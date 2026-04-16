"""
DocuAgent v3 — User Setup Script
Létrehozza a demo és éles teszt usereket.

Futtatás:
  docker cp create_users.py docuagent_v3-backend-1:/app/create_users.py
  docker exec docuagent_v3-backend-1 python create_users.py
"""
import asyncio
import sys
sys.path.insert(0, '/app')

import db.database as db
import db.auth_queries as aq

# ── Konfiguráció ──────────────────────────────────────────────

USERS_TO_CREATE = [
    # Demo tenant (már létezik, csak ellenőrzés)
    {
        "tenant_name":  "Demo Kft.",
        "tenant_slug":  "demo",
        "tenant_plan":  "pro",
        "email":        "demo@agentify.hu",
        "password":     "demo1234",
        "full_name":    "Demo Felhasználó",
        "role":         "agent",
        "note":         "Demo sandbox user — login gombbal érhető el",
    },
    {
        "tenant_name":  "Demo Kft.",
        "tenant_slug":  "demo",
        "tenant_plan":  "pro",
        "email":        "admin@demo.hu",
        "password":     "Admin1234!",
        "full_name":    "Demo Admin",
        "role":         "admin",
        "note":         "Demo admin user",
    },
    # Éles teszt tenant
    {
        "tenant_name":  "Agentify Teszt Kft.",
        "tenant_slug":  "agentify-test",
        "tenant_plan":  "pro",
        "email":        "admin@agentify-test.hu",
        "password":     "TestAdmin2024!",
        "full_name":    "Teszt Admin",
        "role":         "admin",
        "note":         "Éles teszt tenant — onboarding wizard teszteléshez",
    },
    {
        "tenant_name":  "Agentify Teszt Kft.",
        "tenant_slug":  "agentify-test",
        "tenant_plan":  "pro",
        "email":        "agent@agentify-test.hu",
        "password":     "TestAgent2024!",
        "full_name":    "Teszt Agent",
        "role":         "agent",
        "note":         "Éles teszt agent user",
    },
]

# ── Setup ─────────────────────────────────────────────────────

async def main():
    await db.init_pool()
    print("\n" + "="*60)
    print("DocuAgent — User Setup")
    print("="*60)

    created_tenants = {}

    for u in USERS_TO_CREATE:
        slug = u["tenant_slug"]

        # Tenant létrehozása / lekérése
        if slug not in created_tenants:
            tenant = await aq.get_tenant_by_slug(slug)
            if tenant:
                print(f"\n[=] Tenant létezik: {tenant['name']} ({slug})")
                created_tenants[slug] = str(tenant["id"])
            else:
                tenant = await aq.create_tenant(u["tenant_name"], slug, u["tenant_plan"])
                print(f"\n[+] Tenant létrehozva: {tenant['name']} ({slug})")
                created_tenants[slug] = str(tenant["id"])

                # Onboarding state létrehozása új tenanthoz
                existing = await db.fetchrow(
                    "SELECT id FROM onboarding_state WHERE tenant_id=$1",
                    created_tenants[slug]
                )
                if not existing:
                    await db.execute(
                        """INSERT INTO onboarding_state (tenant_id, current_step, completed_steps, metadata)
                           VALUES ($1, 1, '{}', '{}')
                           ON CONFLICT (tenant_id) DO NOTHING""",
                        created_tenants[slug]
                    )
                    print(f"    → Onboarding state létrehozva")

        tenant_id = created_tenants[slug]

        # User létrehozása / ellenőrzése
        existing_user = await aq.get_user_by_email(u["email"], tenant_id)
        if existing_user:
            print(f"[=] User létezik: {u['email']} ({u['role']})")
        else:
            user = await aq.create_user(
                tenant_id, u["email"], u["password"],
                u["full_name"], u["role"]
            )
            print(f"[+] User létrehozva: {u['email']} ({u['role']})")
            print(f"    → Jelszó: {u['password']}")
            print(f"    → Megjegyzés: {u['note']}")

    print("\n" + "="*60)
    print("Összefoglaló — bejelentkezési adatok:")
    print("="*60)
    print("\n📦 DEMO TENANT (demo@agentify.hu)")
    print("   Email:    demo@agentify.hu")
    print("   Jelszó:   demo1234")
    print("   Szerep:   agent")
    print("   Elérés:   Login oldalon 'Demo megtekintése' gomb")
    print("\n📦 DEMO ADMIN (admin@demo.hu)")
    print("   Email:    admin@demo.hu")
    print("   Jelszó:   Admin1234!")
    print("   Szerep:   admin")
    print("\n🏢 ÉLES TESZT ADMIN (agentify-test tenant)")
    print("   Email:    admin@agentify-test.hu")
    print("   Jelszó:   TestAdmin2024!")
    print("   Szerep:   admin")
    print("   Célja:    Onboarding wizard teljes tesztelése")
    print("\n🏢 ÉLES TESZT AGENT (agentify-test tenant)")
    print("   Email:    agent@agentify-test.hu")
    print("   Jelszó:   TestAgent2024!")
    print("   Szerep:   agent")
    print("="*60 + "\n")

    await db.close_pool()

asyncio.run(main())
