# backend/services/feedback_service.py
"""
Business logic for feedback submission and retrieval.
"""
import json
import csv
import io
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc
from backend.database.schema import FeedbackSubmission, FeedbackScreenshot
from backend.models.feedback import FeedbackSubmitRequest
from backend.logging_config import get_logger

logger = get_logger(__name__)


def create_feedback_submission(
    db: Session,
    feedback_data: FeedbackSubmitRequest
) -> FeedbackSubmission:
    """
    Create a new feedback submission in the database.
    
    Args:
        db: Database session
        feedback_data: Validated feedback data from request
    
    Returns:
        Created FeedbackSubmission ORM object
    """
    # Prepare annotation coordinates as JSON string if present
    annotation_json = None
    if feedback_data.annotation:
        annotation_json = json.dumps(feedback_data.annotation.dict())
    
    # Prepare API state as JSON string if present (only for bug reports)
    api_state_json = None
    if feedback_data.category == "Bug Report" and feedback_data.lastApiResponse:
        api_state_json = json.dumps(feedback_data.lastApiResponse)
    
    # Create main feedback submission record
    submission = FeedbackSubmission(
        session_id=feedback_data.clientSessionId,
        category=feedback_data.category,
        description=feedback_data.description,
        url=feedback_data.url,
        timestamp=feedback_data.timestamp,
        browser=feedback_data.browser,
        os=feedback_data.os,
        screen_resolution=feedback_data.screenResolution,
        viewport_size=feedback_data.viewportSize,
        has_screenshot=feedback_data.screenshot is not None,
        has_annotation=feedback_data.annotation is not None,
        annotation_coords=annotation_json,
        api_state=api_state_json
    )
    
    db.add(submission)
    db.flush()  # Get the ID without committing
    
    # Create screenshot record if screenshot data is present
    if feedback_data.screenshot:
        screenshot_size_kb = len(feedback_data.screenshot) // 1024
        screenshot = FeedbackScreenshot(
            feedback_id=submission.id,
            screenshot_data=feedback_data.screenshot,
            size_kb=screenshot_size_kb
        )
        db.add(screenshot)
        logger.info(f"Screenshot saved: {screenshot_size_kb} KB")
    
    db.commit()
    db.refresh(submission)
    
    logger.info(
        f"Feedback submission created: ID={submission.id}, "
        f"Category={submission.category}, Session={submission.session_id}"
    )
    
    return submission


def get_feedback_by_id(db: Session, feedback_id: int) -> Optional[FeedbackSubmission]:
    """
    Retrieve a feedback submission by ID.
    
    Args:
        db: Database session
        feedback_id: Feedback submission ID
    
    Returns:
        FeedbackSubmission object or None if not found
    """
    return db.query(FeedbackSubmission).filter(FeedbackSubmission.id == feedback_id).first()


def get_screenshot_by_feedback_id(db: Session, feedback_id: int) -> Optional[FeedbackScreenshot]:
    """
    Retrieve screenshot for a feedback submission.
    
    Args:
        db: Database session
        feedback_id: Feedback submission ID
    
    Returns:
        FeedbackScreenshot object or None if not found
    """
    return db.query(FeedbackScreenshot).filter(
        FeedbackScreenshot.feedback_id == feedback_id
    ).first()


# ============================================================================
# Phase 3: Admin Functions for Feedback Management
# ============================================================================

def get_all_feedback(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    category: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_archived: Optional[bool] = None,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc"
) -> tuple[List[FeedbackSubmission], int]:
    """
    Retrieve all feedback submissions with filtering, pagination, and sorting.
    
    Args:
        db: Database session
        skip: Number of records to skip (for pagination)
        limit: Maximum number of records to return
        category: Filter by category (optional)
        is_read: Filter by read status (optional)
        is_archived: Filter by archived status (optional)
        search: Search term for description or URL (optional)
        sort_by: Field to sort by (default: created_at)
        sort_order: Sort order: 'asc' or 'desc' (default: desc)
    
    Returns:
        Tuple of (list of feedback submissions, total count)
    """
    query = db.query(FeedbackSubmission)
    
    # Apply filters
    if category:
        query = query.filter(FeedbackSubmission.category == category)
    
    if is_read is not None:
        query = query.filter(FeedbackSubmission.is_read == is_read)
    
    if is_archived is not None:
        query = query.filter(FeedbackSubmission.is_archived == is_archived)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                FeedbackSubmission.description.ilike(search_term),
                FeedbackSubmission.url.ilike(search_term),
                FeedbackSubmission.session_id.ilike(search_term)
            )
        )
    
    # Get total count before pagination
    total_count = query.count()
    
    # Apply sorting
    sort_column = getattr(FeedbackSubmission, sort_by, FeedbackSubmission.created_at)
    if sort_order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(sort_column)
    
    # Apply pagination
    feedback_list = query.offset(skip).limit(limit).all()
    
    return feedback_list, total_count


