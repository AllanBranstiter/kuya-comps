# backend/services/search_log_service.py
"""
Search log service - saves each search response to disk as JSON + CSV.

Files are written to search_logs/ at the project root.
Each search generates a pair:
  search_logs/{endpoint}_{sanitized_query}_{YYYYMMDD_HHMMSS}.json
  search_logs/{endpoint}_{sanitized_query}_{YYYYMMDD_HHMMSS}.csv

The sold log additionally includes server-side FMV analytics and market
confidence, computed from the sold listings directly.

An analytics supplement can be written via append_analytics_snapshot(),
called from the /api/dev/analytics-snapshot endpoint once the frontend
has computed market pressure, liquidity, and absorption ratios.
"""
import csv
import json
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from backend.models.schemas import CompsResponse
from backend.logging_config import get_logger

logger = get_logger(__name__)

# Project root / search_logs directory
SEARCH_LOGS_DIR = Path(__file__).resolve().parents[2] / "search_logs"

# CSV columns written for each listing
SOLD_CSV_FIELDS = [
    "item_id",
    "title",
    "condition",
    "buying_format",
    "is_auction",
    "is_buy_it_now",
    "is_best_offer",
    "bids",
    "extracted_price",
    "extracted_shipping",
    "total_price",
    "authenticity",
    "seller_name",
    "seller_positive_feedback_percent",
    "seller_is_top_rated_plus",
    "is_sponsored",
    "date_scraped",
    "link",
]

ACTIVE_CSV_FIELDS = [
    "item_id",
    "title",
    "condition",
    "buying_format",
    "is_auction",
    "is_buy_it_now",
    "is_best_offer",
    "extracted_price",
    "extracted_shipping",
    "total_price",
    "seller_name",
    "seller_positive_feedback_percent",
    "is_sponsored",
    "time_left",
    "watching",
    "link",
]


def _sanitize(query: str, max_len: int = 40) -> str:
    """Turn a search query into a safe filename fragment."""
    slug = re.sub(r"[^\w\s-]", "", query.lower())
    slug = re.sub(r"[\s]+", "_", slug.strip())
    return slug[:max_len]


def _compute_market_confidence(response: CompsResponse) -> Optional[float]:
    """
    Market confidence: how consistent are the sold prices?

    Formula mirrors the frontend JS:
        CoV = stdDev / avg_price * 100
        confidence = round(100 / (1 + CoV / 100))

    Returns a 0-100 score, or None if insufficient data.
    """
    prices = [item.total_price for item in response.items if item.total_price and item.total_price > 0]
    if len(prices) < 2 or not response.avg_price:
        return None

    mean = sum(prices) / len(prices)
    variance = sum((p - mean) ** 2 for p in prices) / len(prices)
    std_dev = math.sqrt(variance)

    cov = (std_dev / mean) * 100
    return round(100 / (1 + cov / 100))


def _compute_fmv_inline(response: CompsResponse) -> dict:
    """
    Compute FMV from sold items without going through the HTTP endpoint.
    Returns a dict with all FMV fields, or an empty dict on failure.
    """
    try:
        from backend.services.fmv_service import calculate_fmv
        result = calculate_fmv(response.items)
        return result.to_dict()
    except Exception as e:
        logger.error(f"FMV computation failed: {e}")
        return {}


def _write_csv(path: Path, items: list, fields: list) -> None:
    """Write a flat CSV summary from a list of CompItem objects."""
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for item in items:
            row = item.model_dump(mode="json")
            seller = row.get("seller") or {}
            row["seller_name"] = seller.get("name")
            row["seller_positive_feedback_percent"] = seller.get("positive_feedback_percent")
            row["seller_is_top_rated_plus"] = seller.get("is_top_rated_plus")
            writer.writerow(row)


