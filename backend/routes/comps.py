# backend/routes/comps.py
"""
Comps router - handles sold and active listings endpoints.

This module contains the main search endpoints for finding comparable
card prices from eBay's sold and active listings.
"""
import time
import uuid
from typing import List
from fastapi import APIRouter, Depends, Request, HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.models.validators import QueryValidator, ActiveListingsValidator
from backend.exceptions import (
    APIKeyMissingError,
    ScraperError,
    ExternalServiceError,
)
from backend.logging_config import get_logger, log_with_context
from backend.cache import CacheService
from backend.config import (
    get_search_api_key,
    use_ebay_finding_api,
    enable_browse_enrichment,
    get_max_enrichment_count,
    get_enrichment_threshold,
    get_enrichment_max_concurrent,
    CACHE_TTL_SOLD,
    CACHE_TTL_ACTIVE,
    EBAY_DAILY_CALL_LIMIT,
    RATE_LIMIT_WARNING_THRESHOLD
)
from backend.services.intelligence_service import analyze_market_intelligence
from backend.services.api_usage_tracker import APIUsageTracker
from backend.services.circuit_breaker import CircuitBreaker
from backend.models.schemas import CompItem, CompsResponse
from backend.utils import generate_ebay_deep_link, load_test_data
from scraper import scrape_sold_comps, scrape_sold_comps_finding_api, scrape_active_listings_ebay_api
from backend.ebay_finding_client import RateLimitError


# Initialize router
router = APIRouter()

# Initialize logger for this module
logger = get_logger(__name__)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


def get_cache_service(request: Request) -> CacheService:
    """Dependency to get cache service from app state."""
    return request.app.state.cache_service


def get_api_tracker(request: Request) -> APIUsageTracker:
    """Dependency to get API usage tracker from cache service."""
    cache_service = request.app.state.cache_service
    # Pass the Redis client from cache service to tracker
    return APIUsageTracker(redis_client=cache_service.redis if cache_service._is_available else None)


def get_circuit_breaker(request: Request) -> CircuitBreaker:
    """Dependency to get circuit breaker from cache service."""
    cache_service = request.app.state.cache_service
    # Pass the Redis client from cache service to circuit breaker
    return CircuitBreaker(redis_client=cache_service.redis if cache_service._is_available else None)