def get_feedback_stats(db: Session) -> Dict[str, Any]:
    """
    Get statistics about feedback submissions.
    
    Returns:
        Dictionary with statistics
    """
    total = db.query(func.count(FeedbackSubmission.id)).scalar()
    unread = db.query(func.count(FeedbackSubmission.id)).filter(
        FeedbackSubmission.is_read == False
    ).scalar()
    archived = db.query(func.count(FeedbackSubmission.id)).filter(
        FeedbackSubmission.is_archived == True
    ).scalar()
    
    # Category breakdown
    category_counts = db.query(
        FeedbackSubmission.category,
        func.count(FeedbackSubmission.id)
    ).group_by(FeedbackSubmission.category).all()
    
    category_breakdown = {category: count for category, count in category_counts}
    
    # Recent submissions (last 7 days)
    from datetime import datetime, timedelta
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent = db.query(func.count(FeedbackSubmission.id)).filter(
        FeedbackSubmission.created_at >= seven_days_ago
    ).scalar()
    
    return {
        "total": total,
        "unread": unread,
        "archived": archived,
        "category_breakdown": category_breakdown,
        "recent_submissions": recent
    }


def mark_feedback_read(db: Session, feedback_id: int, is_read: bool = True) -> bool:
    """
    Mark feedback as read or unread.
    
    Args:
        db: Database session
        feedback_id: Feedback submission ID
        is_read: Read status to set
    
    Returns:
        True if successful, False if feedback not found
    """
    feedback = db.query(FeedbackSubmission).filter(
        FeedbackSubmission.id == feedback_id
    ).first()
    
    if not feedback:
        return False
    
    feedback.is_read = is_read
    db.commit()
    
    logger.info(f"Feedback {feedback_id} marked as {'read' if is_read else 'unread'}")
    return True


def archive_feedback(db: Session, feedback_id: int, is_archived: bool = True) -> bool:
    """
    Archive or unarchive feedback.
    
    Args:
        db: Database session
        feedback_id: Feedback submission ID
        is_archived: Archived status to set
    
    Returns:
        True if successful, False if feedback not found
    """
    feedback = db.query(FeedbackSubmission).filter(
        FeedbackSubmission.id == feedback_id
    ).first()
    
    if not feedback:
        return False
    
    feedback.is_archived = is_archived
    db.commit()
    
    logger.info(f"Feedback {feedback_id} {'archived' if is_archived else 'unarchived'}")
    return True


def delete_feedback(db: Session, feedback_id: int) -> bool:
    """
    Delete a feedback submission and its associated screenshot.
    
    Args:
        db: Database session
        feedback_id: Feedback submission ID
    
    Returns:
        True if successful, False if feedback not found
    """
    feedback = db.query(FeedbackSubmission).filter(
        FeedbackSubmission.id == feedback_id
    ).first()
    
    if not feedback:
        return False
    
    db.delete(feedback)
    db.commit()
    
    logger.info(f"Feedback {feedback_id} deleted")
    return True


def update_admin_notes(db: Session, feedback_id: int, notes: str) -> bool:
    """
    Update admin notes for a feedback submission.
    
    Args:
        db: Database session
        feedback_id: Feedback submission ID
        notes: Admin notes text
    
    Returns:
        True if successful, False if feedback not found
    """
    feedback = db.query(FeedbackSubmission).filter(
        FeedbackSubmission.id == feedback_id
    ).first()
    
    if not feedback:
        return False
    
    feedback.admin_notes = notes
    db.commit()
    
    logger.info(f"Admin notes updated for feedback {feedback_id}")
    return True


def export_feedback_to_csv(db: Session) -> str:
    """
    Export all feedback to CSV format.
    
    Args:
        db: Database session
    
    Returns:
        CSV string containing all feedback data
    """
    feedback_list = db.query(FeedbackSubmission).order_by(
        desc(FeedbackSubmission.created_at)
    ).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        'ID', 'Category', 'Description', 'URL', 'Timestamp',
        'Browser', 'OS', 'Screen Resolution', 'Viewport Size',
        'Has Screenshot', 'Has Annotation', 'Session ID',
        'Is Read', 'Is Archived', 'Admin Notes', 'Created At'
    ])
    
    # Write data
    for feedback in feedback_list:
        writer.writerow([
            feedback.id,
            feedback.category,
            feedback.description,
            feedback.url,
            feedback.timestamp,
            feedback.browser or '',
            feedback.os or '',
            feedback.screen_resolution or '',
            feedback.viewport_size or '',
            feedback.has_screenshot,
            feedback.has_annotation,
            feedback.session_id,
            feedback.is_read,
            feedback.is_archived,
            feedback.admin_notes or '',
            feedback.created_at.isoformat()
        ])
    
    return output.getvalue()


# ============================================================================
# Phase 4: Async Processing & Data Retention
# ============================================================================

