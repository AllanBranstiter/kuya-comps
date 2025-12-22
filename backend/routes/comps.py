# backend/routes/comps.py
"""
Comps router - handles sold and active listings endpoints.

This module contains the main search endpoints for finding comparable
card prices from eBay's sold and active listings.
"""
import time
import uuid
from typing import List
from fastapi import APIRouter, Depends, Request
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
from backend.config import get_search_api_key, CACHE_TTL_SOLD, CACHE_TTL_ACTIVE
from backend.services.intelligence_service import analyze_market_intelligence
from backend.models.schemas import CompItem, CompsResponse
from backend.utils import generate_ebay_deep_link, load_test_data
from scraper import scrape_sold_comps, scrape_active_listings_ebay_api


# Initialize router
router = APIRouter()

# Initialize logger for this module
logger = get_logger(__name__)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


def get_cache_service(request: Request) -> CacheService:
    """Dependency to get cache service from app state."""
    return request.app.state.cache_service


@router.get("/comps", response_model=CompsResponse)
@limiter.limit("10/minute")
async def get_comps(
    request: Request,
    params: QueryValidator = Depends(),
    cache_service: CacheService = Depends(get_cache_service)
):
    """
    Scrape eBay SOLD/COMPLETED listings for a given query and return:
      - Basic stats on item price (no shipping)
      - FMV metrics based on total price (item + shipping)
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
    
    # Generate cache key from all query parameters
    cache_params = {
        "query": params.query,
        "pages": params.pages,
        "sort_by": params.sort_by,
        "buying_format": params.buying_format,
        "condition": params.condition,
        "price_min": params.price_min,
        "price_max": params.price_max,
        "raw_only": params.raw_only,
        "base_only": params.base_only,
        "exclude_autographs": params.exclude_autographs
    }
    cache_key = CacheService.generate_cache_key("kuya_comps:sold", cache_params)
    
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
        else:
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
                # Exclude grading company names and specific grading terms
                # Note: Removed generic '-mint' as it filters out ungraded "mint condition" cards
                modified_query = f"{modified_query} -PSA -BGS -SGC -CSG -HGA -graded"
            
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
                    # Check title for grading company names and specific grading terms
                    # Note: Removed 'mint' from filter as it catches legitimate ungraded "mint condition" cards
                    if any(term in title for term in ['psa', 'bgs', 'sgc', 'csg', 'hga', 'graded', ' grade ', 'gem mint', 'psa 10', 'bgs 9']):
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
                    # Note: Removed overly broad terms like 'authentic' and 'certified' which filter out non-autograph cards
                    # Only filter clear autograph indicators
                    if any(term in title for term in ['autograph', 'signed', 'auto card', 'auto rc', ' auto ', '/auto']):
                        continue
                    if 'autograph' in authenticity or any('autograph' in ext for ext in extensions):
                        continue
                    
                filtered_items.append(item)

            raw_items = filtered_items
        
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
        
        comp_items.append(CompItem(**item))

    # Use total_price from data if available, otherwise calculate it
    for item in comp_items:
        if item.total_price is None:
            item.total_price = (item.extracted_price or 0) + (item.extracted_shipping or 0)

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
            print(f"[CACHE SET] Stored sold listings in cache: {params.query} (TTL: 30 min)")
        else:
            print(f"[CACHE SET] Failed to store sold listings in cache (continuing without cache)")
    
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
        
        comp_items.append(CompItem(**item))

    # Use total_price from data if available, otherwise calculate it
    for item in comp_items:
        if item.total_price is None:
            item.total_price = (item.extracted_price or 0) + (item.extracted_shipping or 0)

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
