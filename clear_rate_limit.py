#!/usr/bin/env python3
"""
Emergency script to clear rate limit from Redis.
Run this to immediately unblock searches.
"""
import asyncio
import sys
from backend.cache import CacheService
from backend.config import get_redis_url


async def clear_rate_limit():
    """Clear the rate limit key from Redis."""
    print("="*80)
    print("EMERGENCY RATE LIMIT CLEARANCE")
    print("="*80)
    
    # Initialize cache service
    redis_url = get_redis_url()
    print(f"\n[1] Connecting to Redis: {redis_url}")
    cache_service = CacheService(redis_url=redis_url)
    
    # Check if Redis is available
    connected = await cache_service._ensure_connection()
    if not connected:
        print("❌ FAILED: Redis is not available")
        print("\nTroubleshooting:")
        print("1. Check if Redis is running on Railway")
        print("2. Verify REDIS_URL environment variable is set")
        print(f"   Current: {redis_url}")
        return False
    
    print("✓ Redis connected")
    
    # Get current rate limit state
    rate_limit_key = "rate_limit:ebay:finding_api"
    print(f"\n[2] Checking rate limit key: {rate_limit_key}")
    
    current_state = await cache_service.get(rate_limit_key)
    
    if not current_state:
        print("✓ No active rate limit found")
        print("\n" + "="*80)
        print("SUCCESS: You can make searches now!")
        print("="*80)
        await cache_service.close()
        return True
    
    # Show current state
    import time
    limited_until = current_state.get('limited_until', 0)
    triggered_at = current_state.get('triggered_at', 0)
    current_time = time.time()
    time_remaining = max(0, int(limited_until - current_time))
    backoff_level = current_state.get('backoff_level', 0)
    
    print(f"\n[3] Rate limit state found:")
    print(f"  - Triggered at: {triggered_at}")
    print(f"  - Limited until: {limited_until}")
    print(f"  - Time remaining: {time_remaining} seconds ({time_remaining // 60} minutes)")
    print(f"  - Backoff level: {backoff_level}")
    
    # Delete the key
    print(f"\n[4] Deleting rate limit key...")
    deleted = await cache_service.delete(rate_limit_key)
    
    if not deleted:
        print("❌ FAILED: Could not delete rate limit key")
        await cache_service.close()
        return False
    
    print("✓ Rate limit key deleted")
    
    # Verify deletion
    verify = await cache_service.get(rate_limit_key)
    if verify:
        print("❌ WARNING: Key still exists after deletion!")
        await cache_service.close()
        return False
    
    print("✓ Verified: Key successfully removed")
    
    await cache_service.close()
    
    print("\n" + "="*80)
    print("SUCCESS: Rate limit cleared!")
    print("="*80)
    print("\nYou can now:")
    print("1. Make searches on your website")
    print("2. Test the eBay API")
    print("3. The new fix will prevent cascading rate limits in the future")
    
    if time_remaining > 0:
        print(f"\n⚠️  NOTE: eBay may still rate limit for {time_remaining // 60} more minutes")
        print("   But the fix is now active to prevent cascading!")
    
    return True


async def main():
    """Main function."""
    try:
        success = await clear_rate_limit()
        return 0 if success else 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
