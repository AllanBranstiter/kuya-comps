#!/usr/bin/env python3
"""
Test script for Phase 2: Screenshot Optimization & Storage

Tests:
1. Client-side compression simulation
2. Server-side screenshot size validation
3. Screenshot format validation
4. Screenshot retrieval endpoint
"""
import requests
import base64
import json
from io import BytesIO
from PIL import Image

BASE_URL = "http://localhost:8000"


def create_test_image(width=1920, height=1080, format='PNG'):
    """Create a test image and return as base64 data URL."""
    # Create a simple test image
    img = Image.new('RGB', (width, height), color='red')
    
    # Save to bytes
    buffer = BytesIO()
    img.save(buffer, format=format)
    buffer.seek(0)
    
    # Convert to base64
    img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
    
    # Create data URL
    mime_type = f'image/{format.lower()}'
    data_url = f'data:{mime_type};base64,{img_base64}'
    
    return data_url, len(data_url) / 1024  # Return data URL and size in KB


def test_compressed_screenshot_submission():
    """Test 1: Submit feedback with compressed (JPEG) screenshot."""
    print("\n" + "="*60)
    print("TEST 1: Compressed Screenshot Submission (JPEG)")
    print("="*60)
    
    # Create a JPEG screenshot (simulating client-side compression)
    screenshot_data, size_kb = create_test_image(1920, 1080, 'JPEG')
    
    feedback_data = {
        "category": "Bug Report",
        "description": "Testing Phase 2 compressed screenshot",
        "browser": "Test Browser",
        "os": "Test OS",
        "screenResolution": "1920x1080",
        "viewportSize": "1920x1080",
        "url": "http://test.com/phase2",
        "timestamp": "2024-12-20T00:00:00Z",
        "screenshot": screenshot_data,
        "annotation": {"x": 100, "y": 100, "width": 200, "height": 200},
        "clientSessionId": "test_session_phase2_compressed"
    }
    
    print(f"Screenshot size: {size_kb:.2f} KB (JPEG format)")
    
    try:
        response = requests.post(f"{BASE_URL}/api/feedback", json=feedback_data)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ SUCCESS: Feedback submitted successfully")
            print(f"   Feedback ID: {result['feedback_id']}")
            return result['feedback_id']
        else:
            print(f"❌ FAILED: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return None


def test_oversized_screenshot_rejection():
    """Test 2: Verify server rejects screenshots over 2MB."""
    print("\n" + "="*60)
    print("TEST 2: Oversized Screenshot Rejection (>2MB)")
    print("="*60)
    
    # Create a large PNG screenshot that exceeds 2MB
    screenshot_data, size_kb = create_test_image(4000, 4000, 'PNG')
    
    feedback_data = {
        "category": "Bug Report",
        "description": "Testing Phase 2 oversized screenshot rejection",
        "browser": "Test Browser",
        "os": "Test OS",
        "screenResolution": "1920x1080",
        "viewportSize": "1920x1080",
        "url": "http://test.com/phase2",
        "timestamp": "2024-12-20T00:00:00Z",
        "screenshot": screenshot_data,
        "clientSessionId": "test_session_phase2_oversized"
    }
    
    print(f"Screenshot size: {size_kb:.2f} KB (PNG format)")
    
    try:
        response = requests.post(f"{BASE_URL}/api/feedback", json=feedback_data)
        
        if response.status_code == 422 or response.status_code == 400:
            print(f"✅ SUCCESS: Server correctly rejected oversized screenshot")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ FAILED: Expected rejection (422/400), got {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ ERROR: {e}")


def test_invalid_format_rejection():
    """Test 3: Verify server rejects invalid image formats."""
    print("\n" + "="*60)
    print("TEST 3: Invalid Format Rejection")
    print("="*60)
    
    # Create an invalid data URL
    invalid_screenshot = "data:image/bmp;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    
    feedback_data = {
        "category": "Comment",
        "description": "Testing invalid format rejection",
        "browser": "Test Browser",
        "os": "Test OS",
        "screenResolution": "1920x1080",
        "viewportSize": "1920x1080",
        "url": "http://test.com/phase2",
        "timestamp": "2024-12-20T00:00:00Z",
        "screenshot": invalid_screenshot,
        "clientSessionId": "test_session_phase2_invalid"
    }
    
    print(f"Testing with BMP format (not allowed)")
    
    try:
        response = requests.post(f"{BASE_URL}/api/feedback", json=feedback_data)
        
        if response.status_code == 422:
            print(f"✅ SUCCESS: Server correctly rejected invalid format")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ FAILED: Expected rejection (422), got {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ ERROR: {e}")


def test_screenshot_retrieval(feedback_id):
    """Test 4: Retrieve screenshot using the new endpoint."""
    print("\n" + "="*60)
    print("TEST 4: Screenshot Retrieval Endpoint")
    print("="*60)
    
    if not feedback_id:
        print("⚠️  SKIPPED: No valid feedback_id from previous test")
        return
    
    print(f"Retrieving screenshot for feedback ID: {feedback_id}")
    
    try:
        response = requests.get(f"{BASE_URL}/api/feedback/{feedback_id}/screenshot")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ SUCCESS: Screenshot retrieved successfully")
            print(f"   Size: {result.get('size_kb')} KB")
            print(f"   Created: {result.get('created_at')}")
            print(f"   Screenshot data length: {len(result.get('screenshot_data', ''))} characters")
        else:
            print(f"❌ FAILED: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ ERROR: {e}")


def test_nonexistent_screenshot_retrieval():
    """Test 5: Verify 404 for non-existent screenshot."""
    print("\n" + "="*60)
    print("TEST 5: Non-existent Screenshot Retrieval")
    print("="*60)
    
    fake_id = 999999
    print(f"Attempting to retrieve screenshot for non-existent feedback ID: {fake_id}")
    
    try:
        response = requests.get(f"{BASE_URL}/api/feedback/{fake_id}/screenshot")
        
        if response.status_code == 404:
            print(f"✅ SUCCESS: Server correctly returned 404")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ FAILED: Expected 404, got {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ ERROR: {e}")


def main():
    print("\n" + "🔵"*30)
    print("PHASE 2 SCREENSHOT OPTIMIZATION TESTS")
    print("🔵"*30)
    print(f"\nTesting endpoint: {BASE_URL}")
    
    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL}/docs")
        if response.status_code != 200:
            print(f"\n❌ ERROR: Server not responding at {BASE_URL}")
            print("Please ensure the server is running: python3 -m uvicorn main:app --reload")
            return
    except Exception as e:
        print(f"\n❌ ERROR: Cannot connect to server at {BASE_URL}")
        print(f"   {e}")
        print("Please ensure the server is running: python3 -m uvicorn main:app --reload")
        return
    
    # Run tests
    feedback_id = test_compressed_screenshot_submission()
    test_oversized_screenshot_rejection()
    test_invalid_format_rejection()
    test_screenshot_retrieval(feedback_id)
    test_nonexistent_screenshot_retrieval()
    
    print("\n" + "="*60)
    print("PHASE 2 TESTS COMPLETED")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
