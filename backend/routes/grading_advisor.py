# backend/routes/grading_advisor.py
"""
Grading Advisor router - handles the Intelligent Grading Advisor feature.

This module contains the API endpoints for analyzing whether a card is worth
submitting to PSA for professional grading based on price data, population
data, and expected grade predictions.
"""
from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.models.grading_advisor_schemas import (
    GradingAdvisorRequest,
    GradingAdvisorResponse,
)
from backend.services.grading_advisor_service import analyze_grading_decision
from backend.logging_config import get_logger, log_with_context


# Initialize router with prefix and tags for OpenAPI documentation
router = APIRouter(prefix="/api/grading-advisor", tags=["grading-advisor"])

# Initialize logger for this module
logger = get_logger(__name__)

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


@router.post("", response_model=GradingAdvisorResponse)
@limiter.limit("10/minute")
async def analyze_grading(request: Request, body: GradingAdvisorRequest):
    """
    Analyze whether a card is worth submitting to PSA for grading.
    
    Takes price data, population data, and cost information to determine
    if grading is financially viable. Returns a comprehensive analysis
    including:
    
    - **Verdict**: Clear recommendation (Green Light, Proceed with Caution, Gem or Bust, Buy the Slab)
    - **Success Rate**: Percentage of grades that would be profitable
    - **Break-even Grade**: Minimum grade needed to not lose money
    - **Grade Matrix**: Profit/loss analysis for each grade level (PSA 1-10)
    - **Scenario Analysis**: Optimistic, realistic, and pessimistic outcomes
    - **Collector Profiles**: Tailored advice for flippers vs long-term holders
    - **Population Insights**: Rarity tier and distribution analysis
    
    Args:
        request: FastAPI Request object (for rate limiting)
        body: GradingAdvisorRequest containing price_data, population_data,
              raw_purchase_price, grading_fee, and optional expected_grade
    
    Returns:
        GradingAdvisorResponse with complete analysis results
    
    Raises:
        HTTPException: 500 error if analysis fails
    
    Example Request:
        ```json
        {
            "price_data": {"1": 5.0, "2": 8.0, ..., "10": 500.0},
            "population_data": {"1": 10, "2": 25, ..., "10": 150},
            "raw_purchase_price": 50.0,
            "grading_fee": 21.0,
            "expected_grade": 8
        }
        ```
    
    Example Response:
        ```json
        {
            "verdict": "✅ GREEN LIGHT: SUBMIT",
            "status": "green",
            "success_rate": 60.0,
            "expected_value": 45.50,
            "break_even_grade": "7",
            ...
        }
        ```
    """
    log_with_context(
        logger,
        'info',
        'Grading advisor analysis requested',
        endpoint='/api/grading-advisor',
        raw_purchase_price=body.raw_purchase_price,
        grading_fee=body.grading_fee,
        expected_grade=body.expected_grade,
        user_ip=request.client.host if request.client else 'unknown'
    )
    
    try:
        result = analyze_grading_decision(body)
        
        log_with_context(
            logger,
            'info',
            'Grading advisor analysis completed',
            endpoint='/api/grading-advisor',
            verdict=result.verdict,
            status=result.status,
            success_rate=result.success_rate
        )
        
        return result
    except ValueError as e:
        # Handle validation errors from the service
        log_with_context(
            logger,
            'warning',
            'Grading advisor validation error',
            endpoint='/api/grading-advisor',
            error=str(e)
        )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log_with_context(
            logger,
            'error',
            'Grading advisor analysis failed',
            endpoint='/api/grading-advisor',
            error=str(e)
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """
    Health check endpoint for the Grading Advisor service.
    
    Returns a simple status indicating the service is operational.
    Useful for monitoring, load balancer health checks, and verifying
    the grading advisor feature is available.
    
    Returns:
        dict: Health status with service name
    
    Example Response:
        ```json
        {
            "status": "healthy",
            "service": "grading-advisor"
        }
        ```
    """
    return {"status": "healthy", "service": "grading-advisor"}
