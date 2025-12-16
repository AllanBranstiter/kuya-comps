# scraper.py
import time
from typing import List, Dict, Optional

import re
import requests

SEARCHAPI_BASE_URL = "https://www.searchapi.io/api/v1/search"

# Try to import eBay Browse API client
try:
    from ebay_browse_client import eBayBrowseClient, normalize_ebay_browse_item
    EBAY_API_AVAILABLE = True
except ImportError:
    EBAY_API_AVAILABLE = False
    print("[WARNING] eBay Browse API client not available. Install required dependencies.")






def scrape_sold_comps(
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
    Use SearchAPI.io's eBay Search engine to fetch SOLD/COMPLETED listings.
    
    NOTE: Uses SearchAPI.io because the official eBay Browse API does NOT support
    searching sold/completed listings - it only returns active listings.

    - query: search query
    - api_key: SearchAPI.io API key
    - max_pages: how many pages of results to fetch
    - delay_secs: delay between page fetches
    - category_id: optional category filter
    - ungraded_only: if True, filter out graded cards based on title heuristics
    - sort_by: sort order (time_newly_listed, price_low_to_high, etc.)
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

        print(f"[scraper] Fetching sold comps from SearchAPI (page {page})")
        resp = requests.get(SEARCHAPI_BASE_URL, params=params, timeout=30)

        if resp.status_code != 200:
            print(f"[scraper] SearchAPI HTTP {resp.status_code}: {resp.text[:200]}")
            break

        data = resp.json()
        results = data.get("organic_results", []) or []
        print(f"[scraper] Got {len(results)} results on page {page}.")
        
        # Debug: Check pagination info
        pagination = data.get("pagination", {})
        if pagination:
            current_page = pagination.get("current", "unknown")
            print(f"[scraper] API reports current page: {current_page}")
            if "next" in pagination:
                print(f"[scraper] Next page available: {pagination['next']}")
            else:
                print(f"[scraper] No next page available - this may be the last page")

        if not results:
            print(f"[scraper] No results on page {page}, stopping pagination")
            break

        # Track items before adding to check for potential duplicates
        items_before = len(all_items)
        for r in results:
            # Clean up concatenated price data from eBay sale/discount listings
            if 'price' in r and r['price'] and isinstance(r['price'], str):
                price_str = r['price']
                # Handle concatenated prices like "$3.39$3.99"
                if price_str.count('$') > 1:
                    # Split on $ and get the first price (sale price)
                    price_parts = price_str.split('$')[1:] # Remove empty first element
                    if price_parts:
                        r['price'] = '$' + price_parts[0]  # Use sale price
                        print(f"[scraper] Cleaned concatenated price: {price_str} → ${price_parts[0]}")
            
            # The entire result 'r' is now passed, as the Pydantic model
            # will handle the parsing and validation.
            all_items.append(r)
        
        items_added = len(all_items) - items_before
        print(f"[scraper] Added {items_added} items from page {page}. Total so far: {len(all_items)}")

        time.sleep(delay_secs)

    print(f"[scraper] Completed scraping. Final total: {len(all_items)} items across {page} pages")
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
                        print(f"[scraper] Cleaned concatenated price: {price_str} → ${price_parts[0]}")
            
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


def scrape_active_listings_ebay_api(
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
    Fetch ACTIVE listings using official eBay Browse API.
    
    This function uses the official eBay Browse API instead of SearchAPI.io.
    Note: The Browse API only returns active listings, not sold/completed items.
    
    Args:
        query: Search query string
        max_pages: Number of pages to fetch (200 items per page max)
        delay_secs: Delay between page requests
        sort_by: Sort order - "price", "newlyListed", "endingSoonest", "-price" (desc)
        buying_format: Filter - "auction", "buy_it_now", "best_offer"
        condition: Filter - condition name
        price_min: Minimum price filter
        price_max: Maximum price filter
        enrich_shipping: If True, fetch detailed item data to get complete shipping info
    
    Returns:
        List of normalized item dictionaries
    """
    print(f"[scrape_active_listings_ebay_api] Called with query='{query}', max_pages={max_pages}")
    print(f"[scrape_active_listings_ebay_api] EBAY_API_AVAILABLE={EBAY_API_AVAILABLE}")
    
    if not EBAY_API_AVAILABLE:
        raise RuntimeError(
            "eBay Browse API client not available. "
            "Make sure ebay_browse_client.py is in the same directory and credentials are set."
        )
    
    print("[scrape_active_listings_ebay_api] Creating eBayBrowseClient...")
    try:
        client = eBayBrowseClient()
        print(f"[scrape_active_listings_ebay_api] Client created successfully. Environment: {client.environment}")
    except Exception as e:
        print(f"[scrape_active_listings_ebay_api] FAILED to create client: {e}")
        import traceback
        traceback.print_exc()
        raise
    
    all_items = []
    
    limit = 200  # Max per page per eBay API spec
    
    for page in range(max_pages):
        offset = page * limit
        
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
            response = client.search_items(
                query=query,
                limit=limit,
                offset=offset,
                sort=sort_by,
                filter_params=filters,
                fieldgroups='EXTENDED'  # Get additional details
            )
            
            items = response.get('itemSummaries', [])
            if not items:
                print(f"[eBay API] No more items on page {page+1}")
                break
            
            # Normalize to Kuya Comps format
            for item in items:
                normalized = normalize_ebay_browse_item(item)
                
                # If shipping enrichment is enabled and shipping data was MISSING (not free), fetch detailed item
                # Only enrich if shipping_data_missing flag is True
                if enrich_shipping and normalized.get('shipping_data_missing', False):
                    item_id = normalized.get('item_id')
                    if item_id:
                        try:
                            print(f"[eBay API] Enriching shipping data for item {item_id}")
                            detailed_item = client.get_item(item_id, fieldgroups="SHIPPING_INFO")
                            
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
                                
                                print(f"[eBay API] Enriched! New total_price for {item_id}: ${normalized['total_price']:.2f}")
                            
                            time.sleep(0.1)  # Small delay to avoid rate limits
                        except Exception as e:
                            print(f"[eBay API] Failed to enrich item {item_id}: {e}")
                
                all_items.append(normalized)
            
            print(f"[eBay API] Page {page+1}: Added {len(items)} items. Total: {len(all_items)}")
            
            # Check if there are more pages available
            if not response.get('next'):
                print(f"[eBay API] No more pages available")
                break
            
            # Delay before next request (except after last page)
            if page < max_pages - 1:
                time.sleep(delay_secs)
            
        except Exception as e:
            print(f"[eBay API] Error on page {page+1}: {e}")
            break
    
    print(f"[eBay API] Completed: {len(all_items)} items across {page+1} pages")
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