def save_search(endpoint: str, response: CompsResponse) -> Path:
    """
    Persist a search response to disk (JSON + CSV).

    For 'sold' searches, FMV analytics and market confidence are computed
    server-side and embedded in the JSON under the 'analytics' key.

    Args:
        endpoint: "sold" or "active"
        response: the CompsResponse returned by the route

    Returns:
        Path to the JSON file written.
    """
    SEARCH_LOGS_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    slug = _sanitize(response.query)
    stem = f"{endpoint}_{slug}_{timestamp}"

    json_path = SEARCH_LOGS_DIR / f"{stem}.json"
    csv_path = SEARCH_LOGS_DIR / f"{stem}.csv"

    # --- Build base payload ---------------------------------------------------
    payload = response.model_dump(mode="json")
    payload["_meta"] = {
        "logged_at": datetime.now().isoformat(),
        "endpoint": endpoint,
        "stem": stem,
    }

    # --- Analytics section (server-side computed) -----------------------------
    analytics: dict = {}

    # Core price stats (already on the response)
    analytics["price_stats"] = {
        "user_query": response.query,
        "search_query_sent": response.search_query_sent,
        "min_price": response.min_price,
        "max_price": response.max_price,
        "avg_price": response.avg_price,
        "total_listings": len(response.items),
        "raw_scraped": response.raw_items_scraped,
        "duplicates_filtered": response.duplicates_filtered,
        "zero_price_filtered": response.zero_price_filtered,
    }

    # FMV + confidence (sold endpoint only — active listings don't have sold history)
    if endpoint == "sold":
        fmv = _compute_fmv_inline(response)
        analytics["fmv"] = fmv

        market_confidence = _compute_market_confidence(response)
        analytics["market_confidence"] = market_confidence

        # Market intelligence (parallel premiums, grading premium, etc.)
        analytics["market_intelligence"] = response.market_intelligence

        # Per-listing price summary
        analytics["sold_listings"] = [
            {
                "item_id": item.item_id,
                "title": item.title,
                "total_price": item.total_price,
                "extracted_price": item.extracted_price,
                "extracted_shipping": item.extracted_shipping,
                "condition": item.condition,
                "buying_format": item.buying_format,
                "is_auction": item.is_auction,
                "bids": item.bids,
                "date_scraped": str(item.date_scraped),
            }
            for item in response.items
        ]

        # Placeholder — frontend will fill this in via /api/dev/analytics-snapshot
        analytics["frontend_analytics"] = None

    if endpoint == "active":
        # All active listings, including those at/above FMV
        analytics["active_listings"] = [
            {
                "item_id": item.item_id,
                "title": item.title,
                "total_price": item.total_price,
                "extracted_price": item.extracted_price,
                "extracted_shipping": item.extracted_shipping,
                "condition": item.condition,
                "buying_format": item.buying_format,
                "is_auction": item.is_auction,
                "time_left": item.time_left,
                "link": item.link,
            }
            for item in response.items
        ]

    payload["analytics"] = analytics

    # --- JSON -----------------------------------------------------------------
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)

    # --- CSV ------------------------------------------------------------------
    fields = SOLD_CSV_FIELDS if endpoint == "sold" else ACTIVE_CSV_FIELDS
    _write_csv(csv_path, response.items, fields)

    logger.info(f"Saved: {json_path.name}  ({len(response.items)} items)")
    return json_path


def append_analytics_snapshot(query: str, snapshot: dict) -> bool:
    """
    Find the most recent sold log for this query and write an analytics
    supplement JSON alongside it.

    Called from POST /api/dev/analytics-snapshot after the frontend has
    computed market pressure, liquidity, and absorption ratios.

    Args:
        query:    the original search query string
        snapshot: dict of frontend-computed analytics

    Returns:
        True if a matching log was found and updated, False otherwise.
    """
    slug = _sanitize(query)
    pattern = f"sold_{slug}_*.json"
    matches = sorted(
        (p for p in SEARCH_LOGS_DIR.glob(pattern) if "_analytics" not in p.name),
        reverse=True,
    )

    if not matches:
        logger.warning(f"No sold log found for query: {query}")
        return False

    latest = matches[0]

    # Write supplementary analytics file alongside the original
    snapshot_path = latest.with_name(latest.stem + "_analytics.json")
    with snapshot_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "_meta": {
                    "logged_at": datetime.now().isoformat(),
                    "source": "frontend",
                    "linked_log": latest.name,
                    "query": query,
                },
                "analytics": snapshot,
            },
            f,
            indent=2,
            default=str,
        )

    logger.info(f"Analytics snapshot saved: {snapshot_path.name}")
    return True