@router.get("/comps", response_model=CompsResponse)
@limiter.limit("10/minute")
async def get_comps(
    request: Request,
    params: QueryValidator = Depends(),
    cache_service: CacheService = Depends(get_cache_service),
    api_tracker: APIUsageTracker = Depends(get_api_tracker),
    circuit_breaker: CircuitBreaker = Depends(get_circuit_breaker)
):
    """
    Scrape eBay SOLD/COMPLETED listings for a given query and return:
      - Basic stats on item price (no shipping)
      - FMV metrics based on item price (no shipping)
      - Full list of items
    
    Note: Uses SearchAPI.io because the official eBay Browse API does NOT support
    searching sold/completed listings - it only returns active listings.
    """
    # Generate correlation ID for request tracking
    correlation_id = str(uuid.uuid4())
    start_time = time.time()
    
    # Log request start
    log_with_context(
        logger,
        'info',
        'Sold listings search started',
        correlation_id=correlation_id,
        endpoint='/comps',
        query=params.query,
        pages=params.pages,
        user_ip=request.client.host if request.client else 'unknown',
        test_mode=params.test_mode
    )
    
    # Generate cache key from all query parameters including API source and enrichment settings
    cache_params = {
        "query": params.query,
        "api_source": "finding_api" if use_ebay_finding_api() else "search_api",
        "enrichment_enabled": enable_browse_enrichment() if use_ebay_finding_api() else False,
        "pages": params.pages or 1,
        "sort_by": params.sort_by or 'best_match',
        "buying_format": params.buying_format,
        "condition": params.condition,
        "price_min": params.price_min,
        "price_max": params.price_max,
        "raw_only": params.raw_only or False,
        "base_only": params.base_only or False,
        "exclude_autographs": params.exclude_autographs or False,
    }
    cache_key = CacheService.generate_cache_key("kuya_comps:sold", cache_params)
    
    # DIAGNOSTIC: Check Redis connection status
    redis_available = await cache_service._ensure_connection()
    print(f"[DIAGNOSTIC] Redis connection available: {redis_available}")
    if not redis_available:
        print(f"[DIAGNOSTIC] ⚠️ WARNING: Redis is UNAVAILABLE - all searches will hit eBay API directly!")
    log_with_context(
        logger,
        "debug",
        "Generated cache key",
        cache_key=cache_key,
        cache_params=cache_params,
        redis_available=redis_available,
    )
    
    # Multi-layer rate limit protection (Phase 4)
    if use_ebay_finding_api() and not params.test_mode:
        # 1. Check circuit breaker state
        can_proceed, reason = await circuit_breaker.can_proceed('ebay_finding_api')
        if not can_proceed:
            logger.warning(f"Circuit breaker blocking request: {reason}", extra={"correlation_id": correlation_id})
            
            # Get usage stats for enhanced error response (Phase 5)
            usage_stats = await api_tracker.get_stats('ebay_finding_api')
            circuit_state = await circuit_breaker.get_state('ebay_finding_api')
            backoff_level = await circuit_breaker.get_backoff_level('ebay_finding_api')
            
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "CIRCUIT_OPEN",
                    "message": reason,
                    "usage": {
                        "daily_calls": usage_stats.get('daily_calls', 0),
                        "daily_limit": EBAY_DAILY_CALL_LIMIT,
                        "hourly_calls": usage_stats.get('hourly_calls', 0),
                        "percentage_used": f"{(usage_stats.get('daily_calls', 0)/EBAY_DAILY_CALL_LIMIT)*100:.1f}%",
                        "rate_limited_calls": usage_stats.get('rate_limited_calls', 0)
                    },
                    "circuit_state": circuit_state,
                    "backoff_level": backoff_level,
                    "correlation_id": correlation_id
                }
            )
        
        # 2. Check daily usage limit
        daily_usage = await api_tracker.get_daily_usage('ebay_finding_api')
        if await api_tracker.is_near_limit('ebay_finding_api', daily_limit=EBAY_DAILY_CALL_LIMIT, threshold=RATE_LIMIT_WARNING_THRESHOLD):
            usage_stats = await api_tracker.get_stats('ebay_finding_api')
            logger.warning(
                f"Approaching eBay API daily limit: {daily_usage}/{EBAY_DAILY_CALL_LIMIT} calls "
                f"({(daily_usage/EBAY_DAILY_CALL_LIMIT)*100:.1f}%)",
                extra={"correlation_id": correlation_id}
            )
            # Log warning but continue - don't block the request yet
    
    # Check if we're currently rate limited (timestamp-based, not just key existence)
    rate_limit_key = "rate_limit:ebay:finding_api"
    if redis_available:
        rate_limit_data = await cache_service.get(rate_limit_key)
        
        # CRITICAL FIX: Check timestamp instead of just key existence
        # This prevents race condition where TTL expires but eBay is still rate limiting
        if rate_limit_data:
            limited_until = rate_limit_data.get('limited_until', 0)
            current_time = time.time()
            
            # Only block if we're actually still within the rate limit window
            if current_time < limited_until:
                remaining = max(0, int(limited_until - current_time))
                retry_after = rate_limit_data.get('retry_after', 300)
                backoff_level = rate_limit_data.get('backoff_level', 0)
                triggered_at = rate_limit_data.get('triggered_at', current_time)
                
                print(f"[RATE LIMIT CHECK] Currently rate limited:")
                print(f"  - Triggered at: {triggered_at}")
                print(f"  - Limited until: {limited_until}")
                print(f"  - Current time: {current_time}")
                print(f"  - Remaining: {remaining}s")
                print(f"  - Backoff level: {backoff_level}")
                
                # Get usage stats for enhanced error response (Phase 5)
                usage_stats = await api_tracker.get_stats('ebay_finding_api')
                circuit_state = await circuit_breaker.get_state('ebay_finding_api')
                
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "RATE_LIMIT_ACTIVE",
                        "message": f"eBay API rate limit is active. Please wait {remaining} seconds before searching again.",
                        "retry_after": remaining,
                        "limited_until": limited_until,
                        "backoff_level": backoff_level,
                        "usage": {
                            "daily_calls": usage_stats.get('daily_calls', 0),
                            "daily_limit": EBAY_DAILY_CALL_LIMIT,
                            "hourly_calls": usage_stats.get('hourly_calls', 0),
                            "percentage_used": f"{(usage_stats.get('daily_calls', 0)/EBAY_DAILY_CALL_LIMIT)*100:.1f}%",
                            "rate_limited_calls": usage_stats.get('rate_limited_calls', 0)
                        },
                        "circuit_state": circuit_state,
                        "correlation_id": correlation_id
                    }
                )
            else:
                # Rate limit window has expired, clean up the stale key
                print(f"[RATE LIMIT CHECK] Rate limit window expired (expired {int(current_time - limited_until)}s ago), cleaning up stale key")
                await cache_service.delete(rate_limit_key)
    
    # Try to get from cache first (skip cache in test mode)
    if not params.test_mode:
        cached_response = await cache_service.get(cache_key)
        if cached_response is not None:
            duration_ms = (time.time() - start_time) * 1000
            log_with_context(
                logger,
                'info',
                'Cache hit for sold listings',
                correlation_id=correlation_id,
                endpoint='/comps',
                query=params.query,
                duration_ms=round(duration_ms, 2),
                cache_key=cache_key
            )
            print(f"[CACHE HIT] Returning cached data for sold listings: {params.query}")
            return CompsResponse(**cached_response)
    
    # Cache miss - log it
    log_with_context(
        logger,
        'info',
        'Cache miss for sold listings',
        correlation_id=correlation_id,
        endpoint='/comps',
        query=params.query,
        cache_key=cache_key
    )
    print(f"[CACHE MISS] Scraping fresh data for sold listings: {params.query}")
    
    try:
        if params.test_mode:
            print("[INFO] Using test mode with CSV data")
            raw_items = load_test_data()
        elif use_ebay_finding_api():
            # NEW: Use Finding API
            print("[INFO] Using eBay Finding API for sold listings")
            
            # Modify query based on filters
            modified_query = params.query
            if params.raw_only:
                modified_query = f"{modified_query} -PSA -BGS -SGC -CSG -HGA -graded -grade -gem -mint"
            
            try:
                raw_items = await scrape_sold_comps_finding_api(
                    query=modified_query,
                    max_pages=params.pages,
                    sort_by=params.sort_by,
                    buying_format=params.buying_format,
                    condition=params.condition,
                    price_min=params.price_min,
                    price_max=params.price_max,
                )
                
                # Record successful API call (Phase 4)
                await api_tracker.record_call('ebay_finding_api', success=True, rate_limited=False)
                await circuit_breaker.record_success('ebay_finding_api')
                print(f"[API TRACKER] Recorded successful Finding API call")
                print(f"[CIRCUIT BREAKER] Recorded success")
                
            except RateLimitError:
                # Record rate-limited call before re-raising (Phase 4)
                await api_tracker.record_call('ebay_finding_api', success=False, rate_limited=True)
                await circuit_breaker.record_failure('ebay_finding_api', is_rate_limit=True)
                print(f"[API TRACKER] Recorded rate-limited Finding API call")
                print(f"[CIRCUIT BREAKER] Recorded rate limit failure")
                raise
            except Exception:
                # Record failed call before re-raising (Phase 4)
                await api_tracker.record_call('ebay_finding_api', success=False, rate_limited=False)
                await circuit_breaker.record_failure('ebay_finding_api', is_rate_limit=False)
                print(f"[API TRACKER] Recorded failed Finding API call")
                print(f"[CIRCUIT BREAKER] Recorded failure")
                raise
            
            # Enrich Finding API results with Browse API data if enabled
            # ENRICHMENT DISABLED: Removed to reduce API call volume
            # Shipping data is no longer fetched or displayed
            # if enable_browse_enrichment() and raw_items:
            #     try:
            #         from backend.services.ebay_enrichment_service import enrich_items_with_browse_api
            #         
            #         enrichment_count = get_max_enrichment_count()
            #         enrichment_threshold = get_enrichment_threshold()
            #         enrichment_concurrent = get_enrichment_max_concurrent()
            #         
            #         print(f"[ENRICHMENT] Enriching up to {enrichment_count} items (threshold: {enrichment_threshold*100:.0f}%, concurrent: {enrichment_concurrent})")
            #         
            #         raw_items = await enrich_items_with_browse_api(
            #             items=raw_items,
            #             max_enrich=enrichment_count,
            #             enrich_threshold=enrichment_threshold,
            #             max_concurrent=enrichment_concurrent
            #         )
            #         
            #         enriched_count = sum(1 for item in raw_items if item.get('browse_enriched', False))
            #         print(f"[ENRICHMENT] Successfully enriched {enriched_count} items with Browse API data")
            #         
            #     except Exception as e:
            #         # Log enrichment failure but continue - don't break the request
            #         print(f"[ENRICHMENT] Warning: Enrichment failed, continuing with Finding API data only: {e}")
            #         log_with_context(
            #             logger,
            #             'warning',
            #             'Browse API enrichment failed',
            #             correlation_id=correlation_id,
            #             endpoint='/comps',
            #             query=params.query,
            #             error=str(e)
            #         )
        else:
            # EXISTING: Use SearchAPI
            print("[INFO] Using SearchAPI.io for sold listings")
            
            # Check if API key is configured
            api_key = get_search_api_key()
            if not api_key:
                raise APIKeyMissingError(
                    service="SearchAPI",
                    details={"endpoint": "/comps", "query": params.query}
                )
            
            # Modify query based on filters
            modified_query = params.query
            if params.raw_only:
                modified_query = f"{modified_query} -PSA -BGS -SGC -CSG -HGA -graded -grade -gem -mint"
            
            raw_items = await scrape_sold_comps(
                query=modified_query,
                max_pages=params.pages,
                delay_secs=params.delay,
                ungraded_only=params.raw_only,  # Keep this for backward compatibility
                api_key=api_key,
                sort_by=params.sort_by,
                buying_format=params.buying_format,
                condition=params.condition,
                price_min=params.price_min,
                price_max=params.price_max,
            )

            # Additional post-processing filtering using API data
            filtered_items = []
            for item in raw_items:
                title = item.get('title', '').lower()
                condition = item.get('condition', '').lower()
                authenticity = item.get('authenticity', '').lower()
                extensions = [ext.lower() for ext in item.get('extensions', [])]
                
                # Raw Only filter - check both title and condition/authenticity data
                if params.raw_only:
                    # Filter out items with "Graded" in the condition field
                    if condition == 'graded':
                        print(f"[RAW ONLY] Filtered graded item: {item.get('item_id')} - condition={item.get('condition')}")
                        continue
                    # Check title for grading terms
                    if any(term in title for term in ['psa', 'bgs', 'sgc', 'csg', 'hga', 'graded', 'grade', 'gem', 'mint']):
                        continue
                    # Check authenticity field
                    if 'graded' in authenticity:
                        continue
                    # Check PSA vault status
                    if item.get('is_in_psa_vault'):
                        continue
                    
                # Base Only filter - check title and extensions
                if params.base_only:
                    if any(term in title for term in [
                        'refractor', 'prizm', 'prism', 'parallel', 'wave', 'gold', 'purple', 'blue', 'red', 'green',
                        'yellow', 'orange', 'pink', 'black', 'atomic', 'xfractor', 'superfractor', 'numbered', 'stars', 'star'
                    ]):
                        continue
                    if any(term in ' '.join(extensions) for term in ['parallel', 'refractor', 'prizm', 'numbered']):
                        continue
                    
                # Exclude Autographs filter - check title, authenticity, and extensions
                if params.exclude_autographs:
                    if any(term in title for term in ['auto', 'autograph', 'signed', 'signature', 'authentic', 'certified']):
                        continue
                    if 'autograph' in authenticity or any('autograph' in ext for ext in extensions):
                        continue
                    
                filtered_items.append(item)

            raw_items = filtered_items
        
    except RateLimitError as e:
        # DIAGNOSTIC: Log rate limit details
        current_time = time.time()
        
        # Get exponential backoff duration from circuit breaker (Phase 4)
        backoff_duration = await circuit_breaker.get_backoff_duration('ebay_finding_api')
        backoff_level = await circuit_breaker.get_backoff_level('ebay_finding_api')
        limited_until = current_time + backoff_duration
        
        print(f"[RATE LIMIT HIT] ⚠️ eBay API rate limit triggered")
        print(f"  - Timestamp: {current_time}")
        print(f"  - Backoff duration: {backoff_duration}s (level: {backoff_level})")
        print(f"  - Limited until: {limited_until}")
        print(f"  - Retry after: {int((limited_until - current_time) / 60)} minutes")
        
        # Force open circuit breaker (Phase 4)
        await circuit_breaker.force_open('ebay_finding_api', backoff_duration)
        
        # Get usage stats for error response
        usage_stats = await api_tracker.get_stats('ebay_finding_api')
        circuit_state = await circuit_breaker.get_state('ebay_finding_api')
        
        # CRITICAL FIX: Store rate limit state with extended TTL to prevent premature expiration
        # Use 2x backoff duration to ensure key doesn't expire before rate limit window ends
        # This prevents race condition where Redis TTL expires but eBay is still rate limiting
        rate_limit_key = "rate_limit:ebay:finding_api"
        rate_limit_data = {
            "retry_after": backoff_duration,
            "limited_until": limited_until,
            "triggered_at": current_time,
            "backoff_level": backoff_level
        }
        
        # Extended TTL = 2x backoff duration + 60s buffer
        extended_ttl = (backoff_duration * 2) + 60
        
        if await cache_service._ensure_connection():
            stored = await cache_service.set(rate_limit_key, rate_limit_data, ttl=extended_ttl)
            if stored:
                print(f"[RATE LIMIT STORAGE] ✓ Stored rate limit state in Redis")
                print(f"  - TTL: {extended_ttl}s (2x backoff + 60s buffer)")
                print(f"  - Backoff level: {backoff_level}")
                print(f"  - Key will expire at: {current_time + extended_ttl}")
                
                # Verify the store was successful
                verify = await cache_service.get(rate_limit_key)
                if verify:
                    print(f"[RATE LIMIT STORAGE] ✓ Verified: Rate limit state successfully stored")
                else:
                    print(f"[RATE LIMIT STORAGE] ✗ WARNING: Failed to verify rate limit state!")
            else:
                print(f"[RATE LIMIT STORAGE] ✗ Failed to store rate limit state in Redis")
        else:
            print(f"[RATE LIMIT STORAGE] ⚠️ Redis unavailable - rate limit state not stored (retries won't be blocked!)")
        
        # Handle eBay rate limit specifically with user-friendly message (Phase 4)
        log_with_context(
            logger,
            'error',
            'eBay API rate limit exceeded',
            correlation_id=correlation_id,
            endpoint='/comps',
            query=params.query,
            error=str(e),
            retry_after=backoff_duration,
            backoff_level=backoff_level,
            daily_calls=usage_stats.get('daily_calls', 0),
            hourly_calls=usage_stats.get('hourly_calls', 0),
            circuit_state=circuit_state
        )
        raise HTTPException(
            status_code=429,
            detail={
                "error": "RATE_LIMIT_EXCEEDED",
                "message": str(e),
                "retry_after": backoff_duration,
                "limited_until": limited_until,
                "backoff_level": backoff_level,
                "usage": {
                    "daily_calls": usage_stats.get('daily_calls', 0),
                    "daily_limit": EBAY_DAILY_CALL_LIMIT,
                    "hourly_calls": usage_stats.get('hourly_calls', 0),
                    "percentage_used": f"{(usage_stats.get('daily_calls', 0)/EBAY_DAILY_CALL_LIMIT)*100:.1f}%",
                    "rate_limited_calls": usage_stats.get('rate_limited_calls', 0)
                },
                "circuit_state": circuit_state,
                "correlation_id": correlation_id
            }
        )
    except APIKeyMissingError as e:
        # Log and re-raise custom exceptions
        log_with_context(
            logger,
            'error',
            'API key missing',
            correlation_id=correlation_id,
            endpoint='/comps',
            error=str(e)
        )
        raise
    except FileNotFoundError as e:
        log_with_context(
            logger,
            'error',
            'Test data file not found',
            correlation_id=correlation_id,
            endpoint='/comps',
            error=str(e),
            test_mode=params.test_mode
        )
        raise ScraperError(
            message=f"Test data file not found: {str(e)}",
            service="TestData",
            details={"test_mode": params.test_mode, "correlation_id": correlation_id}
        )
    except TypeError as e:
        log_with_context(
            logger,
            'error',
            'Scraper function signature mismatch',
            correlation_id=correlation_id,
            endpoint='/comps',
            query=params.query,
            error=str(e)
        )
        raise ScraperError(
            message=f"Scraper function signature mismatch: {str(e)}",
            service="SearchAPI",
            details={"query": params.query, "error_type": "TypeError", "correlation_id": correlation_id}
        )
    except Exception as e:
        # Catch-all for unexpected errors
        error_message = str(e)
        log_with_context(
            logger,
            'error',
            'Failed to scrape sold listings',
            correlation_id=correlation_id,
            endpoint='/comps',
            query=params.query,
            error=error_message
        )
        
        if "API" in error_message or "api" in error_message.lower():
            raise ExternalServiceError(
                message=f"External API error: {error_message}",
                service="SearchAPI",
                service_error=error_message
            )
        else:
            raise ScraperError(
                message=f"Failed to scrape sold listings: {error_message}",
                service="SearchAPI",
                details={"query": params.query, "error": error_message, "correlation_id": correlation_id}
            )

    # Remove duplicates based on item_id and filter out zero-price items
    print(f"[INFO] Processing {len(raw_items)} raw items from scraper")
    
    unique_items = []
    seen_item_ids = set()
    duplicates_removed = 0
    zero_price_removed = 0
    no_item_id_removed = 0
    
    for idx, item in enumerate(raw_items):
        item_id = item.get('item_id')
        
        # DIAGNOSTIC: Log first 3 items to see what we're getting
        if idx < 3:
            print(f"[DIAGNOSTIC] Item {idx} before filtering:")
            print(f"  - item_id: {item_id}")
            print(f"  - price field: {item.get('price')}")
            print(f"  - extracted_price field: {item.get('extracted_price')}")
            print(f"  - Item keys: {list(item.keys())[:15]}")
        
        # Skip items without item_id
        if not item_id:
            no_item_id_removed += 1
            continue
        
        # Skip duplicates
        if item_id in seen_item_ids:
            duplicates_removed += 1
            continue
            
        # Check for valid price
        extracted_price = item.get('extracted_price')
        if extracted_price is None or extracted_price <= 0:
            zero_price_removed += 1
            if idx < 3:  # Log why first items are rejected
                print(f"[DIAGNOSTIC] Item {idx} REJECTED: extracted_price={extracted_price} (price field was: {item.get('price')})")
            continue
            
        # Item passed all filters
        unique_items.append(item)
        seen_item_ids.add(item_id)
    
    print(f"[INFO] Data filtering results:")
    print(f"  - Raw items: {len(raw_items)}")
    print(f"  - Removed {duplicates_removed} duplicates")
    print(f"  - Removed {zero_price_removed} zero-price items")
    print(f"  - Removed {no_item_id_removed} items without item_id")
    print(f"  - Final clean items: {len(unique_items)}")
    
    # Convert raw items to CompItems with proper buying format flags
    comp_items = []
    for item in unique_items:
        # Get the buying format from the API response
        buying_format = item.get('buying_format', '').lower()
        
        # Set flags based on the buying format
        item['is_auction'] = 'auction' in buying_format
        item['is_buy_it_now'] = 'buy it now' in buying_format
        item['is_best_offer'] = item.get('best_offer_enabled', False) or item.get('has_best_offer', False)
        
        # If it's an auction, override other flags
        if item['is_auction']:
            item['is_buy_it_now'] = False
            item['is_best_offer'] = False
        
        # Generate deep link for mobile app navigation
        item_id = item.get('item_id')
        if item_id:
            print(f"[SOLD LISTING] Processing item_id: {item_id} (type: {type(item_id).__name__})")
            item['deep_link'] = generate_ebay_deep_link(item_id)
        else:
            print(f"[SOLD LISTING] WARNING: No item_id for item: {item.get('title', 'N/A')[:50]}")
            item['deep_link'] = None
        
        # PRICING POLICY: total_price now equals extracted_price (shipping excluded)
        # This change was made to reduce eBay Browse API enrichment calls
        comp_items.append(CompItem(**item))

    # PRICING POLICY: total_price now equals extracted_price (shipping excluded)
    # This change was made to reduce eBay Browse API enrichment calls
    for item in comp_items:
        if item.total_price is None:
            item.total_price = item.extracted_price or 0

    prices = [item.total_price for item in comp_items if item.total_price is not None]
    min_price = min(prices) if prices else None
    max_price = max(prices) if prices else None
    avg_price = sum(prices) / len(prices) if prices else None

    # Generate market intelligence
    market_intelligence = analyze_market_intelligence(comp_items)
    
    # Calculate request duration
    duration_ms = (time.time() - start_time) * 1000
    
    # Log successful completion
    log_with_context(
        logger,
        'info',
        'Sold listings search completed successfully',
        correlation_id=correlation_id,
        endpoint='/comps',
        query=params.query,
        duration_ms=round(duration_ms, 2),
        raw_items=len(raw_items),
        final_items=len(comp_items),
        duplicates_filtered=duplicates_removed,
        zero_price_filtered=zero_price_removed
    )
    
    # Build response
    response_data = CompsResponse(
        query=params.query,
        pages_scraped=params.pages,
        items=comp_items,
        min_price=min_price,
        max_price=max_price,
        avg_price=avg_price,
        raw_items_scraped=len(raw_items),
        duplicates_filtered=duplicates_removed,
        zero_price_filtered=zero_price_removed,
        market_intelligence=market_intelligence,
    )
    
    # Store in cache (skip cache in test mode)
    # TTL = 1800 seconds (30 minutes) for sold listings
    if not params.test_mode:
        cache_stored = await cache_service.set(
            cache_key,
            response_data.dict(),
            ttl=CACHE_TTL_SOLD
        )
        if cache_stored:
            print(f"[CACHE SET] ✓ Stored sold listings in cache: {params.query} (TTL: 30 min)")
            # DIAGNOSTIC: Verify cache entry immediately after setting
            retrieved_value = await cache_service.get(cache_key)
            if retrieved_value:
                print(f"[CACHE VERIFY] ✓ Successfully retrieved cache key immediately after setting.")
            else:
                print(f"[CACHE VERIFY] ✗ FAILED to retrieve cache key immediately after setting - cache may be volatile or misconfigured!")
        else:
            print(f"[CACHE SET] ✗ FAILED to store in cache - Redis unavailable!")
            print(f"[CACHE SET] ⚠️ This means ALL subsequent searches will hit eBay API (causing rate limits)")
    
    return response_data


