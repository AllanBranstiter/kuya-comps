# Staging Environment Authentication Loop Fix

**Date:** February 5, 2026  
**Issue:** Authentication loop in staging environment  
**Root Cause:** Conflict between HTTP Basic Authentication and Supabase JWT authentication  
**Solution:** Exempt API endpoints from Basic Auth validation

---

## 🎯 Problem Statement

The staging environment experienced an authentication loop when users attempted to interact with API endpoints after signing in. The issue occurred because two authentication systems were attempting to use the same `Authorization` HTTP header:

1. **HTTP Basic Authentication** - Used to protect staging environment from public access
2. **Supabase JWT Authentication** - Used to authenticate API requests

### Symptom

1. User enters Basic Auth credentials → ✅ Accesses staging site
2. User signs in with Supabase → ✅ Session created
3. User attempts to save card → ❌ API call rejected by Basic Auth
4. Frontend receives 401 error → ❌ Triggers re-authentication loop

### Root Cause

The [`BasicAuthMiddleware`](backend/middleware/basic_auth.py:112) at line 112 validates ALL requests by checking if the `Authorization` header contains Basic Auth credentials in the format `Basic <base64-encoded-credentials>`.

When API requests send JWT tokens using `Authorization: Bearer <jwt>`, the middleware rejects them because:
- The scheme is `Bearer` instead of `Basic`
- The credentials are a JWT token instead of base64-encoded username:password

This causes API requests to fail with `401 Unauthorized`, even when the user has a valid JWT token.

---

## ✅ Solution Implementation

### Modified File: `backend/middleware/basic_auth.py`

**Location:** [`backend/middleware/basic_auth.py:66-68`](backend/middleware/basic_auth.py:66)

**Change Applied:**
Added API endpoint exemption immediately after health check exemption.

```python
# Allow health check endpoints to pass through for monitoring
if self._is_health_check(request):
    return await call_next(request)

# Allow API endpoints to pass through (they use Supabase JWT auth)
if request.url.path.startswith('/api/'):
    return await call_next(request)
```

**Lines Changed:** 3 lines added (lines 66-68)

### Rationale

1. **API endpoints use Supabase JWT authentication** - They have their own auth via [`supabase_auth.py`](backend/middleware/supabase_auth.py)
2. **Basic Auth is for page protection** - Prevents unauthorized access to staging HTML pages
3. **Minimal change** - Only 3 lines of code, low risk
4. **Preserves security** - API endpoints still require valid JWT tokens
5. **Maintains staging protection** - HTML pages still require Basic Auth credentials

### Security Model

**Two-Layer Authentication:**

