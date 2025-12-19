"""
Admin endpoints for managing system state.
"""
import time
from fastapi import APIRouter, Request, HTTPException
from backend.cache import CacheService
from backend.logging_config import get_logger

router = APIRouter()
logger = get_logger(__name__)


def get_cache_service(request: Request) -> CacheService:
    """Dependency to get cache service from app state."""
    return request.app.state.cache_service


@router.post("/admin/clear-rate-limit")
async def clear_rate_limit(request: Request):
    """
    Emergency endpoint to clear rate limit state from Redis.
    
    Use this when:
    - You're stuck in a rate limit from before the fix
    - You need to reset rate limit state after resolving eBay API issues
    - Testing rate limit behavior
    
    WARNING: This will allow immediate API calls to eBay.
    Only use if you're confident the rate limit window has actually expired.
    """
    cache_service = get_cache_service(request)
    
    # Check if Redis is available
    redis_available = await cache_service._ensure_connection()
    if not redis_available:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "REDIS_UNAVAILABLE",
                "message": "Cannot clear rate limit - Redis is not available"
            }
        )
    
    # Get current rate limit state before clearing
    rate_limit_key = "rate_limit:ebay:finding_api"
    current_state = await cache_service.get(rate_limit_key)
    
    if not current_state:
        return {
            "success": True,
            "message": "No active rate limit found",
            "was_rate_limited": False,
            "current_time": time.time()
        }
    
    # Check if rate limit has actually expired
    limited_until = current_state.get('limited_until', 0)
    current_time = time.time()
    still_limited = current_time < limited_until
    time_remaining = max(0, int(limited_until - current_time))
    
    # Delete the rate limit key
    deleted = await cache_service.delete(rate_limit_key)
    
    if not deleted:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "DELETION_FAILED",
                "message": "Failed to delete rate limit key from Redis"
            }
        )
    
    logger.warning(
        f"Rate limit manually cleared by admin endpoint. "
        f"Was limited until: {limited_until}, "
        f"Time remaining: {time_remaining}s, "
        f"Still in window: {still_limited}"
    )
    
    return {
        "success": True,
        "message": "Rate limit cleared successfully",
        "was_rate_limited": True,
        "previous_state": {
            "limited_until": limited_until,
            "triggered_at": current_state.get('triggered_at'),
            "retry_after": current_state.get('retry_after'),
            "backoff_level": current_state.get('backoff_level', 0),
            "time_remaining_seconds": time_remaining,
            "still_in_ebay_window": still_limited
        },
        "current_time": current_time,
        "warning": "Rate limit cleared. You can now make API requests." if not still_limited else "⚠️ WARNING: eBay may still be rate limiting. Cleared anyway per request."
    }


@router.get("/admin/rate-limit-status")
async def get_rate_limit_status(request: Request):
    """
    Check current rate limit status without modifying it.
    
    Returns information about:
    - Whether rate limit is active
    - When it was triggered
    - When it will expire
    - Time remaining
    """
    cache_service = get_cache_service(request)
    
    # Check if Redis is available
    redis_available = await cache_service._ensure_connection()
    if not redis_available:
        return {
            "redis_available": False,
            "rate_limited": False,
            "message": "Redis unavailable - rate limit protection disabled"
        }
    
    # Get current rate limit state
    rate_limit_key = "rate_limit:ebay:finding_api"
    current_state = await cache_service.get(rate_limit_key)
    
    if not current_state:
        return {
            "redis_available": True,
            "rate_limited": False,
            "message": "No active rate limit",
            "current_time": time.time()
        }
    
    # Calculate status
    limited_until = current_state.get('limited_until', 0)
    triggered_at = current_state.get('triggered_at', 0)
    current_time = time.time()
    still_limited = current_time < limited_until
    time_remaining = max(0, int(limited_until - current_time))
    time_since_trigger = int(current_time - triggered_at) if triggered_at else 0
    
    return {
        "redis_available": True,
        "rate_limited": still_limited,
        "state": {
            "triggered_at": triggered_at,
            "limited_until": limited_until,
            "retry_after": current_state.get('retry_after', 0),
            "backoff_level": current_state.get('backoff_level', 0),
            "time_remaining_seconds": time_remaining,
            "time_since_trigger_seconds": time_since_trigger,
            "expired": not still_limited
        },
        "current_time": current_time,
        "message": f"Rate limited for {time_remaining} more seconds" if still_limited else "Rate limit has expired but key still exists (will be cleaned up on next request)"
    }
