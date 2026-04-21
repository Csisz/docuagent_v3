from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.security.api_key import APIKeyHeader
from jose import JWTError, jwt
from passlib.context import CryptContext
from core.config import DASHBOARD_API_KEY
import hashlib
import os
import secrets

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    import sys
    print("FATAL: JWT_SECRET_KEY environment variable is not set", file=sys.stderr)
    sys.exit(1)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Érvénytelen vagy lejárt token"
        )


from fastapi import Header


async def require_api_key(
    x_api_key: Optional[str] = Security(_api_key_header),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
):
    """
    Elfogad JWT tokent VAGY API key-t.
    JWT prioritas: ha van Bearer token, azt validaljuk.
    API key fallback: ha nincs JWT, az X-API-Key-t nezzu.
    """
    if credentials:
        try:
            decode_token(credentials.credentials)
            return
        except HTTPException:
            pass

    if x_api_key:
        if not DASHBOARD_API_KEY or x_api_key == DASHBOARD_API_KEY:
            return
        raise HTTPException(status_code=401, detail="Érvénytelen API kulcs")

    if DASHBOARD_API_KEY:
        raise HTTPException(status_code=401, detail="Hitelesítés szükséges")


async def get_current_user(
    x_api_key: Optional[str] = Header(None),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
):
    """JWT auth → user payload tenant_id-vel. API key → tenant_id=None."""
    if credentials:
        try:
            payload = decode_token(credentials.credentials)
            return payload
        except HTTPException:
            pass

    if x_api_key:
        if DASHBOARD_API_KEY and x_api_key != DASHBOARD_API_KEY:
            raise HTTPException(status_code=401, detail="Érvénytelen API kulcs")
        return {"tenant_id": None, "auth_type": "api_key"}

    raise HTTPException(status_code=401, detail="Nincs token")


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
) -> Optional[dict]:
    if not credentials:
        return None
    try:
        return decode_token(credentials.credentials)
    except HTTPException:
        return None


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def get_tenant_from_api_key(api_key: str) -> Optional[str]:
    """SHA256 lookup in tenant_api_keys. Updates last_used. Returns tenant_id or None."""
    if not api_key:
        return None

    # Legacy dashboard key — no tenant scoping
    if DASHBOARD_API_KEY and api_key == DASHBOARD_API_KEY:
        return None

    key_hash = _sha256(api_key)
    try:
        import db.database as _db
        row = await _db.fetchrow(
            "SELECT tenant_id FROM tenant_api_keys WHERE key_hash=$1 AND is_active=TRUE",
            key_hash,
        )
        if not row:
            return None
        tenant_id = str(row["tenant_id"])
        await _db.execute(
            "UPDATE tenant_api_keys SET last_used=NOW() WHERE key_hash=$1",
            key_hash,
        )
        return tenant_id
    except Exception:
        return None


def require_role(*roles: str):
    """
    FastAPI dependency factory — raises 403 if user.role not in roles.
    Admins always pass (backwards-compatible).
    Usage: Depends(require_role("admin")) or Depends(require_role("admin", "agent"))
    """
    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role", "")
        if user_role not in roles and user_role != "admin":
            raise HTTPException(
                status_code=403,
                detail=f"Szükséges jogosultság: {', '.join(roles)}",
            )
        return current_user
    return _check


async def generate_api_key(tenant_id: str, label: Optional[str] = None) -> dict:
    """Generates 'docagt_' + 64 hex chars, stores hash, returns full key once."""
    raw_key = "docagt_" + secrets.token_hex(32)
    key_prefix = raw_key[:15]
    key_hash = _sha256(raw_key)

    import db.database as _db
    await _db.execute(
        """INSERT INTO tenant_api_keys (tenant_id, key_hash, key_prefix, label)
           VALUES ($1, $2, $3, $4)""",
        tenant_id, key_hash, key_prefix, label,
    )
    return {"key": raw_key, "prefix": key_prefix, "label": label}
