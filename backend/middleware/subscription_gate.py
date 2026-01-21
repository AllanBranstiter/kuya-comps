# backend/middleware/subscription_gate.py
"""
Subscription Gate Middleware - Phase 3

Provides decorators and dependency functions to enforce tier-based access control
and usage limits across all API endpoints.

Features:
- Tier-based access control (free, member, founder)
- Daily search limit enforcement
- Card limit enforcement
- Analytics access gating
"""
import functools
from typing import Callable, Optional
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.middleware.supabase_auth import get_current_user_optional, get_current_user_required
from backend.services.subscription_service import SubscriptionService
from backend.database.connection import get_db
from backend.config import get_supabase_client
from backend.logging_config import get_logger

logger = get_logger(__name__)

# Tier hierarchy for access control
TIER_HIERARCHY = {
    'free': 0,
    'member': 1,
    'founder': 2
}


def require_tier(min_tier: str) -> Callable:
    """
    Decorator to require a minimum subscription tier for endpoint access.
    
    Args:
        min_tier: Minimum required tier ('free', 'member', or 'founder')
        
    Returns:
        Decorator function that enforces tier requirement
        
    Raises:
        HTTPException 403: If user's tier is insufficient
        
    Usage:
        @router.get("/analytics")
        @require_tier("member")
        async def get_analytics(user: dict = Depends(get_current_user_required)):
            # Only member and founder tier users can access
            ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract user from kwargs (should be injected by Depends)
            user = kwargs.get('user') or kwargs.get('current_user') or kwargs.get('admin_user')
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            
            user_id = user.get('sub')
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid user token"
                )
            
            # Get user's current tier
            supabase = get_supabase_client()
            subscription_service = SubscriptionService(supabase)
            current_tier = await subscription_service.get_user_tier(user_id)
            
            # Check tier hierarchy
            current_level = TIER_HIERARCHY.get(current_tier, 0)
            required_level = TIER_HIERARCHY.get(min_tier, 0)
            
            if current_level < required_level:
                logger.warning(
                    f"[SUBSCRIPTION GATE] User {user_id} denied access - "
                    f"requires {min_tier} tier, has {current_tier} tier"
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        'error': 'TIER_REQUIRED',
                        'message': f'This feature requires {min_tier.capitalize()} tier or higher',
                        'current_tier': current_tier,
                        'required_tier': min_tier
                    }
                )
            
            logger.debug(
                f"[SUBSCRIPTION GATE] User {user_id} tier check passed - "
                f"{current_tier} tier >= {min_tier} tier"
            )
            
            # Call the original function
            return await func(*args, **kwargs)
        
        return wrapper
    return decorator


async def check_search_limit(
    user: Optional[dict] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
) -> dict:
    """
    Dependency function to check and enforce daily search limits.
    
    This dependency:
    1. Checks if the user has remaining searches for today
    2. Increments the search counter if allowed
    3. Raises 429 if limit exceeded
    
    Args:
        user: Current user from auth (optional - anonymous users get free tier limits)
        db: Database session for card count queries
        
    Returns:
        Dict with limit info:
            - allowed: bool
            - used: int - searches used today
            - limit: int - daily limit (-1 = unlimited)
            - remaining: int - searches remaining
            
    Raises:
        HTTPException 429: If daily search limit exceeded
        
    Usage:
        @router.get("/comps")
        async def get_comps(
            search_limit: dict = Depends(check_search_limit),
            ...
        ):
            # Search limit already checked and incremented
            ...
    """
    # Anonymous users get free tier limits
    user_id = user.get('sub') if user else 'anonymous'
    
    # Get subscription service
    supabase = get_supabase_client()
    subscription_service = SubscriptionService(supabase, db)
    
    # Check if user can perform another search
    limit_check = await subscription_service.check_search_limit(user_id)
    
    if not limit_check['allowed']:
        tier = await subscription_service.get_user_tier(user_id)
        logger.warning(
            f"[SUBSCRIPTION GATE] User {user_id} search limit exceeded - "
            f"{limit_check['used']}/{limit_check['limit']} (tier: {tier})"
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                'error': 'SEARCH_LIMIT_EXCEEDED',
                'message': f"Daily search limit reached ({limit_check['limit']} searches). Upgrade to Member tier for unlimited searches.",
                'used': limit_check['used'],
                'limit': limit_check['limit'],
                'tier': tier
            }
        )
    
    # Increment the search counter
    await subscription_service.increment_search_count(user_id)
    
    logger.debug(
        f"[SUBSCRIPTION GATE] User {user_id} search allowed - "
        f"{limit_check['used'] + 1}/{limit_check['limit']}"
    )
    
    return limit_check


async def check_card_limit(
    user: dict = Depends(get_current_user_required),
    db: Session = Depends(get_db)
) -> dict:
    """
    Dependency function to check if user can add more cards.
    
    This dependency validates that the user hasn't reached their tier's card limit.
    Used before card creation operations.
    
    Args:
        user: Current user from auth (required - must be logged in to add cards)
        db: Database session for card count queries
        
    Returns:
        Dict with limit info:
            - allowed: bool
            - count: int - current card count
            - limit: int - max cards (-1 = unlimited)
            - remaining: int - cards remaining
            
    Raises:
        HTTPException 403: If card limit exceeded
        
    Usage:
        @router.post("/api/v1/cards")
        async def create_card(
            card_limit: dict = Depends(check_card_limit),
            user: dict = Depends(get_current_user_required),
            ...
        ):
            # Card limit already validated
            ...
    """
    user_id = user.get('sub')
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user token"
        )
    
    # Get subscription service
    supabase = get_supabase_client()
    subscription_service = SubscriptionService(supabase, db)
    
    # Check if user can add more cards
    limit_check = await subscription_service.check_card_limit(user_id)
    
    if not limit_check['allowed']:
        tier = await subscription_service.get_user_tier(user_id)
        logger.warning(
            f"[SUBSCRIPTION GATE] User {user_id} card limit exceeded - "
            f"{limit_check['count']}/{limit_check['limit']} (tier: {tier})"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                'error': 'CARD_LIMIT_EXCEEDED',
                'message': f"Card limit reached ({limit_check['limit']} cards). Upgrade to Member tier for unlimited cards.",
                'count': limit_check['count'],
                'limit': limit_check['limit'],
                'tier': tier
            }
        )
    
    logger.debug(
        f"[SUBSCRIPTION GATE] User {user_id} card limit check passed - "
        f"{limit_check['count']}/{limit_check['limit']}"
    )
    
    return limit_check


async def check_analytics_access(
    user: dict = Depends(get_current_user_required)
) -> bool:
    """
    Dependency function to check if user has analytics access.
    
    Member and Founder tiers get analytics access, Free tier does not.
    
    Args:
        user: Current user from auth (required)
        
    Returns:
        True if user has access
        
    Raises:
        HTTPException 403: If user doesn't have analytics access
        
    Usage:
        @router.get("/api/analytics")
        async def get_analytics(
            has_access: bool = Depends(check_analytics_access),
            user: dict = Depends(get_current_user_required),
            ...
        ):
            # Analytics access already validated
            ...
    """
    user_id = user.get('sub')
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user token"
        )
    
    # Get subscription service
    supabase = get_supabase_client()
    subscription_service = SubscriptionService(supabase)
    
    # Check analytics access
    has_access = await subscription_service.can_access_analytics(user_id)
    
    if not has_access:
        tier = await subscription_service.get_user_tier(user_id)
        logger.warning(
            f"[SUBSCRIPTION GATE] User {user_id} denied analytics access - tier: {tier}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                'error': 'ANALYTICS_ACCESS_REQUIRED',
                'message': 'Advanced analytics require Member tier or higher',
                'current_tier': tier
            }
        )
    
    logger.debug(f"[SUBSCRIPTION GATE] User {user_id} analytics access granted")
    return True
