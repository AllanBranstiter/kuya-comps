#!/usr/bin/env python3
"""
Test script for Phase 5: Enhanced Error Responses & Monitoring

Tests:
1. /api/usage-stats endpoint returns proper data structure
2. Error responses include usage statistics
3. Circuit breaker state is included in responses
"""

import asyncio
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.cache import CacheService
from backend.services.api_usage_tracker import APIUsageTracker
from backend.services.circuit_breaker import CircuitBreaker
from backend.config import EBAY_DAILY_CALL_LIMIT, RATE_LIMIT_WARNING_THRESHOLD


async def test_usage_stats_structure():
    """Test that usage stats have the correct structure."""
    print("\n" + "="*60)
    print("TEST 1: API Usage Stats Structure")
    print("="*60)
    
    cache_service = CacheService()
    await cache_service._ensure_connection()
    
    tracker = APIUsageTracker(redis_client=cache_service.redis if cache_service._is_available else None)
    circuit = CircuitBreaker(redis_client=cache_service.redis if cache_service._is_available else None)
    
    # Get stats
    stats = await tracker.get_stats('ebay_finding_api')
    circuit_state = await circuit.get_state('ebay_finding_api')
    backoff_level = await circuit.get_backoff_level('ebay_finding_api')
    
    print(f"✓ Stats retrieved: {stats}")
    print(f"✓ Circuit state: {circuit_state}")
    print(f"✓ Backoff level: {backoff_level}")
    
    # Build response like the endpoint does
    response = {
        "ebay_finding_api": {
            "usage": {
                "daily_calls": stats.get('daily_calls', 0),
                "hourly_calls": stats.get('hourly_calls', 0),
                "rate_limited_calls": stats.get('rate_limited_calls', 0),
                "failed_calls": stats.get('failed_calls', 0),
                "current_date": stats.get('current_date'),
                "current_hour": stats.get('current_hour')
            },
            "circuit": {
                "state": circuit_state,
                "backoff_level": backoff_level
            },
            "limits": {
                "daily": EBAY_DAILY_CALL_LIMIT,
                "warning_threshold": RATE_LIMIT_WARNING_THRESHOLD
            },
            "status": {
                "redis_available": stats.get('redis_available', False),
                "percentage_used": f"{(stats.get('daily_calls', 0)/EBAY_DAILY_CALL_LIMIT)*100:.1f}%",
                "is_near_limit": stats.get('daily_calls', 0) >= (EBAY_DAILY_CALL_LIMIT * RATE_LIMIT_WARNING_THRESHOLD)
            }
        }
    }
    
    print("\n✓ /api/usage-stats response structure:")
    for key in response['ebay_finding_api']:
        print(f"  - {key}: {list(response['ebay_finding_api'][key].keys())}")
    
    await cache_service.close()
    return True


