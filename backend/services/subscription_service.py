# backend/services/subscription_service.py
"""
Subscription service layer for managing user subscriptions and tier limits.

Handles business logic for:
- Fetching user subscription details from Supabase
- Checking tier limits (searches, cards, auto-valuations, analytics)
- Tracking daily usage
- Incrementing usage counters
- Admin bypass for unlimited access
"""
from typing import Optional, Dict, Any
from datetime import datetime, date
from supabase import Client
from sqlalchemy.orm import Session
from backend.config import TIER_LIMITS
from backend.logging_config import get_logger
from backend.database.schema import Card, Binder
import os

logger = get_logger(__name__)

# Admin configuration (same as admin_gate.py)
ADMIN_USER_IDS = os.getenv('ADMIN_USER_IDS', '').split(',')
ADMIN_USER_IDS = [uid.strip() for uid in ADMIN_USER_IDS if uid.strip()]

ADMIN_EMAILS = os.getenv('ADMIN_EMAILS', '').split(',')
ADMIN_EMAILS = [email.strip().lower() for email in ADMIN_EMAILS if email.strip()]


class SubscriptionService:
    """Service for managing user subscriptions and tier limits."""
    
    def __init__(self, supabase_client: Client, db_session: Optional[Session] = None):
        """
        Initialize subscription service.
        
        Args:
            supabase_client: Supabase client for accessing subscriptions/usage/card data
            db_session: Optional SQLAlchemy session (legacy, no longer required for card counts)
        """
        self.supabase = supabase_client
        self.db = db_session
    
    async def is_admin(self, user_id: str) -> bool:
        """
        Check if user has admin privileges.
        
        Admins bypass all tier limits and get unlimited access to all features.
        
        Checks:
        1. User ID in ADMIN_USER_IDS environment variable
        2. User email in ADMIN_EMAILS environment variable
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            True if user is an admin, False otherwise
        """
        # Check user ID against ADMIN_USER_IDS
        if user_id in ADMIN_USER_IDS:
            logger.debug(f"[SUBSCRIPTION] User {user_id} is admin (via ADMIN_USER_IDS)")
            return True
        
        # Check email against ADMIN_EMAILS
        try:
            # Get user email from Supabase
            user_response = self.supabase.auth.admin.get_user_by_id(user_id)
            if user_response and user_response.user:
                user_email = user_response.user.email.lower() if user_response.user.email else None
                if user_email and user_email in ADMIN_EMAILS:
                    logger.debug(f"[SUBSCRIPTION] User {user_id} ({user_email}) is admin (via ADMIN_EMAILS)")
                    return True
        except Exception as e:
            logger.debug(f"[SUBSCRIPTION] Could not check admin email for user {user_id}: {e}")
        
        return False
    
    async def get_user_subscription(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user's current subscription details from Supabase.
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            Subscription dict or None if not found
        """
        try:
            response = self.supabase.table('subscriptions')\
                .select('*')\
                .eq('user_id', user_id)\
                .single()\
                .execute()
            
            if response.data:
                logger.debug(f"[SUBSCRIPTION] Found subscription for user {user_id}: tier={response.data.get('tier')}")
                return response.data
            
            logger.debug(f"[SUBSCRIPTION] No subscription found for user {user_id}, defaulting to free tier")
            return None
            
        except Exception as e:
            logger.error(f"[SUBSCRIPTION] Error fetching subscription for user {user_id}: {e}")
            return None
    
    async def get_user_tier(self, user_id: str) -> str:
        """
        Get user's current tier (free, member, founder).
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            Tier string ('free', 'member', or 'founder')
        """
        subscription = await self.get_user_subscription(user_id)
        
        if not subscription:
            return 'free'
        
        # Check if subscription is active
        status = subscription.get('status', 'inactive')
        if status not in ['active', 'trialing']:
            logger.warning(f"[SUBSCRIPTION] User {user_id} has inactive subscription (status={status}), using free tier")
            return 'free'
        
        tier = subscription.get('tier', 'free')
        logger.debug(f"[SUBSCRIPTION] User {user_id} tier: {tier}")
        return tier
    
    async def check_search_limit(self, user_id: str) -> Dict[str, Any]:
        """
        Check if user has remaining searches today.
        
        Admins bypass all limits and get unlimited searches.
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            Dict with keys:
                - allowed: bool - whether user can perform another search
                - used: int - number of searches used today
                - limit: int - daily search limit (-1 = unlimited)
                - remaining: int - searches remaining today (-1 = unlimited)
        """
        # Check if user is an admin - admins have unlimited access
        if await self.is_admin(user_id):
            logger.debug(f"[SUBSCRIPTION] User {user_id} is admin - unlimited searches")
            return {'allowed': True, 'used': 0, 'limit': -1, 'remaining': -1}
        
        tier = await self.get_user_tier(user_id)
        limit = TIER_LIMITS[tier]['daily_searches']
        
        # Unlimited searches
        if limit == -1:
            logger.debug(f"[SUBSCRIPTION] User {user_id} has unlimited searches ({tier} tier)")
            return {'allowed': True, 'used': 0, 'limit': -1, 'remaining': -1}
        
        # Get today's usage from Supabase
        today = date.today().isoformat()
        
        try:
            response = self.supabase.table('daily_usage')\
                .select('searches_count')\
                .eq('user_id', user_id)\
                .eq('usage_date', today)\
                .single()\
                .execute()
            
            used = response.data['searches_count'] if response.data else 0
        except Exception as e:
            logger.warning(f"[SUBSCRIPTION] Error fetching daily usage for user {user_id}: {e}, assuming 0 usage")
            used = 0
        
        remaining = limit - used
        allowed = used < limit
        
        logger.debug(f"[SUBSCRIPTION] User {user_id} search limit check: {used}/{limit} (remaining: {remaining})")
        
        return {
            'allowed': allowed,
            'used': used,
            'limit': limit,
            'remaining': max(0, remaining)
        }
    
    async def increment_search_count(self, user_id: str) -> None:
        """
        Increment user's search count for today.
        
        Uses Supabase RPC function to atomically increment the counter.
        
        Args:
            user_id: Supabase user ID
        """
        today = date.today().isoformat()
        
        try:
            # Use RPC function for atomic increment (created in Phase 1 SQL)
            # If RPC function doesn't exist yet, fall back to upsert
            try:
                self.supabase.rpc('increment_daily_searches', {
                    'p_user_id': user_id,
                    'p_date': today
                }).execute()
                logger.debug(f"[SUBSCRIPTION] Incremented search count for user {user_id}")
            except Exception as rpc_error:
                # Fallback: manual upsert
                logger.debug(f"[SUBSCRIPTION] RPC failed, using upsert fallback: {rpc_error}")
                
                # Try to get existing record
                existing = self.supabase.table('daily_usage')\
                    .select('searches_count')\
                    .eq('user_id', user_id)\
                    .eq('usage_date', today)\
                    .execute()
                
                if existing.data:
                    # Update existing record
                    new_count = existing.data[0]['searches_count'] + 1
                    self.supabase.table('daily_usage')\
                        .update({'searches_count': new_count, 'updated_at': datetime.utcnow().isoformat()})\
                        .eq('user_id', user_id)\
                        .eq('usage_date', today)\
                        .execute()
                else:
                    # Insert new record
                    self.supabase.table('daily_usage').insert({
                        'user_id': user_id,
                        'usage_date': today,
                        'searches_count': 1
                    }).execute()
                
                logger.debug(f"[SUBSCRIPTION] Incremented search count via upsert for user {user_id}")
                
        except Exception as e:
            logger.error(f"[SUBSCRIPTION] Error incrementing search count for user {user_id}: {e}")
            # Don't raise - we don't want to block the search if counter fails
    
    async def check_card_limit(self, user_id: str) -> Dict[str, Any]:
        """
        Check if user can add more cards.
        
        Admins bypass all limits and get unlimited cards.
        Queries Supabase PostgreSQL where frontend stores card data.
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            Dict with keys:
                - allowed: bool - whether user can add more cards
                - count: int - current number of cards
                - limit: int - maximum cards allowed (-1 = unlimited)
                - remaining: int - cards remaining before limit
        """
        # Check if user is an admin - admins have unlimited access
        if await self.is_admin(user_id):
            logger.debug(f"[SUBSCRIPTION] User {user_id} is admin - unlimited cards")
            return {'allowed': True, 'count': 0, 'limit': -1, 'remaining': -1}
        
        tier = await self.get_user_tier(user_id)
        limit = TIER_LIMITS[tier]['max_cards']
        
        # Unlimited cards
        if limit == -1:
            logger.debug(f"[SUBSCRIPTION] User {user_id} has unlimited cards ({tier} tier)")
            return {'allowed': True, 'count': 0, 'limit': -1, 'remaining': -1}
        
        # Count user's cards across all binders from Supabase
        try:
            # Get all binder IDs for this user from Supabase
            binders_response = self.supabase.table('binders')\
                .select('id')\
                .eq('user_id', user_id)\
                .execute()
            
            if not binders_response.data:
                count = 0
            else:
                binder_ids = [b['id'] for b in binders_response.data]
                
                # Count all cards in user's binders from Supabase
                # Using .select('*') pattern that works in Collection Overview
                cards_response = self.supabase.table('cards')\
                    .select('*')\
                    .in_('binder_id', binder_ids)\
                    .execute()
                
                count = len(cards_response.data) if cards_response.data else 0
            
            allowed = count < limit
            remaining = max(0, limit - count)
            
            logger.debug(f"[SUBSCRIPTION] User {user_id} card limit check: {count}/{limit} (remaining: {remaining})")
            
            return {
                'allowed': allowed,
                'count': count,
                'limit': limit,
                'remaining': remaining
            }
            
        except Exception as e:
            logger.error(f"[SUBSCRIPTION] Error checking card limit for user {user_id}: {e}")
            # Fail open - allow the operation if we can't check
            return {'allowed': True, 'count': 0, 'limit': limit, 'remaining': limit}
    
    async def check_auto_valuation_limit(self, user_id: str, binder_id: int) -> Dict[str, Any]:
        """
        Check if user can enable auto-valuation on more cards in a binder.
        
        Admins bypass all limits and get unlimited auto-valuations.
        For Member tier: max 10 cards with auto-valuation enabled across all binders.
        For Founder tier: unlimited.
        For Free tier: 0 (no auto-valuations).
        
        Queries Supabase PostgreSQL where frontend stores card data.
        
        Args:
            user_id: Supabase user ID
            binder_id: Binder ID to check
            
        Returns:
            Dict with keys:
                - allowed: bool - whether user can enable more auto-valuations
                - count: int - current number of cards with auto-valuation enabled
                - limit: int - maximum allowed (-1 = unlimited, 0 = none)
                - remaining: int - auto-valuations remaining before limit
                - tier: str - user's current tier
        """
        # Check if user is an admin - admins have unlimited access
        if await self.is_admin(user_id):
            logger.debug(f"[SUBSCRIPTION] User {user_id} is admin - unlimited auto-valuations")
            return {'allowed': True, 'count': 0, 'limit': -1, 'remaining': -1, 'tier': 'admin'}
        
        tier = await self.get_user_tier(user_id)
        limit = TIER_LIMITS[tier]['auto_valuation_limit']
        
        # No auto-valuations allowed (Free tier)
        if limit == 0:
            logger.debug(f"[SUBSCRIPTION] User {user_id} has no auto-valuations (free tier)")
            return {'allowed': False, 'count': 0, 'limit': 0, 'remaining': 0, 'tier': tier}
        
        # Unlimited auto-valuations (Founder tier)
        if limit == -1:
            logger.debug(f"[SUBSCRIPTION] User {user_id} has unlimited auto-valuations ({tier} tier)")
            return {'allowed': True, 'count': 0, 'limit': -1, 'remaining': -1, 'tier': tier}
        
        # Count cards with auto-valuation enabled from Supabase
        try:
            # Get all binder IDs for this user from Supabase
            binders_response = self.supabase.table('binders')\
                .select('id')\
                .eq('user_id', user_id)\
                .execute()
            
            if not binders_response.data:
                count = 0
            else:
                binder_ids = [b['id'] for b in binders_response.data]
                
                # Count cards with auto_update=True across all user's binders from Supabase
                # Using .select('*') pattern that works in Collection Overview
                cards_response = self.supabase.table('cards')\
                    .select('*')\
                    .in_('binder_id', binder_ids)\
                    .eq('auto_update', True)\
                    .execute()
                
                count = len(cards_response.data) if cards_response.data else 0
            
            allowed = count < limit
            remaining = max(0, limit - count)
            
            logger.debug(f"[SUBSCRIPTION] User {user_id} auto-valuation limit check: {count}/{limit} (remaining: {remaining})")
            
            return {
                'allowed': allowed,
                'count': count,
                'limit': limit,
                'remaining': remaining,
                'tier': tier
            }
            
        except Exception as e:
            logger.error(f"[SUBSCRIPTION] Error checking auto-valuation limit for user {user_id}: {e}")
            # Fail open - allow the operation if we can't check
            return {'allowed': True, 'count': 0, 'limit': limit, 'remaining': limit, 'tier': tier}
    
    async def can_access_analytics(self, user_id: str) -> bool:
        """
        Check if user can access advanced analytics features.
        
        Admins always have access to analytics.
        
        Args:
            user_id: Supabase user ID
            
        Returns:
            True if user has analytics access (Admin, Member, or Founder tier)
        """
        # Check if user is an admin - admins have unlimited access
        if await self.is_admin(user_id):
            logger.debug(f"[SUBSCRIPTION] User {user_id} is admin - analytics access granted")
            return True
        
        tier = await self.get_user_tier(user_id)
        has_access = TIER_LIMITS[tier]['advanced_analytics']
        
        logger.debug(f"[SUBSCRIPTION] User {user_id} analytics access check: {has_access} ({tier} tier)")
        return has_access