def store_screenshot_async(feedback_id: int, screenshot_data: str, db: Session) -> None:
    """
    Async background task to store screenshot data.
    
    This function is designed to be called as a FastAPI BackgroundTask
    to avoid blocking the main request/response cycle.
    
    Args:
        feedback_id: ID of the feedback submission
        screenshot_data: Base64 encoded screenshot data
        db: Database session
    """
    try:
        screenshot_size_kb = len(screenshot_data) // 1024
        screenshot = FeedbackScreenshot(
            feedback_id=feedback_id,
            screenshot_data=screenshot_data,
            size_kb=screenshot_size_kb
        )
        db.add(screenshot)
        db.commit()
        logger.info(f"Background task: Screenshot saved for feedback {feedback_id}: {screenshot_size_kb} KB")
    except Exception as e:
        logger.error(f"Error in background screenshot storage for feedback {feedback_id}: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()


def create_feedback_submission_fast(
    db: Session,
    feedback_data: FeedbackSubmitRequest
) -> Tuple[FeedbackSubmission, Optional[str]]:
    """
    Create feedback submission quickly, returning screenshot data separately for async processing.
    
    This is the Phase 4 optimized version that separates screenshot storage
    for background processing.
    
    Args:
        db: Database session
        feedback_data: Validated feedback data from request
    
    Returns:
        Tuple of (FeedbackSubmission, screenshot_data or None)
    """
    # Prepare annotation coordinates as JSON string if present
    annotation_json = None
    if feedback_data.annotation:
        annotation_json = json.dumps(feedback_data.annotation.dict())
    
    # Prepare API state as JSON string if present (only for bug reports)
    api_state_json = None
    if feedback_data.category == "Bug Report" and feedback_data.lastApiResponse:
        api_state_json = json.dumps(feedback_data.lastApiResponse)
    
    # Create main feedback submission record
    submission = FeedbackSubmission(
        session_id=feedback_data.clientSessionId,
        category=feedback_data.category,
        description=feedback_data.description,
        url=feedback_data.url,
        timestamp=feedback_data.timestamp,
        browser=feedback_data.browser,
        os=feedback_data.os,
        screen_resolution=feedback_data.screenResolution,
        viewport_size=feedback_data.viewportSize,
        has_screenshot=feedback_data.screenshot is not None,
        has_annotation=feedback_data.annotation is not None,
        annotation_coords=annotation_json,
        api_state=api_state_json
    )
    
    db.add(submission)
    db.commit()
    db.refresh(submission)
    
    logger.info(
        f"Feedback submission created (fast): ID={submission.id}, "
        f"Category={submission.category}, Session={submission.session_id}"
    )
    
    # Return submission and screenshot data for background processing
    return submission, feedback_data.screenshot


def cleanup_old_feedback(db: Session, retention_days: int = 90) -> Dict[str, int]:
    """
    Clean up old feedback submissions based on retention policy.
    
    This function implements the data retention policy by deleting
    feedback submissions older than the specified retention period.
    
    Args:
        db: Database session
        retention_days: Number of days to retain feedback (default: 90)
    
    Returns:
        Dictionary with cleanup statistics
    """
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
        
        # Find old submissions
        old_submissions = db.query(FeedbackSubmission).filter(
            FeedbackSubmission.created_at < cutoff_date
        ).all()
        
        submission_count = len(old_submissions)
        screenshot_count = 0
        
        # Delete old submissions (screenshots will be cascade deleted)
        for submission in old_submissions:
            if submission.has_screenshot:
                screenshot_count += 1
            db.delete(submission)
        
        db.commit()
        
        logger.info(
            f"Cleanup completed: Deleted {submission_count} feedback submissions "
            f"and {screenshot_count} screenshots older than {retention_days} days"
        )
        
        return {
            "submissions_deleted": submission_count,
            "screenshots_deleted": screenshot_count,
            "cutoff_date": cutoff_date.isoformat(),
            "retention_days": retention_days
        }
    
    except Exception as e:
        logger.error(f"Error during feedback cleanup: {e}", exc_info=True)
        db.rollback()
        raise


def get_storage_metrics(db: Session) -> Dict[str, Any]:
    """
    Get storage and performance metrics for monitoring.
    
    Returns:
        Dictionary with storage metrics
    """
    total_submissions = db.query(func.count(FeedbackSubmission.id)).scalar()
    total_screenshots = db.query(func.count(FeedbackScreenshot.id)).scalar()
    
    # Calculate total screenshot storage
    total_screenshot_kb = db.query(
        func.sum(FeedbackScreenshot.size_kb)
    ).scalar() or 0
    
    # Get average screenshot size
    avg_screenshot_kb = db.query(
        func.avg(FeedbackScreenshot.size_kb)
    ).scalar() or 0
    
    # Get largest screenshot
    max_screenshot_kb = db.query(
        func.max(FeedbackScreenshot.size_kb)
    ).scalar() or 0
    
    # Get submissions from last 24 hours
    yesterday = datetime.utcnow() - timedelta(days=1)
    recent_submissions = db.query(func.count(FeedbackSubmission.id)).filter(
        FeedbackSubmission.created_at >= yesterday
    ).scalar()
    
    return {
        "total_submissions": total_submissions,
        "total_screenshots": total_screenshots,
        "total_screenshot_storage_kb": int(total_screenshot_kb),
        "total_screenshot_storage_mb": round(total_screenshot_kb / 1024, 2),
        "avg_screenshot_size_kb": round(avg_screenshot_kb, 2),
        "max_screenshot_size_kb": int(max_screenshot_kb),
        "submissions_last_24h": recent_submissions
    }