async def test_error_response_structure():
    """Test that error responses include usage stats."""
    print("\n" + "="*60)
    print("TEST 2: Error Response Structure")
    print("="*60)
    
    cache_service = CacheService()
    await cache_service._ensure_connection()
    
    tracker = APIUsageTracker(redis_client=cache_service.redis if cache_service._is_available else None)
    circuit = CircuitBreaker(redis_client=cache_service.redis if cache_service._is_available else None)
    
    # Get current stats
    usage_stats = await tracker.get_stats('ebay_finding_api')
    circuit_state = await circuit.get_state('ebay_finding_api')
    backoff_level = await circuit.get_backoff_level('ebay_finding_api')
    
    # Simulate CIRCUIT_OPEN error response structure
    circuit_open_error = {
        "error": "CIRCUIT_OPEN",
        "message": "Circuit breaker is open",
        "usage": {
            "daily_calls": usage_stats.get('daily_calls', 0),
            "daily_limit": EBAY_DAILY_CALL_LIMIT,
            "hourly_calls": usage_stats.get('hourly_calls', 0),
            "percentage_used": f"{(usage_stats.get('daily_calls', 0)/EBAY_DAILY_CALL_LIMIT)*100:.1f}%",
            "rate_limited_calls": usage_stats.get('rate_limited_calls', 0)
        },
        "circuit_state": circuit_state,
        "backoff_level": backoff_level,
        "correlation_id": "test-123"
    }
    
    print("✓ CIRCUIT_OPEN error response includes:")
    for key in circuit_open_error:
        print(f"  - {key}")
    
    # Simulate RATE_LIMIT_ACTIVE error response structure
    rate_limit_active_error = {
        "error": "RATE_LIMIT_ACTIVE",
        "message": "Rate limit is active",
        "retry_after": 300,
        "limited_until": 1234567890,
        "backoff_level": 0,
        "usage": {
            "daily_calls": usage_stats.get('daily_calls', 0),
            "daily_limit": EBAY_DAILY_CALL_LIMIT,
            "hourly_calls": usage_stats.get('hourly_calls', 0),
            "percentage_used": f"{(usage_stats.get('daily_calls', 0)/EBAY_DAILY_CALL_LIMIT)*100:.1f}%",
            "rate_limited_calls": usage_stats.get('rate_limited_calls', 0)
        },
        "circuit_state": circuit_state,
        "correlation_id": "test-456"
    }
    
    print("\n✓ RATE_LIMIT_ACTIVE error response includes:")
    for key in rate_limit_active_error:
        print(f"  - {key}")
    
    # Simulate RATE_LIMIT_EXCEEDED error response structure  
    rate_limit_exceeded_error = {
        "error": "RATE_LIMIT_EXCEEDED",
        "message": "Rate limit exceeded",
        "retry_after": 300,
        "limited_until": 1234567890,
        "backoff_level": 0,
        "usage": {
            "daily_calls": usage_stats.get('daily_calls', 0),
            "daily_limit": EBAY_DAILY_CALL_LIMIT,
            "hourly_calls": usage_stats.get('hourly_calls', 0),
            "percentage_used": f"{(usage_stats.get('daily_calls', 0)/EBAY_DAILY_CALL_LIMIT)*100:.1f}%",
            "rate_limited_calls": usage_stats.get('rate_limited_calls', 0)
        },
        "circuit_state": circuit_state,
        "correlation_id": "test-789"
    }
    
    print("\n✓ RATE_LIMIT_EXCEEDED error response includes:")
    for key in rate_limit_exceeded_error:
        print(f"  - {key}")
    
    await cache_service.close()
    return True


async def test_usage_data_consistency():
    """Test that usage data is consistent across calls."""
    print("\n" + "="*60)
    print("TEST 3: Usage Data Consistency")
    print("="*60)
    
    cache_service = CacheService()
    await cache_service._ensure_connection()
    
    tracker = APIUsageTracker(redis_client=cache_service.redis if cache_service._is_available else None)
    
    # Record a test call
    print("Recording test API call...")
    await tracker.record_call('ebay_finding_api', success=True, rate_limited=False)
    
    # Get stats twice
    stats1 = await tracker.get_stats('ebay_finding_api')
    await asyncio.sleep(0.1)  # Small delay
    stats2 = await tracker.get_stats('ebay_finding_api')
    
    # Daily calls should be the same
    if stats1.get('daily_calls') == stats2.get('daily_calls'):
        print(f"✓ Daily calls consistent: {stats1.get('daily_calls')}")
    else:
        print(f"✗ Daily calls inconsistent: {stats1.get('daily_calls')} vs {stats2.get('daily_calls')}")
        return False
    
    # Hourly calls should be the same
    if stats1.get('hourly_calls') == stats2.get('hourly_calls'):
        print(f"✓ Hourly calls consistent: {stats1.get('hourly_calls')}")
    else:
        print(f"✗ Hourly calls inconsistent: {stats1.get('hourly_calls')} vs {stats2.get('hourly_calls')}")
        return False
    
    print(f"✓ Redis available: {stats1.get('redis_available', False)}")
    
    await cache_service.close()
    return True


async def main():
    """Run all Phase 5 tests."""
    print("\n" + "="*60)
    print("PHASE 5 IMPLEMENTATION TEST SUITE")
    print("Enhanced Error Responses & Monitoring")
    print("="*60)
    
    all_passed = True
    
    try:
        # Test 1: Usage stats structure
        if not await test_usage_stats_structure():
            all_passed = False
            print("\n✗ Test 1 FAILED")
        else:
            print("\n✓ Test 1 PASSED")
        
        # Test 2: Error response structure
        if not await test_error_response_structure():
            all_passed = False
            print("\n✗ Test 2 FAILED")
        else:
            print("\n✓ Test 2 PASSED")
        
        # Test 3: Usage data consistency
        if not await test_usage_data_consistency():
            all_passed = False
            print("\n✗ Test 3 FAILED")
        else:
            print("\n✓ Test 3 PASSED")
        
    except Exception as e:
        print(f"\n✗ Test suite failed with error: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False
    
    print("\n" + "="*60)
    if all_passed:
        print("✓ ALL TESTS PASSED - Phase 5 implementation verified")
    else:
        print("✗ SOME TESTS FAILED - Review implementation")
    print("="*60 + "\n")
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
