# backend/config.py
"""
Configuration constants for Kuya Comps application.

This module centralizes all configuration values and magic numbers
to make them easily discoverable and maintainable.
"""
import os
import sys
from typing import Optional, List

from backend.logging_config import get_logger

logger = get_logger(__name__)


# ============================================================================
# AI Model Configuration (OpenRouter)
# ============================================================================

AI_MODEL_SUMMARY = os.getenv("AI_MODEL_SUMMARY", "google/gemini-2.0-flash-001")
"""Model used for AI Market Summary generation."""

AI_MODEL_RELEVANCE = os.getenv("AI_MODEL_RELEVANCE", "google/gemma-3-27b-it")
"""Model used for AI relevance scoring of listings."""

AI_MODEL_PLAYER_EXTRACTION = os.getenv(
    "AI_MODEL_PLAYER_EXTRACTION", "google/gemma-3-27b-it"
)
"""Model used for player name extraction from search queries (fallback)."""


# ============================================================================
# Environment Configuration
# ============================================================================

def get_environment() -> str:
    """
    Get current environment: development, staging, or production.

    Returns:
        Environment name (development, staging, or production)
    """
    return os.getenv('ENVIRONMENT', 'development').lower()


def is_production() -> bool:
    """Check if running in production environment."""
    return get_environment() == 'production'


def is_development() -> bool:
    """Check if running in development environment."""
    return get_environment() == 'development'


# ============================================================================
# API Configuration
# ============================================================================

def get_search_api_key() -> Optional[str]:
    """Get SearchAPI.io API key from environment."""
    return os.getenv('SEARCH_API_KEY')


def get_redis_url() -> str:
    """Get Redis URL from environment with fallback."""
    return os.getenv('REDIS_URL', 'redis://localhost:6379')


def get_results_dir() -> str:
    """Get directory for storing results/CSV files."""
    return os.getenv('CSV_STORAGE_PATH', os.path.dirname(os.path.abspath(__file__)))


def get_sentry_dsn() -> Optional[str]:
    """Get Sentry DSN for error monitoring (production only)."""
    if is_production():
        return os.getenv('SENTRY_DSN')
    return None


def get_sentry_environment() -> str:
    """Get Sentry environment name."""
    return os.getenv('SENTRY_ENVIRONMENT', get_environment())


def get_sentry_traces_sample_rate() -> float:
    """Get Sentry traces sample rate."""
    try:
        return float(os.getenv('SENTRY_TRACES_SAMPLE_RATE', '0.1'))
    except ValueError:
        return 0.1


def get_supabase_client():
    """
    Get Supabase client instance for authentication and user operations.

    Uses the service role key for administrative operations on the Supabase database.

    Returns:
        Supabase Client instance

    Raises:
        HTTPException: If Supabase credentials are not configured
    """
    from supabase import create_client
    from fastapi import HTTPException

    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

    if not supabase_url or not supabase_key:
        raise HTTPException(500, "Supabase not configured")

    return create_client(supabase_url, supabase_key)


# ============================================================================
# Logging Configuration
# ============================================================================

