"""
API Usage Tracker Service for tracking API calls and preventing rate limit issues.

This service uses Redis to track cumulative API usage per hour and per day,
providing visibility and warnings before hitting external API limits.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Optional
from redis import asyncio as aioredis

logger = logging.getLogger(__name__)


class APIUsageTracker:
    """
    Tracks API usage with Redis-backed counters.
    
    Provides methods to:
    - Record API calls (success, failure, rate-limited)
    - Get daily/hourly usage statistics
    - Check if approaching configured limits
    - Get comprehensive stats for monitoring
    """
    
    def __init__(self, redis_client: Optional[aioredis.Redis] = None):
        """
        Initialize API usage tracker.
        
        Args:
            redis_client: Optional Redis client. If not provided, tracker will
                         operate in degraded mode (logging only, no persistence).
        """
        self.redis = redis_client
        self._redis_available = redis_client is not None
        
    async def _ensure_redis(self) -> bool:
        """
        Check if Redis is available.
        
        Returns:
            True if Redis is available, False otherwise
        """
        if not self._redis_available or self.redis is None:
            return False
            
        try:
            # Quick ping to verify connection
            await self.redis.ping()
            return True
        except Exception as e:
            logger.warning(f"Redis unavailable for usage tracking: {e}")
            return False
    
    def _get_current_date(self) -> str:
        """Get current date in YYYY-MM-DD format (UTC)."""
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    def _get_current_hour(self) -> str:
        """Get current hour in YYYY-MM-DD-HH format (UTC)."""
        return datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")
    
    def _get_daily_key(self, api_name: str) -> str:
        """Generate Redis key for daily usage counter."""
        date_str = self._get_current_date()
        return f"api_usage:{api_name}:daily:{date_str}"
    
    def _get_hourly_key(self, api_name: str) -> str:
        """Generate Redis key for hourly usage counter."""
        hour_str = self._get_current_hour()
        return f"api_usage:{api_name}:hourly:{hour_str}"
    
    def _get_rate_limited_key(self, api_name: str) -> str:
        """Generate Redis key for rate-limited call counter."""
        return f"api_usage:{api_name}:rate_limited_count"
    
    def _get_failed_key(self, api_name: str) -> str:
        """Generate Redis key for failed call counter."""
        return f"api_usage:{api_name}:failed_count"
    
    async def record_call(
        self,
        api_name: str,
        success: bool = True,
        rate_limited: bool = False
    ) -> bool:
        """
        Record an API call.
        
        Args:
            api_name: Name of the API (e.g., 'ebay_finding_api')
            success: Whether the call succeeded
            rate_limited: Whether the call was rate-limited
            
        Returns:
            True if recorded successfully, False otherwise
        """
        if not await self._ensure_redis():
            logger.debug(f"Redis unavailable - API call tracking disabled for {api_name}")
            return False
        
        try:
            # Increment daily counter
            daily_key = self._get_daily_key(api_name)
            await self.redis.incr(daily_key)
            # Set TTL to 48 hours (expires day after tomorrow)
            await self.redis.expire(daily_key, 172800)
            
            # Increment hourly counter
            hourly_key = self._get_hourly_key(api_name)
            await self.redis.incr(hourly_key)
            # Set TTL to 2 hours
            await self.redis.expire(hourly_key, 7200)
            
            # Track failures and rate limits separately
            if rate_limited:
                rate_limited_key = self._get_rate_limited_key(api_name)
                await self.redis.incr(rate_limited_key)
                await self.redis.expire(rate_limited_key, 86400)  # 24 hours
                logger.warning(f"Rate limited call recorded for {api_name}")
            elif not success:
                failed_key = self._get_failed_key(api_name)
                await self.redis.incr(failed_key)
                await self.redis.expire(failed_key, 86400)  # 24 hours
                logger.debug(f"Failed call recorded for {api_name}")
            else:
                logger.debug(f"Successful call recorded for {api_name}")
            
            return True
            
        except Exception as e:
            logger.warning(f"Failed to record API call for {api_name}: {e}")
            return False
    
    async def get_daily_usage(self, api_name: str) -> int:
        """
        Get daily usage count for an API.
        
        Args:
            api_name: Name of the API
            
        Returns:
            Number of calls made today (0 if unavailable)
        """
        if not await self._ensure_redis():
            return 0
        
        try:
            daily_key = self._get_daily_key(api_name)
            count = await self.redis.get(daily_key)
            return int(count) if count else 0
        except Exception as e:
            logger.warning(f"Failed to get daily usage for {api_name}: {e}")
            return 0
    
    async def get_hourly_usage(self, api_name: str) -> int:
        """
        Get hourly usage count for an API.
        
        Args:
            api_name: Name of the API
            
        Returns:
            Number of calls made this hour (0 if unavailable)
        """
        if not await self._ensure_redis():
            return 0
        
        try:
            hourly_key = self._get_hourly_key(api_name)
            count = await self.redis.get(hourly_key)
            return int(count) if count else 0
        except Exception as e:
            logger.warning(f"Failed to get hourly usage for {api_name}: {e}")
            return 0
    
    async def is_near_limit(
        self,
        api_name: str,
        daily_limit: int = 5000,
        threshold: float = 0.8
    ) -> bool:
        """
        Check if API usage is approaching the daily limit.
        
        Args:
            api_name: Name of the API
            daily_limit: Maximum calls allowed per day
            threshold: Percentage threshold (0.0-1.0) to trigger warning
            
        Returns:
            True if usage >= threshold * limit, False otherwise
        """
        if not await self._ensure_redis():
            return False
        
        try:
            daily_usage = await self.get_daily_usage(api_name)
            warning_threshold = daily_limit * threshold
            
            is_near = daily_usage >= warning_threshold
            
            if is_near:
                logger.warning(
                    f"API usage near limit for {api_name}: "
                    f"{daily_usage}/{daily_limit} calls "
                    f"({(daily_usage/daily_limit)*100:.1f}%)"
                )
            
            return is_near
            
        except Exception as e:
            logger.warning(f"Failed to check limit for {api_name}: {e}")
            return False
    
    async def get_stats(self, api_name: str) -> Dict:
        """
        Get comprehensive statistics for an API.
        
        Args:
            api_name: Name of the API
            
        Returns:
            Dictionary with usage statistics
        """
        if not await self._ensure_redis():
            return {
                "daily_calls": 0,
                "hourly_calls": 0,
                "rate_limited_calls": 0,
                "failed_calls": 0,
                "redis_available": False
            }
        
        try:
            # Get all counters
            daily_calls = await self.get_daily_usage(api_name)
            hourly_calls = await self.get_hourly_usage(api_name)
            
            # Get rate limited count
            rate_limited_key = self._get_rate_limited_key(api_name)
            rate_limited_count = await self.redis.get(rate_limited_key)
            rate_limited_calls = int(rate_limited_count) if rate_limited_count else 0
            
            # Get failed count
            failed_key = self._get_failed_key(api_name)
            failed_count = await self.redis.get(failed_key)
            failed_calls = int(failed_count) if failed_count else 0
            
            return {
                "daily_calls": daily_calls,
                "hourly_calls": hourly_calls,
                "rate_limited_calls": rate_limited_calls,
                "failed_calls": failed_calls,
                "redis_available": True,
                "current_date": self._get_current_date(),
                "current_hour": self._get_current_hour()
            }
            
        except Exception as e:
            logger.warning(f"Failed to get stats for {api_name}: {e}")
            return {
                "daily_calls": 0,
                "hourly_calls": 0,
                "rate_limited_calls": 0,
                "failed_calls": 0,
                "redis_available": False,
                "error": str(e)
            }
