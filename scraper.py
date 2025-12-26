# scraper.py
"""
eBay scraper using SearchAPI.io for sold listings and eBay Browse API for active listings.

================================================================================
TROUBLESHOOTING GUIDE - "Zero Search Results" Issue
================================================================================

SYMPTOM: All search results filtered as "zero-price items"
- Frontend shows: 0 results despite "120 raw items scraped"
- Backend logs show: "Zero-price filtered: 120" and "Final unique items: 0"
- Console debug: "price field: None", "extracted_price field: None"

ROOT CAUSE: SearchAPI.io API structure changes
- BEFORE: Prices in 'price' and 'extracted_price' fields
- AFTER (Dec 2025): Prices moved to 'deal' field

DIAGNOSIS STEPS:
1. Check backend logs for: "[DIAGNOSTIC] Sample raw SearchAPI item structure"
2. Look for "price field: None" but "deal field: $X.XX" → API changed
3. Verify active listings work (different endpoint: eBay Browse API)
4. If deal field is also None, SearchAPI may have further changed their structure

CURRENT FIX (Lines 134-210):
Parses price from 'deal' field into 'extracted_price':
  - Single price: {"deal": "$120.00"} → extracted_price = 120.00
  - Concatenated: {"deal": "$2.27$3.49"} → extracted_price = 2.27 (sale price)
  - Price range: {"deal": "$0.99 to $1.49"} → extracted_price = 0.99 (lower bound, typically sold price)

IF SEARCHAPI REVERTS/CHANGES AGAIN:
1. Add diagnostic logging to see raw API response (lines 134-177 show pattern)
2. Identify which field now contains the price
3. Update parsing logic at lines 134-177
4. Test with simple query before deploying
5. Update this documentation

HISTORICAL CHANGES:
- Dec 2025: Prices moved from 'price' to 'deal' field (commits 586216c, 62205e8)
- Dec 22, 2025: Fixed price range parsing - now includes sold listings with price ranges instead of skipping them
- Dec 22, 2025: Fixed extracted_price not being set for items with 'price' field - was causing items to be filtered as zero-price

FOR FUTURE DEBUGGING:
- Enable diagnostic logs by checking first item in results loop
- Compare sold vs active endpoint responses to isolate which API changed
- Check SearchAPI.io docs/changelog for breaking changes
- Test locally before pushing to production
"""
import time
import asyncio
from typing import List, Dict, Optional
import logging

import re
import requests
import httpx

logger = logging.getLogger(__name__)

SEARCHAPI_BASE_URL = "https://www.searchapi.io/api/v1/search"

# Try to import eBay Browse API client
try:
    from ebay_browse_client import eBayBrowseClient, normalize_ebay_browse_item
    EBAY_API_AVAILABLE = True
except ImportError:
    EBAY_API_AVAILABLE = False
    print("[WARNING] eBay Browse API client not available. Install required dependencies.")






