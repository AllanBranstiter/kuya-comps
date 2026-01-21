# backend/routes/profile.py
"""
User Profile API routes.

Provides endpoints for:
- Retrieving current user's profile
- Updating current user's profile
"""
import os
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime

from backend.middleware.supabase_auth import get_current_user_required
from backend.models.schemas import ProfileResponse, ProfileUpdateRequest
from backend.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/profile", tags=["Profile"])


# ============================================================================
# Helper Functions
# ============================================================================

def get_supabase_client():
    """
    Get Supabase client for profile operations.
    
    Returns:
        Supabase Client instance
    """
    from supabase import create_client, Client
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')  # Use service role for admin operations
    
    if not supabase_url or not supabase_key:
        raise HTTPException(500, "Supabase not configured")
    
    return create_client(supabase_url, supabase_key)


# ============================================================================
# Endpoints
# ============================================================================

@router.get("", response_model=ProfileResponse)
async def get_profile(
    current_user: dict = Depends(get_current_user_required)
):
    """
    Get current user's profile.
    
    **Authentication Required:** Yes
    
    **Returns:**
    - `id`: User's unique identifier
    - `email`: User's email address
    - `full_name`: User's full name
    - `first_name`: User's first name
    - `last_name`: User's last name
    - `display_name`: User's display name
    - `avatar_url`: URL to user's avatar image
    - `phone`: User's phone number
    - `company`: User's company name
    - `created_at`: Account creation timestamp
    - `updated_at`: Profile last updated timestamp
    """
    logger.info(f"[PROFILE] Profile requested by user {current_user['sub']}")
    
    try:
        supabase = get_supabase_client()
        
        # Fetch user profile from Supabase
        result = supabase.table('profiles')\
            .select('*')\
            .eq('id', current_user['sub'])\
            .execute()
        
        if not result.data or len(result.data) == 0:
            # Profile doesn't exist yet, return basic info from JWT token
            logger.info(f"[PROFILE] No profile found for user {current_user['sub']}, returning basic info")
            return ProfileResponse(
                id=current_user['sub'],
                email=current_user.get('email'),
                full_name=None,
                first_name=None,
                last_name=None,
                display_name=None,
                avatar_url=None,
                phone=None,
                company=None,
                created_at=None,
                updated_at=None
            )
        
        profile = result.data[0]
        logger.info(f"[PROFILE] Retrieved profile for user {current_user['sub']}")
        
        return ProfileResponse(
            id=profile.get('id'),
            email=profile.get('email'),
            full_name=profile.get('full_name'),
            first_name=profile.get('first_name'),
            last_name=profile.get('last_name'),
            display_name=profile.get('display_name'),
            avatar_url=profile.get('avatar_url'),
            phone=profile.get('phone'),
            company=profile.get('company'),
            created_at=profile.get('created_at'),
            updated_at=profile.get('updated_at')
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROFILE] Error retrieving profile for user {current_user['sub']}: {e}")
        raise HTTPException(500, f"Error retrieving profile: {str(e)}")


@router.put("", response_model=ProfileResponse)
async def update_profile(
    profile_update: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user_required)
):
    """
    Update current user's profile.
    
    **Authentication Required:** Yes
    
    **Parameters:**
    - `full_name`: User's full name (optional)
    - `first_name`: User's first name (optional)
    - `last_name`: User's last name (optional)
    - `display_name`: User's display name (optional)
    - `phone`: User's phone number (optional)
    - `company`: User's company name (optional)
    
    **Returns:**
    Updated profile information (same as GET /api/profile)
    
    **Note:**
    - Only provided fields will be updated
    - Email cannot be changed via this endpoint
    - Avatar URL is managed separately (future feature)
    """
    logger.info(f"[PROFILE] Profile update requested by user {current_user['sub']}")
    
    try:
        supabase = get_supabase_client()
        
        # Build update data from provided fields only
        update_data = {}
        
        if profile_update.full_name is not None:
            update_data['full_name'] = profile_update.full_name
        if profile_update.first_name is not None:
            update_data['first_name'] = profile_update.first_name
        if profile_update.last_name is not None:
            update_data['last_name'] = profile_update.last_name
        if profile_update.display_name is not None:
            update_data['display_name'] = profile_update.display_name
        if profile_update.phone is not None:
            update_data['phone'] = profile_update.phone
        if profile_update.company is not None:
            update_data['company'] = profile_update.company
        
        # Always update the updated_at timestamp
        update_data['updated_at'] = datetime.utcnow().isoformat()
        
        if not update_data or update_data == {'updated_at': update_data.get('updated_at')}:
            logger.warning(f"[PROFILE] No fields to update for user {current_user['sub']}")
            raise HTTPException(400, "No fields provided for update")
        
        # Check if profile exists
        existing = supabase.table('profiles')\
            .select('id')\
            .eq('id', current_user['sub'])\
            .execute()
        
        if not existing.data or len(existing.data) == 0:
            # Profile doesn't exist, create it
            logger.info(f"[PROFILE] Creating new profile for user {current_user['sub']}")
            update_data['id'] = current_user['sub']
            update_data['email'] = current_user.get('email')
            update_data['created_at'] = datetime.utcnow().isoformat()
            
            result = supabase.table('profiles').insert(update_data).execute()
        else:
            # Profile exists, update it
            logger.info(f"[PROFILE] Updating existing profile for user {current_user['sub']}")
            result = supabase.table('profiles')\
                .update(update_data)\
                .eq('id', current_user['sub'])\
                .execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(500, "Failed to update profile")
        
        profile = result.data[0]
        logger.info(f"[PROFILE] Successfully updated profile for user {current_user['sub']}")
        
        return ProfileResponse(
            id=profile.get('id'),
            email=profile.get('email'),
            full_name=profile.get('full_name'),
            first_name=profile.get('first_name'),
            last_name=profile.get('last_name'),
            display_name=profile.get('display_name'),
            avatar_url=profile.get('avatar_url'),
            phone=profile.get('phone'),
            company=profile.get('company'),
            created_at=profile.get('created_at'),
            updated_at=profile.get('updated_at')
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[PROFILE] Error updating profile for user {current_user['sub']}: {e}")
        raise HTTPException(500, f"Error updating profile: {str(e)}")
