"""
Shared slowapi rate limiter — import from here to avoid circular imports.
Key function: per-tenant_id for B2B (not per-IP).

In a Hungarian B2B environment users share offices and VPNs, so per-IP
limiting would block legitimate traffic. Tenant-scoped keys are correct.
"""
from slowapi import Limiter
from fastapi import Request


def _get_tenant_id(request: Request) -> str:
    """Rate limit key: tenant_id from JWT, fallback to IP for anonymous calls."""
    if not request:
        return "internal"
    # Try JWT Bearer token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            from core.security import decode_token
            payload = decode_token(auth[7:])
            tid = payload.get("tenant_id")
            if tid:
                return f"tenant:{tid}"
        except Exception:
            pass
    # Fallback to IP for anonymous / API-key-only callers
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_get_tenant_id)
