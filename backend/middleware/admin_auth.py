# backend/middleware/admin_auth.py
"""
Simple admin authentication middleware for feedback dashboard.
Uses session-based authentication with password protection.
"""
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from typing import Optional
import secrets
import os
from datetime import datetime, timedelta

# Store active admin sessions (in production, use Redis or database)
admin_sessions = {}

# Session timeout (1 hour)
SESSION_TIMEOUT = timedelta(hours=1)

# Admin password from environment variable
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "changeme123")  # Default for development


def create_admin_session() -> str:
    """Create a new admin session and return session ID."""
    session_id = secrets.token_urlsafe(32)
    admin_sessions[session_id] = {
        "created_at": datetime.utcnow(),
        "last_activity": datetime.utcnow()
    }
    return session_id


def validate_admin_session(session_id: str) -> bool:
    """Validate an admin session ID."""
    if session_id not in admin_sessions:
        return False
    
    session = admin_sessions[session_id]
    
    # Check if session has expired
    if datetime.utcnow() - session["last_activity"] > SESSION_TIMEOUT:
        # Session expired, remove it
        del admin_sessions[session_id]
        return False
    
    # Update last activity
    session["last_activity"] = datetime.utcnow()
    return True


def cleanup_expired_sessions():
    """Remove expired sessions (should be called periodically)."""
    expired = [
        sid for sid, session in admin_sessions.items()
        if datetime.utcnow() - session["last_activity"] > SESSION_TIMEOUT
    ]
    for sid in expired:
        del admin_sessions[sid]


def verify_admin_password(password: str) -> bool:
    """Verify admin password."""
    return password == ADMIN_PASSWORD


def get_admin_session_from_request(request: Request) -> Optional[str]:
    """Extract admin session ID from request cookies."""
    return request.cookies.get("admin_session")


def require_admin_auth(request: Request):
    """
    Dependency function to require admin authentication.
    Raises HTTPException if not authenticated.
    """
    session_id = get_admin_session_from_request(request)
    
    if not session_id or not validate_admin_session(session_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    return session_id
