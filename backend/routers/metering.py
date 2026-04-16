"""
Usage metering endpoints.
"""
from fastapi import APIRouter, Depends
from core.security import get_current_user
from services.metering import get_usage_summary

router = APIRouter(prefix="/api/usage", tags=["Usage"])


@router.get("")
async def get_usage(current_user: dict = Depends(get_current_user)):
    """Return current period usage and quota limits for the tenant."""
    tenant_id = current_user["tenant_id"]
    summary = await get_usage_summary(tenant_id)
    return summary