@router.get("/active", response_model=CompsResponse)
@limiter.limit("10/minute")
async def get_active_listings(
    request: Request,
    params: ActiveListingsValidator = Depends(),
    cache_service: CacheService = Depends(get_cache_service)
):
    """
    Scrape eBay ACTIVE listings (not sold) for a given query.
    Uses official eBay Browse API for all active listing searches.
    Prices are item price only (shipping excluded).
    """
    # Generate correlation ID for request tracking
    correlation_id = str(uuid.uuid4())
    start_time = time.time()
    
    # Log request start
    log_with_context(
        logger,
        'info',
        'Active listings search started',
        correlation_id=correlation_id,
        endpoint='/active',
        query=params.query,
        pages=params.pages,
        user_ip=request.client.host if request.client else 'unknown',
        sort_by=params.sort_by
    )
    
    # Generate cache key from all query parameters
    cache_params = {
        "query": params.query,
        "pages": params.pages,
        "sort_by": params.sort_by,
        "buying_format": params.buying_format,
        "condition": params.condition
    }
    cache_key = CacheService.generate_cache_key("kuya_comps:active", cache_params)
    
    # Try to get from cache first
    cached_response = await cache_service.get(cache_key)
    if cached_response is not None:
        duration_ms = (time.time() - start_time) * 1000
        log_with_context(
            logger,
            'info',
            'Cache hit for active listings',
            correlation_id=correlation_id,
            endpoint='/active',
            query=params.query,
            duration_ms=round(duration_ms, 2),
            cache_key=cache_key
        )
        print(f"[CACHE HIT] Returning cached data for active listings: {params.query}")
        return CompsResponse(**cached_response)
    
    # Cache miss - log it
    log_with_context(
        logger,
        'info',
        'Cache miss for active listings',
        correlation_id=correlation_id,
        endpoint='/active',
        query=params.query,
        cache_key=cache_key
    )
    print(f"[CACHE MISS] Scraping fresh data for active listings: {params.query}")
    
    # Check if we're currently rate limited (eBay Browse API also has rate limits)
    rate_limit_key = "rate_limit:ebay:browse_api"
    if await cache_service._ensure_connection():
        rate_limit_data = await cache_service.get(rate_limit_key)
        if rate_limit_data:
            retry_after = rate_limit_data.get('retry_after', 300)
            limited_until = rate_limit_data.get('limited_until', time.time() + retry_after)
            remaining = max(0, int(limited_until - time.time()))
            
            print(f"[RATE LIMIT] Browse API rate limited - {remaining} seconds remaining")
            
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "RATE_LIMIT_ACTIVE",
                    "message": f"eBay Browse API rate limit is active. Please wait {remaining} seconds before searching again.",
                    "retry_after": remaining,
                    "limited_until": limited_until,
                    "correlation_id": correlation_id
                }
            )
    
    try:
        # Always use official eBay Browse API for active listings
        print("[INFO] Using official eBay Browse API for active listings")
        print(f"[INFO] Query: {params.query}")
        print(f"[INFO] Sort: {params.sort_by}, Pages: {params.pages}")
        
        raw_items = await scrape_active_listings_ebay_api(
            query=params.query,
            max_pages=params.pages,
            delay_secs=params.delay,
            sort_by=params.sort_by,
            buying_format=params.buying_format,
            condition=params.condition,
            price_min=None,  # Don't filter by price on API side - filter on frontend after getting all data
            price_max=None,  # This ensures we get complete shipping data for all items
            enrich_shipping=True,  # Fetch detailed shipping info when missing from search results
        )
        
        print(f"[INFO] Browse API returned {len(raw_items)} raw items")
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"[ERROR] Active listings failed: {e}")
        print(f"[ERROR] Traceback: {error_details}")
        
        # Determine error type and raise appropriate custom exception
        error_message = str(e)
        
        log_with_context(
            logger,
            'error',
            'Failed to fetch active listings',
            correlation_id=correlation_id,
            endpoint='/active',
            query=params.query,
            error=error_message
        )
        
        if "credentials" in error_message.lower() or "authentication" in error_message.lower():
            raise APIKeyMissingError(
                service="eBay Browse API",
                details={"endpoint": "/active", "query": params.query, "error": error_message, "correlation_id": correlation_id}
            )
        elif "API" in error_message or "api" in error_message.lower():
            raise ExternalServiceError(
                message=f"eBay Browse API error: {error_message}",
                service="eBay Browse API",
                service_error=error_message
            )
        else:
            raise ScraperError(
                message=f"Failed to fetch active listings: {error_message}",
                service="eBay Browse API",
                details={"query": params.query, "error": error_message, "traceback": error_details, "correlation_id": correlation_id}
            )

    # Remove duplicates and filter
    print(f"[INFO] Processing {len(raw_items)} raw active listings from scraper")
    
    # Debug: Show sample of first few items
    if raw_items and len(raw_items) > 0:
        print(f"[DEBUG] Sample item keys from Browse API: {list(raw_items[0].keys())[:10]}")
        print(f"[DEBUG] Sample price data: extracted_price={raw_items[0].get('extracted_price')}, price={raw_items[0].get('price')}")
    
    unique_items = []
    seen_item_ids = set()
    duplicates_removed = 0
    zero_price_removed = 0
    no_item_id_removed = 0
    
    for item in raw_items:
        item_id = item.get('item_id')
        
        if not item_id:
            no_item_id_removed += 1
            print(f"[DEBUG] Filtered item without item_id: title={item.get('title', 'N/A')[:50]}")
            continue
        
        if item_id in seen_item_ids:
            duplicates_removed += 1
            continue
            
        extracted_price = item.get('extracted_price')
        if extracted_price is None or extracted_price <= 0:
            zero_price_removed += 1
            print(f"[DEBUG] Filtered zero-price item: {item_id}, price={extracted_price}, title={item.get('title', 'N/A')[:50]}")
            continue
            
        unique_items.append(item)
        seen_item_ids.add(item_id)
    
    print(f"[INFO] Active listings filtering results:")
    print(f"  - Raw items: {len(raw_items)}")
    print(f"  - Removed {duplicates_removed} duplicates")
    print(f"  - Removed {zero_price_removed} zero-price items")
    print(f"  - Removed {no_item_id_removed} items without item_id")
    print(f"  - Final clean items: {len(unique_items)}")
    
    # Convert to CompItems
    comp_items = []
    for item in unique_items:
        buying_format = item.get('buying_format', '').lower()
        item['is_auction'] = 'auction' in buying_format
        item['is_buy_it_now'] = 'buy it now' in buying_format
        item['is_best_offer'] = item.get('best_offer_enabled', False) or item.get('has_best_offer', False)
        
        if item['is_auction']:
            item['is_buy_it_now'] = False
            item['is_best_offer'] = False
        
        # Generate deep link for mobile app navigation
        item_id = item.get('item_id')
        if item_id:
            print(f"[ACTIVE LISTING] Processing item_id: {item_id} (type: {type(item_id).__name__})")
            item['deep_link'] = generate_ebay_deep_link(item_id)
        else:
            print(f"[ACTIVE LISTING] WARNING: No item_id for item: {item.get('title', 'N/A')[:50]}")
            item['deep_link'] = None

        # PRICING POLICY: total_price now equals extracted_price (shipping excluded)
        # This change was made to reduce eBay Browse API enrichment calls
        comp_items.append(CompItem(**item))

    # PRICING POLICY: total_price now equals extracted_price (shipping excluded)
    # This change was made to reduce eBay Browse API enrichment calls
    for item in comp_items:
        if item.total_price is None:
            item.total_price = item.extracted_price or 0

    prices = [item.total_price for item in comp_items if item.total_price is not None]
    min_price = min(prices) if prices else None
    max_price = max(prices) if prices else None
    avg_price = sum(prices) / len(prices) if prices else None
    
    # Calculate request duration
    duration_ms = (time.time() - start_time) * 1000
    
    # Log successful completion
    log_with_context(
        logger,
        'info',
        'Active listings search completed successfully',
        correlation_id=correlation_id,
        endpoint='/active',
        query=params.query,
        duration_ms=round(duration_ms, 2),
        raw_items=len(raw_items),
        final_items=len(comp_items),
        duplicates_filtered=duplicates_removed,
        zero_price_filtered=zero_price_removed
    )
    
    # Build response
    response_data = CompsResponse(
        query=params.query,
        pages_scraped=params.pages,
        items=comp_items,
        min_price=min_price,
        max_price=max_price,
        avg_price=avg_price,
        raw_items_scraped=len(raw_items),
        duplicates_filtered=duplicates_removed,
        zero_price_filtered=zero_price_removed,
    )
    
    # Store in cache
    # TTL = 300 seconds (5 minutes) for active listings (more volatile than sold)
    cache_stored = await cache_service.set(
        cache_key,
        response_data.dict(),
        ttl=CACHE_TTL_ACTIVE
    )
    if cache_stored:
        print(f"[CACHE SET] Stored active listings in cache: {params.query} (TTL: 5 min)")
    else:
        print(f"[CACHE SET] Failed to store active listings in cache (continuing without cache)")
    
    return response_data


