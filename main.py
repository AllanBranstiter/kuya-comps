# main.py
import csv
import os
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

from datetime import date
from typing import List, Optional, Dict

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from backend.exceptions import KuyaCompsException
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
from backend.routes import health, comps, fmv

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
# Pydantic Models (Shared Across Application)
# ============================================================================

class Seller(BaseModel):
    name: Optional[str] = None
    reviews: Optional[int] = None
    positive_feedback_percent: Optional[float] = None
    is_top_rated_plus: Optional[bool] = None
    is_direct_from_seller: Optional[bool] = None
    thumbnail: Optional[str] = None


class ExtractedPriceRange(BaseModel):
    from_price: Optional[float] = None
    to_price: Optional[float] = None


class CompItem(BaseModel):
    date_scraped: date = date.today()
    library_id: Optional[int] = None
    position: Optional[int] = None
    library_card_name: Optional[str] = None
    product_id: Optional[str] = None
    item_id: Optional[str] = None
    title: Optional[str] = None
    subtitle: Optional[str] = None
    tag: Optional[str] = None
    link: Optional[str] = None
    seller: Optional[Seller] = None
    brand: Optional[str] = None
    condition: Optional[str] = None
    extensions: Optional[List[str]] = None
    authenticity: Optional[str] = None
    is_sponsored: Optional[bool] = None
    rating: Optional[float] = None
    reviews: Optional[int] = None
    reviews_link: Optional[str] = None
    buying_format: Optional[str] = None
    is_best_offer: Optional[bool] = None
    is_buy_it_now: Optional[bool] = None
    is_auction: Optional[bool] = None
    price: Optional[str] = None
    extracted_price: Optional[float] = None
    extracted_price_range: Optional[ExtractedPriceRange] = None
    is_price_range: Optional[bool] = None
    original_price: Optional[str] = None
    extracted_original_price: Optional[float] = None
    unit_price: Optional[str] = None
    extracted_unit_price: Optional[float] = None
    bids: Optional[int] = None
    time_left: Optional[str] = None
    deal: Optional[str] = None
    discount: Optional[str] = None
    items_sold: Optional[str] = None
    extracted_items_sold: Optional[int] = None
    stock: Optional[str] = None
    watching: Optional[str] = None
    extracted_watching: Optional[int] = None
    shipping: Optional[str] = None
    extracted_shipping: Optional[float] = None
    shipping_details: Optional[str] = None
    is_free_return: Optional[bool] = None
    is_in_psa_vault: Optional[bool] = None
    trending: Optional[str] = None
    thumbnail: Optional[str] = None
    images: Optional[List[str]] = None
    # Fields from previous version, for compatibility
    url: Optional[str] = None
    listing_type: Optional[str] = None
    shipping_price: Optional[float] = None
    shipping_type: Optional[str] = None
    best_offer_enabled: Optional[bool] = None
    has_best_offer: Optional[bool] = None
    sold_price: Optional[float] = None
    end_time: Optional[str] = None
    auction_sold: Optional[bool] = None
    total_bids: Optional[int] = None
    sold: Optional[bool] = None
    total_price: Optional[float] = None
    deep_link: Optional[str] = None


class CompsResponse(BaseModel):
    query: str
    pages_scraped: int
    items: List[CompItem]
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    avg_price: Optional[float] = None
    raw_items_scraped: Optional[int] = None
    duplicates_filtered: Optional[int] = None
    zero_price_filtered: Optional[int] = None
    market_intelligence: Optional[Dict] = None


class FmvResponse(BaseModel):
    fmv_low: Optional[float] = None
    fmv_high: Optional[float] = None
    expected_low: Optional[float] = None
    expected_high: Optional[float] = None
    market_value: Optional[float] = None
    quick_sale: Optional[float] = None
    patient_sale: Optional[float] = None
    volume_confidence: Optional[str] = None
    count: int


# ============================================================================
# Utility Functions (Shared Across Application)
# ============================================================================