async def scrape_sold_comps(
    query: str,
    api_key: str,
    max_pages: int = 3,
    delay_secs: float = 2.0,
    category_id: Optional[str] = None,
    ungraded_only: bool = False,
    sort_by: str = "best_match",
    buying_format: Optional[str] = None,
    condition: Optional[str] = None,
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
) -> List[Dict]:
    """
    Use SearchAPI.io's eBay Search engine to fetch SOLD/COMPLETED listings (Async with Concurrency).
    
    NOTE: Uses SearchAPI.io because the official eBay Browse API does NOT support
    searching sold/completed listings - it only returns active listings.

    - query: search query
    - api_key: SearchAPI.io API key
    - max_pages: how many pages of results to fetch (fetched concurrently)
    - delay_secs: delay between page fetches (deprecated - concurrent fetching used)
    - category_id: optional category filter
    - ungraded_only: if True, filter out graded cards based on title heuristics
    - sort_by: sort order (time_newly_listed, price_low_to_high, etc.)
    - buying_format: filter by auction, buy_it_now, or best_offer
    - condition: filter by condition (new, used, etc.)
    - price_min/price_max: price range filters
    """
    if not api_key:
        raise RuntimeError("An API key must be provided.")

    # Helper function to fetch a single page
    async def fetch_page(client: httpx.AsyncClient, page: int, semaphore: asyncio.Semaphore) -> Dict:
        """Fetch a single page with semaphore-controlled concurrency."""
        async with semaphore:
            params = {
                "engine": "ebay_search",
                "q": query,
                "filters": "sold_listings",     # SOLD ONLY
                "num": 120,  # Increased from 60 to 120 (max results per page)
                "page": page,
                "ebay_domain": "ebay.com",
                "sort_by": sort_by,
                "api_key": api_key,
            }

            if category_id:
                params["category_id"] = category_id
                
            # Add optional filters based on API spec
            if buying_format:
                params["buying_format"] = buying_format
                
            if condition:
                params["condition"] = condition
                
            if price_min is not None:
                params["price_min"] = price_min
                
            if price_max is not None:
                params["price_max"] = price_max

            try:
                logger.info(f"[scraper] Fetching sold comps from SearchAPI (page {page})")
                page_start_time = time.time()
                resp = await client.get(SEARCHAPI_BASE_URL, params=params)
                fetch_time = time.time() - page_start_time

                if resp.status_code != 200:
                    logger.error(f"[scraper] SearchAPI HTTP {resp.status_code} on page {page}: {resp.text[:200]}")
                    return {"page": page, "success": False, "items": [], "error": f"HTTP {resp.status_code}", "fetch_time": fetch_time}

                data = resp.json()
                results = data.get("organic_results", []) or []
                logger.info(f"[scraper] Page {page}: Got {len(results)} results in {fetch_time:.2f}s")
                
                # Debug: Check pagination info
                pagination = data.get("pagination", {})
                if pagination:
                    current_page = pagination.get("current", "unknown")
                    logger.info(f"[scraper] Page {page}: API reports current page: {current_page}")
                    if "next" in pagination:
                        logger.info(f"[scraper] Page {page}: Next page available")
                    else:
                        logger.info(f"[scraper] Page {page}: No next page available - this may be the last page")
    
                if not results:
                    logger.info(f"[scraper] No results on page {page}")
                    return {"page": page, "success": True, "items": [], "fetch_time": fetch_time}
    
                # Process items for this page
                page_items = []
                for r in results:
                    # FIX: SearchAPI moved sold listing prices to the 'deal' field
                    # Parse price from 'deal' field if 'price' is missing
                    if not r.get('price') and r.get('deal'):
                        deal_value = r.get('deal')
                        extracted_price = None
                        
                        # Handle different deal formats:
                        # 1. Single price: "$120.00"
                        # 2. Price range: "$0.99 to $1.49" - Parse lower price (often the sold price)
                        # 3. Concatenated: "$2.27$3.49" (sale price + original price)
                        
                        if isinstance(deal_value, str):
                            # Check for price range (e.g., "$0.99 to $1.49")
                            # For sold listings, use the lower price (typically the sold price)
                            if ' to ' in deal_value:
                                try:
                                    # Extract the lower price from the range
                                    price_parts = deal_value.split(' to ')
                                    if price_parts and len(price_parts) >= 2:
                                        lower_price_str = price_parts[0].strip().replace('$', '').replace(',', '')
                                        extracted_price = float(lower_price_str)
                                        r['price'] = price_parts[0].strip()
                                        r['extracted_price'] = extracted_price
                                        logger.info(f"[scraper] Page {page}: Parsed price range: {deal_value} → ${extracted_price} (using lower bound)")
                                    else:
                                        logger.warning(f"[scraper] Page {page}: Could not parse price range: {deal_value}")
                                        continue  # Skip only if we can't parse it
                                except (ValueError, IndexError) as e:
                                    logger.warning(f"[scraper] Page {page}: Failed to parse price range: {deal_value} - {e}")
                                    continue  # Skip only if parsing fails
                            
                            # Check for concatenated prices (e.g., "$2.27$3.49")
                            elif deal_value.count('$') > 1:
                                # Split and take first price (sale price)
                                price_parts = deal_value.split('$')[1:]  # Remove empty first element
                                if price_parts:
                                    price_clean = price_parts[0].replace(',', '')
                                    try:
                                        extracted_price = float(price_clean)
                                        r['price'] = '$' + price_parts[0]
                                        logger.info(f"[scraper] Page {page}: Parsed concatenated price: {deal_value} → ${extracted_price}")
                                    except ValueError:
                                        logger.warning(f"[scraper] Page {page}: WARNING: Could not parse concatenated price: {deal_value}")
                            
                            # Single price (e.g., "$120.00")
                            else:
                                price_clean = deal_value.replace('$', '').replace(',', '')
                                try:
                                    extracted_price = float(price_clean)
                                    r['price'] = deal_value
                                    logger.info(f"[scraper] Page {page}: Parsed single price: {deal_value} → ${extracted_price}")
                                except ValueError:
                                    logger.warning(f"[scraper] Page {page}: WARNING: Could not parse single price: {deal_value}")
                            
                            # Set the extracted_price field
                            if extracted_price is not None:
                                r['extracted_price'] = extracted_price
                    
                    # Clean up concatenated price data from eBay sale/discount listings
                    elif 'price' in r and r['price'] and isinstance(r['price'], str):
                        price_str = r['price']
                        # Handle concatenated prices like "$3.39$3.99"
                        if price_str.count('$') > 1:
                            # Split on $ and get the first price (sale price)
                            price_parts = price_str.split('$')[1:] # Remove empty first element
                            if price_parts:
                                r['price'] = '$' + price_parts[0]  # Use sale price
                                # CRITICAL: Also set extracted_price so item isn't filtered out
                                try:
                                    price_clean = price_parts[0].replace(',', '')
                                    r['extracted_price'] = float(price_clean)
                                    logger.info(f"[scraper] Page {page}: Cleaned concatenated price: {price_str} → ${price_parts[0]} (extracted: {r['extracted_price']})")
                                except ValueError:
                                    logger.warning(f"[scraper] Page {page}: Could not parse cleaned price: {price_parts[0]}")
                        # Even for single prices, ensure extracted_price is set
                        elif not r.get('extracted_price'):
                            try:
                                price_clean = price_str.replace('$', '').replace(',', '')
                                r['extracted_price'] = float(price_clean)
                                logger.info(f"[scraper] Page {page}: Extracted price from single price string: {price_str} → {r['extracted_price']}")
                            except ValueError:
                                logger.warning(f"[scraper] Page {page}: Could not parse price string: {price_str}")
                    
                    # The entire result 'r' is now passed, as the Pydantic model
                    # will handle the parsing and validation.
                    page_items.append(r)
                
                logger.info(f"[scraper] Page {page}: Processed {len(page_items)} items")
                return {"page": page, "success": True, "items": page_items, "fetch_time": fetch_time}
                
            except Exception as e:
                fetch_time = time.time() - page_start_time if 'page_start_time' in locals() else 0
                logger.error(f"[scraper] Error fetching page {page}: {e}")
                return {"page": page, "success": False, "items": [], "error": str(e), "fetch_time": fetch_time}

    # Main concurrent fetching logic
    start_time = time.time()
    semaphore = asyncio.Semaphore(3)  # Max 3 concurrent requests
    
    async with httpx.AsyncClient(timeout=30) as client:
        # Create tasks for all pages
        tasks = [fetch_page(client, page, semaphore) for page in range(1, max_pages + 1)]
        
        logger.info(f"[scraper] Starting concurrent fetch of {max_pages} pages (max 3 concurrent)")
        
        # Fetch all pages concurrently (return_exceptions=True to handle individual failures)
        results = await asyncio.gather(*tasks, return_exceptions=True)
    
    total_time = time.time() - start_time
    
    # Calculate sequential time estimate (assuming average fetch time)
    successful_results = [r for r in results if isinstance(r, dict) and r.get('success')]
    failed_results = [r for r in results if isinstance(r, Exception) or (isinstance(r, dict) and not r.get('success'))]
    
    avg_fetch_time = sum(r.get('fetch_time', 0) for r in successful_results) / len(successful_results) if successful_results else 0
    sequential_time_estimate = avg_fetch_time * max_pages
    time_saved = sequential_time_estimate - total_time
    percent_faster = (time_saved / sequential_time_estimate * 100) if sequential_time_estimate > 0 else 0
    
    logger.info(f"[scraper] Concurrent fetch completed: {len(successful_results)} successful, {len(failed_results)} failed")
    logger.info(f"[scraper] Time: {total_time:.2f}s concurrent vs {sequential_time_estimate:.2f}s sequential (est), {percent_faster:.0f}% faster")
    
    # Log failed pages
    for result in results:
        if isinstance(result, Exception):
            logger.error(f"[scraper] Page fetch failed with exception: {result}")
        elif isinstance(result, dict) and not result.get('success'):
            logger.error(f"[scraper] Page {result.get('page')} failed: {result.get('error')}")
    
    # Aggregate items from successful pages
    all_items = []
    for result in successful_results:
        all_items.extend(result.get('items', []))
    
    logger.info(f"[scraper] Completed scraping. Final total: {len(all_items)} items across {len(successful_results)} successful pages")
    return all_items


