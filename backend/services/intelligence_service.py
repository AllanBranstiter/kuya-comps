# backend/services/intelligence_service.py
"""
Market intelligence analysis service.

This module analyzes card listings to generate insights about:
- Parallel card types and their price premiums
- Grading service premiums
- Year-over-year trends
- High-activity auction premiums
"""
import re
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
from backend.config import (
    MIN_PARALLEL_SAMPLES,
    MAX_PARALLEL_PREMIUMS,
    MAX_YEAR_TRENDS,
    HIGH_ACTIVITY_BID_THRESHOLD,
)


def detect_parallel_type(title: str) -> Tuple[str, Optional[int]]:
    """
    Detect parallel type and numbering from card title.
    
    Parallel cards are special variants with limited print runs, often numbered
    (e.g., "/99" means only 99 copies exist). Different parallel types command
    different premium prices in the market.
    
    Args:
        title: Card listing title
    
    Returns:
        Tuple of (parallel_type, numbered_out_of)
        - parallel_type: Type of parallel (e.g., "refractor", "base")
        - numbered_out_of: Print run limit if numbered (e.g., 99 from "/99")
    
    Examples:
        "2024 Topps Chrome Elly De La Cruz Gold Refractor /50"
        -> ("gold_refractor", 50)
        
        "2024 Topps Chrome Base Card"
        -> ("base", None)
        
        "2024 Topps Chrome Aqua Refractor /199"
        -> ("aqua_refractor", 199)
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
    
    Professional grading services authenticate and grade cards on a scale
    (typically 1-10). Graded cards, especially high grades (PSA 10, BGS 9.5),
    command significant premiums over raw (ungraded) cards.
    
    Args:
        title: Card listing title
    
    Returns:
        Tuple of (grading_service, grade)
        - grading_service: "psa", "bgs", "sgc", "other_graded", or "raw"
        - grade: Numeric grade (e.g., 10, 9.5) or None for raw
    
    Examples:
        "2024 Topps Chrome PSA 10"
        -> ("psa", 10.0)
        
        "2024 Topps Chrome BGS 9.5"
        -> ("bgs", 9.5)
        
        "2024 Topps Chrome Raw Card"
        -> ("raw", None)
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
    """
    Extract the card year from title.
    
    Card values often vary by year due to player performance, rookie status,
    or set popularity. This helps identify year-over-year price trends.
    
    Args:
        title: Card listing title
    
    Returns:
        Year as integer (2018-2025) or None if not found
    
    Examples:
        "2024 Topps Chrome Elly De La Cruz"
        -> 2024
        
        "2021 Bowman Chrome Vladimir Guerrero Jr."
        -> 2021
    """
    if not title:
        return None
        
    # Look for 4-digit years (2018-2025 range for modern cards)
    year_match = re.search(r'20(1[8-9]|2[0-5])', title)
    if year_match:
        return int(year_match.group(0))
    return None


def analyze_market_intelligence(items: List[object]) -> Dict:
    """
    Analyze sold listings to generate actionable market insights.
    
    This function categorizes items by parallel type, grading, and year,
    then calculates price averages and premiums to help users understand:
    - Which parallel variants are worth more
    - The value added by professional grading
    - Price trends across different card years
    - Whether high-bidding auctions indicate strong demand
    
    Args:
        items: List of CompItem objects with title and total_price
    
    Returns:
        Dictionary with market insights including:
        - parallel_premiums: Top N parallel types with % premium vs base
        - grading_premium: PSA 10 multiplier vs raw cards
        - year_trends: Year-over-year price changes
        - activity_premium: High-bid auction premium vs average
        - parallel_breakdown: Average prices by parallel type
        - grading_breakdown: Average prices by grading service/grade
    
    Example return:
        {
            "parallel_premiums": [
                "Gold Refractor: +250% vs Base",
                "Refractor: +120% vs Base"
            ],
            "grading_premium": "PSA 10: 3.2x Raw Card Premium",
            "parallel_breakdown": {
                "base": "$15.00 avg (23 items)",
                "refractor": "$33.00 avg (12 items)"
            }
        }
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
        if len(prices) >= MIN_PARALLEL_SAMPLES:  # Need at least 2 prices for meaningful average
            parallel_avgs[parallel_type] = sum(prices) / len(prices)
    
    # Calculate premiums vs base cards
    base_avg = parallel_avgs.get('base', 0)
    if base_avg > 0:
        premiums = []
        for parallel_type, avg_price in parallel_avgs.items():
            if parallel_type != 'base' and avg_price > base_avg:
                premium_pct = ((avg_price - base_avg) / base_avg) * 100
                premiums.append(f"{parallel_type.replace('_', ' ').title()}: +{premium_pct:.0f}% vs Base")
        insights['parallel_premiums'] = premiums[:MAX_PARALLEL_PREMIUMS]  # Top 3 premiums
    
    # Grading insights
    grading_avgs = {}
    for grading_key, prices in grading_groups.items():
        if len(prices) >= MIN_PARALLEL_SAMPLES:
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
        
        insights['year_trends'] = year_trends[:MAX_YEAR_TRENDS]  # Top 2 trends
    
    # High-activity insights (auctions with lots of bids)
    high_activity_prices = []
    for item in items:
        bid_count = item.bids or item.total_bids or 0
        if bid_count >= HIGH_ACTIVITY_BID_THRESHOLD and item.total_price:
            high_activity_prices.append(item.total_price)
    
    if high_activity_prices and len([p for item in items if item.total_price]) > 0:
        all_prices = [item.total_price for item in items if item.total_price]
        high_activity_avg = sum(high_activity_prices) / len(high_activity_prices)
        overall_avg = sum(all_prices) / len(all_prices)
        if overall_avg > 0:
            activity_premium = ((high_activity_avg - overall_avg) / overall_avg) * 100
            insights['activity_premium'] = f"High-Bid Auctions ({HIGH_ACTIVITY_BID_THRESHOLD}+): +{activity_premium:.0f}% Above Average"
    
    # Summary stats
    insights['parallel_breakdown'] = {k: f"${v:.2f} avg ({len(parallel_groups[k])} items)"
                                    for k, v in parallel_avgs.items()}
    insights['grading_breakdown'] = {k: f"${v:.2f} avg ({len(grading_groups[k])} items)"
                                   for k, v in grading_avgs.items()}
    
    return insights
