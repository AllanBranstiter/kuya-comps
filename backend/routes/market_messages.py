# backend/routes/market_messages.py
"""
Market Messages API endpoints.

Provides tier-specific market messages and liquidity popup content
based on price tier and market conditions.
"""
from fastapi import APIRouter, HTTPException
from backend.models.schemas import MarketMessageRequest
from backend.services.price_tier_service import get_price_tier
from backend.services.market_message_service import get_market_message, get_liquidity_popup_content
from backend.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.post("/market-message")
async def get_market_message_endpoint(request: MarketMessageRequest):
    """
    Get tier-specific market message based on conditions.
    
    Request body:
    {
        "fmv": 150.00,
        "avg_listing_price": 165.00,
        "market_pressure": 12.5,
        "liquidity_score": 65,
        "market_confidence": 72,
        "absorption_below": 1.2,
        "absorption_above": 0.4,
        "below_fmv_count": 5,
        "above_fmv_count": 8,
        "sales_below": 6,
        "sales_above": 3
    }
    
    Response:
    {
        "tier": {
            "tier_id": "tier_3",
            "tier_emoji": "🟣",
            "tier_name": "$500-$2,000",
            ...
        },
        "message": {
            "message_type": "normal_market",
            "title": "Normal, Stable Market",
            "icon": "📊",
            "content": "Prices are in the middle range...",
            "advice": {...},
            "color": "#007aff"
        }
    }
    """
    try:
        # Determine price tier
        tier = get_price_tier(
            fmv=request.fmv,
            avg_listing_price=request.avg_listing_price
        )
        
        logger.info(f"[MARKET_MESSAGE] Tier determined: {tier.get('tier_id')} for FMV={request.fmv}, avg={request.avg_listing_price}")
        
        # If no tier could be determined, return error
        if tier.get('tier_id') is None:
            return {
                "tier": tier,
                "message": {
                    "message_type": "no_data",
                    "title": "Insufficient Data",
                    "icon": "ℹ️",
                    "content": "Unable to determine price tier. Please ensure valid pricing data is available.",
                    "advice": {},
                    "color": "#8e8e93"
                }
            }
        
        # Get tier-specific market message
        message = get_market_message(
            tier_id=tier["tier_id"],
            market_pressure=request.market_pressure,
            liquidity_score=request.liquidity_score,
            market_confidence=request.market_confidence,
            absorption_below=request.absorption_below,
            absorption_above=request.absorption_above,
            below_fmv_count=request.below_fmv_count,
            above_fmv_count=request.above_fmv_count,
            sales_below=request.sales_below,
            sales_above=request.sales_above
        )
        
        logger.info(f"[MARKET_MESSAGE] Message type: {message.get('message_type')} for tier {tier.get('tier_id')}")
        
        return {
            "tier": tier,
            "message": message
        }
        
    except ValueError as e:
        logger.error(f"[MARKET_MESSAGE] ValueError: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[MARKET_MESSAGE] Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error processing market message")


@router.get("/liquidity-popup/{tier_id}")
async def get_liquidity_popup_endpoint(tier_id: str):
    """
    Get tier-specific content for liquidity risk popup.
    
    Args:
        tier_id: Price tier (tier_1, tier_2, tier_3, tier_4, tier_5)
    
    Response:
    {
        "title": "How Easy Is It to Sell This Card?",
        "content": "This score shows how hard or easy..."
    }
    """
    try:
        # Validate tier_id
        valid_tiers = ["tier_1", "tier_2", "tier_3", "tier_4", "tier_5"]
        if tier_id not in valid_tiers:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid tier_id. Must be one of: {', '.join(valid_tiers)}"
            )
        
        content = get_liquidity_popup_content(tier_id)
        
        return content
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[LIQUIDITY_POPUP] Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