def get_log_level() -> str:
    """
    Get log level from environment.

    Returns:
        Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    return os.getenv('LOG_LEVEL', 'DEBUG' if is_development() else 'INFO').upper()


def get_log_format() -> str:
    """
    Get log format from environment.

    Returns:
        Log format (json or text)
    """
    return os.getenv('LOG_FORMAT', 'text' if is_development() else 'json').lower()


# ============================================================================
# CORS Configuration
# ============================================================================

def get_cors_origins() -> List[str]:
    """
    Get allowed CORS origins from environment.

    Returns:
        List of allowed origin URLs
    """
    origins_str = os.getenv(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:8000,http://127.0.0.1:8000'
    )
    return [origin.strip() for origin in origins_str.split(',') if origin.strip()]


def get_cors_allow_credentials() -> bool:
    """Check if CORS credentials are allowed."""
    return os.getenv('CORS_ALLOW_CREDENTIALS', 'false').lower() == 'true'


# ============================================================================
# Server Configuration
# ============================================================================

def get_host() -> str:
    """Get server host."""
    return os.getenv('HOST', '0.0.0.0')


def get_port() -> int:
    """Get server port."""
    try:
        return int(os.getenv('PORT', '8000'))
    except ValueError:
        return 8000


# ============================================================================
# Configuration Validation
# ============================================================================

def validate_config() -> None:
    """
    Validate required environment variables on startup.

    Raises:
        SystemExit: If required configuration is missing
    """
    errors = []

    # Check eBay credentials (required for Finding API + Browse API)
    ebay_app_id = os.getenv('EBAY_APP_ID')
    ebay_dev_id = os.getenv('EBAY_DEV_ID')
    ebay_cert_id = os.getenv('EBAY_CERT_ID')

    if not ebay_app_id:
        errors.append("EBAY_APP_ID is required for sold listings (Finding API) and active listings (Browse API)")

    if not ebay_cert_id:
        logger.warning("EBAY_CERT_ID not configured. Active listings (Browse API) may not work.")

    # SearchAPI key is optional (legacy — kept for potential fallback)
    if not get_search_api_key():
        logger.info("SEARCH_API_KEY not configured (optional — Finding API used for sold listings)")

    # Validate environment name
    env = get_environment()
    if env not in ['development', 'staging', 'production']:
        errors.append(f"Invalid ENVIRONMENT value: {env}. Must be development, staging, or production.")

    # Validate log level
    log_level = get_log_level()
    if log_level not in ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']:
        errors.append(f"Invalid LOG_LEVEL value: {log_level}")

    # Validate log format
    log_format = get_log_format()
    if log_format not in ['json', 'text']:
        errors.append(f"Invalid LOG_FORMAT value: {log_format}. Must be json or text.")

    # Production-specific validations
    if is_production():
        if not get_sentry_dsn():
            logger.warning("SENTRY_DSN not configured. Error monitoring disabled in production.")

        if get_log_format() != 'json':
            logger.warning("LOG_FORMAT should be 'json' in production for better log aggregation.")

    # Report errors
    if errors:
        logger.error("Configuration validation failed:")
        for error in errors:
            logger.error(f"  {error}")
        logger.error("Please check your .env file and ensure all required variables are set.")
        logger.error("See .env.example for reference.")
        sys.exit(1)

    # Print configuration summary
    logger.info(f"Environment: {get_environment()}")
    logger.info(f"Log Level: {get_log_level()}")
    logger.info(f"Log Format: {get_log_format()}")
    logger.info(f"Redis URL: {get_redis_url()}")
    logger.info(f"CORS Origins: {', '.join(get_cors_origins())}")
    if is_production() and get_sentry_dsn():
        logger.info("Sentry: Enabled")


# ============================================================================
# Rate Limiting
# ============================================================================

RATE_LIMIT_PER_MINUTE = 10
"""Maximum requests per minute per IP address."""

RATE_LIMIT_STRING = f"{RATE_LIMIT_PER_MINUTE}/minute"
"""Rate limit in slowapi format."""


# ============================================================================
# Scraper Configuration
# ============================================================================

MAX_RESULTS_PER_PAGE = 120
"""Maximum results to fetch per page from SearchAPI.io (legacy)."""

EBAY_API_LIMIT = 200
"""Maximum results per page from eBay Browse API."""

FINDING_API_RESULTS_PER_PAGE = 100
"""Maximum results per page from eBay Finding API."""

MAX_CONCURRENT_REQUESTS = 3
"""Maximum concurrent API requests to avoid rate limits."""

DEFAULT_PAGE_DELAY_SECS = 2.0
"""Default delay between sequential page requests (deprecated with async)."""


# ============================================================================
# Cache Configuration
# ============================================================================

CACHE_TTL_SOLD = 1800
"""Cache TTL for sold listings in seconds (30 minutes)."""

CACHE_TTL_ACTIVE = 300
"""Cache TTL for active listings in seconds (5 minutes)."""


# ============================================================================
# FMV Calculation
# ============================================================================

IQR_OUTLIER_MULTIPLIER = 0.5
"""
IQR multiplier for outlier detection in FMV calculation.
Lower value = more aggressive filtering (focuses on core cluster).
Standard value would be 1.5, but 0.5 focuses on main price cluster.
"""

MIN_ITEMS_FOR_OUTLIER_DETECTION = 4
"""Minimum number of items required to perform outlier detection."""

MIN_ITEMS_FOR_FMV = 2
"""Minimum number of items required to calculate FMV."""


# ============================================================================
# Price Concentration Detection
# ============================================================================

MIN_CONCENTRATION_RATIO = 0.25
"""
Minimum ratio of sales in one cluster to detect price concentration.
If 25%+ of sales fall within a tight price range, use cluster center as FMV.
"""

MIN_SECONDARY_CLUSTER_RATIO = 0.10
"""
Minimum ratio of sales for a secondary cluster to anchor quick_sale/patient_sale.
Lower bar than primary (10% vs 25%) because secondaries inform the range, not the center.
"""

MIN_SECONDARY_CLUSTER_SIZE = 2
"""
Absolute minimum items for a secondary cluster, regardless of ratio.
Prevents a single outlier sale from anchoring quick_sale/patient_sale.
"""

PRICE_BIN_SIZE_BULK = 0.50
"""Bin size for cards with median price ≤$10."""

PRICE_BIN_SIZE_LOW = 2.00
"""Bin size for cards with median price $10-$100. DEPRECATED — use PRICE_BIN_PCT_LOW instead."""

PRICE_BIN_PCT_LOW = 0.05
"""Bin size as fraction of median price for $10-$100 cards (matches mid-tier scaling)."""

PRICE_BIN_PCT_MID = 0.05
"""Bin size as fraction of median price for $100-$1000 cards."""

PRICE_BIN_PCT_GRAIL = 0.03
"""Bin size as fraction of median price for $1000+ cards."""


# ============================================================================
# Competitive Active Zone Detection
# ============================================================================

COMPETITIVE_ZONE_IQR_MULT = 1.0
"""IQR multiplier for competitive zone boundaries around sold Q1/Q3."""

COMPETITIVE_ZONE_MIN_MARGIN = 0.10
"""Minimum zone margin as fraction of bid_center (floor when sold IQR is tiny)."""

MIN_COMPETITIVE_ACTIVE_COUNT = 3
"""Minimum competitive active listings required to use competitive zone in blend."""


# ============================================================================
# Active Market Validation
# ============================================================================

ACTIVE_FLOOR_MULTIPLIER = 1.2
"""
Active floor must be 20%+ higher than calculated quick_sale to trigger adjustment.
Prevents over-adjustment from sparse active data.
"""

ACTIVE_FLOOR_ADJUSTMENT = 1.15
"""Adjust market_value to 115% of active floor when validation triggers."""


# ============================================================================
# Parallel Classification for Outliers
# ============================================================================

RARE_PARALLEL_THRESHOLD = 50
"""Parallel numbering threshold - /50 or lower is considered rare."""

AUTO_KEYWORDS = ['auto', 'au', 'autograph', 'signature', 'signed']
"""Keywords indicating autograph cards for outlier classification."""


# ============================================================================
# Volatility Thresholds
# ============================================================================

HIGH_VOLATILITY_CV = 0.5
"""
Coefficient of variation threshold for high price volatility.
CV > 0.5 indicates unstable market, downgrades confidence.
"""


# ============================================================================
# Volume Weighting Configuration
# ============================================================================

AUCTION_BASE_WEIGHT = 1.5
"""Base weight multiplier for auction sales (more price discovery)."""

BUY_IT_NOW_WEIGHT = 0.8
"""Weight multiplier for Buy It Now sales (less price discovery)."""

BEST_OFFER_WEIGHT = 1.1
"""Weight multiplier for sales with Best Offer accepted."""

# Bid count weight bonuses
BID_COUNT_HIGH = 20
"""Bid count threshold for high competition (~75th percentile)."""

BID_COUNT_MODERATE = 10
"""Bid count threshold for moderate competition (~50th percentile)."""

BID_COUNT_LOW = 3
"""Bid count threshold for low competition (~25th percentile)."""

BID_WEIGHT_HIGH = 1.0
"""Additional weight for high bid count."""

BID_WEIGHT_MODERATE = 0.5
"""Additional weight for moderate bid count."""

BID_WEIGHT_LOW = 0.25
"""Additional weight for low bid count."""

MIN_VOLUME_WEIGHT = 0.5
"""Minimum volume weight for any item."""

MAX_VOLUME_WEIGHT = 3.0
"""Maximum volume weight for any item."""


# ============================================================================
# Volume Confidence Thresholds
# ============================================================================

CONFIDENCE_HIGH_RATIO = 0.6
"""Ratio of high-weight sales for high confidence."""

CONFIDENCE_MEDIUM_RATIO = 0.3
"""Ratio of high-weight sales for medium confidence."""


# ============================================================================
# File Storage
# ============================================================================

RESULTS_FILE = "results_library_complete.csv"
"""Default filename for results CSV (deprecated - not used per eBay ToS)."""


# ============================================================================
# eBay Deep Link Configuration
# ============================================================================

EBAY_ROTATION_IDS = {
    "com": "711-53200-19255-0",      # US
    "de": "707-53477-19255-0",       # Germany
    "co.uk": "710-53481-19255-0",    # UK
}
"""eBay Partner Network rotation IDs for different marketplaces."""


# ============================================================================
# Market Intelligence Configuration
# ============================================================================

MIN_PARALLEL_SAMPLES = 2
"""Minimum number of samples required for parallel analysis."""

MAX_PARALLEL_PREMIUMS = 3
"""Maximum number of parallel premiums to display."""

MAX_YEAR_TRENDS = 2
"""Maximum number of year-over-year trends to display."""

HIGH_ACTIVITY_BID_THRESHOLD = 10
"""Bid count threshold for high-activity premium analysis."""


# ============================================================================
# Collections & Binders Configuration (Phase 2)
# ============================================================================

COLLECTION_AUTO_UPDATE_THRESHOLD_DAYS = 90
"""Number of days before a card's FMV is considered stale and needs updating."""

