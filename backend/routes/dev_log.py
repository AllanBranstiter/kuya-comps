# backend/routes/dev_log.py
"""
Developer logging endpoints.

POST /api/dev/analytics-snapshot
  Called by the frontend after it computes market pressure, liquidity,
  and absorption ratios. Writes a supplementary analytics JSON file
  alongside the most recent sold log for that query.

These endpoints are intentionally lightweight and fail silently so they
never interfere with normal app operation.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from backend.services.search_log_service import append_analytics_snapshot
from backend.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()


class AnalyticsSnapshot(BaseModel):
    query: str
    market_pressure: Optional[float] = None
    market_pressure_status: Optional[str] = None
    market_pressure_label: Optional[str] = None
    market_confidence: Optional[float] = None
    liquidity_score: Optional[float] = None
    liquidity_label: Optional[str] = None
    liquidity_absorption_ratio: Optional[float] = None
    liquidity_confidence: Optional[str] = None
    market_value: Optional[float] = None
    quick_sale: Optional[float] = None
    patient_sale: Optional[float] = None
    fmv_low: Optional[float] = None
    fmv_high: Optional[float] = None
    median_asking_price: Optional[float] = None
    # Price bands
    below_fmv_active_count: Optional[int] = None
    at_fmv_active_count: Optional[int] = None
    above_fmv_active_count: Optional[int] = None
    sales_below_fmv: Optional[int] = None
    sales_at_fmv: Optional[int] = None
    sales_above_fmv: Optional[int] = None
    absorption_below: Optional[str] = None
    absorption_at: Optional[str] = None
    absorption_above: Optional[str] = None
    sold_item_count: Optional[int] = None
    active_item_count: Optional[int] = None
    # Bid/Ask spread
    ask_p10: Optional[float] = None
    ask_median: Optional[float] = None
    ask_p90: Optional[float] = None
    bid_ask_spread_amount: Optional[float] = None
    bid_ask_spread_pct: Optional[float] = None
    # Collectibility
    collectibility_score: Optional[int] = None
    collectibility_label: Optional[str] = None
    collectibility_scenario: Optional[str] = None


@router.post("/api/dev/analytics-snapshot", status_code=200)
def post_analytics_snapshot(snapshot: AnalyticsSnapshot):
    """
    Receive frontend-computed analytics and append to the most recent
    sold log for this query.
    """
    try:
        found = append_analytics_snapshot(
            query=snapshot.query,
            snapshot=snapshot.model_dump(exclude={"query"}),
        )
        return {"success": found, "query": snapshot.query}
    except Exception as e:
        logger.error(f"analytics-snapshot error (non-fatal): {e}")
        return {"success": False, "error": str(e)}
