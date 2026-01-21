# main.py
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Validate configuration before importing anything else
from backend.config import (
    validate_config,
    get_sentry_dsn,
    get_sentry_environment,
    get_sentry_traces_sample_rate,
    is_production
)
validate_config()

# Initialize Sentry for error monitoring (production only)
sentry_dsn = get_sentry_dsn()
if sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    
    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=get_sentry_environment(),
        traces_sample_rate=get_sentry_traces_sample_rate(),
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        # Set other options
        send_default_pii=False,  # Don't send personally identifiable information
        attach_stacktrace=True,
        before_send=lambda event, hint: event if is_production() else None,  # Only send in production
    )
    print("[SENTRY] Error monitoring initialized")
else:
    print("[SENTRY] Error monitoring disabled (no DSN configured)")

from typing import List, Optional, Dict

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.exceptions import KuyaCompsException
from backend.models.schemas import CompItem, CompsResponse, FmvResponse, Seller, ExtractedPriceRange
from backend.utils import generate_ebay_deep_link, load_test_data
from backend.logging_config import get_logger
from backend.cache import CacheService
from backend.config import (
    get_redis_url,
    EBAY_ROTATION_IDS,
    get_cors_origins,
    get_cors_allow_credentials
)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Import middleware
from backend.middleware import RequestIDMiddleware, MetricsMiddleware, SecurityHeadersMiddleware
from backend.middleware.metrics import metrics

# Import routers
from backend.routes import health, comps, fmv, market_messages, feedback, admin_feedback, collection_valuation, billing, admin

# Initialize logger for this module
logger = get_logger(__name__)


# ============================================================================
# FastAPI Application Setup
# ============================================================================

app = FastAPI(
    title="Kuya Comps: Your Personal Card Value Dugout",
    description="Your personal assistant for finding baseball card values and deals.",
    version="0.3.0",  # Version History:
                      # 0.3.0 - Dual-search display with active listings filter
                      # 0.2.4 - Improved auction detection using multiple indicators (bids, time left)
                      # 0.2.1 - Added filtering for Raw Only, Base Only, and Exclude Autographs
                      # 0.2.0 - Initial release
)

# ============================================================================
# CORS Configuration
# ============================================================================

# Configure CORS - must be added early in middleware chain
allowed_origins = get_cors_origins()
logger.info(f"[CORS] Allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=get_cors_allow_credentials(),
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Request-ID",
        "Accept",
        "Origin",
        "User-Agent",
    ],
    expose_headers=[
        "X-Request-ID",
        "X-Response-Time",
    ],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# ============================================================================
# Additional Middleware
# ============================================================================

# Add middlewares (order matters - they execute in reverse order of adding)
app.add_middleware(SecurityHeadersMiddleware)  # Security headers (executes last)
app.add_middleware(MetricsMiddleware)  # Metrics
app.add_middleware(RequestIDMiddleware)  # Request ID (executes first)

# Initialize rate limiter (10 requests per minute per IP)
limiter = Limiter(key_func=get_remote_address, default_limits=["10/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Initialize cache service and make it available to routers
redis_url = get_redis_url()
cache_service = CacheService(redis_url=redis_url)
app.state.cache_service = cache_service


# Global exception handler for custom exceptions
@app.exception_handler(KuyaCompsException)
async def kuya_comps_exception_handler(request: Request, exc: KuyaCompsException):
    """Handle all custom Kuya Comps exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.to_dict()
    )


# ============================================================================
# Database Initialization (for feedback system)
# ============================================================================

from backend.database.connection import init_db

# Initialize database tables on startup
@app.on_event("startup")
async def startup_event():
    """Initialize database and other startup tasks."""
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Error during startup: {e}")


# ============================================================================
# Register Routers
# ============================================================================

# Health check endpoints
app.include_router(health.router, tags=["Health"])

# Comps endpoints (/comps and /active)
app.include_router(comps.router, tags=["Comps"])

# FMV endpoints (/fmv and /test-ebay-api)
app.include_router(fmv.router, tags=["FMV"])

# Market messages endpoints (/market-message and /liquidity-popup/<tier_id>)
app.include_router(market_messages.router, tags=["Market Messages"])

# Feedback endpoints (/api/feedback)
app.include_router(feedback.router, tags=["Feedback"])

# Admin feedback endpoints (/admin/*)
app.include_router(admin_feedback.router, tags=["Admin"])

# Collection valuation endpoints (/api/v1/cards/*/update-value, /admin/api/valuation/*)
app.include_router(collection_valuation.router, tags=["Collection Valuation"])

# Billing endpoints (/api/billing/*)
app.include_router(billing.router, tags=["Billing"])

# Admin analytics endpoints (/api/admin/*)
app.include_router(admin.router, tags=["Admin Analytics"])


# ============================================================================
# Metrics Endpoint
# ============================================================================

@app.get("/metrics", tags=["Monitoring"])
async def get_metrics():
    """
    Get application performance metrics.
    
    Returns metrics including:
    - Request count by endpoint and status code
    - Average and P95 response times
    - Cache hit rate
    - Error rates
    - Active requests
    """
    return metrics.get_metrics_summary()


# ============================================================================
# Static File Serving (Must be last)
# ============================================================================

# Serve the UI
app.mount("/", StaticFiles(directory="static", html=True), name="static")
