# scraper.py
import time
from typing import List, Dict, Optional

import re
import requests

SEARCHAPI_BASE_URL = "https://www.searchapi.io/api/v1/search"






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
    Use SearchAPI.io's eBay Search engine to fetch SOLD listings and normalize them.

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
    Use SearchAPI.io's eBay Search engine to fetch ACTIVE listings (not sold).
    
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