def scrape_active_listings(
    query: str,
    api_key: str,
    max_pages: int = 1,
    delay_secs: float = 2.0,
    category_id: Optional[str] = None,
    sort_by: str = "price_low_to_high",
    buying_format: Optional[str] = None,
    condition: Optional[str] = None,
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
) -> List[Dict]:
    """
    [DEPRECATED] Use SearchAPI.io's eBay Search engine to fetch ACTIVE listings.
    
    This function is deprecated. Use scrape_active_listings_ebay_api() instead,
    which uses the official eBay Browse API.
    
    - query: search query
    - api_key: SearchAPI.io API key
    - max_pages: how many pages of results to fetch
    - delay_secs: delay between page fetches
    - category_id: optional category filter
    - sort_by: sort order (price_low_to_high recommended for deals)
    - buying_format: filter by auction, buy_it_now, or best_offer
    - condition: filter by condition (new, used, etc.)
    - price_min/price_max: price range filters
    """
    if not api_key:
        raise RuntimeError("An API key must be provided.")

    all_items: List[Dict] = []

    for page in range(1, max_pages + 1):
        params = {
            "engine": "ebay_search",
            "q": query,
            # NO "filters": "sold_listings" - this searches active listings
            "num": 120,  # Increased to match comps endpoint
            "page": page,
            "ebay_domain": "ebay.com",
            "sort_by": sort_by,
            "api_key": api_key,
        }

        if category_id:
            params["category_id"] = category_id
            
        # Add optional filters based on API spec
        if buying_format:
            params["buying_format"] = buying_format
            
        if condition:
            params["condition"] = condition
            
        if price_min is not None:
            params["price_min"] = price_min
            
        if price_max is not None:
            params["price_max"] = price_max

        print(f"[scraper] Fetching active listings from SearchAPI (page {page})")
        resp = requests.get(SEARCHAPI_BASE_URL, params=params, timeout=30)

        if resp.status_code != 200:
            print(f"[scraper] SearchAPI HTTP {resp.status_code}: {resp.text[:200]}")
            break

        data = resp.json()
        results = data.get("organic_results", []) or []
        print(f"[scraper] Got {len(results)} active listings on page {page}.")

        if not results:
            print(f"[scraper] No results on page {page}, stopping pagination")
            break

        # Track items before adding to check for potential duplicates
        items_before = len(all_items)
        for r in results:
            # Debug: Log the raw buying format
            buying_format = r.get('buying_format', '')
            print(f"[DEBUG] Raw buying_format from SearchAPI: {buying_format}")
            
            # Map the buying format to our display values
            if 'auction' in buying_format.lower():
                r['listing_type'] = 'Auction'
            elif 'buy it now' in buying_format.lower():
                r['listing_type'] = 'Buy It Now'
            else:
                r['listing_type'] = 'Buy It Now'  # Default case
            
            # Clean up concatenated price data from eBay sale/discount listings
            if 'price' in r and r['price'] and isinstance(r['price'], str):
                price_str = r['price']
                # Handle concatenated prices like "$3.39$3.99"
                if price_str.count('$') > 1:
                    # Split on $ and get the first price (sale price)
                    price_parts = price_str.split('$')[1:] # Remove empty first element
                    if price_parts:
                        r['price'] = '$' + price_parts[0]  # Use sale price
                        # Also set extracted_price so item isn't filtered out
                        try:
                            price_clean = price_parts[0].replace(',', '')
                            r['extracted_price'] = float(price_clean)
                            print(f"[scraper] Cleaned concatenated price: {price_str} → ${price_parts[0]} (extracted: {r['extracted_price']})")
                        except ValueError:
                            print(f"[scraper] WARNING: Could not parse cleaned price: {price_parts[0]}")
                # Even for single prices, ensure extracted_price is set
                elif not r.get('extracted_price'):
                    try:
                        price_clean = price_str.replace('$', '').replace(',', '')
                        r['extracted_price'] = float(price_clean)
                        print(f"[scraper] Extracted price from single price string: {price_str} → {r['extracted_price']}")
                    except ValueError:
                        print(f"[scraper] WARNING: Could not parse price string: {price_str}")
            
            # Check for auction indicators
            buying_format = r.get('buying_format', '').lower()
            bids = r.get('bids', 0)
            time_left = str(r.get('time_left', '')).lower()
            
            # Set auction flag based on multiple indicators
            r['is_auction'] = (
                'auction' in buying_format or
                bids > 0 or
                any(x in time_left for x in ['left', 'ends in', 'ending'])
            )
            
            # If it's an auction, override other buying format flags
            if r['is_auction']:
                r['is_buy_it_now'] = False
                r['is_best_offer'] = False
            else:
                r['is_buy_it_now'] = 'buy it now' in buying_format
                r['is_best_offer'] = r.get('best_offer_enabled', False) or r.get('has_best_offer', False)
            
            all_items.append(r)
        
        items_added = len(all_items) - items_before
        print(f"[scraper] Added {items_added} active listings from page {page}. Total so far: {len(all_items)}")

        if page < max_pages:
            time.sleep(delay_secs)

    print(f"[scraper] Completed scraping active listings. Final total: {len(all_items)} items across {page} pages")
    return all_items


