"""
queries.py patch — tenant_id szűrés hozzáadása a dashboard querykhez.
Futtatás: docker exec docuagent_v3-backend-1 python queries_patch.py
"""
import asyncio, sys
sys.path.insert(0, '/app')
import db.database as db

# ── Patch: tenant_id szűrés ───────────────────────────────────

PATCHES = {
    'get_status_stats': '''
async def get_status_stats(days: int, tenant_id: str = None):
    where = f"created_at > NOW() - INTERVAL '{days} days'"
    if tenant_id:
        where += f" AND tenant_id='{tenant_id}'"
    return await db.fetch(
        f"""SELECT status, COUNT(*) AS cnt,
                   COUNT(*) FILTER(WHERE urgent) AS urg,
                   AVG(confidence) AS avg_conf
            FROM emails WHERE {where}
            GROUP BY status"""
    )
''',
    'get_avg_confidence': '''
async def get_avg_confidence(days: int, tenant_id: str = None):
    where = f"created_at > NOW() - INTERVAL '{days} days'"
    if tenant_id:
        where += f" AND tenant_id='{tenant_id}'"
    return await db.fetchrow(
        f"SELECT AVG(confidence)*100 AS v FROM emails WHERE {where}"
    )
''',
    'get_feedback_count': '''
async def get_feedback_count(tenant_id: str = None):
    if tenant_id:
        return await db.fetchrow(
            "SELECT COUNT(*) FROM feedback WHERE tenant_id=$1", tenant_id
        )
    return await db.fetchrow("SELECT COUNT(*) FROM feedback")
''',
    'get_timeline': '''
async def get_timeline(days: int = 7, tenant_id: str = None):
    where = f"created_at > NOW() - INTERVAL '{days} days'"
    if tenant_id:
        where += f" AND tenant_id='{tenant_id}'"
    return await db.fetch(
        f"""SELECT DATE(created_at)::text AS day, COUNT(*) AS cnt,
                   COUNT(*) FILTER(WHERE status='NEEDS_ATTENTION') AS needs
            FROM emails WHERE {where}
            GROUP BY day ORDER BY day"""
    )
''',
    'get_category_breakdown': '''
async def get_category_breakdown(days: int, tenant_id: str = None):
    where = f"created_at > NOW() - INTERVAL '{days} days'"
    if tenant_id:
        where += f" AND tenant_id='{tenant_id}'"
    return await db.fetch(
        f"""SELECT COALESCE(category,'other') AS cat, COUNT(*) AS cnt
            FROM emails WHERE {where}
            GROUP BY cat"""
    )
''',
    'get_recent_activity': '''
async def get_recent_activity(limit: int = 8, tenant_id: str = None):
    if tenant_id:
        return await db.fetch(
            "SELECT subject, sender, status, confidence, created_at FROM emails WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2",
            tenant_id, limit
        )
    return await db.fetch(
        "SELECT subject, sender, status, confidence, created_at FROM emails ORDER BY created_at DESC LIMIT $1",
        limit
    )
''',
}

async def apply_patches():
    content = open('/app/db/queries.py', encoding='utf-8').read()
    changed = False

    for func_name, new_code in PATCHES.items():
        if f'tenant_id: str = None' in content and func_name in content:
            print(f'[=] {func_name} already patched')
            continue

        # Find and replace the old function
        import re
        pattern = rf'async def {func_name}\([^)]*\):.*?(?=\nasync def |\nclass |\Z)'
        match = re.search(pattern, content, re.DOTALL)
        if match:
            content = content[:match.start()] + new_code.strip() + '\n\n\n' + content[match.end():]
            print(f'[+] Patched: {func_name}')
            changed = True
        else:
            print(f'[!] Not found: {func_name}')

    if changed:
        open('/app/db/queries.py', 'w', encoding='utf-8').write(content)
        print('\n[OK] queries.py patched successfully')
    else:
        print('\n[=] No changes needed')

asyncio.run(apply_patches())
