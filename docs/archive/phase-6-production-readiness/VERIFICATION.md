# Phase 6 Implementation Verification Checklist

This document provides step-by-step verification procedures for the Phase 6 implementation.

## Prerequisites

Before testing, ensure you have:
- [ ] Python 3.11+ installed
- [ ] A `.env` file (copy from `.env.example` and fill in values)
- [ ] Valid API keys for SearchAPI and eBay

---

## Step 1: Install Dependencies

```bash
# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install all dependencies
pip install -r requirements.txt

# Expected new packages from Phase 6:
# - sentry-sdk[fastapi]
```

**Verify:**
```bash
pip list | grep sentry
# Should show: sentry-sdk
```

---

## Step 2: Verify Configuration

```bash
# Check environment file exists
test -f .env && echo "✓ .env file exists" || echo "✗ Create .env from .env.example"

# Test configuration validation
python3 -c "from backend.config import validate_config; validate_config(); print('✓ Configuration valid')"
```

**Expected output:**
```
[CONFIG] Environment: development
[CONFIG] Log Level: DEBUG
[CONFIG] Log Format: text
[CONFIG] Redis URL: redis://localhost:6379
[CONFIG] CORS Origins: http://localhost:8000, http://127.0.0.1:8000
✓ Configuration valid
```

---

## Step 3: Test Imports

```bash
# Test all new middleware imports
python3 << 'EOF'
from backend.middleware import RequestIDMiddleware, MetricsMiddleware, SecurityHeadersMiddleware
from backend.middleware.metrics import metrics
from backend.config import (
    get_environment,
    get_cors_origins,
    get_sentry_dsn,
    validate_config
)
print("✓ All imports successful")
EOF
```

---

## Step 4: Start the Application