async def scrape_active_listings_ebay_api(
    query: str,
    max_pages: int = 1,
    delay_secs: float = 1.0,
    sort_by: str = "price",
    buying_format: Optional[str] = None,
    condition: Optional[str] = None,
    price_min: Optional[float] = None,
    price_max: Optional[float] = None,
    enrich_shipping: bool = False,
) -> List[Dict]:
    """
    Fetch ACTIVE listings using official eBay Browse API (Async with Concurrency).
    
    This function uses the official eBay Browse API instead of SearchAPI.io.
    Note: The Browse API only returns active listings, not sold/completed items.
    
    Args:
        query: Search query string
        max_pages: Number of pages to fetch (200 items per page max, fetched concurrently)
        delay_secs: Delay between page requests (deprecated - concurrent fetching used)
        sort_by: Sort order - "price", "newlyListed", "endingSoonest", "-price" (desc)
        buying_format: Filter - "auction", "buy_it_now", "best_offer"
        condition: Filter - condition name
        price_min: Minimum price filter
        price_max: Maximum price filter
        enrich_shipping: If True, fetch detailed item data to get complete shipping info
    
    Returns:
        List of normalized item dictionaries
    """
    logger.info(f"[scrape_active_listings_ebay_api] Called with query='{query}', max_pages={max_pages}")
    logger.info(f"[scrape_active_listings_ebay_api] EBAY_API_AVAILABLE={EBAY_API_AVAILABLE}")
    
    if not EBAY_API_AVAILABLE:
        raise RuntimeError(
            "eBay Browse API client not available. "
            "Make sure ebay_browse_client.py is in the same directory and credentials are set."
        )
    
    logger.info("[scrape_active_listings_ebay_api] Creating eBayBrowseClient...")
    try:
        client = eBayBrowseClient()
        logger.info(f"[scrape_active_listings_ebay_api] Client created successfully. Environment: {client.environment}")
    except Exception as e:
        logger.error(f"[scrape_active_listings_ebay_api] FAILED to create client: {e}")
        import traceback
        traceback.print_exc()
        raise
    
    limit = 200  # Max per page per eBay API spec
    
    # Helper function to fetch a single page
    async def fetch_page_with_offset(page_num: int, semaphore: asyncio.Semaphore) -> Dict:
        """Fetch a single page with semaphore-controlled concurrency."""
        async with semaphore:
            offset = page_num * limit
            
            # Build filters dictionary
            filters = {}
            
            # Buying format mapping (SearchAPI format -> eBay API format)
            # When buying_format is specified, filter to that specific type
            # When None, don't set filter - eBay API returns all types (AUCTION, FIXED_PRICE, etc.)
            if buying_format:
                format_map = {
                    'auction': 'AUCTION',
                    'buy_it_now': 'FIXED_PRICE',
                    'best_offer': 'BEST_OFFER'
                }
                ebay_format = format_map.get(buying_format.lower(), 'FIXED_PRICE')
                filters['buyingOptions'] = ebay_format
            
            # Price range filter
            if price_min is not None and price_max is not None:
                filters['price'] = f'[{price_min}..{price_max}]'
            elif price_min is not None:
                filters['price'] = f'[{price_min}..]'
            elif price_max is not None:
                filters['price'] = f'[..{price_max}]'
            
            # Condition filter
            # eBay API uses condition values like "NEW", "USED", etc.
            if condition:
                filters['conditions'] = condition.upper()
            
            # Always filter to US items
            filters['itemLocationCountry'] = 'US'
            
            try:
                logger.info(f"[eBay API] Fetching page {page_num+1} (offset={offset})")
                page_start_time = time.time()
                
                response = await client.search_items(
                    query=query,
                    limit=limit,
                    offset=offset,
                    sort=sort_by,
                    filter_params=filters,
                    fieldgroups='EXTENDED'  # Get additional details
                )
                
                fetch_time = time.time() - page_start_time
                
                items = response.get('itemSummaries', [])
                if not items:
                    logger.info(f"[eBay API] No items on page {page_num+1}")
                    return {"page": page_num+1, "success": True, "items": [], "has_next": False, "fetch_time": fetch_time}
                
                logger.info(f"[eBay API] Page {page_num+1}: Got {len(items)} items in {fetch_time:.2f}s")
                
                # Normalize to Kuya Comps format
                normalized_items = []
                for item in items:
                    normalized = normalize_ebay_browse_item(item)
                    
                    # If shipping enrichment is enabled and shipping data was MISSING (not free), fetch detailed item
                    # Only enrich if shipping_data_missing flag is True
                    if enrich_shipping and normalized.get('shipping_data_missing', False):
                        item_id = normalized.get('item_id')
                        if item_id:
                            try:
                                logger.info(f"[eBay API] Enriching shipping data for item {item_id}")
                                detailed_item = await client.get_item(item_id, fieldgroups="SHIPPING_INFO")
                                
                                # Extract shipping from detailed response
                                detailed_shipping_options = detailed_item.get('shippingOptions', [])
                                if detailed_shipping_options and len(detailed_shipping_options) > 0:
                                    shipping_obj = detailed_shipping_options[0].get('shippingCost', {})
                                    shipping_value = float(shipping_obj.get('value', 0))
                                    
                                    # Update normalized item with correct shipping
                                    normalized['extracted_shipping'] = shipping_value
                                    normalized['shipping'] = 'Free' if shipping_value == 0 else f"${shipping_value:.2f}"
                                    normalized['total_price'] = normalized['extracted_price'] + shipping_value
                                    normalized['shipping_data_missing'] = False  # Mark as enriched
                                    
                                    logger.info(f"[eBay API] Enriched! New total_price for {item_id}: ${normalized['total_price']:.2f}")
                                
                                await asyncio.sleep(0.1)  # Small delay to avoid rate limits
                            except Exception as e:
                                logger.error(f"[eBay API] Failed to enrich item {item_id}: {e}")
                    
                    normalized_items.append(normalized)
                
                has_next = bool(response.get('next'))
                logger.info(f"[eBay API] Page {page_num+1}: Processed {len(normalized_items)} items, has_next={has_next}")
                
                return {
                    "page": page_num+1,
                    "success": True,
                    "items": normalized_items,
                    "has_next": has_next,
                    "fetch_time": fetch_time
                }
                
            except Exception as e:
                fetch_time = time.time() - page_start_time if 'page_start_time' in locals() else 0
                logger.error(f"[eBay API] Error on page {page_num+1}: {e}")
                return {
                    "page": page_num+1,
                    "success": False,
                    "items": [],
                    "error": str(e),
                    "has_next": False,
                    "fetch_time": fetch_time
                }
    
    # Main concurrent fetching logic
    start_time = time.time()
    semaphore = asyncio.Semaphore(3)  # Max 3 concurrent requests to respect eBay rate limits
    
    # Create tasks for all pages
    tasks = [fetch_page_with_offset(page, semaphore) for page in range(max_pages)]
    
    logger.info(f"[eBay API] Starting concurrent fetch of {max_pages} pages (max 3 concurrent)")
    
    # Fetch all pages concurrently (return_exceptions=True to handle individual failures)
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    total_time = time.time() - start_time
    
    # Calculate sequential time estimate (assuming average fetch time)
    successful_results = [r for r in results if isinstance(r, dict) and r.get('success')]
    failed_results = [r for r in results if isinstance(r, Exception) or (isinstance(r, dict) and not r.get('success'))]
    
    avg_fetch_time = sum(r.get('fetch_time', 0) for r in successful_results) / len(successful_results) if successful_results else 0
    sequential_time_estimate = avg_fetch_time * max_pages
    time_saved = sequential_time_estimate - total_time
    percent_faster = (time_saved / sequential_time_estimate * 100) if sequential_time_estimate > 0 else 0
    
    logger.info(f"[eBay API] Concurrent fetch completed: {len(successful_results)} successful, {len(failed_results)} failed")
    logger.info(f"[eBay API] Time: {total_time:.2f}s concurrent vs {sequential_time_estimate:.2f}s sequential (est), {percent_faster:.0f}% faster")
    
    # Log failed pages
    for result in results:
        if isinstance(result, Exception):
            logger.error(f"[eBay API] Page fetch failed with exception: {result}")
        elif isinstance(result, dict) and not result.get('success'):
            logger.error(f"[eBay API] Page {result.get('page')} failed: {result.get('error')}")
    
    # Aggregate items from successful pages, maintaining page order
    all_items = []
    for result in successful_results:
        all_items.extend(result.get('items', []))
    
    logger.info(f"[eBay API] Completed: {len(all_items)} items across {len(successful_results)} successful pages")
    return all_items


def main():
    # Simple local test
    test_query = "2024 topps chrome elly de la cruz"
    print(f"[TEST] Running SearchAPI test for: {test_query!r}")
    # This test will fail unless you provide a valid API key.
    # You can set it as an environment variable for testing.
    import os
    test_api_key = os.getenv("SEARCHAPI_API_KEY_TEST")
    if not test_api_key:
        print("[TEST] Skipping test, SEARCHAPI_API_KEY_TEST not set.")
        return

    items = scrape_sold_comps(
        test_query,
        api_key=test_api_key,
        max_pages=1,
        delay_secs=1.0,
        ungraded_only=False
    )
    print(f"[TEST] Total items (all sold): {len(items)}")
    for i, item in enumerate(items[:5], start=1):
        print(f"[TEST] {i}. {item.get('title')!r}  price={item.get('price')!r}")

if __name__ == "__main__":
    main()
