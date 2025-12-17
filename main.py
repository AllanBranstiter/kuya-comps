# main.py
import csv
import os
import re
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Tuple
from collections import defaultdict

from fastapi import FastAPI, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import numpy as np
from sklearn.neighbors import KernelDensity
from scraper import scrape_sold_comps, scrape_active_listings_ebay_api


app = FastAPI(
    title="Kuya Comps: Your Personal Card Value Dugout",
    description="Your personal assistant for finding baseball card values and deals.",
    version="0.3.0",  # Version History:
                      # 0.3.0 - Dual-search display with active listings filter
                      # 0.2.4 - Improved auction detection using multiple indicators (bids, time left)
                      # 0.2.1 - Added filtering for Raw Only, Base Only, and Exclude Autographs
                      # 0.2.0 - Initial release
)


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

from datetime import date

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


# Production-ready configuration
RESULTS_DIR = os.getenv('CSV_STORAGE_PATH', os.path.dirname(os.path.abspath(__file__)))
RESULTS_FILE = "results_library_complete.csv"

# Get the API key from environment variable (secure - no fallback)
DEFAULT_API_KEY = os.getenv('SEARCH_API_KEY')

# Validate API key is configured
if not DEFAULT_API_KEY:
    print("WARNING: SEARCH_API_KEY environment variable not set. App will only work in test mode.")
    DEFAULT_API_KEY = None


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
    rotation_ids = {
        "com": "711-53200-19255-0",  # US
        "de": "707-53477-19255-0",   # Germany
        "co.uk": "710-53481-19255-0" # UK
    }
    
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
    mkrid = rotation_ids.get(marketplace, rotation_ids["com"])
    params = f"?mkevt=1&mkcid=1&mkrid={mkrid}&customid=kuyacomps"
    
    deep_link = base_url + params
    print(f"[DEEPLINK] Generated: {deep_link}")
    
    return deep_link


def write_results_to_csv(query: str, items: List[CompItem]):
    """
    DISABLED: CSV saving disabled to comply with eBay Terms of Service.
    eBay's API terms prohibit storing/caching their data.
    """
    # Function disabled - no data is saved
    print("[INFO] CSV saving disabled per eBay ToS - data not stored")
    return


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


# ===== MARKET INTELLIGENCE ANALYTICS =====

def detect_parallel_type(title: str) -> Tuple[str, Optional[int]]:
    """
    Detect parallel type and numbering from card title.
    Returns: (parallel_type, numbered_out_of)
    """
    if not title:
        return "unknown", None
    
    title_lower = title.lower()
    
    # Extract numbered parallel (/199, /99, /50, /25, etc.)
    numbered_match = re.search(r'/(\d+)', title)
    numbered = int(numbered_match.group(1)) if numbered_match else None
    
    # Detect parallel types (order matters - check specific types first)
    if re.search(r'aqua.*refractor', title_lower):
        return "aqua_refractor", numbered
    elif re.search(r'ray\s*wave|raywave', title_lower):
        return "raywave_refractor", numbered
    elif re.search(r'x[-\s]*fractor', title_lower):
        return "xfractor", numbered
    elif re.search(r'gold.*refractor', title_lower):
        return "gold_refractor", numbered
    elif re.search(r'orange.*refractor', title_lower):
        return "orange_refractor", numbered
    elif re.search(r'refractor', title_lower) and not re.search(r'base|common', title_lower):
        return "refractor", numbered
    elif re.search(r'prism', title_lower):
        return "prism", numbered
    elif re.search(r'base|common', title_lower) or (not re.search(r'refractor|parallel|prism|chrome', title_lower)):
        return "base", numbered
    else:
        return "chrome_parallel", numbered


