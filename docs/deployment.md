# Deployment Guide

This guide covers deploying Kuya Comps to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Railway Deployment](#railway-deployment)
- [Render Deployment](#render-deployment)
- [Docker Deployment](#docker-deployment)
- [Post-Deployment Checklist](#post-deployment-checklist)
- [Rollback Procedure](#rollback-procedure)

---

## Prerequisites

Before deploying, ensure you have:

1. **API Keys**:
   - SearchAPI.io API key (required)
   - eBay API credentials: App ID, Dev ID, Cert ID (recommended)
   - Sentry DSN (optional but recommended for production)

2. **Infrastructure**:
   - Redis instance (Railway/Render provide managed Redis)
   - PostgreSQL (optional, for future database features)

3. **Domain** (optional):
   - Custom domain configured in your hosting provider
   - SSL certificate (automatically provided by Railway/Render)

---

## Environment Variables

All required environment variables are documented in `.env.example`. The minimum required variables for production are:

### Required Variables

```bash
# Environment
ENVIRONMENT=production

# API Keys
SEARCH_API_KEY=your_actual_searchapi_key
EBAY_APP_ID=your_ebay_app_id
EBAY_DEV_ID=your_ebay_dev_id
EBAY_CERT_ID=your_ebay_cert_id
EBAY_ENVIRONMENT=production

# Redis (provided by hosting platform)
REDIS_URL=redis://user:password@host:port
```

### Recommended Variables

```bash
# Error Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Optional Variables

```bash
# Rate Limiting
RATE_LIMIT_PER_MINUTE=10

# Affiliate
EBAY_CAMPAIGN_ID=your_campaign_id
EBAY_ENABLE_AFFILIATE=true

# Server
WEB_CONCURRENCY=4
```

---

## Railway Deployment

Railway provides the easiest deployment experience with automatic builds and managed infrastructure.

### Step 1: Connect Repository

1. Go to [Railway](https://railway.app/)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `kuya-comps` repository
5. Railway will automatically detect the Python application

### Step 2: Add Redis

1. In your Railway project, click "New"
2. Select "Database" → "Redis"
3. Railway will automatically set the `REDIS_URL` environment variable

### Step 3: Configure Environment Variables

1. Go to your service settings
2. Click "Variables" tab
3. Add all required environment variables from above
4. Click "Deploy" to apply changes

### Step 4: Configure Domain (Optional)

1. Go to "Settings" → "Domains"
2. Click "Generate Domain" for a Railway domain
3. Or add your custom domain

### Step 5: Verify Deployment

1. Check the deployment logs for errors
2. Visit `/health` endpoint to verify app is running
3. Visit `/metrics` to check application metrics
4. Test a search query through the UI

### Railway Configuration Files

The following files configure Railway deployment:

- **`Procfile`**: Specifies the command to run the app
  ```
  web: gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app
  ```

- **`runtime.txt`**: Specifies Python version
  ```
  python-3.11.6
  ```

- **`railway.json`** or **`railway.toml`**: Additional Railway configuration (if present)

---

## Render Deployment

Render is another excellent platform for deploying Python applications.

### Step 1: Create Web Service

1. Go to [Render](https://render.com/)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: kuya-comps
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app`

### Step 2: Add Redis

1. Click "New" → "Redis"
2. Choose a plan (free tier available)
3. Copy the Internal Redis URL
4. Add it to your web service as `REDIS_URL`

### Step 3: Environment Variables

1. In your web service, go to "Environment"
2. Add all required variables
3. Click "Save Changes"

### Step 4: Deploy

1. Render will automatically deploy on git push
2. Monitor deployment in the logs
3. Verify at your Render URL

---

## Docker Deployment

For self-hosted deployments or other platforms.

### Create Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Start application
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "main:app"]
```

### Build and Run

```bash
# Build image
docker build -t kuya-comps .

# Run container
docker run -d \
  -p 8000:8000 \
  -e SEARCH_API_KEY=your_key \
  -e EBAY_APP_ID=your_app_id \
  -e EBAY_DEV_ID=your_dev_id \
  -e EBAY_CERT_ID=your_cert_id \
  -e REDIS_URL=redis://redis:6379 \
  -e ENVIRONMENT=production \
  --name kuya-comps \
  kuya-comps
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=production
      - REDIS_URL=redis://redis:6379
      - SEARCH_API_KEY=${SEARCH_API_KEY}
      - EBAY_APP_ID=${EBAY_APP_ID}
      - EBAY_DEV_ID=${EBAY_DEV_ID}
      - EBAY_CERT_ID=${EBAY_CERT_ID}
      - SENTRY_DSN=${SENTRY_DSN}
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

Run with:

```bash
docker-compose up -d
```

---

## Post-Deployment Checklist

After deploying, verify the following:

### Health Checks

- [ ] `/health` returns 200 OK
- [ ] `/health/ready` shows Redis connectivity
- [ ] `/health/live` confirms app is running

### Functionality

- [ ] Home page loads correctly
- [ ] Search for sold comps works
- [ ] Search for active listings works
- [ ] FMV calculations display correctly
- [ ] Charts and visualizations render

### Performance

- [ ] `/metrics` endpoint is accessible
- [ ] Response times are acceptable (< 2s p95)
- [ ] Cache hit rate is > 0% after some usage
- [ ] No memory leaks after 24 hours

### Monitoring

- [ ] Sentry is receiving events (test with intentional error)
- [ ] Logs are being captured
- [ ] Metrics are being tracked
- [ ] Request IDs appear in logs and headers

### Security

- [ ] HTTPS is enforced
- [ ] CORS is configured correctly
- [ ] API keys are not exposed in frontend
- [ ] Security headers are present
- [ ] Rate limiting is working

---

## Rollback Procedure

If a deployment causes issues, follow these steps to rollback:

### Railway Rollback

1. Go to your service deployments
2. Find the last working deployment
3. Click "Redeploy"
4. Monitor logs to ensure stability

### Render Rollback

1. Go to "Events" tab
2. Find the last successful deploy
3. Click "Rollback to this version"
4. Verify in logs

### Docker Rollback

```bash
# Stop current container
docker stop kuya-comps

# Remove current container
docker rm kuya-comps

# Run previous image version
docker run -d \
  -p 8000:8000 \
  --env-file .env \
  --name kuya-comps \
  kuya-comps:previous-tag
```

### Manual Rollback (Git)

```bash
# Revert to previous commit
git revert HEAD

# Or reset to specific commit
git reset --hard <commit-hash>

# Force push (use with caution)
git push -f origin main
```

### Verification After Rollback

1. Check `/health` endpoint
2. Test core functionality
3. Monitor error rates
4. Review logs for issues
5. Notify team of rollback

---

## Troubleshooting

### Common Issues

**Issue**: Application won't start

- Check environment variables are set correctly
- Verify Python version matches `runtime.txt`
- Check logs for configuration validation errors

**Issue**: Redis connection fails

- Verify `REDIS_URL` is correct
- Check Redis instance is running
- App should still work with degraded caching

**Issue**: Slow response times

- Check `/metrics` for slow endpoints
- Verify Redis cache is being used
- Review Sentry performance monitoring
- Consider increasing workers (`WEB_CONCURRENCY`)

**Issue**: Rate limiting too aggressive

- Adjust `RATE_LIMIT_PER_MINUTE` environment variable
- Check for bot traffic in logs

---

## Support

For deployment issues:

1. Check the logs first
2. Review `/metrics` endpoint
3. Check Sentry for errors
4. Consult [Railway docs](https://docs.railway.app/) or [Render docs](https://render.com/docs)
5. See `docs/runbook.md` for operational guidance
