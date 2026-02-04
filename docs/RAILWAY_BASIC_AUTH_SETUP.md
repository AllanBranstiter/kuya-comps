# Railway Basic Authentication Setup Guide

This guide explains how to configure HTTP Basic Authentication for your staging environment while keeping production publicly accessible.

## Overview

The application now includes conditional Basic Authentication that:
- **Activates ONLY** when `ENVIRONMENT=staging`
- **Does NOT activate** when `ENVIRONMENT=production`
- Protects the entire staging site with username/password
- Allows health check endpoints (`/health`, `/healthz`, `/metrics`) to pass through for monitoring

## Railway Environment Variables Setup

### For Staging Environment

In your Railway **staging** project/service, set these environment variables:

```bash
# Required: Set environment to staging
ENVIRONMENT=staging

# Required: Basic Auth credentials
BASIC_AUTH_USER=your_username_here
BASIC_AUTH_PASSWORD=your_secure_password_here
```

**Recommended credentials:**
- Username: Choose something memorable (e.g., `kuyacomps`, `staging`, or your team name)
- Password: Use a strong password (min 12 characters, mix of letters, numbers, symbols)
- Example: `BASIC_AUTH_USER=kuyacomps` and `BASIC_AUTH_PASSWORD=St@ging2026Secure!`

### For Production Environment

In your Railway **production** project/service, set:

```bash
# Required: Set environment to production
ENVIRONMENT=production

# Optional: Leave Basic Auth variables empty or unset
# BASIC_AUTH_USER=    (not needed, can be blank or omitted)
# BASIC_AUTH_PASSWORD=  (not needed, can be blank or omitted)
```

> **Important:** Even if you accidentally set `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` in production, they will be **ignored** because `ENVIRONMENT=production`. The middleware only activates for `ENVIRONMENT=staging`.

## Step-by-Step Railway Configuration

### Setting Environment Variables in Railway

1. **Go to your Railway project dashboard**
   - Navigate to https://railway.app/
   - Select your project

2. **Select the staging service**
   - Click on your staging deployment/service

3. **Open the Variables tab**
   - Click on "Variables" in the service menu

4. **Add the staging variables**
   - Click "New Variable" or "Raw Editor"
   - Add each variable:
     ```
     ENVIRONMENT=staging
     BASIC_AUTH_USER=your_username
     BASIC_AUTH_PASSWORD=your_password
     ```

5. **Deploy the changes**
   - Railway will automatically redeploy when you save variables
   - Wait for deployment to complete

6. **Repeat for production**
   - Select your production service
   - Set only: `ENVIRONMENT=production`
   - Leave Basic Auth variables unset

## Testing Your Setup

### Test Staging Environment

1. **Visit your staging URL** (e.g., `https://your-staging-app.up.railway.app`)
2. **You should see a browser authentication prompt**
   - Title: "Kuya Comps Staging Environment"
   - Enter your `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD`
3. **After authentication:** The site should load normally
4. **Test health endpoints:** These should work without authentication
   - `https://your-staging-app.up.railway.app/health`
   - `https://your-staging-app.up.railway.app/metrics`

### Test Production Environment

1. **Visit your production URL** (e.g., `https://your-production-app.up.railway.app`)
2. **You should NOT see an authentication prompt**
3. **The site should load immediately** and be publicly accessible

## Troubleshooting

### Staging Environment Issues

**Problem:** No authentication prompt appears in staging
- **Solution:** Check that `ENVIRONMENT=staging` is set correctly
- **Check logs:** Look for `[BASIC_AUTH] Enabled for staging environment` in Railway logs

**Problem:** "Unauthorized" error even with correct credentials
- **Solution:** Verify `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are set correctly
- **Check:** Make sure there are no extra spaces in the credentials

**Problem:** Authentication prompt appears but credentials don't work
- **Solution:** Try these steps:
  1. Double-check spelling of username and password in Railway
  2. Re-deploy the service to ensure variables are loaded
  3. Check Railway logs for `[BASIC_AUTH] Invalid authorization header` messages

### Production Environment Issues

**Problem:** Authentication prompt appears in production
- **Solution:** Verify `ENVIRONMENT=production` is set (not `staging`)
- **Check:** Railway deployment should show environment variable

### Health Check Issues

**Problem:** Railway health checks failing with 401 Unauthorized
- **Solution:** This shouldn't happen - health check endpoints are whitelisted
- **Check:** Verify you're using standard health check paths: `/health`, `/healthz`, or `/metrics`
- **Check logs:** Look for authentication bypass messages in logs

## Security Best Practices

1. **Use strong passwords** for staging credentials
   - Minimum 12 characters
   - Mix uppercase, lowercase, numbers, and symbols

2. **Don't commit credentials** to your repository
   - Credentials are only set in Railway environment variables
   - Never add them to `.env` files in git

3. **Share credentials securely**
   - Use a password manager to share with your team
   - Don't send via email or Slack in plain text

4. **Rotate credentials periodically**
   - Change staging password every few months
   - Update in Railway when you rotate

5. **Use different credentials** for different staging environments
   - If you have multiple staging deployments
   - Makes it easier to track access

## How It Works

The implementation uses:
- **Environment-based activation:** Only turns on when `ENVIRONMENT=staging`
- **HTTP Basic Authentication:** Standard browser authentication (RFC 7617)
- **Middleware pattern:** Integrated into FastAPI's middleware chain
- **Health check bypass:** Monitoring endpoints are always accessible
- **Constant-time comparison:** Protects against timing attacks on passwords

## Files Modified

- [`backend/middleware/basic_auth.py`](../backend/middleware/basic_auth.py) - Main authentication middleware
- [`backend/middleware/__init__.py`](../backend/middleware/__init__.py) - Middleware exports
- [`backend/config.py`](../backend/config.py) - Configuration helpers
- [`main.py`](../main.py) - Middleware integration
- [`.env.example`](../.env.example) - Environment variable documentation

## Additional Notes

- **Same codebase, different behavior:** The exact same code deploys to both staging and production, but behaves differently based on the `ENVIRONMENT` variable
- **No additional packages needed:** Uses Python's built-in `secrets` and `base64` modules
- **Railway-agnostic:** This works on any hosting platform, not just Railway
- **Browser caching:** Browsers remember credentials during a session, so you won't need to re-enter them on every page

## Questions or Issues?

If you encounter any problems with Basic Authentication:
1. Check Railway deployment logs for `[BASIC_AUTH]` messages
2. Verify environment variables are set correctly in Railway dashboard
3. Test health check endpoints to ensure they're not blocked
4. Try in an incognito/private browser window to clear cached credentials