def detect_grading_info(title: str) -> Tuple[str, Optional[float]]:
    """
    Detect grading service and grade from title.
    Returns: (grading_service, grade)
    """
    if not title:
        return "raw", None
    
    title_lower = title.lower()
    
    # PSA detection
    psa_match = re.search(r'psa\s*(\d+(?:\.\d+)?)', title_lower)
    if psa_match:
        return "psa", float(psa_match.group(1))
    
    # BGS detection
    bgs_match = re.search(r'bgs\s*(\d+(?:\.\d+)?)', title_lower)
    if bgs_match:
        return "bgs", float(bgs_match.group(1))
        
    # SGC detection
    sgc_match = re.search(r'sgc\s*(\d+(?:\.\d+)?)', title_lower)
    if sgc_match:
        return "sgc", float(sgc_match.group(1))
        
    # Other grading services
    if re.search(r'cgc|csg|hga|tag|gma', title_lower):
        return "other_graded", None
        
    return "raw", None


def extract_card_year(title: str) -> Optional[int]:
    """Extract the card year from title."""
    if not title:
        return None
        
    # Look for 4-digit years (2018-2025 range for modern cards)
    year_match = re.search(r'20(1[8-9]|2[0-5])', title)
    if year_match:
        return int(year_match.group(0))
    return None


def analyze_market_intelligence(items: List[CompItem]) -> Dict:
    """
    Analyze items to generate smart market insights.
    """
    if not items:
        return {}
    
    # Categorize items
    parallel_groups = defaultdict(list)
    grading_groups = defaultdict(list)
    year_groups = defaultdict(list)
    
    for item in items:
        if not item.title or not item.total_price or item.total_price <= 0:
            continue
            
        # Parallel analysis
        parallel_type, numbered = detect_parallel_type(item.title)
        parallel_groups[parallel_type].append(item.total_price)
        
        # Grading analysis
        grading_service, grade = detect_grading_info(item.title)
        grading_key = f"{grading_service}_{int(grade) if grade else 'ungraded'}"
        grading_groups[grading_key].append(item.total_price)
        
        # Year analysis
        year = extract_card_year(item.title)
        if year:
            year_groups[year].append(item.total_price)
    
    # Calculate averages and insights
    insights = {}
    
    # Parallel insights
    parallel_avgs = {}
    for parallel_type, prices in parallel_groups.items():
        if len(prices) >= 2:  # Need at least 2 prices for meaningful average
            parallel_avgs[parallel_type] = sum(prices) / len(prices)
    
    # Calculate premiums vs base cards
    base_avg = parallel_avgs.get('base', 0)
    if base_avg > 0:
        premiums = []
        for parallel_type, avg_price in parallel_avgs.items():
            if parallel_type != 'base' and avg_price > base_avg:
                premium_pct = ((avg_price - base_avg) / base_avg) * 100
                premiums.append(f"{parallel_type.replace('_', ' ').title()}: +{premium_pct:.0f}% vs Base")
        insights['parallel_premiums'] = premiums[:3]  # Top 3 premiums
    
    # Grading insights
    grading_avgs = {}
    for grading_key, prices in grading_groups.items():
        if len(prices) >= 2:
            grading_avgs[grading_key] = sum(prices) / len(prices)
    
    raw_avg = grading_avgs.get('raw_ungraded', 0)
    psa10_avg = grading_avgs.get('psa_10', 0)
    if raw_avg > 0 and psa10_avg > 0:
        grading_multiplier = psa10_avg / raw_avg
        insights['grading_premium'] = f"PSA 10: {grading_multiplier:.1f}x Raw Card Premium"
    
    # Year-over-year insights
    if len(year_groups) >= 2:
        year_trends = []
        sorted_years = sorted(year_groups.keys())
        for i in range(1, len(sorted_years)):
            prev_year = sorted_years[i-1]
            curr_year = sorted_years[i]
            
            prev_avg = sum(year_groups[prev_year]) / len(year_groups[prev_year])
            curr_avg = sum(year_groups[curr_year]) / len(year_groups[curr_year])
            
            if prev_avg > 0:
                change_pct = ((curr_avg - prev_avg) / prev_avg) * 100
                trend_direction = "up" if change_pct > 0 else "down"
                year_trends.append(f"{curr_year} vs {prev_year}: {abs(change_pct):.0f}% {trend_direction}")
        
        insights['year_trends'] = year_trends[:2]  # Top 2 trends
    
    # High-activity insights (auctions with lots of bids)
    high_activity_prices = []
    for item in items:
        bid_count = item.bids or item.total_bids or 0
        if bid_count >= 10 and item.total_price:
            high_activity_prices.append(item.total_price)
    
    if high_activity_prices and len([p for item in items if item.total_price]) > 0:
        all_prices = [item.total_price for item in items if item.total_price]
        high_activity_avg = sum(high_activity_prices) / len(high_activity_prices)
        overall_avg = sum(all_prices) / len(all_prices)
        if overall_avg > 0:
            activity_premium = ((high_activity_avg - overall_avg) / overall_avg) * 100
            insights['activity_premium'] = f"High-Bid Auctions (10+): +{activity_premium:.0f}% Above Average"
    
    # Summary stats
    insights['parallel_breakdown'] = {k: f"${v:.2f} avg ({len(parallel_groups[k])} items)"
                                    for k, v in parallel_avgs.items()}
    insights['grading_breakdown'] = {k: f"${v:.2f} avg ({len(grading_groups[k])} items)"
                                   for k, v in grading_avgs.items()}
    
    return insights


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/test-ebay-api")
def test_ebay_api():
    """Test eBay Browse API connectivity and credentials"""
    try:
        from ebay_browse_client import eBayBrowseClient
        
        print("[TEST] Initializing eBay Browse API client...")
        client = eBayBrowseClient()
        
        print("[TEST] Testing authentication...")
        token = client.get_access_token()
        
        print("[TEST] Testing search...")
        results = client.search_items(
            query="baseball card",
            limit=5
        )
        
        items_count = len(results.get('itemSummaries', []))
        
        return {
            "status": "success",
            "message": "eBay Browse API is working correctly",
            "items_found": items_count,
            "total_matches": results.get('total', 0),
            "environment": client.environment
        }
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[TEST] eBay API test failed: {e}")
        print(f"[TEST] Traceback: {error_trace}")
        
        return {
            "status": "error",
            "message": str(e),
            "traceback": error_trace
        }