def generate_ebay_deep_link(item_id: str, marketplace: str = "com") -> str:
    """
    Generate eBay deep link with EPN tracking parameters for mobile app navigation.
    
    Handles both formats:
    - Sold listings (SearchAPI): "187831448152" (numeric only)
    - Active listings (Browse API): "v1|406480768830|0" (versioned format)
    
    Args:
        item_id: eBay item ID (may be in v1|ID|variant format from Browse API)
        marketplace: Top-level domain (com, de, co.uk, etc.)
    
    Returns:
        Full deep link URL with tracking parameters
    """
    # Extract numeric item ID from Browse API format (v1|ITEM_ID|0)
    # or use as-is for SearchAPI format (numeric only)
    clean_item_id = str(item_id)
    if '|' in clean_item_id:
        # Parse format: v1|406480768830|0
        parts = clean_item_id.split('|')
        if len(parts) >= 2:
            clean_item_id = parts[1]  # Extract the numeric ID (middle part)
            print(f"[DEEPLINK] Extracted numeric ID '{clean_item_id}' from Browse API format '{item_id}'")
    
    base_url = f"https://www.ebay.{marketplace}/itm/{clean_item_id}"
    mkrid = EBAY_ROTATION_IDS.get(marketplace, EBAY_ROTATION_IDS["com"])
    params = f"?mkevt=1&mkcid=1&mkrid={mkrid}&customid=kuyacomps"
    
    deep_link = base_url + params
    print(f"[DEEPLINK] Generated: {deep_link}")
    
    return deep_link


def load_test_data() -> List[Dict]:
    """Load test data from CSV file for testing without using API tokens."""
    test_csv_path = os.path.join(os.path.dirname(__file__), "testing", "comps.csv")
    
    if not os.path.exists(test_csv_path):
        raise FileNotFoundError(f"Test CSV file not found at {test_csv_path}")
    
    items = []
    try:
        with open(test_csv_path, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            for row in reader:
                # Convert CSV data to match the expected format
                price_str = row.get('Price', '').replace('$', '').replace(',', '')
                try:
                    extracted_price = float(price_str) if price_str else None
                except ValueError:
                    extracted_price = None
                
                shipping_str = row.get('Shipping Price', '').replace('$', '').replace(',', '')
                try:
                    extracted_shipping = float(shipping_str) if shipping_str else 0.0
                except ValueError:
                    extracted_shipping = 0.0
                
                item = {
                    'title': row.get('Title', ''),
                    'item_id': row.get('Item ID', ''),
                    'link': f"https://www.ebay.com/itm/{row.get('Item ID', '')}",
                    'url': row.get('URL', ''),
                    'subtitle': row.get('Subtitle', ''),
                    'listing_type': row.get('Listing Type', ''),
                    'price': row.get('Price', ''),
                    'extracted_price': extracted_price,
                    'shipping_price': extracted_shipping,
                    'extracted_shipping': extracted_shipping,
                    'shipping_type': row.get('Shipping Type', ''),
                    'best_offer_enabled': row.get('Best Offer Enabled', '').lower() == 'true',
                    'has_best_offer': row.get('Has Best Offer', '').lower() == 'true',
                    'sold_price': extracted_price,  # Using price as sold_price for test data
                    'end_time': row.get('End Time', ''),
                    'auction_sold': row.get('Auction Sold', '').lower() == 'true',
                    'total_bids': int(row.get('Total Bids', 0)) if row.get('Total Bids', '').isdigit() else 0,
                    'sold': row.get('Sold', '').lower() == 'true',
                }
                items.append(item)
        
        print(f"[TEST] Loaded {len(items)} items from test CSV")
        return items
        
    except Exception as e:
        raise Exception(f"Failed to load test data: {e}")


# ============================================================================
# Register Routers
# ============================================================================

# Health check endpoints
app.include_router(health.router, tags=["Health"])

# Comps endpoints (/comps and /active)
app.include_router(comps.router, tags=["Comps"])

# FMV endpoints (/fmv and /test-ebay-api)
app.include_router(fmv.router, tags=["FMV"])


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
