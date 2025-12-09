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
from scraper import scrape_sold_comps, scrape_active_listings


app = FastAPI(
    title="eBay Baseball Card Comps API",
    description="Tiny API to pull eBay sold comps for baseball cards.",
    version="0.2.0",
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


def write_results_to_csv(query: str, items: List[CompItem]):
    """Saves search results to a CSV file on the server."""
    if not items:
        return

    # Create directory if it doesn't exist
    os.makedirs(RESULTS_DIR, exist_ok=True)

    filepath = os.path.join(RESULTS_DIR, RESULTS_FILE)
    file_exists = os.path.isfile(filepath)
    existing_item_ids = set()
    max_library_id = 0

    if file_exists:
        try:
            with open(filepath, "r", newline="", encoding="utf-8") as csvfile:
                reader = csv.DictReader(csvfile)
                for row in reader:
                    if 'item_id' in row:
                        existing_item_ids.add(row['item_id'])
                    if 'library_id' in row and row['library_id']:
                        try:
                            max_library_id = max(max_library_id, int(row['library_id']))
                        except (ValueError, TypeError):
                            pass # Ignore if library_id is not a valid integer
        except (IOError, csv.Error) as e:
            print(f"[ERROR] Failed to read existing CSV file: {e}")
            # Proceeding will overwrite or create a new file if reading fails
            pass

    # Define CSV headers based on the CompItem model
    headers = list(CompItem.model_fields.keys())
    new_items = [item for item in items if item.item_id not in existing_item_ids]

    if not new_items:
        print("[INFO] No new items to add to the CSV.")
        return
        
    # Assign library_id to new items
    for i, item in enumerate(new_items, start=1):
        item.library_id = max_library_id + i

    try:
        with open(filepath, "a", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=headers)
            if not file_exists or not existing_item_ids:
                writer.writeheader()
            for item in new_items:
                writer.writerow(item.model_dump())
        print(f"[SUCCESS] {len(new_items)} new results saved to {filepath}")
    except IOError as e:
        print(f"[ERROR] Failed to write CSV file: {e}")


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
    Scrape eBay sold listings for a given query and return:
      - Basic stats on item price (no shipping)
      - FMV metrics based on total price (item + shipping)
      - Full list of items
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

            # Additional post-processing filtering
            filtered_items = []
            for item in raw_items:
                title = item.get('title', '').lower()
                
                if raw_only and any(term in title for term in ['psa', 'bgs', 'sgc', 'csg', 'hga', 'graded', 'grade', 'gem', 'mint']):
                    continue
                    
                if base_only and any(term in title for term in [
                    'refractor', 'prizm', 'prism', 'parallel', 'wave', 'gold', 'purple', 'blue', 'red', 'green',
                    'yellow', 'orange', 'pink', 'black', 'atomic', 'xfractor', 'superfractor', 'numbered', 'stars', 'star'
                ]):
                    continue
                    
                if exclude_autographs and any(term in title for term in ['auto', 'autograph', 'signed', 'signature', 'authentic', 'certified']):
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
    
    comp_items = [CompItem(**item) for item in unique_items]

    # Calculate total_price for each item
    for item in comp_items:
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


@app.get("/deals", response_model=CompsResponse)
def get_deals(
    query: str = Query(
        ...,
        description="Search term, e.g. '2024 topps chrome elly de la cruz auto /25'",
    ),
    market_value: float = Query(
        ...,
        description="Market value threshold - only return items below this price",
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
        le=3,
        description="Number of pages to scrape (max 3 for deals)",
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
    Search for active eBay listings that are priced below the given market value.
    Returns items that could be good deals.
    """
    try:
        if test_mode or (api_key and api_key.lower() == "test"):
            print("[INFO] Using test mode with CSV data for deals")
            raw_items = load_test_data()
        else:
            # Use the backend's default API key for production
            actual_api_key = DEFAULT_API_KEY
            # Modify query based on filters
            modified_query = query
            if raw_only:
                modified_query = f"{modified_query} -PSA -BGS -SGC -CSG -HGA -graded -grade -gem -mint"
            if base_only:
                modified_query = f"{modified_query} -refractor -prizm -prism -parallel -wave -gold -purple -blue -red -green -yellow -orange -pink -black -atomic -xfractor -superfractor -numbered -stars -star"
            if exclude_autographs:
                modified_query = f"{modified_query} -auto -autograph -signed -signature -authentic -certified"

            raw_items = scrape_active_listings(
                query=modified_query,
                api_key=actual_api_key,
                max_pages=pages,
                delay_secs=delay,
                sort_by=sort_by,
                buying_format=buying_format,
                condition=condition,
                price_max=market_value,  # Only get items below market value
            )

            # Additional post-processing filtering
            filtered_items = []
            for item in raw_items:
                title = item.get('title', '').lower()
                
                if raw_only and any(term in title for term in ['psa', 'bgs', 'sgc', 'csg', 'hga', 'graded', 'grade', 'gem', 'mint']):
                    continue
                    
                if base_only and any(term in title for term in [
                    'refractor', 'prizm', 'prism', 'parallel', 'wave', 'gold', 'purple', 'blue', 'red', 'green',
                    'yellow', 'orange', 'pink', 'black', 'atomic', 'xfractor', 'superfractor', 'numbered', 'stars', 'star'
                ]):
                    continue
                    
                if exclude_autographs and any(term in title for term in ['auto', 'autograph', 'signed', 'signature', 'authentic', 'certified']):
                    continue
                    
                filtered_items.append(item)

            raw_items = filtered_items
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scrape failed: {e}")

    # Remove duplicates based on item_id and filter out zero-price items
    print(f"[INFO] Processing {len(raw_items)} raw active listings")
    
    unique_items = []
    seen_item_ids = set()
    duplicates_removed = 0
    zero_price_removed = 0
    above_market_removed = 0
    
    for item in raw_items:
        item_id = item.get('item_id')
        
        # Skip items without item_id
        if not item_id:
            continue
        
        # Skip duplicates
        if item_id in seen_item_ids:
            duplicates_removed += 1
            continue
            
        # Check for valid price
        extracted_price = item.get('extracted_price')
        extracted_shipping = item.get('extracted_shipping', 0)
        
        if extracted_price is None or extracted_price <= 0:
            zero_price_removed += 1
            continue
            
        # Check if total price is below market value
        total_price = extracted_price + (extracted_shipping or 0)
        if total_price >= market_value:
            above_market_removed += 1
            continue
            
        # Item passed all filters - it's a potential deal
        unique_items.append(item)
        seen_item_ids.add(item_id)
    
    print(f"[INFO] Deal filtering results:")
    print(f"  - Raw items: {len(raw_items)}")
    print(f"  - Removed {duplicates_removed} duplicates")
    print(f"  - Removed {zero_price_removed} zero-price items")
    print(f"  - Removed {above_market_removed} items above market value")
    print(f"  - Final deals found: {len(unique_items)}")
    
    comp_items = [CompItem(**item) for item in unique_items]

    # Calculate total_price for each item
    for item in comp_items:
        item.total_price = (item.extracted_price or 0) + (item.extracted_shipping or 0)

    prices = [item.total_price for item in comp_items if item.total_price is not None]
    min_price = min(prices) if prices else None
    max_price = max(prices) if prices else None
    avg_price = sum(prices) / len(prices) if prices else None

    return CompsResponse(
        query=f"{query} (deals below ${market_value:.2f})",
        pages_scraped=pages,
        items=comp_items,
        min_price=min_price,
        max_price=max_price,
        avg_price=avg_price,
        raw_items_scraped=len(raw_items),
        duplicates_filtered=duplicates_removed,
        zero_price_filtered=zero_price_removed,
        market_intelligence={}  # No intelligence analysis for deals
    )


@app.post("/fmv", response_model=FmvResponse)
def get_fmv(items: List[CompItem]):
    """
    Calculates the Fair Market Value (FMV) using volume weighting.
    Auctions with more bids get higher weight (more market validation).
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
        prices = np.array([pair[0] for pair in price_weight_pairs])
        weights = np.array([pair[1] for pair in price_weight_pairs])
        
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
