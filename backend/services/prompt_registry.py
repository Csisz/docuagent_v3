"""
Prompt version registry.

Prompts are stored in the DB with versioning.
Active prompt per name is cached in-memory (5-min TTL).
This allows A/B testing prompt changes and tracking which version
produced better approval rates via agent_runs.prompt_version.
"""
import logging
import time
from typing import Optional

import db.database as _db

log = logging.getLogger("docuagent")

# In-memory cache: name → (content, version, expires_at)
_cache: dict[str, tuple[str, int, float]] = {}
_CACHE_TTL = 300  # seconds


async def get_active_prompt(name: str) -> Optional[str]:
    """
    Return content of the active prompt version for `name`.
    Returns None if no active version exists (caller uses hardcoded fallback).
    """
    now = time.monotonic()
    if name in _cache:
        content, version, expires = _cache[name]
        if now < expires:
            return content
        del _cache[name]

    try:
        row = await _db.fetchrow(
            "SELECT content, version FROM prompt_versions WHERE name=$1 AND is_active=TRUE ORDER BY version DESC LIMIT 1",
            name,
        )
        if not row:
            return None
        _cache[name] = (row["content"], row["version"], now + _CACHE_TTL)
        return row["content"]
    except Exception as e:
        log.debug(f"prompt_registry: DB read failed for {name!r}: {e}")
        return None


async def get_active_version(name: str) -> Optional[int]:
    """Return the version number of the active prompt (for agent_runs logging)."""
    now = time.monotonic()
    if name in _cache:
        _, version, expires = _cache[name]
        if now < expires:
            return version
    await get_active_prompt(name)  # warm cache
    if name in _cache:
        return _cache[name][1]
    return None


async def activate_prompt(name: str, version: int) -> bool:
    """
    Set a specific version as active (deactivates all others for that name).
    Returns True if successful.
    """
    try:
        # Deactivate all versions for this name
        await _db.execute(
            "UPDATE prompt_versions SET is_active=FALSE WHERE name=$1", name
        )
        # Activate the requested version
        result = await _db.execute(
            "UPDATE prompt_versions SET is_active=TRUE WHERE name=$1 AND version=$2",
            name, version,
        )
        # Invalidate cache
        _cache.pop(name, None)
        log.info(f"prompt_registry: activated {name} v{version}")
        return True
    except Exception as e:
        log.error(f"prompt_registry: activate failed: {e}")
        return False


async def create_prompt(name: str, content: str, model_hint: Optional[str] = None,
                         notes: Optional[str] = None, make_active: bool = False) -> int:
    """
    Create a new version (auto-increments).
    Returns the new version number.
    """
    row = await _db.fetchrow(
        "SELECT COALESCE(MAX(version), 0) AS max_v FROM prompt_versions WHERE name=$1", name
    )
    new_version = (row["max_v"] or 0) + 1

    await _db.execute(
        """INSERT INTO prompt_versions (name, version, content, model_hint, notes, is_active)
           VALUES ($1, $2, $3, $4, $5, $6)""",
        name, new_version, content, model_hint, notes, False,
    )

    if make_active:
        await activate_prompt(name, new_version)

    return new_version


async def list_versions(name: str) -> list:
    """List all versions for a prompt name."""
    rows = await _db.fetch(
        "SELECT version, model_hint, is_active, notes, created_at FROM prompt_versions WHERE name=$1 ORDER BY version DESC",
        name,
    )
    return [dict(r) for r in (rows or [])]