```bash
# Start the development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Expected startup output:**
```
[CONFIG] Environment: development
[CONFIG] Log Level: DEBUG
[CONFIG] Log Format: text
[CONFIG] Redis URL: redis://localhost:6379
[CONFIG] CORS Origins: http://localhost:8000, http://127.0.0.1:8000
[SENTRY] Error monitoring disabled (no DSN configured)
[CORS] Allowed origins: ['http://localhost:8000', 'http://127.0.0.1:8000']
INFO:     Started server process [xxxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

---

## Step 5: Test Health Endpoints

Open a new terminal and run:

```bash
# Basic health check
curl http://localhost:8000/health
# Expected: {"status":"healthy"}

# Detailed health check
curl http://localhost:8000/health/ready
# Expected: {"status":"healthy","redis":true/false,"database":false}
```

---

## Step 6: Test Metrics Endpoint

```bash
# Get current metrics
curl http://localhost:8000/metrics | jq

# Expected structure:
# {
#   "endpoints": {},
#   "cache": {
#     "hits": 0,
#     "misses": 0,
#     "hit_rate": 0.0
#   },
#   "active_requests": 0
# }
```

---

## Step 7: Test Request ID Middleware

```bash
# Make a request and check for X-Request-ID header
curl -I http://localhost:8000/health

# Expected headers should include:
# X-Request-ID: <uuid>
# X-Response-Time: <time>s
```

---

## Step 8: Test Security Headers

```bash
# Check security headers
curl -I http://localhost:8000/

# Expected headers should include:
# Content-Security-Policy: ...
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
# Referrer-Policy: strict-origin-when-cross-origin
```

---

## Step 9: Test CORS

```bash
# Test CORS preflight
curl -X OPTIONS http://localhost:8000/comps \
  -H "Origin: http://localhost:8000" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Should see Access-Control-* headers in response
```

---

## Step 10: Test Existing Functionality

```bash
# Test comps endpoint (requires valid API keys)
curl "http://localhost:8000/comps?query=mike+trout+2011&pages=1"

# Should still work as before, but now with:
# - X-Request-ID header
# - X-Response-Time header
# - Security headers
# - Request logged with correlation ID
```

---

## Step 11: Verify Metrics Are Updating

```bash
# Make several requests
for i in {1..5}; do
  curl -s http://localhost:8000/health > /dev/null
done

# Check metrics again
curl http://localhost:8000/metrics | jq '.endpoints."/health"'

# Should show:
# {
#   "total_requests": 5,
#   "status_codes": {"200": 5},
#   "avg_response_time_ms": <number>,
#   "p95_response_time_ms": <number>,
#   "error_count": 0,
#   "error_rate": 0
# }
```

---

## Step 12: Test Error Handling

```bash
# Test with invalid input (should trigger validation)
curl "http://localhost:8000/comps?query=&pages=100"

# Expected: 422 Unprocessable Entity with validation error
# Metrics should show error count increased
```

---

## Step 13: Check Logs

Look at the application console output. You should see:

```
[INFO] Request started: GET /health
[INFO] Request completed: GET /health - 200
```

Each log entry should have a request_id if you configured JSON logging.

---

## Step 14: Test Cache Metrics (if Redis running)

```bash
# Make same request twice
curl "http://localhost:8000/comps?query=test&pages=1"
curl "http://localhost:8000/comps?query=test&pages=1"

# Check cache metrics
curl http://localhost:8000/metrics | jq '.cache'

# Should show:
# {
#   "hits": 1,
#   "misses": 1,
#   "hit_rate": 50.0
# }
```

---

## Step 15: Verify Documentation

Check that all documentation files exist and are complete:

```bash
# Check documentation files
ls -la docs/

# Should include:
# - deployment.md
# - database-migration.md
# - runbook.md
# - security-audit.md
```

---

## Common Issues & Solutions

### Issue: "ModuleNotFoundError: No module named 'sentry_sdk'"
**Solution:** Run `pip install -r requirements.txt`

### Issue: "Configuration validation failed"
**Solution:** Check `.env` file has required variables (SEARCH_API_KEY minimum)

### Issue: Redis connection warnings
**Solution:** This is OK - app works without Redis (degraded caching only)

### Issue: CORS errors from browser
**Solution:** Add your origin to CORS_ALLOWED_ORIGINS in .env

---

## Production Verification

If deploying to production:

1. **Environment Variables**
   - [ ] ENVIRONMENT=production
   - [ ] SENTRY_DSN configured
   - [ ] LOG_FORMAT=json
   - [ ] CORS_ALLOWED_ORIGINS set to production domain

2. **Security Headers**
   ```bash
   # Test production deployment
   curl -I https://your-domain.com/
   
   # Should include HSTS header (production only)
   # Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   ```

3. **Sentry**
   - [ ] Verify errors appear in Sentry dashboard
   - [ ] Test by triggering an error

4. **Monitoring**
   - [ ] Set up Sentry alerts
   - [ ] Monitor /metrics endpoint
   - [ ] Review logs in Railway/Render dashboard

---

## Success Criteria

All of the following should be true:

- [x] Application starts without errors
- [x] `/health` returns 200 OK
- [x] `/metrics` returns performance data
- [x] Request ID appears in headers
- [x] Security headers present in responses
- [x] CORS configured (no browser errors)
- [x] Existing endpoints still work
- [x] Documentation complete
- [x] Configuration validation works
- [x] Error monitoring configured (Sentry)

---

## Next Steps After Verification

1. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: implement Phase 6 - Production Readiness
   
   - Add environment configuration and validation
   - Implement Sentry error monitoring
   - Add Request ID middleware for tracing
   - Add performance metrics collection
   - Create deployment documentation
   - Add database migration plan
   - Create operations runbook
   - Configure CORS properly
   - Add security headers middleware
   - Complete security audit"
   ```

2. **Push to Repository**
   ```bash
   git push origin main
   ```

3. **Deploy to Staging** (if available)
   - Test in staging environment first
   - Verify all features work
   - Check Sentry receives events

4. **Deploy to Production**
   - Follow `docs/deployment.md`
   - Set production environment variables
   - Monitor metrics closely
   - Have rollback plan ready

---

## Rollback Plan

If issues are discovered:

```bash
# Revert to previous commit
git revert HEAD

# Or reset to specific commit
git reset --hard <previous-commit-hash>

# Force push (if needed)
git push -f origin main
```

Railway/Render will auto-deploy the reverted version.
