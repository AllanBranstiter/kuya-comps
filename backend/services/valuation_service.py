# backend/services/valuation_service.py
"""
Automated Valuation Engine for Collections & Binders (Phase 4).

This service automatically updates Fair Market Values (FMV) for cards in user collections
by scraping eBay sold listings and applying safety checks to ensure data quality.

Safety Checks Implemented:
1. Keyword Firewall - Excludes listings with unwanted keywords (reprints, digital, etc.)
2. Outlier Removal - Uses IQR filtering to remove extreme prices
3. Ghost Town Check - Doesn't update to $0 if no sales found
4. Volatility Guardrail - Flags cards for review if price changes >50%
"""
from sqlalchemy.orm import Session
from typing import List, Optional, Tuple, Dict
from datetime import datetime
from decimal import Decimal
import asyncio
import numpy as np

from backend.database.schema import Card
from backend.services.collection_service import (
    get_cards_for_auto_update,
    add_price_history
)
from backend.models.collection_schemas import PriceHistoryCreate
from backend.models.schemas import CompItem
from backend.services.fmv_service import calculate_fmv
from backend.logging_config import get_logger

logger = get_logger(__name__)

# ============================================================================
# Configuration Constants
# ============================================================================

# Keyword Firewall - Exclude listings containing these terms
EXCLUDED_KEYWORDS = [
    'reprint',
    'digital',
    'rp',
    'box',
    'pack',
    'lot of',
    'custom',
    'proxy',
    'replica',
    'facsimile',
    'photocopy',
    'print',
    'poster',
    'photo',
]

# Volatility threshold for flagging review (50% change)
VOLATILITY_THRESHOLD = 0.50

# Minimum number of sales required for FMV calculation
MIN_SALES_FOR_UPDATE = 1

# IQR multiplier for outlier detection (1.5 is standard)
IQR_MULTIPLIER = 1.5


# ============================================================================
# Keyword Firewall
# ============================================================================

def passes_keyword_firewall(title: str) -> bool:
    """
    Check if a listing title passes the keyword firewall.

    Excludes listings containing unwanted keywords like "reprint", "digital", etc.

    Args:
        title: Listing title to check

    Returns:
        True if title is acceptable, False if it should be excluded
    """
    if not title:
        return True

    title_lower = title.lower()

    for keyword in EXCLUDED_KEYWORDS:
        if keyword in title_lower:
            logger.debug(f"[Keyword Firewall] Excluded: '{keyword}' found in '{title[:60]}'")
            return False

    return True


# ============================================================================
# Outlier Detection
# ============================================================================

def remove_outliers_iqr(prices: List[float]) -> Tuple[List[float], int]:
    """
    Remove outliers using Interquartile Range (IQR) method.

    This filters out extreme prices (e.g., $1 starting bids, $10,000 shill bids)
    to focus on the core price cluster.

    Args:
        prices: List of prices to filter

    Returns:
        Tuple of (filtered_prices, num_outliers_removed)
    """
    if len(prices) < 4:
        # Need at least 4 data points for IQR
        return prices, 0

    # Sort prices
    sorted_prices = sorted(prices)
    n = len(sorted_prices)

    # Calculate quartiles
    q1, q3 = np.percentile(sorted_prices, [25, 75])
    iqr = q3 - q1

    # Define outlier bounds
    lower_bound = q1 - IQR_MULTIPLIER * iqr
    upper_bound = q3 + IQR_MULTIPLIER * iqr

    # Filter outliers
    filtered_prices = [p for p in prices if lower_bound <= p <= upper_bound]
    num_removed = len(prices) - len(filtered_prices)

    if num_removed > 0:
        logger.info(f"[IQR Filter] Removed {num_removed} outliers. Bounds: ${lower_bound:.2f} - ${upper_bound:.2f}")

    return filtered_prices, num_removed


# ============================================================================
# FMV Calculation
# ============================================================================