@app.get("/comps", response_model=CompsResponse)
def get_comps(
    query: str = Query(
        ...,
        description="Search term, e.g. '2024 topps chrome elly de la cruz auto /25'",
    ),
    delay: float = Query(
        2.0,
        ge=0.0,
        le=10.0,
        description="Delay between page fetches in seconds",
    ),
    pages: int = Query(
        1,
        ge=1,
        le=10,
        description="Number of pages to scrape",
    ),
    raw_only: bool = Query(
        False,
        description="If true, exclude graded cards",
    ),
    base_only: bool = Query(
        False,
        description="If true, exclude parallels and variations",
    ),
    exclude_autographs: bool = Query(
        False,
        description="If true, exclude cards with autographs",
    ),
    sort_by: str = Query(
        "best_match",
        description="Sort order: best_match, price_low_to_high, price_high_to_low, time_newly_listed, etc.",
    ),
    buying_format: Optional[str] = Query(
        None,
        description="Filter by buying format: auction, buy_it_now, best_offer",
    ),
    condition: Optional[str] = Query(
        None,
        description="Filter by condition: new, used, pre_owned_excellent, etc.",
    ),
    price_min: Optional[float] = Query(
        None,
        ge=0,
        description="Minimum price filter",
    ),
    price_max: Optional[float] = Query(
        None,
        ge=0,
        description="Maximum price filter",
    ),
    api_key: str = Query(
        "backend-handled",
        description="API key handling (use 'test' for test mode)",
    ),
    test_mode: bool = Query(
        False,
        description="If true, use test data from CSV instead of SearchAPI.io",
    ),
):
    """
    Scrape eBay SOLD/COMPLETED listings for a given query and return:
      - Basic stats on item price (no shipping)
      - FMV metrics based on total price (item + shipping)
      - Full list of items
    
    Note: Uses SearchAPI.io because the official eBay Browse API does NOT support
    searching sold/completed listings - it only returns active listings.
    """
    try:
        if test_mode or (api_key and api_key.lower() == "test"):
            print("[INFO] Using test mode with CSV data")
            raw_items = load_test_data()
        else:
            # Use the backend's default API key for production
            actual_api_key = DEFAULT_API_KEY
            # Modify query based on filters
            modified_query = query
            if raw_only:
                modified_query = f"{modified_query} -PSA -BGS -SGC -CSG -HGA -graded -grade -gem -mint"
            
            raw_items = scrape_sold_comps(
                query=modified_query,
                max_pages=pages,
                delay_secs=delay,
                ungraded_only=raw_only,  # Keep this for backward compatibility
                api_key=actual_api_key,
                sort_by=sort_by,
                buying_format=buying_format,
                condition=condition,
                price_min=price_min,
                price_max=price_max,
            )

            # Additional post-processing filtering using API data
            filtered_items = []
            for item in raw_items:
                title = item.get('title', '').lower()
                condition = item.get('condition', '').lower()
                authenticity = item.get('authenticity', '').lower()
                extensions = [ext.lower() for ext in item.get('extensions', [])]
                
                # Raw Only filter - check both title and condition/authenticity data
                if raw_only:
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
                if base_only:
                    if any(term in title for term in [
                        'refractor', 'prizm', 'prism', 'parallel', 'wave', 'gold', 'purple', 'blue', 'red', 'green',
                        'yellow', 'orange', 'pink', 'black', 'atomic', 'xfractor', 'superfractor', 'numbered', 'stars', 'star'
                    ]):
                        continue
                    if any(term in ' '.join(extensions) for term in ['parallel', 'refractor', 'prizm', 'numbered']):
                        continue
                    
                # Exclude Autographs filter - check title, authenticity, and extensions
                if exclude_autographs:
                    if any(term in title for term in ['auto', 'autograph', 'signed', 'signature', 'authentic', 'certified']):
                        continue
                    if 'autograph' in authenticity or any('autograph' in ext for ext in extensions):
                        continue
                    
                filtered_items.append(item)

            raw_items = filtered_items
        
    except TypeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Scraper function signature mismatch: {e}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scrape failed: {e}")

    # Remove duplicates based on item_id and filter out zero-price items
    print(f"[INFO] Processing {len(raw_items)} raw items from scraper")
    
    unique_items = []
    seen_item_ids = set()
    duplicates_removed = 0
    zero_price_removed = 0
    no_item_id_removed = 0
    
    for item in raw_items:
        item_id = item.get('item_id')
        
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

    # Save results to CSV on the server
    write_results_to_csv(query, comp_items)

    prices = [item.total_price for item in comp_items if item.total_price is not None]
    min_price = min(prices) if prices else None
    max_price = max(prices) if prices else None
    avg_price = sum(prices) / len(prices) if prices else None

    # Generate market intelligence
    market_intelligence = analyze_market_intelligence(comp_items)

    return CompsResponse(
        query=query,
        pages_scraped=pages,
        items=comp_items,
        min_price=min_price,
        max_price=max_price,
        avg_price=avg_price,
        raw_items_scraped=len(raw_items),
        duplicates_filtered=duplicates_removed,
        zero_price_filtered=zero_price_removed,
        market_intelligence=market_intelligence,
    )


