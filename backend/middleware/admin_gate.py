# backend/middleware/admin_gate.py
"""
Admin authentication middleware for protecting admin-only routes.

Provides:
- Admin role checking
- Admin-only route protection
- Audit logging of admin actions
"""
import os
from fastapi import HTTPException, Depends
from typing import Optional, Dict, Any
from supabase import create_client, Client
from backend.logging_config import get_logger
from backend.middleware.supabase_auth import get_current_user_required

logger = get_logger(__name__)

# Admin user IDs (configured via environment variables)
# Format: Comma-separated list of Supabase user IDs
# Example: ADMIN_USER_IDS="uuid1,uuid2,uuid3"
ADMIN_USER_IDS = os.getenv('ADMIN_USER_IDS', '').split(',')
ADMIN_USER_IDS = [uid.strip() for uid in ADMIN_USER_IDS if uid.strip()]

# Alternative: Admin emails (if user IDs not available)
ADMIN_EMAILS = os.getenv('ADMIN_EMAILS', '').split(',')
ADMIN_EMAILS = [email.strip().lower() for email in ADMIN_EMAILS if email.strip()]


def get_supabase_client() -> Client:
    """
    Get Supabase client for admin operations.
    
    Returns:
        Supabase Client instance
    """
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not supabase_key:
        raise HTTPException(500, "Supabase not configured")
    
    return create_client(supabase_url, supabase_key)


async def is_admin(user: Dict[str, Any]) -> bool:
    """
    Check if user has admin privileges.
    
    Checks:
    1. User ID in ADMIN_USER_IDS environment variable
    2. User email in ADMIN_EMAILS environment variable
    3. is_admin flag in user metadata (if configured in Supabase)
    
    Args:
        user: User object from Supabase authentication
        
    Returns:
        True if user is an admin, False otherwise
    """
    if not user:
        return False
    
    user_id = user.get('sub') or user.get('id')
    user_email = user.get('email', '').lower()
    
    # Check user ID
    if user_id and user_id in ADMIN_USER_IDS:
        logger.debug(f"[ADMIN] User {user_id} is admin (via user ID)")
        return True
    
    # Check email
    if user_email and user_email in ADMIN_EMAILS:
        logger.debug(f"[ADMIN] User {user_email} is admin (via email)")
        return True
    
    # Check user metadata for is_admin flag
    user_metadata = user.get('user_metadata', {})
    app_metadata = user.get('app_metadata', {})
    
    if user_metadata.get('is_admin') or app_metadata.get('is_admin'):
        logger.debug(f"[ADMIN] User {user_id} is admin (via metadata)")
        return True
    
    return False


async def get_current_admin_required(current_user: dict = Depends(get_current_user_required)) -> dict:
    """
    Dependency to require admin authentication for routes.
    
    Usage:
        @router.get("/admin/endpoint")
        async def admin_endpoint(admin: dict = Depends(get_current_admin_required)):
            # Only admins can access this
            pass
    
    Args:
        current_user: User from Supabase authentication middleware
        
    Returns:
        User object if admin, raises HTTPException otherwise
        
    Raises:
        HTTPException 403: If user is not an admin
    """
    if not await is_admin(current_user):
        user_id = current_user.get('sub') or current_user.get('id', 'unknown')
        logger.warning(f"[ADMIN] Unauthorized admin access attempt by user {user_id}")
        raise HTTPException(
            status_code=403,
            detail="Admin access required. Contact support if you believe this is an error."
        )
    
    logger.info(f"[ADMIN] Admin access granted to user {current_user.get('sub')}")
    return current_user


async def log_admin_action(user_id: str, action: str, details: Optional[Dict[str, Any]] = None):
    """
    Log admin actions for audit trail.
    
    Args:
        user_id: Admin user ID
        action: Action performed (e.g., "exported_data", "deleted_user")
        details: Additional context (e.g., affected user IDs, date ranges)
    """
    try:
        supabase = get_supabase_client()
        
        # Create admin_logs table if it doesn't exist
        # This would typically be done via migration, but we'll log to a general table
        supabase.table('admin_audit_log').insert({
            'user_id': user_id,
            'action': action,
            'details': details or {},
            'ip_address': None,  # Can be added from request context
            'user_agent': None   # Can be added from request context
        }).execute()
        
        logger.info(f"[ADMIN_AUDIT] User {user_id} performed action: {action}")
    except Exception as e:
        # Don't fail the request if audit logging fails
        logger.error(f"[ADMIN_AUDIT] Failed to log admin action: {e}")
