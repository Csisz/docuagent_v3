"""
Demo adatok feltöltése a DocuAgent demó tenant-hoz.

Futtatás:
  docker exec docuagent_v3-backend-1 python db/seed_demo.py

Létrehoz:
  - Demo Kft. tenant (slug: demo)
  - admin@demo.hu / Admin1234! (admin)
  - demo@agentify.hu / demo1234  (agent — sales demo belépő)
  - 20 minta email különböző státuszokkal
  - 3 dokumentum
  - 5 naptár esemény
  - RAG log bejegyzések
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from db.demo_data import seed

asyncio.run(seed())
