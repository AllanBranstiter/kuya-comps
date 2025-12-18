# Operations Runbook

This runbook provides step-by-step procedures for common operational tasks and troubleshooting for Kuya Comps.

## Table of Contents

- [System Overview](#system-overview)
- [Health Checks](#health-checks)
- [Common Issues](#common-issues)
- [Monitoring Dashboards](#monitoring-dashboards)
- [Escalation Procedures](#escalation-procedures)
- [Maintenance Tasks](#maintenance-tasks)

---

## System Overview

### Architecture

```
┌─────────────┐
│   Users     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  FastAPI Application (Railway)  │
│  - Main API                     │
│  - Static File Serving          │
│  - Rate Limiting                │
└────────┬─────────────┬──────────┘
         │             │
         ▼             ▼
   ┌─────────┐   ┌──────────────┐
   │  Redis  │   │ External APIs │
   │  Cache  │   │ - SearchAPI   │
   └─────────┘   │ - eBay API    │
                 └──────────────┘
```

### Key Components

1. **FastAPI Application**: Main application server
2. **Redis**: In-memory caching layer
3. **SearchAPI.io**: Sold listings data provider
4. **eBay Browse API**: Active listings data provider
5. **Sentry**: Error monitoring and alerting

### Service URLs

| Environment | URL | Purpose |
|-------------|-----|---------|
| Production | `https://kuya-comps.up.railway.app` | Live application |
| Staging | `https://kuya-comps-staging.up.railway.app` | Testing |
| Metrics | `/metrics` | Performance metrics |
| Health | `/health` | Basic health check |
| Health Ready | `/health/ready` | Dependency health |

---

## Health Checks

### Quick Health Check

```bash
# Check if application is running
curl https://your-domain.com/health

# Expected response:
# {"status": "healthy"}
```

### Detailed Health Check

```bash
# Check all dependencies
curl https://your-domain.com/health/ready

# Expected response:
# {
#   "status": "healthy",
#   "redis": true,
#   "database": false  # Optional, if database added
# }
```

### Performance Metrics

```bash
# Get current metrics
curl https://your-domain.com/metrics

# Response includes:
# - Request counts by endpoint
# - Response times (avg, p95)
# - Cache hit rate
# - Error counts
```

### Expected Metrics (Healthy System)

- **Response Time P95**: < 2000ms
- **Cache Hit Rate**: > 40% (after warm-up)
- **Error Rate**: < 1%
- **Active Requests**: < 10

---

## Common Issues

### Issue 1: Application Won't Start

**Symptoms:**
- Deployment fails
- Health check returns 503
- Logs show configuration errors

**Diagnosis:**

```bash
# Check Railway/Render logs
railway logs

# Look for:
# - Missing environment variables
# - Python import errors
# - Configuration validation failures
```

**Resolution:**

1. **Verify Environment Variables**:
   ```bash
   # Required variables
   SEARCH_API_KEY=xxx
   EBAY_APP_ID=xxx
   EBAY_DEV_ID=xxx
   EBAY_CERT_ID=xxx
   ```

2. **Check Logs for Specific Error**:
   - Look for `[ERROR] Configuration validation failed`
   - Fix the specific missing variable

3. **Restart Service**:
   ```bash
   railway restart
   ```

**Prevention:**
- Always test deployment in staging first
- Verify `.env` file matches `.env.example`

---

### Issue 2: Slow Response Times

**Symptoms:**
- Users report slow searches
- `/metrics` shows high response times (> 5s)
- Timeout errors in logs

**Diagnosis:**

```bash
# Check metrics
curl https://your-domain.com/metrics | jq '.endpoints'

# Look for:
# - High p95_response_time_ms values
# - Low cache hit rate
# - High error counts
```

**Resolution:**

1. **Check Cache Status**:
   ```bash
   # Verify Redis is connected
   curl https://your-domain.com/health/ready
   
   # If Redis is down, requests will be slow
   ```

2. **Check External APIs**:
   - Verify SearchAPI.io status: https://status.searchapi.io
   - Check eBay API status: https://developer.ebay.com/status
   - API rate limits may be hit

3. **Scale Resources**:
   ```bash
   # Railway: Increase resources
   # Settings → Resources → Scale up
   
   # Or increase workers
   WEB_CONCURRENCY=8  # From 4
   ```

4. **Clear Cache if Stale**:
   - Redis may have stale/large cached values
   - Consider Redis restart or FLUSHDB (use cautiously)

**Prevention:**
- Monitor `/metrics` regularly
- Set up Sentry performance alerts
- Configure appropriate cache TTLs

---

### Issue 3: Redis Connection Failed

**Symptoms:**
- Cache hit rate = 0%
- Logs show: "Redis cache unavailable"
- `/health/ready` shows `redis: false`

**Diagnosis:**

```bash
# Check Redis status in Railway/Render
railway status redis

# Test Redis connection
redis-cli -h <hostname> -p <port> PING
```

**Resolution:**

1. **Verify REDIS_URL**:
   ```bash
   # Check environment variable is set correctly
   echo $REDIS_URL
   
   # Should be: redis://user:password@host:port
   ```

2. **Restart Redis**:
   - Railway: Restart Redis service
   - Render: Check Redis dashboard

3. **Check Network**:
   - Verify app can reach Redis
   - Check firewall rules
   - Verify Redis is in same region

4. **Fallback to No-Cache**:
   - Application designed to work without Redis
   - Performance will be degraded but functional

**Prevention:**
- Monitor Redis uptime
- Set up alerts for Redis failures
- Consider Redis clustering for HA

---

### Issue 4: API Rate Limit Exceeded

**Symptoms:**
- Errors: "SearchAPI rate limit exceeded"
- Errors: "eBay API quota exceeded"
- Search results show errors

**Diagnosis:**

```bash
# Check logs for rate limit errors
railway logs | grep -i "rate limit"

# Check metrics for request volume
curl https://your-domain.com/metrics
```

**Resolution:**

1. **SearchAPI.io Limits**:
   ```bash
   # Check quota at https://www.searchapi.io/dashboard
   # Free tier: 100 requests/month
   # Paid tier: Varies by plan
   
   # Temporary fix: Reduce searches
   # Long-term: Upgrade plan or increase caching
   ```

2. **eBay API Limits**:
   ```bash
   # Check limits: https://developer.ebay.com/api-docs/static/rate-limiting.html
   # Standard: 5000 calls/day
   
   # Temporary fix: Use SearchAPI more
   # Long-term: Request limit increase
   ```

3. **Application Rate Limiting**:
   ```bash
   # Reduce user rate limit temporarily
   RATE_LIMIT_PER_MINUTE=5  # From 10
   ```

4. **Increase Cache TTL**:
   ```python
   # In backend/config.py
   CACHE_TTL_SOLD = 3600  # 1 hour instead of 30 min
   CACHE_TTL_ACTIVE = 600  # 10 min instead of 5 min
   ```

**Prevention:**
- Monitor API usage in dashboards
- Set up alerts for approaching limits
- Aggressive caching strategy
- Consider higher API tier

---

### Issue 5: High Error Rate

**Symptoms:**
- `/metrics` shows high error_count
- Sentry showing many errors
- Users report failed searches

**Diagnosis:**

```bash
# Check Sentry dashboard
# https://sentry.io/organizations/your-org/issues/

# Check metrics
curl https://your-domain.com/metrics | jq '.endpoints'

# Check logs
railway logs | grep ERROR
```

**Resolution:**

1. **Identify Error Type**:
   - Check Sentry for error patterns
   - Look for common request IDs (X-Request-ID header)

2. **Common Error Fixes**:
   
   **ValidationError**:
   ```python
   # Users sending invalid queries
   # Already handled with 422 responses
   # May need to improve frontend validation
   ```
   
   **APIKeyMissingError**:
   ```bash
   # Check API keys are set
   railway variables
   ```
   
   **ScraperError**:
   ```python
   # External API issues
   # Check API status pages
   # May need to implement retry logic
   ```

3. **Deploy Fix**:
   ```bash
   git commit -m "Fix: [error description]"
   git push origin main
   # Railway auto-deploys
   ```

**Prevention:**
- Set up Sentry alerts
- Monitor error rates daily
- Implement comprehensive error handling

---

### Issue 6: Memory Usage High

**Symptoms:**
- Application crashes with OOM (Out of Memory)
- Slow performance
- Railway shows memory warnings

**Diagnosis:**

```bash
# Check Railway metrics dashboard
# Monitor memory usage over time

# Check for memory leaks
# Look for growing cache sizes
curl https://your-domain.com/metrics
```

**Resolution:**

1. **Immediate Fix - Restart**:
   ```bash
   railway restart
   ```

2. **Check Worker Count**:
   ```bash
   # Reduce workers if memory is limited
   WEB_CONCURRENCY=2  # From 4
   ```

3. **Clear Redis**:
   ```bash
   # If Redis cache is huge
   redis-cli DBSIZE  # Check size
   redis-cli FLUSHDB  # Clear (use cautiously)
   ```

4. **Optimize Code**:
   - Check for memory leaks in recent changes
   - Review large data structures
   - Implement pagination for large results

5. **Scale Resources**:
   - Railway: Upgrade to plan with more RAM
   - Render: Scale to larger instance

**Prevention:**
- Monitor memory usage trends
- Set reasonable cache limits
- Implement cache eviction policies
- Code review for memory-intensive operations

---

## Monitoring Dashboards

### Sentry Dashboard

**URL**: https://sentry.io/organizations/your-org/

**Key Metrics**:
- Error frequency and trends
- Performance metrics (response times)
- User impact (affected users)
- Release tracking

**Alerts**:
- Email notifications for new issues
- Slack integration for critical errors
- Performance degradation alerts

### Railway Dashboard

**URL**: https://railway.app/project/your-project

**Key Metrics**:
- CPU usage
- Memory usage
- Network traffic
- Deployment history
- Environment variables

**Alerts**:
- Deployment failures
- Resource usage warnings
- Service downtime

### Application Metrics

**URL**: https://your-domain.com/metrics

**Key Metrics**:
```json
{
  "endpoints": {
    "/comps": {
      "total_requests": 1234,
      "avg_response_time_ms": 450,
      "p95_response_time_ms": 1200,
      "error_rate": 0.5
    }
  },
  "cache": {
    "hits": 500,
    "misses": 234,
    "hit_rate": 68.12
  }
}
```

---

## Escalation Procedures

### Severity Levels

#### P1 - Critical (Immediate Response)
- Application completely down
- Data breach or security incident
- All users affected

**Response Time**: 15 minutes  
**Actions**:
1. Acknowledge incident
2. Assess impact
3. Engage on-call engineer
4. Begin troubleshooting
5. Post status updates every 30 min

#### P2 - High (1 Hour Response)
- Partial outage
- Critical feature broken
- Multiple users affected

**Response Time**: 1 hour  
**Actions**:
1. Investigate issue
2. Determine workaround
3. Deploy fix or rollback
4. Monitor closely

#### P3 - Medium (4 Hour Response)
- Minor feature broken
- Single user affected
- Degraded performance

**Response Time**: 4 hours  
**Actions**:
1. Create ticket
2. Schedule fix
3. Communicate with user

#### P4 - Low (Next Business Day)
- Cosmetic issues
- Feature requests
- Documentation updates

**Response Time**: Next business day  
**Actions**:
1. Add to backlog
2. Prioritize accordingly

### Contact List

```
On-Call Engineer: [Phone/Email]
DevOps Lead: [Phone/Email]
Product Owner: [Phone/Email]
```

### Incident Communication Template

```
**Incident**: [Brief description]
**Status**: Investigating / Identified / Monitoring / Resolved
**Impact**: [Number of users affected]
**Started**: [Timestamp]
**Next Update**: [ETA]

**Details**:
[What happened, what's being done]

**Workaround** (if available):
[Steps users can take]
```

---

## Maintenance Tasks

### Daily Tasks

1. **Check Health**:
   ```bash
   curl https://your-domain.com/health
   curl https://your-domain.com/health/ready
   ```

2. **Review Metrics**:
   - Visit `/metrics`
   - Check error rates
   - Monitor response times

3. **Check Sentry**:
   - Review new errors
   - Triage and assign

### Weekly Tasks

1. **Review Performance**:
   - Analyze `/metrics` trends
   - Identify slow endpoints
   - Optimize if needed

2. **Update Dependencies**:
   ```bash
   pip list --outdated
   pip install --upgrade [package]
   ```

3. **Review Logs**:
   - Check for patterns
   - Identify potential issues
   - Clean up old logs

4. **Backup Check**:
   - Verify automated backups running
   - Test restore procedure (monthly)

### Monthly Tasks

1. **Security Updates**:
   ```bash
   # Update all dependencies
   pip install --upgrade -r requirements.txt
   
   # Run security audit
   pip-audit
   ```

2. **Cost Review**:
   - Review Railway/Render billing
   - Check API usage costs
   - Optimize resources

3. **Performance Review**:
   - Analyze 30-day metrics
   - Identify optimization opportunities
   - Update capacity planning

4. **Documentation Update**:
   - Update runbook with new issues
   - Review deployment docs
   - Update API documentation

### Quarterly Tasks

1. **Disaster Recovery Test**:
   - Test full backup restore
   - Verify rollback procedures
   - Update DR plan

2. **Capacity Planning**:
   - Review growth trends
   - Plan resource scaling
   - Budget for next quarter

3. **Security Audit**:
   - Review access controls
   - Rotate API keys
   - Check for vulnerabilities

---

## Emergency Procedures

### Complete Outage

1. **Assess Scope**:
   ```bash
   # Check all services
   railway status
   curl https://your-domain.com/health
   ```

2. **Check Recent Changes**:
   ```bash
   git log --oneline -5
   # Any recent deployments?
   ```

3. **Rollback if Needed**:
   - Railway: Redeploy previous version
   - Or: `git revert HEAD && git push`

4. **Communicate**:
   - Post status page update
   - Notify stakeholders
   - Update every 30 minutes

5. **Resolve**:
   - Fix root cause
   - Test thoroughly
   - Deploy fix
   - Monitor closely

### Data Loss Prevention

1. **Never run** without confirmation:
   ```bash
   # DANGEROUS
   redis-cli FLUSHDB
   rm -rf data/
   ```

2. **Always backup first**:
   ```bash
   # Create backup
   railway backup create
   
   # Then proceed with caution
   ```

3. **Use transactions**:
   ```bash
   # For database changes
   BEGIN;
   -- changes
   COMMIT;  # or ROLLBACK
   ```

---

## Quick Reference

### Common Commands

```bash
# View logs
railway logs

# Restart service
railway restart

# Check environment
railway variables

# Deploy
git push origin main

# Connect to Redis
railway connect redis

# Check metrics
curl https://your-domain.com/metrics | jq

# Test endpoint
curl -X GET "https://your-domain.com/comps?query=mike+trout+2011&pages=1"
```

### Important URLs

- Health: `/health`
- Metrics: `/metrics`
- Sentry: https://sentry.io
- Railway: https://railway.app
- SearchAPI: https://www.searchapi.io
- eBay Dev: https://developer.ebay.com

### Support Resources

- Deployment Guide: `docs/deployment.md`
- Database Migration: `docs/database-migration.md`
- GitHub Issues: `https://github.com/your-repo/issues`
- Railway Docs: https://docs.railway.app
- Render Docs: https://render.com/docs
