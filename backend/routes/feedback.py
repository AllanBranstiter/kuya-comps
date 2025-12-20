# backend/routes/feedback.py
"""
FastAPI routes for feedback submission and retrieval.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.database.connection import get_db, SessionLocal
from backend.database.schema import FeedbackSubmission, FeedbackScreenshot
from backend.models.feedback import FeedbackSubmitRequest, FeedbackSubmitResponse
from backend.services.feedback_service import (
    create_feedback_submission,
    create_feedback_submission_fast,
    store_screenshot_async
)
from backend.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()

# Rate limiter for feedback endpoint (5 submissions per hour per IP)
limiter = Limiter(key_func=get_remote_address)


@router.post("/api/feedback", response_model=FeedbackSubmitResponse)
@limiter.limit("5/hour")
async def submit_feedback(
    request: Request,
    background_tasks: BackgroundTasks,
    feedback_data: FeedbackSubmitRequest,
    db: Session = Depends(get_db)
):
    """
    Submit feedback from users with async screenshot processing.
    
    Phase 4 Enhancement: Uses BackgroundTasks to process screenshots asynchronously,
    improving response time for the user while still ensuring data is stored.
    
    This endpoint accepts feedback submissions including:
    - Category (Bug Report, Comment, Feature Request, etc.)
    - Description
    - System information (browser, OS, screen resolution)
    - Optional screenshot with annotation (processed asynchronously)
    - API state (for bug reports)
    
    Rate limited to 5 submissions per hour per IP address.
    
    Args:
        request: FastAPI request object
        background_tasks: FastAPI BackgroundTasks for async processing
        feedback_data: Validated feedback submission data
        db: Database session
    
    Returns:
        FeedbackSubmitResponse with success status and feedback ID
    """
    try:
        # Phase 4: Use fast submission with async screenshot processing
        submission, screenshot_data = create_feedback_submission_fast(db, feedback_data)
        
        # If there's a screenshot, process it in the background
        if screenshot_data:
            # Create a new DB session for the background task
            background_tasks.add_task(
                store_screenshot_async,
                submission.id,
                screenshot_data,
                SessionLocal()
            )
            logger.info(f"Screenshot queued for async processing: Feedback ID {submission.id}")
        
        logger.info(
            f"Feedback received from {get_remote_address(request)}: "
            f"Category={feedback_data.category}, ID={submission.id}"
        )
        
        return FeedbackSubmitResponse(
            success=True,
            feedback_id=submission.id,
            message="Feedback submitted successfully"
        )
    
    except ValueError as e:
        # Validation errors
        logger.warning(f"Validation error in feedback submission: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        # Database or other errors
        logger.error(f"Error submitting feedback: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An error occurred while submitting your feedback. Please try again later."
        )


@router.get("/api/feedback/{feedback_id}/screenshot")
async def get_feedback_screenshot(
    feedback_id: int,
    db: Session = Depends(get_db)
):
    """
    Phase 2: Retrieve screenshot for a specific feedback submission.
    
    This endpoint enables lazy loading of screenshots, keeping the main
    feedback list lightweight and only loading images when needed.
    
    Args:
        feedback_id: ID of the feedback submission
        db: Database session
    
    Returns:
        JSON response with screenshot data
    
    Raises:
        404: If feedback or screenshot not found
    """
    try:
        # Check if feedback exists
        feedback = db.query(FeedbackSubmission).filter(
            FeedbackSubmission.id == feedback_id
        ).first()
        
        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")
        
        if not feedback.has_screenshot:
            raise HTTPException(status_code=404, detail="No screenshot available for this feedback")
        
        # Retrieve screenshot
        screenshot = db.query(FeedbackScreenshot).filter(
            FeedbackScreenshot.feedback_id == feedback_id
        ).first()
        
        if not screenshot:
            logger.warning(f"Screenshot marked as existing but not found for feedback ID {feedback_id}")
            raise HTTPException(status_code=404, detail="Screenshot not found")
        
        logger.info(f"Screenshot retrieved for feedback ID {feedback_id} ({screenshot.size_kb} KB)")
        
        return JSONResponse(content={
            "success": True,
            "feedback_id": feedback_id,
            "screenshot_data": screenshot.screenshot_data,
            "size_kb": screenshot.size_kb,
            "created_at": screenshot.created_at.isoformat()
        })
    
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"Error retrieving screenshot for feedback {feedback_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An error occurred while retrieving the screenshot."
        )
