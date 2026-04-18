"""
Qdrant vektoros adatbázis service.

v3.4 változások (tenant isolation):
  - Minden vektor tenant_id-t tartalmaz a payloadban
  - Collection-névrendszer: {tenant_id[:8]}_{domain}
    pl. "a1b2c3d4_billing", "a1b2c3d4_legal"
  - search() és search_multi() tenant_id alapján szűrnek
  - delete_by_doc_id() csak a tenant saját collection-jeit érinti
  - get_tenant_collections() visszaadja a tenant összes collection-jét

v3.3 változások:
  - Multi-collection: tag alapján különböző collection-ökbe kerülnek a dok.
  - Forrás-visszaadás: search() visszaadja a dokumentum nevét és score-ját
  - ensure_collection(): automatikusan létrehozza a collection-t ha nem létezik
  - search_multi(): több collection-ben keres egyszerre
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from core.config import QDRANT_URL, OPENAI_API_KEY, COLLECTION_MAP, DEFAULT_COLLECTION
from services.openai_service import embed

log = logging.getLogger("docuagent")
VECTOR_SIZE = 1536   # text-embedding-3-small


# ── Collection kezelés ────────────────────────────────────────

async def ensure_collection(name: str) -> bool:
    """Létrehozza a collection-t ha még nem létezik."""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{QDRANT_URL}/collections/{name}")
            if r.status_code == 200:
                return True
            r2 = await c.put(
                f"{QDRANT_URL}/collections/{name}",
                json={"vectors": {"size": VECTOR_SIZE, "distance": "Cosine"}},
            )
            ok = r2.status_code in (200, 201)
            if ok:
                log.info(f"Qdrant collection létrehozva: '{name}'")
            return ok
    except Exception as e:
        log.warning(f"ensure_collection({name}) hiba: {e}")
        return False


def tag_to_collection(tag: str) -> str:
    """Tag → domain neve (COLLECTION_MAP suffix)."""
    return COLLECTION_MAP.get(tag.lower(), DEFAULT_COLLECTION)


def _tenant_collection(tenant_id: str, domain: str) -> str:
    """Tenant-specifikus collection neve: {tenant_id[:8]}_{domain}."""
    return f"{tenant_id[:8]}_{domain}"


def _tenant_collections(tenant_id: str) -> list[str]:
    """Visszaadja a tenant összes lehetséges collection-nevét."""
    return [_tenant_collection(tenant_id, domain) for domain in set(COLLECTION_MAP.values())]


async def count_vectors(collection: str = DEFAULT_COLLECTION) -> int:
    """Vektorok száma egy collection-ben, vagy -1 ha nem elérhető."""
    try:
        async with httpx.AsyncClient(timeout=4) as c:
            r = await c.get(f"{QDRANT_URL}/collections/{collection}")
            return r.json().get("result", {}).get("points_count", 0)
    except Exception:
        return -1


async def count_all_vectors() -> dict[str, int]:
    """Összes ismert collection vektor-száma (globális, nem tenant-specifikus)."""
    totals = {}
    for name in set(COLLECTION_MAP.values()):
        totals[name] = await count_vectors(name)
    return totals


# ── Tenant collection lista ────────────────────────────────────

async def get_tenant_collections(tenant_id: str) -> list[str]:
    """
    Visszaadja azokat a tenant collection neveket, amelyek ténylegesen
    léteznek a Qdrant-ban.
    """
    existing = []
    candidate_names = _tenant_collections(tenant_id)
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{QDRANT_URL}/collections")
            if r.status_code != 200:
                return candidate_names  # fallback: return all possible names
            all_names = {col["name"] for col in r.json().get("result", {}).get("collections", [])}
            existing = [name for name in candidate_names if name in all_names]
    except Exception as e:
        log.warning(f"get_tenant_collections hiba: {e}")
        return candidate_names
    return existing


# ── Tárolás ───────────────────────────────────────────────────

async def store_document(doc_id: str, filename: str, text: str,
                          tag: str, department: str,
                          access_level: str, uploader: str,
                          tenant_id: str) -> tuple[bool, str]:
    """
    Darabolja és vektorizálja a dokumentumot, feltölti a tenant-specifikus
    Qdrant collection-be.

    Collection: {tenant_id[:8]}_{domain}
    Payload: tartalmazza a tenant_id-t is (szűréshez).

    Visszaad: (sikeres, collection_neve)
    """
    domain     = tag_to_collection(tag)
    collection = _tenant_collection(tenant_id, domain)
    await ensure_collection(collection)

    try:
        chunks = [text[i:i+1400] for i in range(0, min(len(text), 12000), 1400)]
        points = []

        async with httpx.AsyncClient(timeout=60) as client:
            for i, chunk in enumerate(chunks):
                vector = await embed(chunk)
                points.append({
                    "id": str(uuid.uuid4()),
                    "vector": vector,
                    "payload": {
                        "tenant_id":    tenant_id,
                        "filename":     filename,
                        "text":         chunk,
                        "tag":          tag,
                        "collection":   collection,
                        "department":   department,
                        "access_level": access_level,
                        "uploader":     uploader,
                        "doc_id":       doc_id,
                        "chunk_index":  i,
                        "total_chunks": len(chunks),
                        "upload_time":  datetime.now(timezone.utc).isoformat(),
                    },
                })

            r = await client.put(
                f"{QDRANT_URL}/collections/{collection}/points",
                json={"points": points},
            )
            ok = r.status_code == 200
            log.info(f"Qdrant store: {filename} → '{collection}' ({len(chunks)} chunk, ok={ok})")
            return ok, collection

    except Exception as e:
        log.warning(f"Qdrant store_document hiba: {e}")
        return False, collection


# ── Keresés ───────────────────────────────────────────────────

async def search(query_text: str, collection: str = DEFAULT_COLLECTION,
                 limit: int = 3, score_threshold: float = 0.35,
                 tenant_id: Optional[str] = None) -> list[dict]:
    """
    Szemantikus keresés egy collection-ben.
    Ha tenant_id megadva → Qdrant payload filter szűri le a tenant vektorait.
    Visszaad strukturált találati listát forrás-adatokkal.
    """
    vector = await embed(query_text)

    body: dict = {"vector": vector, "limit": limit, "with_payload": True}
    if tenant_id:
        body["filter"] = {
            "must": [{"key": "tenant_id", "match": {"value": tenant_id}}]
        }

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{QDRANT_URL}/collections/{collection}/points/search",
            json=body,
        )
        raw = r.json().get("result", [])

    results = []
    for item in raw:
        score = item.get("score", 0)
        if score < score_threshold:
            continue
        payload = item.get("payload", {})
        results.append({
            "score":       round(score, 3),
            "text":        payload.get("text", ""),
            "filename":    payload.get("filename", "ismeretlen"),
            "collection":  payload.get("collection", collection),
            "tag":         payload.get("tag", ""),
            "doc_id":      payload.get("doc_id", ""),
            "chunk_index": payload.get("chunk_index", 0),
        })

    return results


async def search_multi(query_text: str, collections: Optional[list[str]] = None,
                       limit_per: int = 2, score_threshold: float = 0.35,
                       tenant_id: Optional[str] = None) -> list[dict]:
    """
    Több collection-ben keres egyszerre, összefésüli és score szerint rendezi.

    Ha tenant_id megadva:
      - collections paramétert felülírja a tenant-specifikus collection-nevekkel
      - search() hívásban tenant_id filter is aktív (dupla biztonság)
    Ha sem tenant_id sem collections nincs megadva → globális collection-ök.
    """
    if tenant_id:
        # Tenant-specific collections: {tenant_id[:8]}_{domain}
        cols = _tenant_collections(tenant_id)
    elif collections is not None:
        cols = collections
    else:
        cols = list(set(COLLECTION_MAP.values()))

    all_results = []
    for col in cols:
        try:
            results = await search(
                query_text, collection=col,
                limit=limit_per, score_threshold=score_threshold,
                tenant_id=tenant_id,
            )
            all_results.extend(results)
        except Exception as e:
            log.warning(f"search_multi hiba ({col}): {e}")

    all_results.sort(key=lambda x: x["score"], reverse=True)
    if tenant_id and all_results:
        try:
            from services.metering import increment_usage
            await increment_usage(tenant_id, "rag_queries", 1)
        except Exception:
            pass
    return all_results[:limit_per * 2]


# ── Törlés ────────────────────────────────────────────────────

async def delete_by_doc_id(doc_id: str, collection: str = None,
                            tenant_id: Optional[str] = None) -> int:
    """
    Törli az összes vektort ami egy adott doc_id-hoz tartozik.

    Ha collection megadva → csak abban a collection-ben töröl.
    Ha tenant_id megadva → a tenant összes collection-jében töröl.
    Ha sem → globális fallback (összes ismert collection).
    """
    if collection:
        collections_to_search = [collection]
    elif tenant_id:
        collections_to_search = _tenant_collections(tenant_id)
    else:
        collections_to_search = list(set(COLLECTION_MAP.values()))

    deleted_total = 0
    async with httpx.AsyncClient(timeout=20) as client:
        for col in collections_to_search:
            try:
                r = await client.post(
                    f"{QDRANT_URL}/collections/{col}/points/delete",
                    json={"filter": {"must": [{"key": "doc_id", "match": {"value": doc_id}}]}}
                )
                if r.status_code == 200:
                    deleted_total += 1
                    log.info(f"Qdrant delete: doc_id={doc_id} collection={col}")
            except Exception as e:
                log.warning(f"Qdrant delete hiba ({col}): {e}")

    return deleted_total


async def delete_by_filename(filename: str, collection: str = DEFAULT_COLLECTION) -> bool:
    """Törli az összes vektort ami egy adott fájlnévhez tartozik."""
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            r = await client.post(
                f"{QDRANT_URL}/collections/{collection}/points/delete",
                json={"filter": {"must": [{"key": "filename", "match": {"value": filename}}]}}
            )
            return r.status_code == 200
        except Exception as e:
            log.warning(f"Qdrant delete_by_filename hiba: {e}")
            return False
