"""
Autentikáció: login, token refresh, user management.
"""
import logging
from fastapi import APIRouter, HTTPException, Depends
from core.security import (
    verify_password, create_access_token, get_current_user
)
import db.auth_queries as aq
from models.schemas import LoginRequest, TokenResponse, UserCreate, UserResponse

router = APIRouter(prefix="/api/auth", tags=["Auth"])
log = logging.getLogger("docuagent")


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    """
    Login: email + jelszó → JWT token.
    A tenant meghatározása az email domain alapján történik,
    vagy explicit tenant_slug query paraméterrel.
    """
    domain = req.email.split("@")[1] if "@" in req.email else ""

    tenant = await aq.get_tenant_by_slug(domain)
    if not tenant:
        # Fallback: demo tenant fejlesztéshez
        tenant = await aq.get_tenant_by_slug("demo")
    if not tenant:
        raise HTTPException(404, "Tenant nem található")

    user = await aq.get_user_by_email(req.email, str(tenant["id"]))
    if not user:
        raise HTTPException(401, "Hibás email vagy jelszó")
    if not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(401, "Hibás email vagy jelszó")
    if not user["is_active"]:
        raise HTTPException(403, "A fiók inaktív")

    await aq.update_last_login(str(user["id"]))

    token = create_access_token({
        "user_id":     str(user["id"]),
        "tenant_id":   str(tenant["id"]),
        "email":       user["email"],
        "role":        user["role"],
        "tenant_slug": tenant["slug"],
    })

    log.info(f"Login: {user['email']} tenant={tenant['slug']}")
    return {
        "access_token": token,
        "token_type":   "bearer",
        "user": {
            "id":        str(user["id"]),
            "tenant_id": str(tenant["id"]),
            "email":     user["email"],
            "full_name": user["full_name"],
            "role":      user["role"],
            "is_active": user["is_active"],
        },
        "tenant": {
            "id":         str(tenant["id"]),
            "name":       tenant["name"],
            "slug":       tenant["slug"],
            "plan":       tenant["plan"],
            "is_active":  tenant["is_active"],
            "created_at": tenant["created_at"].isoformat(),
        }
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Visszaadja a bejelentkezett user adatait."""
    user = await aq.get_user_by_id(current_user["user_id"])
    if not user:
        raise HTTPException(404, "User nem található")
    tenant = await aq.get_tenant_by_id(current_user["tenant_id"])
    return {
        "user":   dict(user),
        "tenant": dict(tenant)
    }


@router.post("/users")
async def create_user(
    req: UserCreate,
    current_user: dict = Depends(get_current_user)
):
    """Új user létrehozása (csak admin teheti)."""
    if current_user["role"] != "admin":
        raise HTTPException(403, "Csak admin hozhat létre felhasználót")

    existing = await aq.get_user_by_email(req.email, current_user["tenant_id"])
    if existing:
        raise HTTPException(409, "Ez az email már regisztrált")

    user = await aq.create_user(
        current_user["tenant_id"], req.email, req.password,
        req.full_name, req.role
    )
    log.info(f"User created: {req.email} role={req.role} tenant={current_user['tenant_id']}")
    return dict(user)


@router.get("/users")
async def list_users(current_user: dict = Depends(get_current_user)):
    """Tenant felhasználóinak listázása (csak admin)."""
    if current_user["role"] not in ("admin", "viewer"):
        raise HTTPException(403, "Nincs jogosultság")
    users = await aq.list_users_by_tenant(current_user["tenant_id"])
    return {"users": [dict(u) for u in users]}
