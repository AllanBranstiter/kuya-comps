"""
eBay Browse API Client
Official eBay Buy API integration for Kuya Comps
Documentation: https://developer.ebay.com/api-docs/buy/browse/overview.html
"""
import os
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from dotenv import load_dotenv

load_dotenv()


class eBayBrowseClient:
    """
    eBay Browse API client with OAuth 2.0 Application token authentication.
    
    This client handles:
    - OAuth 2.0 authentication with automatic token refresh
    - Item search using the Browse API
    - Individual item details retrieval
    - Proper error handling and logging
    """
    
    def __init__(self):
        self.app_id = os.getenv('EBAY_APP_ID')
        self.dev_id = os.getenv('EBAY_DEV_ID')
        self.cert_id = os.getenv('EBAY_CERT_ID')
        self.environment = os.getenv('EBAY_ENVIRONMENT', 'production')
        
        # eBay Partner Network (ePN) affiliate configuration
        self.campaign_id = os.getenv('EBAY_CAMPAIGN_ID')
        self.enable_affiliate = os.getenv('EBAY_ENABLE_AFFILIATE', 'false').lower() == 'true'
        
        if not all([self.app_id, self.cert_id]):
            raise ValueError("eBay credentials not found. Please set EBAY_APP_ID and EBAY_CERT_ID in .env")
        
        # API endpoints based on environment
        if self.environment == 'production':
            self.auth_url = "https://api.ebay.com/identity/v1/oauth2/token"
            self.base_url = "https://api.ebay.com/buy/browse/v1"
        else:
            self.auth_url = "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
            self.base_url = "https://api.sandbox.ebay.com/buy/browse/v1"
        
        # Token management
        self.token = None
        self.token_expires = None
        
        print(f"[eBay API] Initialized in {self.environment} mode")
    
    def get_access_token(self) -> str:
        """
        Get OAuth 2.0 Application Access Token using Client Credentials flow.
        Tokens are cached and automatically refreshed when expired.
        
        Returns:
            str: Valid access token
        """
        # Check if cached token is still valid
        if self.token and self.token_expires and datetime.now() < self.token_expires:
            return self.token
        
        print("[eBay API] Requesting new access token...")
        
        # Request new token using Client Credentials grant
        auth = (self.app_id, self.cert_id)
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        data = {
            'grant_type': 'client_credentials',
            'scope': 'https://api.ebay.com/oauth/api_scope'
        }
        
        try:
            response = requests.post(
                self.auth_url,
                auth=auth,
                headers=headers,
                data=data,
                timeout=10
            )
            response.raise_for_status()
            
            token_data = response.json()
            self.token = token_data['access_token']
            
            # Refresh token 5 minutes before actual expiry for safety
            expires_in = token_data.get('expires_in', 7200) - 300
            self.token_expires = datetime.now() + timedelta(seconds=expires_in)
            
            print(f"[eBay API] Token acquired successfully, expires in {expires_in}s")
            return self.token
            
        except requests.exceptions.RequestException as e:
            print(f"[eBay API] Authentication failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"[eBay API] Error response: {e.response.text[:500]}")
            raise
    
    def search_items(
        self,
        query: str,
        limit: int = 50,
        offset: int = 0,
        sort: str = "price",
        filter_params: Optional[Dict[str, str]] = None,
        fieldgroups: str = "EXTENDED",
        marketplace_id: str = "EBAY_US",
    ) -> Dict:
        """
        Search for items using the Browse API.
        
        API Endpoint: GET /item_summary/search
        Docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
        
        Args:
            query: Search keywords (e.g., "2024 topps chrome paul skenes")
            limit: Results per page (1-200, default 50)
            offset: Pagination offset (0-9999)
            sort: Sort order - "price", "newlyListed", "endingSoonest", "-price" (desc)
            filter_params: Filters dict - buyingOptions, conditions, price, itemLocationCountry
            fieldgroups: "EXTENDED" for more details, "MATCHING_ITEMS" (default)
            marketplace_id: "EBAY_US", "EBAY_GB", "EBAY_DE", etc.
        
        Returns:
            Dict containing:
                - itemSummaries: List of item objects
                - total: Total number of matching items
                - limit: Items per page
                - offset: Current offset
                - next: URL for next page (if available)
                - prev: URL for previous page (if available)
        
        Example filters:
            {
                'buyingOptions': 'FIXED_PRICE|AUCTION',
                'price': '[10..100]',
                'conditions': 'NEW',
                'itemLocationCountry': 'US'
            }
        """
        token = self.get_access_token()
        
        headers = {
            'Authorization': f'Bearer {token}',
            'X-EBAY-C-MARKETPLACE-ID': marketplace_id,
            'Accept': 'application/json'
        }
        
        # Add eBay Partner Network (ePN) affiliate tracking header
        # This enables the API to return itemAffiliateWebUrl for commission tracking
        if self.enable_affiliate and self.campaign_id:
            headers['X-EBAY-C-ENDUSERCTX'] = f'affiliateCampaignId={self.campaign_id}'
            print(f"[eBay API] Affiliate tracking enabled (Campaign: {self.campaign_id})")
        
        params = {
            'q': query,
            'limit': min(limit, 200),  # eBay API max is 200
            'offset': offset,
        }
        
        if sort:
            params['sort'] = sort
        
        if fieldgroups:
            params['fieldgroups'] = fieldgroups
        
        # Build filter string from dict
        # Format: "key1:value1,key2:value2"
        if filter_params:
            filter_list = []
            for key, value in filter_params.items():
                filter_list.append(f"{key}:{value}")
            params['filter'] = ','.join(filter_list)
        
        url = f"{self.base_url}/item_summary/search"
        
        try:
            print(f"[eBay API] Searching: '{query}' (limit={limit}, offset={offset})")
            response = requests.get(url, headers=headers, params=params, timeout=15)
            response.raise_for_status()
            
            data = response.json()
            total = data.get('total', 0)
            items_count = len(data.get('itemSummaries', []))
            print(f"[eBay API] Found {items_count} items on this page (total matches: {total})")
            
            return data
            
        except requests.exceptions.RequestException as e:
            print(f"[eBay API] Search failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"[eBay API] Error response: {e.response.text[:500]}")
            raise
    
    def get_item(
        self,
        item_id: str,
        fieldgroups: Optional[str] = None,
        marketplace_id: str = "EBAY_US"
    ) -> Dict:
        """
        Get detailed information for a specific item.
        
        API Endpoint: GET /item/{item_id}
        Docs: https://developer.ebay.com/api-docs/buy/browse/resources/item/methods/getItem
        
        Args:
            item_id: eBay item ID (RESTful format: v1|######|#)
            fieldgroups: Optional - "PRODUCT", "ADDITIONAL_SELLER_DETAILS", "CHARITY_DETAILS"
            marketplace_id: "EBAY_US", "EBAY_GB", "EBAY_DE", etc.
        
        Returns:
            Dict: Detailed item information including description, specs, seller info, etc.
        """
        token = self.get_access_token()
        
        headers = {
            'Authorization': f'Bearer {token}',
            'X-EBAY-C-MARKETPLACE-ID': marketplace_id,
            'Accept': 'application/json'
        }
        
        # Add eBay Partner Network (ePN) affiliate tracking header
        if self.enable_affiliate and self.campaign_id:
            headers['X-EBAY-C-ENDUSERCTX'] = f'affiliateCampaignId={self.campaign_id}'
        
        params = {}
        if fieldgroups:
            params['fieldgroups'] = fieldgroups
        
        url = f"{self.base_url}/item/{item_id}"
        
        try:
            print(f"[eBay API] Getting item details: {item_id}")
            response = requests.get(url, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"[eBay API] Get item failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"[eBay API] Error response: {e.response.text[:500]}")
            raise


def normalize_ebay_browse_item(ebay_item: Dict) -> Dict:
    """
    Convert eBay Browse API item format to Kuya Comps internal format.
    
    Maps eBay API fields to the format expected by main.py and the frontend.
    This ensures compatibility with existing code while using official eBay data.
    
    Args:
        ebay_item: Item object from eBay Browse API response
    
    Returns:
        Dict: Normalized item in Kuya Comps format
    """
    # Extract nested values safely
    price_obj = ebay_item.get('price', {})
    seller_obj = ebay_item.get('seller', {})
    image_obj = ebay_item.get('image', {})
    location_obj = ebay_item.get('itemLocation', {})
    
    # Extract shipping info (first shipping option if available)
    shipping_options = ebay_item.get('shippingOptions', [])
    shipping_cost = 0.0
    if shipping_options and len(shipping_options) > 0:
        shipping_obj = shipping_options[0].get('shippingCost', {})
        try:
            shipping_cost = float(shipping_obj.get('value', 0))
        except (ValueError, TypeError):
            shipping_cost = 0.0
    
    # Extract price
    try:
        extracted_price = float(price_obj.get('value', 0))
    except (ValueError, TypeError):
        extracted_price = 0.0
    
    # Determine buying format
    buying_options = ebay_item.get('buyingOptions', [])
    is_auction = 'AUCTION' in buying_options
    is_buy_it_now = 'FIXED_PRICE' in buying_options
    is_best_offer = 'BEST_OFFER' in buying_options
    
    # Create buying format string for display
    buying_format_parts = []
    if is_auction:
        buying_format_parts.append('Auction')
    if is_buy_it_now:
        buying_format_parts.append('Buy It Now')
    if is_best_offer:
        buying_format_parts.append('Best Offer')
    buying_format = ', '.join(buying_format_parts) if buying_format_parts else 'Buy It Now'
    
    # Use affiliate link if available (for ePN commissions), otherwise use regular link
    # itemAffiliateWebUrl is returned when X-EBAY-C-ENDUSERCTX header includes affiliateCampaignId
    item_link = ebay_item.get('itemAffiliateWebUrl') or ebay_item.get('itemWebUrl')
    
    return {
        # Core identification
        'item_id': ebay_item.get('itemId'),
        'title': ebay_item.get('title'),
        'subtitle': ebay_item.get('subtitle'),
        'link': item_link,  # Affiliate link if available, regular link otherwise
        'itemAffiliateWebUrl': ebay_item.get('itemAffiliateWebUrl'),  # Preserve affiliate URL
        'itemWebUrl': ebay_item.get('itemWebUrl'),  # Preserve regular URL
        'thumbnail': image_obj.get('imageUrl'),
        'images': ebay_item.get('additionalImages', []),
        
        # Pricing
        'price': f"${extracted_price:.2f}",
        'extracted_price': extracted_price,
        'currency': price_obj.get('currency', 'USD'),
        'shipping': f"${shipping_cost:.2f}" if shipping_cost > 0 else 'Free',
        'extracted_shipping': shipping_cost,
        
        # Buying format
        'buying_format': buying_format,
        'is_auction': is_auction,
        'is_buy_it_now': is_buy_it_now,
        'is_best_offer': is_best_offer,
        
        # Condition
        'condition': ebay_item.get('condition'),
        'condition_id': ebay_item.get('conditionId'),
        
        # Location
        'item_location': location_obj.get('city'),
        
        # Seller info
        'seller': {
            'name': seller_obj.get('username'),
            'feedback_percent': seller_obj.get('feedbackPercentage'),
            'feedback_score': seller_obj.get('feedbackScore'),
        },
        
        # Special features
        'authenticity_guarantee': ebay_item.get('authenticityGuarantee') is not None,
        'top_rated': ebay_item.get('topRatedBuyingExperience', False),
        'is_in_psa_vault': False,  # Not available in Browse API item summary
        
        # Additional metadata
        'bid_count': ebay_item.get('bidCount', 0),
        'bids': ebay_item.get('bidCount', 0),
        'watching': ebay_item.get('watchCount'),
        'itemCreationDate': ebay_item.get('itemCreationDate'),
        'itemEndDate': ebay_item.get('itemEndDate'),
        
        # Categories
        'categories': ebay_item.get('categories', []),
        'leafCategoryIds': ebay_item.get('leafCategoryIds', []),
        
        # Short description if available (EXTENDED fieldgroup)
        'shortDescription': ebay_item.get('shortDescription'),
    }


# Test function
def test_ebay_client():
    """
    Test the eBay Browse API client with a sample search.
    Run this file directly to test: python ebay_browse_client.py
    """
    try:
        print("="*60)
        print("Testing eBay Browse API Client")
        print("="*60)
        
        client = eBayBrowseClient()
        
        # Test search
        print("\n[TEST] Searching for: '2024 topps chrome paul skenes'")
        results = client.search_items(
            query="2024 topps chrome paul skenes",
            limit=10,
            sort="price",
            filter_params={
                'buyingOptions': 'FIXED_PRICE',
                'itemLocationCountry': 'US'
            }
        )
        
        items = results.get('itemSummaries', [])
        total = results.get('total', 0)
        
        print(f"\n[TEST] API returned {len(items)} items (total matches: {total})")
        print("\n" + "="*60)
        print("Sample Items:")
        print("="*60)
        
        for i, item in enumerate(items[:3], 1):
            normalized = normalize_ebay_browse_item(item)
            print(f"\n{i}. {normalized['title'][:70]}...")
            print(f"   Price: {normalized['price']} + {normalized['shipping']} shipping")
            print(f"   Format: {normalized['buying_format']}")
            print(f"   Condition: {normalized['condition']}")
            print(f"   Seller: {normalized['seller']['name']} ({normalized['seller']['feedback_score']} feedback)")
            if normalized['authenticity_guarantee']:
                print(f"   ✓ Authenticity Guarantee")
            if normalized['top_rated']:
                print(f"   ✓ Top Rated Plus")
        
        print("\n" + "="*60)
        print("✓ Test completed successfully!")
        print("="*60)
        return True
        
    except Exception as e:
        print("\n" + "="*60)
        print(f"✗ Test failed: {e}")
        print("="*60)
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    test_ebay_client()