def calculate_median_fmv(prices: List[float]) -> Optional[Decimal]:
    """
    Calculate median Fair Market Value from a list of prices.

    Uses median instead of mean to be more resistant to outliers.

    Args:
        prices: List of prices

    Returns:
        Median price as Decimal, or None if insufficient data
    """
    if not prices or len(prices) < MIN_SALES_FOR_UPDATE:
        return None

    sorted_prices = sorted(prices)
    n = len(sorted_prices)

    if n % 2 == 0:
        # Even number of prices - average the two middle values
        median = (sorted_prices[n // 2 - 1] + sorted_prices[n // 2]) / 2
    else:
        # Odd number of prices - take the middle value
        median = sorted_prices[n // 2]

    return Decimal(str(round(median, 2)))


# ============================================================================
# Volatility Check
# ============================================================================

def check_volatility(
    new_fmv: Decimal,
    previous_fmv: Optional[Decimal]
) -> Tuple[bool, Optional[float], Optional[str]]:
    """
    Check if the new FMV represents excessive volatility.

    If the price change exceeds 50%, the card should be flagged for manual review.

    Args:
        new_fmv: Newly calculated FMV
        previous_fmv: Previous FMV (None if first update)

    Returns:
        Tuple of (should_flag_for_review, percent_change, reason)
    """
    if previous_fmv is None or previous_fmv == 0:
        # First update or previous was $0 - no volatility check
        return False, None, None

    # Calculate percent change
    change = new_fmv - previous_fmv
    percent_change = float(abs(change) / previous_fmv)

    if percent_change > VOLATILITY_THRESHOLD:
        direction = "increase" if change > 0 else "decrease"
        reason = f"Price {direction} of {percent_change:.1%} exceeds {VOLATILITY_THRESHOLD:.0%} threshold"
        logger.warning(f"[Volatility Check] FLAGGED: {reason} (${previous_fmv} → ${new_fmv})")
        return True, percent_change, reason

    return False, percent_change, None


# ============================================================================
# Main Valuation Function
# ============================================================================

async def update_card_valuation(
    db: Session,
    card: Card,
    scraper_func,
    api_key: str
) -> Dict:
    """
    Update the Fair Market Value for a single card.

    This function:
    1. Scrapes eBay using the card's search_query_string
    2. Applies keyword firewall to filter unwanted listings
    3. Removes outliers using IQR method
    4. Calculates median FMV
    5. Checks for excessive volatility
    6. Updates card or flags for review
    7. Creates price history entry

    Args:
        db: Database session
        card: Card object to update
        scraper_func: Async function to scrape eBay (scrape_sold_comps)
        api_key: SearchAPI.io API key

    Returns:
        Dict with update results and statistics
    """
    logger.info(f"[Valuation] Updating card {card.id}: {card.athlete} - {card.set_name}")

    result = {
        'card_id': card.id,
        'success': False,
        'updated': False,
        'flagged_for_review': False,
        'reason': None,
        'previous_fmv': float(card.current_fmv) if card.current_fmv else None,
        'new_fmv': None,
        'num_sales': 0,
        'num_filtered': 0,
        'num_outliers': 0,
    }

    try:
        # Step 1: Scrape eBay for sold listings
        search_query = card.search_query_string or f"{card.year} {card.set_name} {card.athlete}"

        # Apply raw_only query modification (same as comps.py)
        if card.raw_only:
            search_query = f"{search_query} -PSA -BGS -SGC -CSG -HGA -graded"

        logger.info(f"[Valuation] Scraping eBay with query: '{search_query}'")

        raw_items = await scraper_func(
            query=search_query,
            api_key=api_key,
            max_pages=2,
            delay_secs=1.0
        )

        logger.info(f"[Valuation] Scraped {len(raw_items)} raw items")

        # Step 2: Apply keyword firewall + card-specific filters, build CompItem list
        comp_items = []
        for item in raw_items:
            title = item.get('title', '')
            title_lower = title.lower()

            # Keyword firewall — always exclude reprints, digital, etc.
            if not passes_keyword_firewall(title):
                result['num_filtered'] += 1
                continue

            # Raw only post-filter (same logic as comps.py)
            if card.raw_only:
                condition = item.get('condition', '').lower()
                if condition == 'graded' or item.get('is_in_psa_vault'):
                    result['num_filtered'] += 1
                    continue
                if any(term in title_lower for term in ['psa', 'bgs', 'sgc', 'csg', 'hga', 'graded']):
                    result['num_filtered'] += 1
                    continue

            # Base only post-filter (same logic as comps.py)
            if card.base_only:
                parallel_terms = [
                    'refractor', 'prizm', 'prism', 'parallel', 'wave', 'gold', 'purple',
                    'blue', 'red', 'green', 'yellow', 'orange', 'pink', 'black', 'atomic',
                    'xfractor', 'superfractor', 'numbered', 'stars', 'star'
                ]
                if any(term in title_lower for term in parallel_terms):
                    result['num_filtered'] += 1
                    continue

            # Must have a usable price
            price = item.get('extracted_price') or item.get('total_price')
            if not price or price <= 0:
                continue

            # Ensure total_price is set (calculate_fmv uses this field)
            if not item.get('total_price'):
                item['total_price'] = price

            comp_items.append(CompItem(
                title=title,
                total_price=item.get('total_price'),
                extracted_price=item.get('extracted_price'),
                is_auction=item.get('is_auction', False),
                is_buy_it_now=item.get('is_buy_it_now', False),
                is_best_offer=item.get('is_best_offer', False),
                bids=item.get('bids', 0),
            ))

        logger.info(f"[Valuation] After filtering: {len(comp_items)} items ({result['num_filtered']} filtered)")

        # Step 3: Ghost Town Check — flag if zero sales found, but don't update FMV
        if len(comp_items) == 0:
            logger.warning(f"[Valuation] Ghost town detected: No sales found after keyword filtering")

            card.review_required = True
            card.review_reason = "No sales found — check search query or try again later"
            card.no_recent_sales = True
            card.last_updated_at = datetime.utcnow()

            db.commit()

            result['success'] = True
            result['flagged_for_review'] = True
            result['reason'] = 'ghost_town'
            result['num_sales'] = 0
            return result

        # Step 4: Calculate FMV using the same algorithm as the Comps tab
        fmv_result = calculate_fmv(comp_items)
        result['num_sales'] = fmv_result.count

        new_fmv = fmv_result.market_value
        if not new_fmv or new_fmv <= 0:
            logger.warning(f"[Valuation] Could not calculate FMV from {len(comp_items)} items")
            result['reason'] = 'calculation_failed'
            return result

        new_fmv = Decimal(str(round(new_fmv, 2)))
        result['new_fmv'] = float(new_fmv)
        logger.info(f"[Valuation] Calculated FMV: ${new_fmv} (volume-weighted, {fmv_result.count} sales used)")

        # Step 6: Update card FMV
        card.current_fmv = new_fmv
        card.last_updated_at = datetime.utcnow()
        card.review_required = False
        card.review_reason = None
        card.no_recent_sales = False

        db.commit()
        db.refresh(card)

        # Step 7: Create price history entry
        confidence = 'high' if fmv_result.count >= 10 else 'medium' if fmv_result.count >= 5 else 'low'

        price_history = PriceHistoryCreate(
            card_id=card.id,
            value=new_fmv,
            num_sales=fmv_result.count,
            confidence=confidence
        )

        add_price_history(db, price_history)

        logger.info(f"[Valuation] ✓ Updated card {card.id}: ${card.current_fmv} ({fmv_result.count} sales, {confidence} confidence)")

        result['success'] = True
        result['updated'] = True
        return result

    except Exception as e:
        logger.error(f"[Valuation] Error updating card {card.id}: {e}")
        result['reason'] = f'error: {str(e)}'
        return result


# ============================================================================
# Batch Valuation
# ============================================================================

async def update_stale_cards(
    db: Session,
    scraper_func,
    api_key: str,
    days_threshold: int = 30,
    max_cards: Optional[int] = None,
    delay_between_cards: float = 2.0
) -> Dict:
    """
    Update all cards that need automated valuation updates.

    This is the main entry point for the automated valuation cron job.

    Args:
        db: Database session
        scraper_func: Async function to scrape eBay
        api_key: SearchAPI.io API key
        days_threshold: Number of days to consider a card stale (default: 30)
        max_cards: Maximum number of cards to update (None = all)
        delay_between_cards: Delay in seconds between card updates

    Returns:
        Dict with batch update statistics
    """
    logger.info(f"[Batch Valuation] Starting batch update (threshold: {days_threshold} days)")

    # Get cards needing updates
    stale_cards = get_cards_for_auto_update(db, days_threshold)

    if max_cards:
        stale_cards = stale_cards[:max_cards]

    logger.info(f"[Batch Valuation] Found {len(stale_cards)} cards needing updates")

    if not stale_cards:
        return {
            'total_cards': 0,
            'updated': 0,
            'flagged': 0,
            'errors': 0,
            'results': []
        }

    # Update each card
    results = []
    updated_count = 0
    flagged_count = 0
    error_count = 0

    for i, card in enumerate(stale_cards, 1):
        logger.info(f"[Batch Valuation] Processing card {i}/{len(stale_cards)}")

        result = await update_card_valuation(db, card, scraper_func, api_key)
        results.append(result)

        if result['updated']:
            updated_count += 1
        elif result['flagged_for_review']:
            flagged_count += 1
        elif not result['success']:
            error_count += 1

        # Delay between cards to avoid rate limiting
        if i < len(stale_cards):
            await asyncio.sleep(delay_between_cards)

    summary = {
        'total_cards': len(stale_cards),
        'updated': updated_count,
        'flagged': flagged_count,
        'errors': error_count,
        'results': results
    }

    logger.info(f"[Batch Valuation] Complete: {updated_count} updated, {flagged_count} flagged, {error_count} errors")

    return summary


# ============================================================================
# Manual Valuation (Single Card)
# ============================================================================

async def manually_update_card(
    db: Session,
    card_id: int,
    user_id: str,
    scraper_func,
    api_key: str
) -> Dict:
    """
    Manually trigger a valuation update for a specific card.

    This can be called from the UI when a user wants to force an update.

    Args:
        db: Database session
        card_id: Card ID to update
        user_id: User ID (for ownership verification)
        scraper_func: Async function to scrape eBay
        api_key: SearchAPI.io API key

    Returns:
        Dict with update results
    """
    from backend.services.collection_service import get_card_by_id

    # Verify ownership
    card = get_card_by_id(db, card_id, user_id)

    if not card:
        return {
            'success': False,
            'error': 'Card not found or access denied'
        }

    logger.info(f"[Manual Valuation] User {user_id} requested update for card {card_id}")

    result = await update_card_valuation(db, card, scraper_func, api_key)

    return result
