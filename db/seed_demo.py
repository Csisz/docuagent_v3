"""
Demo tenant és admin user létrehozása fejlesztéshez.
Futtatás: docker exec docuagent_v3-backend-1 python db/seed_demo.py
"""
import asyncio
import sys
sys.path.insert(0, '/app')

async def seed():
    from db.database import init_pool as connect, close_pool as disconnect
    import db.auth_queries as aq

    await connect()

    # Demo tenant
    tenant = await aq.get_tenant_by_slug("demo")
    if not tenant:
        tenant = await aq.create_tenant("Demo Kft.", "demo", "pro")
        print(f"Tenant created: {tenant['id']}")
    else:
        print(f"Tenant exists: {tenant['id']}")

    # Admin user
    user = await aq.get_user_by_email("admin@demo.hu", str(tenant["id"]))
    if not user:
        user = await aq.create_user(
            str(tenant["id"]), "admin@demo.hu", "Admin1234!",
            "Demo Admin", "admin"
        )
        print(f"Admin user created: {user['email']}")
    else:
        print(f"Admin user exists: {user['email']}")

    await disconnect()

asyncio.run(seed())
