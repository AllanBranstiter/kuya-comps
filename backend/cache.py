"""
Redis cache service for Kuya Comps.

Provides async caching with graceful fallback when Redis is unavailable.
"""

import json
import hashlib
import logging
from typing import Any, Optional
from redis import asyncio as aioredis

logger = logging.getLogger(__name__)

# Import metrics for tracking cache hit/miss
try:
    from backend.middleware.metrics import metrics
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False


class CacheService:
    """Async Redis cache service with graceful degradation."""
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        """
        Initialize cache service.
        
        Args:
            redis_url: Redis connection URL
        """
        self.redis_url = redis_url
        self.redis: Optional[aioredis.Redis] = None
        self._connection_attempted = False
        self._is_available = False
        
    async def _ensure_connection(self) -> bool:
        """
        Ensure Redis connection is established.
        
        Returns:
            True if connected, False otherwise
        """
        if self.redis is not None and self._is_available:
            return True
            
        if self._connection_attempted and not self._is_available:
            # Already tried and failed, don't spam connection attempts
            return False
            
        try:
            self.redis = await aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2
            )
            # Test connection
            await self.redis.ping()
            self._is_available = True
            self._connection_attempted = True
            logger.info(f"Redis cache connected successfully: {self.redis_url}")
            return True
        except Exception as e:
            self._is_available = False
            self._connection_attempted = True
            logger.warning(f"Redis cache unavailable, continuing without cache: {str(e)}")
            return False
    
    async def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found/error
        """
        if not await self._ensure_connection():
            if METRICS_AVAILABLE:
                metrics.record_cache_miss()
            return None
            
        try:
            value = await self.redis.get(key)
            if value is None:
                # Cache miss
                if METRICS_AVAILABLE:
                    metrics.record_cache_miss()
                return None
            
            # Cache hit
            if METRICS_AVAILABLE:
                metrics.record_cache_hit()
            return json.loads(value)
        except Exception as e:
            logger.warning(f"Cache get error for key '{key}': {str(e)}")
            if METRICS_AVAILABLE:
                metrics.record_cache_miss()
            return None
    
    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """
        Set value in cache with TTL.
        
        Args:
            key: Cache key
            value: Value to cache (must be JSON serializable)
            ttl: Time to live in seconds (default: 5 minutes)
            
        Returns:
            True if successful, False otherwise
        """
        if not await self._ensure_connection():
            return False
            
        try:
            serialized = json.dumps(value)
            await self.redis.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.warning(f"Cache set error for key '{key}': {str(e)}")
            return False
    
    async def delete(self, key: str) -> bool:
        """
        Delete key from cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if successful, False otherwise
        """
        if not await self._ensure_connection():
            return False
            
        try:
            await self.redis.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Cache delete error for key '{key}': {str(e)}")
            return False
    
    async def ping(self) -> bool:
        """
        Ping Redis to check connection health.
        
        Returns:
            True if Redis responds, False otherwise
        """
        if not await self._ensure_connection():
            return False
            
        try:
            response = await self.redis.ping()
            return response is True
        except Exception as e:
            logger.warning(f"Cache ping error: {str(e)}")
            return False
    
    async def close(self):
        """Close Redis connection."""
        if self.redis is not None:
            await self.redis.close()
            self.redis = None
            self._is_available = False
    
    @staticmethod
    def generate_cache_key(prefix: str, params: dict) -> str:
        """
        Generate a cache key from parameters.
        
        Args:
            prefix: Key prefix (e.g., 'kuya_comps:sold')
            params: Dictionary of parameters to hash
            
        Returns:
            Cache key string
        """
        # Sort keys to ensure consistent hashing
        param_str = json.dumps(params, sort_keys=True)
        hash_value = hashlib.md5(param_str.encode()).hexdigest()
        return f"{prefix}:{hash_value}"