COLLECTION_MAX_PRICE_HISTORY_ENTRIES = 365
"""Maximum number of price history entries to keep per card (1 year of daily updates)."""

COLLECTION_VOLATILITY_THRESHOLD = 0.50
"""
Volatility threshold for automated FMV updates.
If new FMV differs from previous by more than 50%, flag for manual review.
"""

COLLECTION_KEYWORD_BLACKLIST = [
    'reprint', 'digital', 'rp', 'box', 'pack', 'lot',
    'custom', 'proxy', 'replica', 'reproduction'
]
"""Keywords to exclude from automated valuation searches."""

COLLECTION_MAX_CARDS_PER_BINDER = 1000
"""Maximum number of cards allowed in a single binder."""

COLLECTION_MAX_BINDERS_PER_USER = 50
"""Maximum number of binders a user can create."""

COLLECTION_SPARKLINE_DATA_POINTS = 30
"""Number of price history points to return for sparkline charts."""


# ============================================================================
# Subscription Tier Configuration (Phase 1)
# ============================================================================

TIER_LIMITS = {
    'free': {
        'daily_searches': 5,
        'max_cards': 50,
        'max_binders': -1,  # -1 = unlimited
        'auto_valuation_limit': 0,  # No auto-valuations
        'advanced_analytics': False,
    },
    'member': {
        'daily_searches': 20,
        'max_cards': -1,  # Unlimited
        'max_binders': -1,
        'auto_valuation_limit': 10,  # Max 10 cards with auto-valuation
        'advanced_analytics': True,
    },
    'founder': {
        'daily_searches': -1,  # Unlimited
        'max_cards': -1,
        'max_binders': -1,
        'auto_valuation_limit': -1,  # Unlimited
        'advanced_analytics': True,
    }
}
"""
Subscription tier limits configuration.
-1 indicates unlimited for that feature.
"""