@router.get("/api/usage-stats")
async def get_api_usage_stats(
    request: Request,
    api_tracker: APIUsageTracker = Depends(get_api_tracker),
    circuit_breaker: CircuitBreaker = Depends(get_circuit_breaker)
):
    """
    Get current API usage statistics for monitoring (Phase 4 enhanced).
    
    Returns usage data for eBay Finding API including:
    - Daily and hourly call counts
    - Rate limited calls
    - Failed calls
    - Percentage of daily limit used
    - Circuit breaker state
    """
    stats = await api_tracker.get_stats('ebay_finding_api')
    circuit_state = await circuit_breaker.get_state('ebay_finding_api')
    backoff_level = await circuit_breaker.get_backoff_level('ebay_finding_api')
    
    return {
        "ebay_finding_api": {
            "usage": {
                "daily_calls": stats.get('daily_calls', 0),
                "hourly_calls": stats.get('hourly_calls', 0),
                "rate_limited_calls": stats.get('rate_limited_calls', 0),
                "failed_calls": stats.get('failed_calls', 0),
                "current_date": stats.get('current_date'),
                "current_hour": stats.get('current_hour')
            },
            "circuit": {
                "state": circuit_state,
                "backoff_level": backoff_level
            },
            "limits": {
                "daily": EBAY_DAILY_CALL_LIMIT,
                "warning_threshold": RATE_LIMIT_WARNING_THRESHOLD
            },
            "status": {
                "redis_available": stats.get('redis_available', False),
                "percentage_used": f"{(stats.get('daily_calls', 0)/EBAY_DAILY_CALL_LIMIT)*100:.1f}%",
                "is_near_limit": stats.get('daily_calls', 0) >= (EBAY_DAILY_CALL_LIMIT * RATE_LIMIT_WARNING_THRESHOLD)
            }
        }
    }