@app.get("/active", response_model=CompsResponse)
def get_active_listings(
    query: str = Query(
        ...,
        description="Search term, e.g. '2024 topps chrome elly de la cruz auto /25'",
    ),
    delay: float = Query(
        2.0,
        ge=0.0,
        le=10.0,
        description="Delay between page fetches in seconds",
    ),
    pages: int = Query(
        1,
        ge=1,
        le=10,
        description="Number of pages to scrape",
    ),
    sort_by: str = Query(
        "best_match",
        description="Sort order: best_match, price_low_to_high, price_high_to_low, time_newly_listed, etc.",
    ),
    buying_format: Optional[str] = Query(
        None,
        description="Filter by buying format: auction, buy_it_now, best_offer",
    ),
    condition: Optional[str] = Query(
        None,
        description="Filter by condition: new, used, pre_owned_excellent, etc.",
    ),
    price_min: Optional[float] = Query(
        None,
        ge=0,
        description="Minimum price filter",
    ),
    price_max: Optional[float] = Query(
        None,
        ge=0,
        description="Maximum price filter",
    ),
    api_key: str = Query(
        "backend-handled",
        description="API key handling",
    ),
):
    """
    Scrape eBay ACTIVE listings (not sold) for a given query.
    Uses official eBay Browse API for all active listing searches.
    """
    try:
        # Always use official eBay Browse API for active listings
        print("[INFO] Using official eBay Browse API for active listings")
        print(f"[INFO] Query: {query}")
        print(f"[INFO] Sort: {sort_by}, Pages: {pages}")
        
        raw_items = scrape_active_listings_ebay_api(
            query=query,
            max_pages=pages,
            delay_secs=delay,
            sort_by=sort_by,
            buying_format=buying_format,
            condition=condition,
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
        raise HTTPException(status_code=500, detail=f"Scrape failed: {str(e)}")

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

    return CompsResponse(
        query=query,
        pages_scraped=pages,
        items=comp_items,
        min_price=min_price,
        max_price=max_price,
        avg_price=avg_price,
        raw_items_scraped=len(raw_items),
        duplicates_filtered=duplicates_removed,
        zero_price_filtered=zero_price_removed,
    )


@app.post("/fmv", response_model=FmvResponse)
def get_fmv(items: List[CompItem]):
    """
    Calculates the Fair Market Value (FMV) using volume weighting.
    Auctions with more bids get higher weight (more market validation).
    Outliers are filtered using IQR method before calculation.
    """
    try:
        # Prepare data for volume weighting
        price_weight_pairs = []
        
        for item in items:
            if item.total_price is None or item.total_price <= 0:
                continue
                
            # Calculate volume weight based on auction activity
            weight = calculate_volume_weight(item)
            price_weight_pairs.append((item.total_price, weight))
        
        if len(price_weight_pairs) < 2:
            return FmvResponse(count=len(price_weight_pairs))

        # Extract prices and weights
        all_prices = np.array([pair[0] for pair in price_weight_pairs])
        all_weights = np.array([pair[1] for pair in price_weight_pairs])
        
        # Filter outliers using IQR method (need at least 4 data points)
        if len(all_prices) >= 4:
            # Calculate quartiles
            q1 = np.percentile(all_prices, 25)
            q3 = np.percentile(all_prices, 75)
            iqr = q3 - q1
            
            # Define outlier bounds (0.5 * IQR for very aggressive filtering)
            # This focuses FMV on the core cluster of sales where most volume occurs
            lower_bound = q1 - 0.5 * iqr
            upper_bound = q3 + 0.5 * iqr
            
            # Filter out outliers
            mask = (all_prices >= lower_bound) & (all_prices <= upper_bound)
            prices = all_prices[mask]
            weights = all_weights[mask]
            
            outliers_removed = len(all_prices) - len(prices)
            print(f"[FMV] Removed {outliers_removed} outliers using very aggressive IQR method (0.5x multiplier)")
            print(f"[FMV] Price bounds: ${lower_bound:.2f} - ${upper_bound:.2f} (Q1: ${q1:.2f}, Q3: ${q3:.2f})")
        else:
            # Not enough data for outlier detection
            prices = all_prices
            weights = all_weights
            print(f"[FMV] Skipping outlier detection (need 4+ items, have {len(all_prices)})")
        
        # Calculate volume-weighted statistics
        weighted_mean = np.average(prices, weights=weights)
        
        # Calculate weighted percentiles for FMV range
        sorted_indices = np.argsort(prices)
        sorted_prices = prices[sorted_indices]
        sorted_weights = weights[sorted_indices]
        
        # Calculate cumulative weights
        cumulative_weights = np.cumsum(sorted_weights)
        total_weight = cumulative_weights[-1]
        
        # Find weighted percentiles
        percentile_25 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.25)
        percentile_75 = find_weighted_percentile(sorted_prices, cumulative_weights, total_weight, 0.75)
        
        # Calculate weighted standard deviation
        weighted_variance = np.average((prices - weighted_mean) ** 2, weights=weights)
        weighted_std = np.sqrt(weighted_variance)
        
        # Define FMV ranges using volume-weighted statistics
        fmv_low = max(0, weighted_mean - weighted_std)
        fmv_high = weighted_mean + weighted_std
        
        # Volume-weighted market tiers
        quick_sale = max(0, percentile_25)      # 25th percentile - quick sale price
        market_value = weighted_mean            # Volume-weighted average - true market
        patient_sale = percentile_75            # 75th percentile - patient seller price
        
        # Determine confidence based on high-weight sales
        high_weight_count = sum(1 for w in weights if w > 1.0)
        confidence_ratio = high_weight_count / len(weights)
        
        if confidence_ratio >= 0.6:
            volume_confidence = "High"
        elif confidence_ratio >= 0.3:
            volume_confidence = "Medium"
        else:
            volume_confidence = "Low"
        
        # Count items within FMV range
        inliers = [price for price in prices if fmv_low <= price <= fmv_high]
        
        print(f"[FMV] Volume-weighted mean: ${weighted_mean:.2f}, std: ${weighted_std:.2f}")
        print(f"[FMV] High-weight sales: {high_weight_count}/{len(weights)} ({volume_confidence} confidence)")

        return FmvResponse(
            fmv_low=fmv_low,
            fmv_high=fmv_high,
            expected_low=quick_sale,    # Keep for backward compatibility
            expected_high=patient_sale, # Keep for backward compatibility
            market_value=market_value,
            quick_sale=quick_sale,
            patient_sale=patient_sale,
            volume_confidence=volume_confidence,
            count=len(inliers)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def calculate_volume_weight(item: CompItem) -> float:
    """
    Calculate volume weight for an item based on auction activity and listing type.
    Higher weight = more market validation.
    """
    base_weight = 1.0
    
    # Check if it's an auction vs buy-it-now
    is_auction_listing = (
        item.is_auction or
        item.auction_sold or
        (item.bids is not None and item.bids > 0) or
        (item.total_bids is not None and item.total_bids > 0)
    )
    
    if is_auction_listing:
        # Auction sales get higher weight (more price discovery)
        weight_multiplier = 1.5
        
        # Add extra weight based on bid count
        bid_count = item.bids or item.total_bids or 0
        if bid_count >= 10:
            weight_multiplier += 1.0  # High competition = very reliable price
        elif bid_count >= 5:
            weight_multiplier += 0.5  # Moderate competition
        elif bid_count >= 2:
            weight_multiplier += 0.25 # Some competition
        
    else:
        # Buy-it-now sales get lower weight (less price discovery)
        weight_multiplier = 0.8
        
        # But if it has best offer accepted, it's more like an auction
        if item.has_best_offer or item.best_offer_enabled:
            weight_multiplier = 1.1
    
    final_weight = base_weight * weight_multiplier
    
    # Cap weights to reasonable range
    return min(max(final_weight, 0.5), 3.0)


def find_weighted_percentile(sorted_prices: np.ndarray, cumulative_weights: np.ndarray,
                           total_weight: float, percentile: float) -> float:
    """
    Find the price at a given weighted percentile.
    """
    target_weight = total_weight * percentile
    
    # Find the index where cumulative weight crosses the target
    idx = np.searchsorted(cumulative_weights, target_weight)
    
    # Handle edge cases
    if idx == 0:
        return sorted_prices[0]
    elif idx >= len(sorted_prices):
        return sorted_prices[-1]
    
    # Interpolate between prices if needed
    if idx < len(sorted_prices) - 1:
        weight_before = cumulative_weights[idx - 1] if idx > 0 else 0
        weight_at = cumulative_weights[idx]
        
        if weight_at > weight_before:
            ratio = (target_weight - weight_before) / (weight_at - weight_before)
            return sorted_prices[idx - 1] + ratio * (sorted_prices[idx] - sorted_prices[idx - 1])
    
    return sorted_prices[idx]


# Serve the UI
app.mount("/", StaticFiles(directory="static", html=True), name="static")