# ============================================================================
# Stripe Payment Integration (Phase 1)
# ============================================================================

STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
"""Stripe secret key for server-side API calls (from environment)."""

STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY')
"""Stripe publishable key for client-side integration (from environment)."""

STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')
"""Stripe webhook signing secret for verifying webhook authenticity (from environment)."""

# Stripe Price IDs (from Stripe Dashboard)
STRIPE_PRICES = {
    'member_monthly': os.getenv('STRIPE_PRICE_MEMBER_MONTHLY'),
    'member_annual': os.getenv('STRIPE_PRICE_MEMBER_ANNUAL'),
    'founder_monthly': os.getenv('STRIPE_PRICE_FOUNDER_MONTHLY'),
    'founder_annual': os.getenv('STRIPE_PRICE_FOUNDER_ANNUAL'),
}
"""Stripe Price IDs for each subscription tier and billing interval."""

# Frontend URL for Stripe redirects
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:8000')
"""Frontend base URL for Stripe checkout success/cancel redirects."""


# ============================================================================
# Print Run Scarcity Tiers
# ============================================================================

# ============================================================================
# Player Score Configuration
# ============================================================================

PLAYER_SCORE_ENABLED = os.getenv("PLAYER_SCORE_ENABLED", "true").lower() == "true"
"""Master switch for the player collectibility component."""

