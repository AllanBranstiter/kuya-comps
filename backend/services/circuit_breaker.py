"""
Circuit Breaker Service for preventing cascading failures.

Implements the circuit breaker pattern with three states:
- CLOSED: Normal operation, requests pass through
- OPEN: Blocking all requests, system in cooldown
- HALF_OPEN: Testing recovery with limited requests

Uses exponential backoff for recovery (5min → 15min → 45min).
"""

import logging
import time
from typing import Optional, Tuple
from redis import asyncio as aioredis
from backend.config import (
    CIRCUIT_FAILURE_THRESHOLD,
    CIRCUIT_BASE_TIMEOUT,
    CIRCUIT_MAX_TIMEOUT,
    CIRCUIT_HALF_OPEN_REQUESTS
)

logger = logging.getLogger(__name__)


class CircuitState:
    """Circuit breaker state constants."""
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreaker:
    """
    Circuit breaker for API failure protection.
    
    Provides methods to:
    - Check if API calls can proceed
    - Record successes and failures
    - Implement exponential backoff for recovery
    - Prevent cascading failures
    """
    
    def __init__(self, redis_client: Optional[aioredis.Redis] = None):
        """
        Initialize circuit breaker.
        
        Args:
            redis_client: Optional Redis client. If not provided, breaker will
                         operate in degraded mode (always allows requests).
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
            await self.redis.ping()
            return True
        except Exception as e:
            logger.warning(f"Redis unavailable for circuit breaker: {e}")
            return False
    
    def _get_state_key(self, api_name: str) -> str:
        """Generate Redis key for circuit state."""
        return f"circuit:{api_name}:state"
    
    def _get_failures_key(self, api_name: str) -> str:
        """Generate Redis key for failure counter."""
        return f"circuit:{api_name}:failures"
    
    def _get_opens_timestamp_key(self, api_name: str) -> str:
        """Generate Redis key for when circuit opened."""
        return f"circuit:{api_name}:opens_timestamp"
    
    def _get_backoff_level_key(self, api_name: str) -> str:
        """Generate Redis key for backoff level."""
        return f"circuit:{api_name}:backoff_level"
    
    def _get_half_open_attempts_key(self, api_name: str) -> str:
        """Generate Redis key for half-open test attempts."""
        return f"circuit:{api_name}:half_open_attempts"
    
    async def get_state(self, api_name: str) -> str:
        """
        Get current circuit state.
        
        Args:
            api_name: Name of the API
            
        Returns:
            Circuit state (CLOSED, OPEN, or HALF_OPEN)
        """
        if not await self._ensure_redis():
            return CircuitState.CLOSED  # Default to allowing requests
        
        try:
            state_key = self._get_state_key(api_name)
            state = await self.redis.get(state_key)
            return state if state else CircuitState.CLOSED
        except Exception as e:
            logger.warning(f"Failed to get circuit state for {api_name}: {e}")
            return CircuitState.CLOSED
    
    async def _set_state(self, api_name: str, state: str) -> bool:
        """
        Set circuit state.
        
        Args:
            api_name: Name of the API
            state: New state (CLOSED, OPEN, or HALF_OPEN)
            
        Returns:
            True if successful, False otherwise
        """
        if not await self._ensure_redis():
            return False
        
        try:
            state_key = self._get_state_key(api_name)
            await self.redis.set(state_key, state)
            logger.info(f"Circuit breaker state changed to {state} for {api_name}")
            return True
        except Exception as e:
            logger.warning(f"Failed to set circuit state for {api_name}: {e}")
            return False
    
    async def get_backoff_level(self, api_name: str) -> int:
        """
        Get current backoff level (0, 1, or 2).
        
        Args:
            api_name: Name of the API
            
        Returns:
            Backoff level (0-2)
        """
        if not await self._ensure_redis():
            return 0
        
        try:
            backoff_key = self._get_backoff_level_key(api_name)
            level = await self.redis.get(backoff_key)
            return int(level) if level else 0
        except Exception as e:
            logger.warning(f"Failed to get backoff level for {api_name}: {e}")
            return 0
    
    async def get_backoff_duration(self, api_name: str) -> int:
        """
        Calculate exponential backoff duration.
        
        Backoff progression: 5min → 15min → 45min
        
        Args:
            api_name: Name of the API
            
        Returns:
            Backoff duration in seconds
        """
        level = await self.get_backoff_level(api_name)
        
        # Exponential backoff with 3x multiplier
        # Level 0: 5 min (300s)
        # Level 1: 15 min (900s)
        # Level 2: 45 min (2700s)
        duration = CIRCUIT_BASE_TIMEOUT * (3 ** level)
        
        # Cap at maximum timeout
        return min(duration, CIRCUIT_MAX_TIMEOUT)
    
    async def can_proceed(self, api_name: str) -> Tuple[bool, Optional[str]]:
        """
        Check if an API call can proceed based on circuit state.
        
        Args:
            api_name: Name of the API
            
        Returns:
            Tuple of (can_proceed: bool, reason: Optional[str])
        """
        if not await self._ensure_redis():
            # If Redis unavailable, allow requests (fail open)
            return True, None
        
        try:
            state = await self.get_state(api_name)
            current_time = int(time.time())
            
            if state == CircuitState.CLOSED:
                # Normal operation
                return True, None
            
            elif state == CircuitState.OPEN:
                # Check if timeout has elapsed
                opens_key = self._get_opens_timestamp_key(api_name)
                opens_timestamp = await self.redis.get(opens_key)
                
                if opens_timestamp:
                    opens_time = int(opens_timestamp)
                    backoff_duration = await self.get_backoff_duration(api_name)
                    elapsed = current_time - opens_time
                    
                    if elapsed >= backoff_duration:
                        # Timeout elapsed, try half-open
                        await self._set_state(api_name, CircuitState.HALF_OPEN)
                        await self.redis.delete(self._get_half_open_attempts_key(api_name))
                        logger.info(f"Circuit entering HALF_OPEN state for {api_name}")
                        return True, None
                    else:
                        # Still in timeout
                        remaining = backoff_duration - elapsed
                        backoff_level = await self.get_backoff_level(api_name)
                        reason = (
                            f"Circuit breaker is OPEN. "
                            f"Retry after {remaining}s "
                            f"(backoff level: {backoff_level})"
                        )
                        return False, reason
                else:
                    # No timestamp, reset to closed
                    await self._set_state(api_name, CircuitState.CLOSED)
                    return True, None
            
            elif state == CircuitState.HALF_OPEN:
                # Allow limited test requests
                attempts_key = self._get_half_open_attempts_key(api_name)
                attempts = await self.redis.get(attempts_key)
                current_attempts = int(attempts) if attempts else 0
                
                if current_attempts < CIRCUIT_HALF_OPEN_REQUESTS:
                    # Allow test request
                    await self.redis.incr(attempts_key)
                    await self.redis.expire(attempts_key, 300)  # 5 min TTL
                    return True, None
                else:
                    # Already testing, block additional requests
                    return False, "Circuit is HALF_OPEN and testing recovery"
            
            # Unknown state, default to closed
            await self._set_state(api_name, CircuitState.CLOSED)
            return True, None
            
        except Exception as e:
            logger.error(f"Error checking circuit breaker for {api_name}: {e}")
            # On error, fail open (allow requests)
            return True, None
    
    async def record_success(self, api_name: str) -> bool:
        """
        Record a successful API call.
        
        Args:
            api_name: Name of the API
            
        Returns:
            True if recorded successfully, False otherwise
        """
        if not await self._ensure_redis():
            return False
        
        try:
            state = await self.get_state(api_name)
            
            if state == CircuitState.HALF_OPEN:
                # Success in half-open state, close circuit and reset
                await self._set_state(api_name, CircuitState.CLOSED)
                await self.redis.delete(self._get_failures_key(api_name))
                await self.redis.delete(self._get_backoff_level_key(api_name))
                await self.redis.delete(self._get_half_open_attempts_key(api_name))
                logger.info(f"Circuit breaker closed for {api_name} after successful test")
            elif state == CircuitState.CLOSED:
                # Reset failure counter on success
                await self.redis.delete(self._get_failures_key(api_name))
            
            return True
            
        except Exception as e:
            logger.warning(f"Failed to record success for {api_name}: {e}")
            return False
    
    async def record_failure(
        self,
        api_name: str,
        is_rate_limit: bool = False
    ) -> bool:
        """
        Record a failed API call.
        
        Args:
            api_name: Name of the API
            is_rate_limit: Whether the failure was due to rate limiting
            
        Returns:
            True if recorded successfully, False otherwise
        """
        if not await self._ensure_redis():
            return False
        
        try:
            state = await self.get_state(api_name)
            
            if state == CircuitState.HALF_OPEN:
                # Failure in half-open state, reopen circuit
                await self._open_circuit(api_name, is_rate_limit)
                logger.warning(f"Circuit reopened for {api_name} after failed test")
            elif state == CircuitState.CLOSED:
                # Increment failure counter
                failures_key = self._get_failures_key(api_name)
                failures = await self.redis.incr(failures_key)
                await self.redis.expire(failures_key, 300)  # 5 min TTL
                
                # Check if we've hit threshold
                if failures >= CIRCUIT_FAILURE_THRESHOLD:
                    await self._open_circuit(api_name, is_rate_limit)
                    logger.warning(
                        f"Circuit opened for {api_name} after {failures} failures"
                    )
            
            return True
            
        except Exception as e:
            logger.warning(f"Failed to record failure for {api_name}: {e}")
            return False
    
    async def _open_circuit(self, api_name: str, is_rate_limit: bool = False) -> bool:
        """
        Open the circuit breaker.
        
        Args:
            api_name: Name of the API
            is_rate_limit: Whether opening due to rate limit
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Set state to OPEN
            await self._set_state(api_name, CircuitState.OPEN)
            
            # Record timestamp
            current_time = int(time.time())
            opens_key = self._get_opens_timestamp_key(api_name)
            await self.redis.set(opens_key, current_time)
            
            # Increment backoff level if rate limited
            if is_rate_limit:
                backoff_key = self._get_backoff_level_key(api_name)
                current_level = await self.get_backoff_level(api_name)
                new_level = min(current_level + 1, 2)  # Max level 2
                await self.redis.set(backoff_key, new_level)
                await self.redis.expire(backoff_key, 86400)  # 24 hour TTL
                
                duration = await self.get_backoff_duration(api_name)
                logger.warning(
                    f"Circuit opened for {api_name} due to rate limit. "
                    f"Backoff level: {new_level}, duration: {duration}s"
                )
            else:
                duration = await self.get_backoff_duration(api_name)
                logger.warning(
                    f"Circuit opened for {api_name} due to failures. "
                    f"Duration: {duration}s"
                )
            
            # Reset failure counter
            await self.redis.delete(self._get_failures_key(api_name))
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to open circuit for {api_name}: {e}")
            return False
    
    async def force_open(self, api_name: str, duration_seconds: int) -> bool:
        """
        Forcefully open the circuit for a specific duration.
        
        Useful for handling rate limit responses from the API.
        
        Args:
            api_name: Name of the API
            duration_seconds: How long to keep circuit open
            
        Returns:
            True if successful, False otherwise
        """
        if not await self._ensure_redis():
            return False
        
        try:
            # Set state to OPEN
            await self._set_state(api_name, CircuitState.OPEN)
            
            # Record timestamp
            current_time = int(time.time())
            opens_key = self._get_opens_timestamp_key(api_name)
            await self.redis.set(opens_key, current_time)
            await self.redis.expire(opens_key, duration_seconds + 60)  # Add buffer
            
            logger.warning(
                f"Circuit forcefully opened for {api_name} for {duration_seconds}s"
            )
            
            return True
            
        except Exception as e:
            logger.warning(f"Failed to force open circuit for {api_name}: {e}")
            return False
