# Production Deployment Guide for Kuya Comps

## Step 1: Railway Deployment

### 1.1 Connect to Railway
1. Go to [railway.app](https://railway.app)
2. Sign in with your GitHub account
3. Click "New Project" → "Deploy from GitHub repo"
4. Select the `AllanBranstiter/kuya-comps` repository

### 1.2 Set Environment Variables in Railway
Go to your Railway project → Settings → Environment Variables and set:

```bash
# REQUIRED - API Keys
SEARCH_API_KEY=your_actual_searchapi_io_key_here
EBAY_APP_ID=your_actual_ebay_app_id_here  
EBAY_DEV_ID=your_actual_ebay_dev_id_here
EBAY_CERT_ID=your_actual_ebay_cert_id_here
EBAY_ENVIRONMENT=production

# REQUIRED - Environment
ENVIRONMENT=production

# OPTIONAL - Monitoring (Recommended)
SENTRY_DSN=your_sentry_dsn_here
ADMIN_PASSWORD=secure_password_here

# OPTIONAL - Rate Limiting
RATE_LIMIT_PER_MINUTE=10

# Note: REDIS_URL will be auto-provided by Railway when you add Redis service
```

### 1.3 Add Redis Service
1. In Railway dashboard, click "New" → "Database" → "Add Redis"
2. Redis will auto-connect and provide REDIS_URL environment variable

### 1.4 Deploy
1. Click "Deploy" in Railway dashboard
2. Monitor deployment logs
3. Once deployed, note your production URL (format: `https://kuya-comps-production.up.railway.app`)

## Step 2: Test Production Deployment

### 2.1 Health Check
```bash
curl https://your-railway-url.up.railway.app/health
# Expected: {"status": "healthy", ...}
```

### 2.2 Basic API Test (if you have API keys)
```bash
curl "https://your-railway-url.up.railway.app/comps?query=test&pages=1"
# Expected: JSON response with cards data
```

## Step 3: Update SDK Configuration

After getting your production URL, update the SDK:

1. Edit `/Users/allanbranstiter/Desktop/kuya-comps-integration/kuyacompssdk/config.py`
2. Update the `DEFAULT_ENDPOINT` with your actual Railway URL

## Step 4: Final Validation

Run the SDK integration tests against production:
```bash
cd /Users/allanbranstiter/Desktop/kuya-comps-integration
export KUYA_COMPS_ENDPOINT=https://your-railway-url.up.railway.app
export ENVIRONMENT=production
python3 integration_test.py
```

## Ready for Production! 🚀

Your Kuya Comps app will be live and the SDK integration complete!