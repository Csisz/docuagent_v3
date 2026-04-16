import asyncio, sys
sys.path.insert(0, '/app')
import db.database as db
from core.security import hash_password

async def run():
    await db.init_pool()
    updates = [
        ('TestAdmin2024!', 'admin@agentify-test.hu'),
        ('TestAgent2024!', 'agent@agentify-test.hu'),
        ('Admin1234!',     'admin@demo.hu'),
        ('demo1234',       'demo@agentify.hu'),
    ]
    for password, email in updates:
        h = hash_password(password)
        await db.execute(
            'UPDATE users SET hashed_password=$1 WHERE email=$2',
            h, email
        )
        print(f'[OK] {email} jelszó frissítve')
    await db.close_pool()

asyncio.run(run())
