# backend/routes/admin_feedback.py
"""
Admin routes for feedback management dashboard.
Phase 3: Admin interface for viewing and managing feedback submissions.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from backend.database.connection import get_db
from backend.middleware.admin_auth import (
    require_admin_auth,
    verify_admin_password,
    create_admin_session,
    cleanup_expired_sessions
)
from backend.services.feedback_service import (
    get_all_feedback,
    get_feedback_stats,
    get_feedback_by_id,
    mark_feedback_read,
    archive_feedback,
    delete_feedback,
    update_admin_notes,
    export_feedback_to_csv,
    cleanup_old_feedback,
    get_storage_metrics
)
from backend.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================

class LoginRequest(BaseModel):
    """Admin login request."""
    password: str


class FeedbackUpdateRequest(BaseModel):
    """Request to update feedback status."""
    is_read: Optional[bool] = None
    is_archived: Optional[bool] = None
    admin_notes: Optional[str] = None


# ============================================================================
# Authentication Endpoints
# ============================================================================

@router.post("/admin/login")
async def admin_login(login_data: LoginRequest, response: Response):
    """
    Admin login endpoint.
    
    Validates password and creates admin session.
    
    Args:
        login_data: Login credentials
        response: Response object to set cookies
    
    Returns:
        Success status and message
    """
    if not verify_admin_password(login_data.password):
        logger.warning("Failed admin login attempt")
        raise HTTPException(status_code=401, detail="Invalid password")
    
    # Create session
    session_id = create_admin_session()
    
    # Set secure cookie
    response.set_cookie(
        key="admin_session",
        value=session_id,
        httponly=True,
        max_age=3600,  # 1 hour
        samesite="lax"
    )
    
    logger.info("Admin logged in successfully")
    
    return {"success": True, "message": "Login successful"}


@router.post("/admin/logout")
async def admin_logout(response: Response):
    """
    Admin logout endpoint.
    
    Clears admin session cookie.
    """
    response.delete_cookie("admin_session")
    cleanup_expired_sessions()
    
    return {"success": True, "message": "Logged out successfully"}


# ============================================================================
# Feedback Retrieval Endpoints
# ============================================================================

@router.get("/admin/api/feedback")
async def get_feedback_list(
    request: Request,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin_auth),
    page: int = 1,
    per_page: int = 50,
    category: Optional[str] = None,
    is_read: Optional[bool] = None,
    is_archived: Optional[bool] = None,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc"
):
    """
    Get list of feedback submissions with filtering and pagination.
    
    Query Parameters:
        - page: Page number (default: 1)
        - per_page: Items per page (default: 50, max: 100)
        - category: Filter by category
        - is_read: Filter by read status (true/false)
        - is_archived: Filter by archived status (true/false)
        - search: Search term for description/URL
        - sort_by: Field to sort by (default: created_at)
        - sort_order: Sort order (asc/desc, default: desc)
    
    Returns:
        Paginated list of feedback submissions
    """
    try:
        # Validate pagination
        per_page = min(per_page, 100)  # Max 100 items per page
        skip = (page - 1) * per_page
        
        # Get feedback list
        feedback_list, total_count = get_all_feedback(
            db=db,
            skip=skip,
            limit=per_page,
            category=category,
            is_read=is_read,
            is_archived=is_archived,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        # Convert to dict for JSON response
        feedback_data = []
        for feedback in feedback_list:
            feedback_data.append({
                "id": feedback.id,
                "category": feedback.category,
                "description": feedback.description,
                "url": feedback.url,
                "timestamp": feedback.timestamp,
                "browser": feedback.browser,
                "os": feedback.os,
                "screen_resolution": feedback.screen_resolution,
                "viewport_size": feedback.viewport_size,
                "has_screenshot": feedback.has_screenshot,
                "has_annotation": feedback.has_annotation,
                "session_id": feedback.session_id,
                "is_read": feedback.is_read,
                "is_archived": feedback.is_archived,
                "admin_notes": feedback.admin_notes,
                "created_at": feedback.created_at.isoformat()
            })
        
        total_pages = (total_count + per_page - 1) // per_page
        
        return {
            "success": True,
            "data": feedback_data,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total_items": total_count,
                "total_pages": total_pages
            }
        }
    
    except Exception as e:
        logger.error(f"Error retrieving feedback list: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error retrieving feedback")


@router.get("/admin/api/feedback/{feedback_id}")
async def get_feedback_detail(
    feedback_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin_auth)
):
    """
    Get detailed information for a specific feedback submission.
    
    Args:
        feedback_id: Feedback submission ID
    
    Returns:
        Detailed feedback data including full metadata
    """
    try:
        feedback = get_feedback_by_id(db, feedback_id)
        
        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")
        
        return {
            "success": True,
            "data": {
                "id": feedback.id,
                "category": feedback.category,
                "description": feedback.description,
                "url": feedback.url,
                "timestamp": feedback.timestamp,
                "browser": feedback.browser,
                "os": feedback.os,
                "screen_resolution": feedback.screen_resolution,
                "viewport_size": feedback.viewport_size,
                "has_screenshot": feedback.has_screenshot,
                "has_annotation": feedback.has_annotation,
                "annotation_coords": feedback.annotation_coords,
                "api_state": feedback.api_state,
                "session_id": feedback.session_id,
                "is_read": feedback.is_read,
                "is_archived": feedback.is_archived,
                "admin_notes": feedback.admin_notes,
                "created_at": feedback.created_at.isoformat()
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving feedback {feedback_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error retrieving feedback")


@router.get("/admin/api/stats")
async def get_stats(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin_auth)
):
    """
    Get statistics about feedback submissions.
    
    Returns:
        Statistics including total submissions, category breakdown, etc.
    """
    try:
        stats = get_feedback_stats(db)
        return {"success": True, "data": stats}
    
    except Exception as e:
        logger.error(f"Error retrieving stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error retrieving statistics")


# ============================================================================
# Feedback Management Endpoints
# ============================================================================

@router.patch("/admin/api/feedback/{feedback_id}")
async def update_feedback(
    feedback_id: int,
    update_data: FeedbackUpdateRequest,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin_auth)
):
    """
    Update feedback status (read, archived) or admin notes.
    
    Args:
        feedback_id: Feedback submission ID
        update_data: Fields to update
    
    Returns:
        Success status
    """
    try:
        # Check if feedback exists
        feedback = get_feedback_by_id(db, feedback_id)
        if not feedback:
            raise HTTPException(status_code=404, detail="Feedback not found")
        
        # Update fields
        if update_data.is_read is not None:
            mark_feedback_read(db, feedback_id, update_data.is_read)
        
        if update_data.is_archived is not None:
            archive_feedback(db, feedback_id, update_data.is_archived)
        
        if update_data.admin_notes is not None:
            update_admin_notes(db, feedback_id, update_data.admin_notes)
        
        logger.info(f"Feedback {feedback_id} updated")
        
        return {"success": True, "message": "Feedback updated successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating feedback {feedback_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error updating feedback")


@router.delete("/admin/api/feedback/{feedback_id}")
async def delete_feedback_endpoint(
    feedback_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin_auth)
):
    """
    Delete a feedback submission and its associated screenshot.
    
    Args:
        feedback_id: Feedback submission ID
    
    Returns:
        Success status
    """
    try:
        success = delete_feedback(db, feedback_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Feedback not found")
        
        logger.info(f"Feedback {feedback_id} deleted")
        
        return {"success": True, "message": "Feedback deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting feedback {feedback_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error deleting feedback")


@router.get("/admin/api/export")
async def export_feedback(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin_auth)
):
    """
    Export all feedback to CSV format.
    
    Returns:
        CSV file download
    """
    try:
        csv_data = export_feedback_to_csv(db)
        
        logger.info("Feedback exported to CSV")
        
        return StreamingResponse(
            iter([csv_data]),
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=feedback_export.csv"
            }
        )
    
    except Exception as e:
        logger.error(f"Error exporting feedback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error exporting feedback")


# ============================================================================
# Phase 4: Monitoring & Data Retention Endpoints
# ============================================================================

@router.get("/admin/api/metrics")
async def get_storage_metrics_endpoint(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin_auth)
):
    """
    Get storage and performance metrics for monitoring.
    
    Phase 4 Enhancement: Monitor screenshot storage, submission rates, and performance.
    
    Returns:
        Storage metrics including:
        - Total submissions and screenshots
        - Storage usage (KB/MB)
        - Average and max screenshot sizes
        - Recent submission rate
    """
    try:
        metrics = get_storage_metrics(db)
        return {"success": True, "data": metrics}
    
    except Exception as e:
        logger.error(f"Error retrieving storage metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error retrieving metrics")


@router.post("/admin/api/cleanup")
async def cleanup_feedback_endpoint(
    db: Session = Depends(get_db),
    _: str = Depends(require_admin_auth),
    retention_days: int = 90
):
    """
    Clean up old feedback submissions based on retention policy.
    
    Phase 4 Enhancement: Data retention policy implementation.
    Deletes feedback submissions older than the specified retention period.
    
    Query Parameters:
        - retention_days: Number of days to retain feedback (default: 90)
    
    Returns:
        Cleanup statistics including number of submissions and screenshots deleted
    """
    try:
        # Validate retention_days
        if retention_days < 1:
            raise HTTPException(status_code=400, detail="retention_days must be at least 1")
        
        if retention_days < 30:
            logger.warning(f"Cleanup requested with retention_days={retention_days} (less than 30 days)")
        
        cleanup_stats = cleanup_old_feedback(db, retention_days)
        
        logger.info(
            f"Manual cleanup completed: {cleanup_stats['submissions_deleted']} submissions deleted, "
            f"retention period: {retention_days} days"
        )
        
        return {"success": True, "data": cleanup_stats}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during cleanup: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error performing cleanup")
