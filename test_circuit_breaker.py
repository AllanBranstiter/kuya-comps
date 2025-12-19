"""
Quick test script for Circuit Breaker implementation.

This script verifies:
- State transitions (CLOSED → OPEN → HALF_OPEN)
- Failure threshold triggering
- Exponential backoff
- Success recovery
"""

import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from backend.services.circuit_breaker import CircuitBreaker, CircuitState
from redis import asyncio as aioredis


async def test_circuit_breaker():
    """Test circuit breaker functionality."""
    print("🧪 Testing Circuit Breaker Implementation\n")
    
    # Connect to Redis
    try:
        redis_client = await aioredis.from_url(
            'redis://localhost:6379',
            encoding="utf-8",
            decode_responses=True
        )
        await redis_client.ping()
        print("✅ Connected to Redis\n")
    except Exception as e:
        print(f"❌ Failed to connect to Redis: {e}")
        print("Please ensure Redis is running on localhost:6379")
        return
    
    # Initialize circuit breaker
    circuit = CircuitBreaker(redis_client=redis_client)
    test_api = "test_api"
    
    # Clean up any existing state
    await redis_client.delete(f"circuit:{test_api}:state")
    await redis_client.delete(f"circuit:{test_api}:failures")
    await redis_client.delete(f"circuit:{test_api}:opens_timestamp")
    await redis_client.delete(f"circuit:{test_api}:backoff_level")
    await redis_client.delete(f"circuit:{test_api}:half_open_attempts")
    
    print("=" * 60)
    print("Test 1: Initial State (should be CLOSED)")
    print("=" * 60)
    state = await circuit.get_state(test_api)
    can_proceed, reason = await circuit.can_proceed(test_api)
    print(f"State: {state}")
    print(f"Can proceed: {can_proceed}")
    print(f"Reason: {reason}")
    assert state == CircuitState.CLOSED, f"Expected CLOSED, got {state}"
    assert can_proceed == True, "Should allow requests in CLOSED state"
    print("✅ Test 1 passed\n")
    
    print("=" * 60)
    print("Test 2: Record failures (should open after 3)")
    print("=" * 60)
    for i in range(1, 4):
        await circuit.record_failure(test_api, is_rate_limit=False)
        state = await circuit.get_state(test_api)
        print(f"Failure {i} recorded. State: {state}")
    
    state = await circuit.get_state(test_api)
    can_proceed, reason = await circuit.can_proceed(test_api)
    print(f"\nFinal state: {state}")
    print(f"Can proceed: {can_proceed}")
    print(f"Reason: {reason}")
    assert state == CircuitState.OPEN, f"Expected OPEN, got {state}"
    assert can_proceed == False, "Should block requests in OPEN state"
    print("✅ Test 2 passed\n")
    
    print("=" * 60)
    print("Test 3: Exponential backoff levels")
    print("=" * 60)
    backoff_level_0 = await circuit.get_backoff_duration(test_api)
    print(f"Backoff level 0: {backoff_level_0}s ({backoff_level_0/60:.1f} minutes)")
    
    # Increment backoff
    await circuit.record_failure(test_api, is_rate_limit=True)
    backoff_level_1 = await circuit.get_backoff_duration(test_api)
    print(f"Backoff level 1: {backoff_level_1}s ({backoff_level_1/60:.1f} minutes)")
    
    assert backoff_level_0 == 300, "Level 0 should be 5 minutes"
    assert backoff_level_1 == 900, "Level 1 should be 15 minutes"
    print("✅ Test 3 passed\n")
    
    print("=" * 60)
    print("Test 4: Force open with specific duration")
    print("=" * 60)
    
    # Reset state
    await redis_client.delete(f"circuit:{test_api}:state")
    await redis_client.delete(f"circuit:{test_api}:backoff_level")
    
    # Force open for 10 seconds
    await circuit.force_open(test_api, duration_seconds=10)
    state = await circuit.get_state(test_api)
    can_proceed, reason = await circuit.can_proceed(test_api)
    print(f"State: {state}")
    print(f"Can proceed: {can_proceed}")
    assert state == CircuitState.OPEN, f"Expected OPEN, got {state}"
    assert can_proceed == False, "Should block requests when forced open"
    print("✅ Test 4 passed\n")
    
    print("=" * 60)
    print("Test 5: Recovery (HALF_OPEN and success)")
    print("=" * 60)
    
    # Wait a bit and simulate timeout elapsed
    import time
    timestamp_key = f"circuit:{test_api}:opens_timestamp"
    past_time = int(time.time()) - 15  # 15 seconds ago
    await redis_client.set(timestamp_key, past_time)
    
    # Should transition to HALF_OPEN
    can_proceed, reason = await circuit.can_proceed(test_api)
    state = await circuit.get_state(test_api)
    print(f"After timeout - State: {state}")
    print(f"Can proceed: {can_proceed}")
    assert state == CircuitState.HALF_OPEN, f"Expected HALF_OPEN, got {state}"
    assert can_proceed == True, "Should allow test request in HALF_OPEN"
    
    # Record success to close circuit
    await circuit.record_success(test_api)
    state = await circuit.get_state(test_api)
    print(f"After success - State: {state}")
    assert state == CircuitState.CLOSED, f"Expected CLOSED, got {state}"
    print("✅ Test 5 passed\n")
    
    # Clean up
    print("🧹 Cleaning up test data...")
    await redis_client.delete(f"circuit:{test_api}:state")
    await redis_client.delete(f"circuit:{test_api}:failures")
    await redis_client.delete(f"circuit:{test_api}:opens_timestamp")
    await redis_client.delete(f"circuit:{test_api}:backoff_level")
    await redis_client.delete(f"circuit:{test_api}:half_open_attempts")
    await redis_client.close()
    
    print("\n" + "=" * 60)
    print("🎉 All tests passed!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_circuit_breaker())
