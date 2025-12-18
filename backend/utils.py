# backend/utils.py
"""
Utility functions shared across the application.

This module contains utility functions extracted from main.py
to avoid circular imports.
"""
import csv
import os
from typing import List, Dict
from backend.config import EBAY_ROTATION_IDS


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
    test_csv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "testing", "comps.csv")
    
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
