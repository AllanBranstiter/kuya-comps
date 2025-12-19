"""
eBay Finding API Client
Official eBay Finding API integration for sold/completed listings
Documentation: https://developer.ebay.com/DevZone/finding/Concepts/FindingAPIGuide.html
"""
import os
import asyncio
import httpx
from typing import Optional, Dict, List
from datetime import datetime
from dotenv import load_dotenv
import logging

load_dotenv()
logger = logging.getLogger(__name__)


class eBayFindingClient:
    """
    eBay Finding API client for searching sold/completed listings.
    Uses simple App ID authentication (not OAuth).
    
    This client handles:
    - App ID authentication (simpler than OAuth)
    - Sold/completed item search using findCompletedItems
    - Pagination support
    - Filtering by condition, price, buying format
    - Proper error handling and retry logic
    """
    
    def __init__(self):
        self.app_id = os.getenv('EBAY_APP_ID')
        self.environment = os.getenv('EBAY_ENVIRONMENT', 'production')
        
        if not self.app_id:
            raise ValueError("eBay App ID not found. Please set EBAY_APP_ID in .env")
        
        # API endpoint based on environment
        if self.environment == 'production':
            self.base_url = "https://svcs.ebay.com/services/search/FindingService/v1"
        else:
            self.base_url = "https://svcs.sandbox.ebay.com/services/search/FindingService/v1"
        
        # API limits
        self.max_results_per_page = 100  # Finding API max
        self.daily_call_limit = 5000
        
        logger.info(f"[eBay Finding API] Initialized in {self.environment} mode")
    
    async def find_completed_items(
        self,
        keywords: str,
        page_number: int = 1,
        entries_per_page: int = 100,
        sort_order: str = "EndTimeSoonest",
        buying_format: Optional[str] = None,
        condition: Optional[str] = None,
        price_min: Optional[float] = None,
        price_max: Optional[float] = None,
        max_retries: int = 3,
    ) -> Dict:
        """
        Search for completed/sold items using the Finding API.
        
        API Operation: findCompletedItems
        Docs: https://developer.ebay.com/DevZone/finding/CallRef/findCompletedItems.html
        
        Args:
            keywords: Search query (e.g., "2024 topps chrome paul skenes")
            page_number: Page number for pagination (1-indexed)
            entries_per_page: Results per page (1-100, default 100)
            sort_order: "EndTimeSoonest", "EndTimeNewest", "PricePlusShippingLowest", "PricePlusShippingHighest"
            buying_format: Filter by format - "Auction", "FixedPrice", "All" (optional)
            condition: Filter by condition - "New", "Used", "Unspecified" (optional)
            price_min: Minimum price filter in USD (optional)
            price_max: Maximum price filter in USD (optional)
            max_retries: Maximum retry attempts for failed requests
        
        Returns:
            Dict containing:
                - searchResult: Object with item array and count
                - paginationOutput: Pagination info (totalPages, totalEntries, entriesPerPage, pageNumber)
                - ack: Response status ("Success", "Warning", "Failure")
        
        Raises:
            httpx.HTTPStatusError: If API request fails after retries
            ValueError: If invalid parameters provided
        """
        # Validate parameters
        if entries_per_page > self.max_results_per_page:
            logger.warning(f"[Finding API] entries_per_page={entries_per_page} exceeds max {self.max_results_per_page}, using max")
            entries_per_page = self.max_results_per_page
        
        # Build base parameters
        params = {
            'OPERATION-NAME': 'findCompletedItems',
            'SERVICE-VERSION': '1.13.0',
            'SECURITY-APPNAME': self.app_id,
            'RESPONSE-DATA-FORMAT': 'JSON',
            'REST-PAYLOAD': '',
            'keywords': keywords,
            'paginationInput.pageNumber': str(page_number),
            'paginationInput.entriesPerPage': str(entries_per_page),
            'sortOrder': sort_order,
        }
        
        # Build item filters
        filter_index = 0
        
        # Filter 1: Only include sold items (items with sales)
        params[f'itemFilter({filter_index}).name'] = 'SoldItemsOnly'
        params[f'itemFilter({filter_index}).value'] = 'true'
        filter_index += 1
        
        # Filter 2: Buying format if specified
        if buying_format:
            format_value = self._normalize_buying_format(buying_format)
            if format_value:
                params[f'itemFilter({filter_index}).name'] = 'ListingType'
                params[f'itemFilter({filter_index}).value'] = format_value
                filter_index += 1
        
        # Filter 3: Condition if specified
        if condition:
            condition_id = self._get_condition_id(condition)
            if condition_id:
                params[f'itemFilter({filter_index}).name'] = 'Condition'
                params[f'itemFilter({filter_index}).value'] = condition_id
                filter_index += 1
        
        # Filter 4: Price range if specified
        if price_min is not None or price_max is not None:
            params[f'itemFilter({filter_index}).name'] = 'MinPrice'
            params[f'itemFilter({filter_index}).value'] = str(price_min if price_min is not None else 0)
            params[f'itemFilter({filter_index}).paramName'] = 'Currency'
            params[f'itemFilter({filter_index}).paramValue'] = 'USD'
            filter_index += 1
            
            if price_max is not None:
                params[f'itemFilter({filter_index}).name'] = 'MaxPrice'
                params[f'itemFilter({filter_index}).value'] = str(price_max)
                params[f'itemFilter({filter_index}).paramName'] = 'Currency'
                params[f'itemFilter({filter_index}).paramValue'] = 'USD'
                filter_index += 1
        
        # Make request with retry logic
        attempt = 0
        last_error = None
        
        while attempt < max_retries:
            try:
                logger.info(f"[Finding API] Searching: '{keywords}' (page={page_number}, limit={entries_per_page})")
                
                async with httpx.AsyncClient(timeout=15) as client:
                    response = await client.get(self.base_url, params=params)
                    response.raise_for_status()
                    
                    data = response.json()
                    
                    # Check eBay API acknowledgement
                    ack = data.get('findCompletedItemsResponse', [{}])[0].get('ack', [''])[0]
                    
                    if ack == 'Failure':
                        error_msg = data.get('findCompletedItemsResponse', [{}])[0].get('errorMessage', [{}])[0]
                        error_text = error_msg.get('error', [{}])[0].get('message', ['Unknown error'])[0]
                        logger.error(f"[Finding API] Request failed: {error_text}")
                        raise ValueError(f"eBay API Error: {error_text}")
                    
                    # Extract search results
                    search_result = data.get('findCompletedItemsResponse', [{}])[0].get('searchResult', [{}])[0]
                    items = search_result.get('item', [])
                    count = int(search_result.get('@count', 0))
                    
                    # Extract pagination info
                    pagination = data.get('findCompletedItemsResponse', [{}])[0].get('paginationOutput', [{}])[0]
                    total_pages = int(pagination.get('totalPages', [0])[0])
                    total_entries = int(pagination.get('totalEntries', [0])[0])
                    
                    logger.info(f"[Finding API] Found {count} items on page {page_number} (total: {total_entries})")
                    
                    return {
                        'searchResult': {
                            'item': items,
                            'count': count
                        },
                        'paginationOutput': {
                            'pageNumber': page_number,
                            'entriesPerPage': entries_per_page,
                            'totalPages': total_pages,
                            'totalEntries': total_entries
                        },
                        'ack': ack
                    }
                
            except httpx.HTTPStatusError as e:
                last_error = e
                attempt += 1
                if attempt < max_retries:
                    # Exponential backoff: 1s, 2s, 4s
                    wait_time = 2 ** (attempt - 1)
                    logger.warning(f"[Finding API] Request failed (attempt {attempt}/{max_retries}), retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"[Finding API] Request failed after {max_retries} attempts: {e}")
                    if e.response is not None:
                        logger.error(f"[Finding API] Error response: {e.response.text[:500]}")
                    raise
            
            except httpx.RequestError as e:
                last_error = e
                attempt += 1
                if attempt < max_retries:
                    wait_time = 2 ** (attempt - 1)
                    logger.warning(f"[Finding API] Network error (attempt {attempt}/{max_retries}), retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"[Finding API] Request failed after {max_retries} attempts: {e}")
                    raise
        
        # Should never reach here, but just in case
        if last_error:
            raise last_error
        raise RuntimeError("Unexpected error in find_completed_items")
    
    def _normalize_buying_format(self, buying_format: str) -> Optional[str]:
        """
        Convert user-friendly buying format to Finding API ListingType value.
        
        Args:
            buying_format: "Auction", "FixedPrice", "BuyItNow", "All", etc.
        
        Returns:
            Finding API ListingType value or None if invalid
        """
        format_map = {
            'auction': 'Auction',
            'fixedprice': 'FixedPrice',
            'buyitnow': 'FixedPrice',
            'bin': 'FixedPrice',
            'all': 'All',
        }
        
        normalized = buying_format.lower().replace(' ', '').replace('_', '').replace('-', '')
        return format_map.get(normalized)
    
    def _get_condition_id(self, condition: str) -> Optional[str]:
        """
        Convert condition name to eBay condition ID.
        
        Args:
            condition: "New", "Used", "Unspecified", etc.
        
        Returns:
            eBay condition ID or None if invalid
        """
        condition_map = {
            'new': '1000',
            'likenew': '1500',
            'used': '3000',
            'verygood': '4000',
            'good': '5000',
            'acceptable': '6000',
            'unspecified': '7000',
        }
        
        normalized = condition.lower().replace(' ', '').replace('_', '').replace('-', '')
        return condition_map.get(normalized)
    
    async def get_all_completed_items(
        self,
        keywords: str,
        max_pages: int = 3,
        sort_order: str = "EndTimeSoonest",
        buying_format: Optional[str] = None,
        condition: Optional[str] = None,
        price_min: Optional[float] = None,
        price_max: Optional[float] = None,
    ) -> List[Dict]:
        """
        Fetch multiple pages of completed items concurrently.
        
        Args:
            keywords: Search query
            max_pages: Maximum pages to fetch (default 3)
            sort_order: Sort order for results
            buying_format: Optional buying format filter
            condition: Optional condition filter
            price_min: Optional minimum price
            price_max: Optional maximum price
        
        Returns:
            List of all items from all pages
        """
        # Fetch first page to get total pages
        first_page = await self.find_completed_items(
            keywords=keywords,
            page_number=1,
            sort_order=sort_order,
            buying_format=buying_format,
            condition=condition,
            price_min=price_min,
            price_max=price_max,
        )
        
        total_pages = first_page['paginationOutput']['totalPages']
        pages_to_fetch = min(max_pages, total_pages)
        
        logger.info(f"[Finding API] Fetching {pages_to_fetch} pages (total available: {total_pages})")
        
        # If only one page needed, return immediately
        if pages_to_fetch <= 1:
            return first_page['searchResult']['item']
        
        # Fetch remaining pages concurrently with semaphore to limit concurrency
        semaphore = asyncio.Semaphore(3)  # Max 3 concurrent requests
        
        async def fetch_page_with_limit(page_num: int):
            async with semaphore:
                result = await self.find_completed_items(
                    keywords=keywords,
                    page_number=page_num,
                    sort_order=sort_order,
                    buying_format=buying_format,
                    condition=condition,
                    price_min=price_min,
                    price_max=price_max,
                )
                return result['searchResult']['item']
        
        # Create tasks for pages 2 through pages_to_fetch
        tasks = [fetch_page_with_limit(page_num) for page_num in range(2, pages_to_fetch + 1)]
        
        # Gather all results
        remaining_pages = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Combine all items
        all_items = first_page['searchResult']['item'].copy()
        
        for page_result in remaining_pages:
            if isinstance(page_result, Exception):
                logger.error(f"[Finding API] Page fetch failed: {page_result}")
                continue
            all_items.extend(page_result)
        
        logger.info(f"[Finding API] Fetched total of {len(all_items)} items from {pages_to_fetch} pages")
        return all_items


def normalize_finding_api_item(finding_item: Dict) -> Dict:
    """
    Convert Finding API response to Kuya Comps internal format.
    Must match the structure expected by CompItem schema.
    
    Finding API returns data in arrays (e.g., title: ['some title']).
    We need to extract the first element and map to our schema.
    
    Args:
        finding_item: Item object from Finding API response
    
    Returns:
        Dict: Normalized item in Kuya Comps format matching CompItem schema
    """
    # Helper to safely extract first element from array or return default
    def extract(data, *keys, default=None):
        """Extract nested value, handling eBay's array format."""
        result = data
        for key in keys:
            if isinstance(result, dict):
                result = result.get(key, default)
            else:
                return default
            if isinstance(result, list) and len(result) > 0:
                result = result[0]
            elif isinstance(result, list):
                return default
        return result if result is not None else default
    
    # Extract item ID
    item_id = extract(finding_item, 'itemId', default='')
    
    # Extract title
    title = extract(finding_item, 'title', default='')
    
    # Extract price info from sellingStatus
    selling_status = finding_item.get('sellingStatus', [{}])[0] if finding_item.get('sellingStatus') else {}
    current_price = selling_status.get('currentPrice', [{}])[0] if selling_status.get('currentPrice') else {}
    
    try:
        extracted_price = float(current_price.get('__value__', 0))
    except (ValueError, TypeError):
        extracted_price = 0.0
        logger.warning(f"[Finding API] Invalid price for item {item_id}: {current_price}")
    
    currency = current_price.get('@currencyId', 'USD')
    
    # Extract shipping cost
    shipping_info = finding_item.get('shippingInfo', [{}])[0] if finding_item.get('shippingInfo') else {}
    shipping_cost_obj = shipping_info.get('shippingServiceCost', [{}])[0] if shipping_info.get('shippingServiceCost') else {}
    
    try:
        extracted_shipping = float(shipping_cost_obj.get('__value__', 0))
    except (ValueError, TypeError):
        extracted_shipping = 0.0
    
    shipping_free = shipping_info.get('shippingType', [''])[0] == 'Free'
    if shipping_free:
        extracted_shipping = 0.0
    
    # Extract listing info
    listing_info = finding_item.get('listingInfo', [{}])[0] if finding_item.get('listingInfo') else {}
    buying_format_raw = listing_info.get('listingType', ['FixedPrice'])[0]
    end_time = listing_info.get('endTime', [''])[0]
    
    # Determine buying format flags
    is_auction = 'auction' in buying_format_raw.lower()
    is_buy_it_now = 'fixedprice' in buying_format_raw.lower() or 'storeinventory' in buying_format_raw.lower()
    
    # Check for best offer (Finding API doesn't always provide this)
    is_best_offer = listing_info.get('bestOfferEnabled', [False])[0] if listing_info.get('bestOfferEnabled') else False
    
    # Create buying format string
    buying_format_parts = []
    if is_auction:
        buying_format_parts.append('Auction')
    if is_buy_it_now:
        buying_format_parts.append('Buy It Now')
    if is_best_offer:
        buying_format_parts.append('Best Offer')
    buying_format = ', '.join(buying_format_parts) if buying_format_parts else 'Buy It Now'
    
    # Extract condition
    condition_obj = finding_item.get('condition', [{}])[0] if finding_item.get('condition') else {}
    condition_name = condition_obj.get('conditionDisplayName', [''])[0]
    condition_id = condition_obj.get('conditionId', [''])[0]
    
    # Extract seller info
    seller_info = finding_item.get('sellerInfo', [{}])[0] if finding_item.get('sellerInfo') else {}
    seller_name = seller_info.get('sellerUserName', [''])[0]
    
    # Extract view URL
    view_url = extract(finding_item, 'viewItemURL', default='')
    
    # Extract location
    location = extract(finding_item, 'location', default='')
    
    # Extract image URL
    gallery_url = extract(finding_item, 'galleryURL', default='')
    
    # Calculate total price
    total_price = extracted_price + extracted_shipping
    
    # Build normalized item
    normalized = {
        # Core identification
        'item_id': item_id,
        'title': title,
        'link': view_url,
        'url': view_url,
        'thumbnail': gallery_url,
        
        # Pricing
        'price': f"${extracted_price:.2f}",
        'extracted_price': extracted_price,
        'currency': currency,
        'shipping': 'Free' if shipping_free or extracted_shipping == 0 else f"${extracted_shipping:.2f}",
        'extracted_shipping': extracted_shipping,
        'total_price': total_price,
        
        # Buying format
        'buying_format': buying_format,
        'is_auction': is_auction,
        'is_buy_it_now': is_buy_it_now,
        'is_best_offer': is_best_offer,
        'listing_type': buying_format_raw,
        
        # Condition
        'condition': condition_name,
        'condition_id': condition_id,
        
        # Seller
        'seller': {
            'name': seller_name,
        },
        
        # Timing - for sold items, this is when it ended
        'end_time': end_time,
        
        # Location
        'item_location': location,
        
        # Mark as sold
        'sold': True,
        
        # Finding API specific fields
        'primaryCategory': finding_item.get('primaryCategory', [{}])[0] if finding_item.get('primaryCategory') else {},
        'country': extract(finding_item, 'country', default=''),
        'postalCode': extract(finding_item, 'postalCode', default=''),
    }
    
    # Debug logging
    if extracted_price <= 0:
        logger.warning(f"[Finding API] Item {item_id} has zero/invalid price: {current_price}")
    
    return normalized


# Test function
async def test_finding_client():
    """
    Test the eBay Finding API client with a sample search.
    Run this file directly to test: python backend/ebay_finding_client.py
    """
    try:
        print("="*80)
        print("Testing eBay Finding API Client")
        print("="*80)
        
        client = eBayFindingClient()
        
        # Test single page search
        print("\n[TEST 1] Single page search for: '2024 topps chrome paul skenes'")
        results = await client.find_completed_items(
            keywords="2024 topps chrome paul skenes",
            page_number=1,
            entries_per_page=10,
            sort_order="EndTimeSoonest"
        )
        
        items = results['searchResult']['item']
        count = results['searchResult']['count']
        total_entries = results['paginationOutput']['totalEntries']
        
        print(f"\n[TEST 1] API returned {count} items (total matches: {total_entries})")
        print("\n" + "="*80)
        print("Sample Items:")
        print("="*80)
        
        for i, item in enumerate(items[:5], 1):
            normalized = normalize_finding_api_item(item)
            print(f"\n{i}. {normalized['title'][:70]}...")
            print(f"   Price: {normalized['price']} + {normalized['shipping']} shipping = ${normalized['total_price']:.2f}")
            print(f"   Format: {normalized['buying_format']}")
            print(f"   Condition: {normalized['condition']}")
            print(f"   Seller: {normalized['seller']['name']}")
            print(f"   Item ID: {normalized['item_id']}")
        
        # Test multi-page fetch
        print("\n" + "="*80)
        print("[TEST 2] Multi-page search (2 pages)")
        print("="*80)
        
        all_items = await client.get_all_completed_items(
            keywords="baseball card",
            max_pages=2,
            price_min=10.0,
            price_max=50.0
        )
        
        print(f"\n[TEST 2] Fetched total of {len(all_items)} items across 2 pages")
        
        # Show a few normalized items
        print("\nFirst 3 normalized items:")
        for i, raw_item in enumerate(all_items[:3], 1):
            normalized = normalize_finding_api_item(raw_item)
            print(f"  {i}. {normalized['title'][:60]}... - ${normalized['total_price']:.2f}")
        
        print("\n" + "="*80)
        print("✓ All tests completed successfully!")
        print("="*80)
        return True
        
    except Exception as e:
        print("\n" + "="*80)
        print(f"✗ Test failed: {e}")
        print("="*80)
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_finding_client())