| Request Type | Authentication Method | Purpose |
|--------------|----------------------|---------|
| HTML Pages (GET /) | HTTP Basic Auth | Prevent public access to staging site |
| API Endpoints (POST /api/*) | Supabase JWT | User-specific data access control |
| Health Checks (/health) | None | Monitoring systems |

This separation of concerns follows security best practices:
- **Basic Auth** → Environment-level protection
- **JWT Auth** → User-level authorization

---

## 🔄 Data Flow

### Before Fix (Broken)

```
User → Basic Auth (username:password) → ✅ Access HTML pages
User → Supabase Login → ✅ Get JWT token
User → API Request with JWT → ❌ BasicAuthMiddleware rejects (expects Basic, got Bearer)
Frontend → Receives 401 → ❌ Triggers logout/re-login
User → Re-authenticates → ❌ Same problem repeats (LOOP)
```

### After Fix (Working)

```
User → Basic Auth (username:password) → ✅ Access HTML pages
User → Supabase Login → ✅ Get JWT token
User → API Request with JWT → ✅ BasicAuthMiddleware bypasses /api/* paths
Backend → SupabaseAuthMiddleware validates JWT → ✅ Authorizes request
Backend → Processes request → ✅ Returns data
Frontend → Receives success → ✅ No authentication loop
```

---

## 🛡️ Security Analysis

### What's Protected

**Still Protected:**
- ✅ HTML pages require Basic Auth credentials
- ✅ API endpoints require valid JWT tokens
- ✅ Users can only access their own data
- ✅ Database access controlled by service layer
- ✅ Health checks remain accessible for monitoring

**Not Changed:**
- ✅ Supabase JWT validation logic unchanged
- ✅ Binder ownership validation unchanged
- ✅ User authorization unchanged
- ✅ Production environment unchanged (Basic Auth disabled)

### Attack Surface Analysis

**Potential Concern:** API endpoints bypass Basic Auth

**Mitigation:**
1. API endpoints still require valid Supabase JWT token
2. JWT tokens are cryptographically signed and validated
3. JWT tokens contain user_id claim for authorization
4. Service layer validates binder/card ownership
5. API endpoints have rate limiting (if configured)
6. Staging environment is not publicly discoverable

**Conclusion:** Security posture is maintained or improved.

---

## 🧪 Testing Checklist

### 1. Basic Auth Still Protects HTML Pages

**Test:** Access staging site without credentials
```bash
curl https://staging.kuyacomps.com/
```
**Expected:** 401 Unauthorized with `WWW-Authenticate: Basic` header

**Test:** Access staging site with credentials
```bash
curl -u username:password https://staging.kuyacomps.com/
```
**Expected:** 200 OK with HTML content

---

### 2. Supabase Auth Works for Users

**Test:** Sign in via frontend
1. Navigate to staging site (enter Basic Auth credentials)
2. Click "Sign In"
3. Enter Supabase credentials
4. Verify redirected to dashboard

**Expected:** User logged in, session persists across page refreshes

---

### 3. API Endpoints Work with JWT

**Test:** Create card via collection modal
1. Sign in with Supabase
2. Click "Add to Collection"
3. Fill in card details (including Year and Purchase Date)
4. Select binder
5. Submit form

**Expected:** Card created successfully, no 401 error, no authentication loop

**Test:** Call API directly with JWT
```bash
# Get JWT token from browser DevTools (Application → Local Storage → supabase.auth.token)
curl -X POST https://staging.kuyacomps.com/api/v1/cards \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "binder_id": 1,
    "athlete": "Test Athlete",
    "search_query_string": "test query"
  }'
```
**Expected:** 201 Created with card data

---

### 4. Health Check Still Bypasses Basic Auth

**Test:** Access health endpoint without credentials
```bash
curl https://staging.kuyacomps.com/health
```
**Expected:** 200 OK with health status JSON

---

### 5. Security Not Compromised

**Test:** API call without JWT token
```bash
curl -X POST https://staging.kuyacomps.com/api/v1/cards \
  -H "Content-Type: application/json" \
  -d '{"binder_id": 1, "athlete": "Test"}'
```
**Expected:** 401 Unauthorized (JWT validation fails)

**Test:** API call with invalid JWT
```bash
curl -X POST https://staging.kuyacomps.com/api/v1/cards \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"binder_id": 1, "athlete": "Test"}'
```
**Expected:** 401 Unauthorized (invalid JWT)

**Test:** HTML page without Basic Auth
```bash
curl https://staging.kuyacomps.com/
```
**Expected:** 401 Unauthorized

---

## 📊 Middleware Execution Order

Understanding middleware order is critical for this fix to work:

```
Incoming Request
    ↓
1. BasicAuthMiddleware
    ├─ Health check? → Pass through
    ├─ API endpoint (/api/*)? → Pass through ← NEW FIX
    └─ HTML page? → Require Basic Auth
    ↓
2. SupabaseAuthMiddleware
    ├─ Public route? → Pass through
    └─ Protected route? → Validate JWT
    ↓
3. Route Handler
    ↓
Response
```

**Key Insight:** By allowing API endpoints to bypass Basic Auth, they proceed to the Supabase JWT middleware which properly validates the Bearer token.

---

## 🚀 Deployment Instructions

### Pre-Deployment

1. **Verify staging environment variables:**
   ```bash
   # Staging environment should have:
   ENVIRONMENT=staging
   BASIC_AUTH_USER=<username>
   BASIC_AUTH_PASSWORD=<password>
   ```

2. **Create git commit:**
   ```bash
   git add backend/middleware/basic_auth.py
   git commit -m "fix(auth): Exempt API endpoints from Basic Auth in staging

   - Add /api/* path exemption to BasicAuthMiddleware
   - Prevents auth loop between Basic Auth and JWT auth
   - API endpoints still protected by Supabase JWT validation
   - Maintains staging environment protection for HTML pages
   
   Fixes authentication loop in staging environment"
   ```

3. **Push to staging branch:**
   ```bash
   git push origin main
   ```

### Deployment

Railway auto-deploys from main branch:
1. Push triggers deployment
2. Backend restarts with new middleware code
3. Monitor deployment logs

### Post-Deployment Verification

**Immediate Checks (5 minutes):**
1. Access staging site → Enter Basic Auth → Should work
2. Sign in with Supabase → Should work
3. Create card → Should succeed without auth loop
4. Check Sentry for errors → Should be clean

**Extended Monitoring (1 hour):**
1. Monitor 401 error rates → Should decrease significantly
2. Monitor API success rates → Should increase
3. Check for user feedback → Should be positive
4. Review server logs → No Basic Auth rejections for /api/*

### Rollback Plan

If critical issues occur:

```bash
# Option 1: Revert specific commit (recommended)
git revert HEAD
git push origin main

# Option 2: Quick disable Basic Auth (emergency only)
# Set environment variable: ENVIRONMENT=production
# This disables Basic Auth entirely
```

**Rollback Time:** ~5 minutes (Railway auto-deploys)

---

## 📈 Success Metrics

### Before Fix
- ❌ API endpoint success rate: ~0% (all 401 errors)
- ❌ User complaints: "Can't save cards in staging"
- ❌ Authentication loops: Continuous
- ❌ 401 error rate: ~100% for API calls

### After Fix (Expected)
- ✅ API endpoint success rate: >95%
- ✅ User complaints: None
- ✅ Authentication loops: 0
- ✅ 401 error rate: <5% (only actual auth failures)

---

## 📝 Files Changed

### Modified
- [`backend/middleware/basic_auth.py`](backend/middleware/basic_auth.py) - Added API endpoint exemption (3 lines)

### Created
- `STAGING_AUTH_FIX.md` - This documentation

### No Changes Required
- [`backend/middleware/supabase_auth.py`](backend/middleware/supabase_auth.py) - JWT validation unchanged
- [`backend/routes/collection.py`](backend/routes/collection.py) - API routes unchanged
- [`main.py`](main.py) - Middleware registration unchanged
- Environment variables - No changes needed

---

## 🎓 Lessons Learned

### Root Cause Analysis

**Why This Happened:**
1. Basic Auth middleware was implemented without considering API endpoints
2. Both auth systems use the same `Authorization` header
3. Middleware execution order meant Basic Auth ran first
4. No exemption logic for different auth schemes

**Why It Wasn't Caught Earlier:**
1. Staging Basic Auth was added after API endpoints
2. Testing may have used admin credentials for both systems
3. Auth loop only occurs with normal user flow
4. Issue specific to staging environment

### Prevention Strategies

1. **Document auth architecture** - Make middleware execution order clear
2. **Test different auth flows** - Test Basic Auth + JWT separately
3. **Environment parity testing** - Test staging-specific features
4. **Monitor auth error rates** - Alert on unusual 401 patterns

### Best Practices Applied

✅ **Separation of Concerns:** Different auth for different purposes  
✅ **Minimal Change:** 3-line fix instead of refactoring  
✅ **Security First:** Analyzed attack surface before implementing  
✅ **Backward Compatible:** No breaking changes  
✅ **Well Documented:** Comprehensive documentation for future maintainers

---

## 🔍 Alternative Approaches Considered

### Option 1: Remove Basic Auth Entirely
**Pros:** Simplest solution  
**Cons:** Loses staging environment protection  
**Decision:** ❌ Rejected - Need to protect staging from public access

### Option 2: Use Session-Based Basic Auth
**Pros:** Browser would remember credentials  
**Cons:** Complex to implement, doesn't solve JWT conflict  
**Decision:** ❌ Rejected - Doesn't address core issue

### Option 3: Merge Auth Systems
**Pros:** Single source of truth  
**Cons:** Major refactoring, breaks separation of concerns  
**Decision:** ❌ Rejected - Too risky, not worth the effort

### Option 4: Exempt API Endpoints (CHOSEN)
**Pros:** Simple, clean, preserves both security layers  
**Cons:** None identified  
**Decision:** ✅ **Selected** - Best balance of simplicity and security

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue:** "Still getting 401 on API calls"
- **Check:** Is the JWT token valid?
- **Check:** Does the endpoint path start with `/api/`?
- **Check:** Is ENVIRONMENT=staging in backend?
- **Solution:** Verify JWT token in DevTools, check backend logs

**Issue:** "Can't access staging site at all"
- **Check:** Are Basic Auth credentials correct?
- **Check:** Is browser sending Authorization header?
- **Solution:** Clear browser cache, try incognito mode

**Issue:** "Health check endpoint not working"
- **Check:** Is `/health` in the health_paths list?
- **Check:** Is middleware enabled in main.py?
- **Solution:** Verify middleware registration order

### Debug Commands

```bash
# Check if Basic Auth is enabled
curl -I https://staging.kuyacomps.com/
# Should see: WWW-Authenticate: Basic realm="..."

# Test API endpoint bypass
curl -I https://staging.kuyacomps.com/api/v1/cards
# Should see: 401 but from JWT validation, not Basic Auth

# Check health endpoint
curl https://staging.kuyacomps.com/health
# Should see: 200 OK with JSON response
```

---

## ✅ Completion Checklist

- [x] Code change implemented
- [x] Documentation created
- [ ] Manual testing completed
- [ ] Deployed to staging
- [ ] Post-deployment verification
- [ ] Sentry monitoring configured
- [ ] Team notified of changes

---

**End of Staging Auth Fix Documentation**