PLAYER_STATS_CSV_DIR = os.getenv(
    "PLAYER_STATS_CSV_DIR",
    os.path.expanduser(
        "~/Documents/Personal/Fantasy Baseball/Stats/Stats"
    ),
)
"""Directory containing FanGraphs season and career CSV files."""

PLAYER_PROJECTIONS_DIR = os.getenv(
    "PLAYER_PROJECTIONS_DIR",
    os.path.expanduser(
        "~/Documents/Personal/Fantasy Baseball/Stats/2025_Projections/Preseason"
    ),
)
"""Directory containing FanGraphs projection/auction CSVs with ADP data."""

PLAYER_CACHE_TTL_PROFILE = int(os.getenv("PLAYER_CACHE_TTL_PROFILE", "86400"))
"""Redis TTL for player bio/draft data (24 hours)."""

PLAYER_CACHE_TTL_STATS = int(os.getenv("PLAYER_CACHE_TTL_STATS", "21600"))
"""Redis TTL for player season stats (6 hours)."""

PLAYER_CACHE_TTL_POPULARITY = int(os.getenv("PLAYER_CACHE_TTL_POPULARITY", "14400"))
"""Redis TTL for Wikipedia pageview data (4 hours)."""

PLAYER_CACHE_TTL_SCORE = int(os.getenv("PLAYER_CACHE_TTL_SCORE", "3600"))
"""Redis TTL for computed player score (1 hour)."""

WIKIPEDIA_POPULARITY_ENABLED = os.getenv("WIKIPEDIA_POPULARITY_ENABLED", "true").lower() == "true"
"""Enable Wikipedia pageview popularity lookups."""

# Player sub-factor max contributions (must sum to 5.0)
PLAYER_WEIGHT_POSITION = 0.40
PLAYER_WEIGHT_TAM = 0.50
PLAYER_WEIGHT_PEDIGREE = 1.25
PLAYER_WEIGHT_STATISTICS = 1.10
PLAYER_WEIGHT_LIQUIDITY = 0.50
PLAYER_WEIGHT_FLIPPING = 0.50
PLAYER_WEIGHT_POPULARITY = 0.75


SCARCITY_TIERS = [
    # (max_print_run, label, gradient_start, gradient_end, border_color)
    (1, "1 of 1", "#fff7e6", "#ffecb3", "#ffc107"),
    (50, "Extremely Rare", "#fce4ec", "#f8bbd0", "#e91e63"),
    (100, "Very Rare", "#fff3e0", "#ffe0b2", "#ff9800"),
    (999, "Rare", "#fefce8", "#fef9c3", "#eab308"),
    (5000, "A Little Rare", "#e8f5e9", "#c8e6c9", "#4caf50"),
    (float("inf"), "Common", "#f5f5f5", "#eeeeee", "#9e9e9e"),
]
"""Scarcity tier definitions for the Print Run analytics card.
Each tuple: (max_print_run, label, gradient_start, gradient_end, border_color).
"""
