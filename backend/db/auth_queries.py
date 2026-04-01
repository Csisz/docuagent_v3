"""
Auth és tenant-related SQL lekérdezések.
"""
import db.database as db
from core.security import hash_password


async def get_tenant_by_slug(slug: str):
    return await db.fetchrow("SELECT * FROM tenants WHERE slug=$1", slug)


async def get_tenant_by_id(tenant_id: str):
    return await db.fetchrow("SELECT * FROM tenants WHERE id=$1", tenant_id)


async def create_tenant(name: str, slug: str, plan: str = "free"):
    return await db.fetchrow(
        """INSERT INTO tenants (name, slug, plan)
           VALUES ($1, $2, $3)
           RETURNING *""",
        name, slug, plan
    )


async def get_user_by_email(email: str, tenant_id: str):
    return await db.fetchrow(
        "SELECT * FROM users WHERE email=$1 AND tenant_id=$2",
        email, tenant_id
    )


async def get_user_by_id(user_id: str):
    return await db.fetchrow("SELECT * FROM users WHERE id=$1", user_id)


async def create_user(tenant_id: str, email: str, password: str,
                       full_name: str = None, role: str = "agent"):
    hashed = hash_password(password)
    return await db.fetchrow(
        """INSERT INTO users (tenant_id, email, hashed_password, full_name, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, tenant_id, email, full_name, role, is_active""",
        tenant_id, email, hashed, full_name, role
    )


async def update_last_login(user_id: str):
    await db.execute(
        "UPDATE users SET last_login=NOW() WHERE id=$1", user_id
    )


async def list_users_by_tenant(tenant_id: str):
    return await db.fetch(
        """SELECT id, email, full_name, role, is_active, last_login, created_at
           FROM users WHERE tenant_id=$1 ORDER BY created_at""",
        tenant_id
    )
