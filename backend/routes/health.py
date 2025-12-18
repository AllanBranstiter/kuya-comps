# backend/routes/health.py
"""
Health check router - provides endpoints for monitoring application health.

This module contains health check endpoints used by orchestration systems
(Kubernetes, Docker, Railway, etc.) to monitor application status.
"""
from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from backend.logging_config import get_logger

# Initialize router
router = APIRouter()

# Initialize logger for this module
logger = get_logger(__name__)


@router.get("/health")
async def health_check():
    """
    Basic health check endpoint.
    
    Returns a simple status response to verify the application is running.
    Used by load balancers and monitoring systems for basic availability checks.
    
    Returns:
        dict: {"status": "ok"}
    """
    return {"status": "ok"}


@router.get("/health/live")
async def liveness_check():
    """
    Kubernetes-style liveness probe.
    
    Indicates whether the application is running and responsive.
    If this fails, the container should be restarted.
    
    Returns:
        dict: {"status": "alive"}
    """
    return {"status": "alive"}


@router.get("/health/ready")
async def readiness_check(request: Request):
    """
    Kubernetes-style readiness probe.
    
    Indicates whether the application is ready to serve traffic.
    Checks connectivity to critical dependencies (cache, etc.).
    If this fails, the container should not receive traffic but shouldn't be restarted.
    
    Returns:
        JSONResponse: {"status": "ready", "checks": {...}} with HTTP 200 if ready
                     {"status": "not_ready", "checks": {...}} with HTTP 503 if not ready
    """
    checks = {
        "application": "ok",
        "cache": "unknown",
    }
    
    # Check cache service availability
    try:
        if hasattr(request.app.state, 'cache_service'):
            cache_service = request.app.state.cache_service
            # Try a simple ping to Redis
            test_result = await cache_service.ping()
            checks["cache"] = "ok" if test_result else "unavailable"
        else:
            checks["cache"] = "not_configured"
    except Exception as e:
        logger.warning(f"Cache health check failed: {e}")
        checks["cache"] = "error"
    
    # Determine overall readiness
    # App is ready if it's running, even if cache is unavailable (degraded mode)
    is_ready = checks["application"] == "ok"
    
    if is_ready:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "status": "ready",
                "checks": checks
            }
        )
    else:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "checks": checks
            }
        )
