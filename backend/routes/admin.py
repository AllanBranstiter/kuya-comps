# backend/routes/admin.py
"""
Admin API routes for subscription analytics and monitoring.

Provides admin-only endpoints for:
- Key metrics dashboard (MRR, users, conversion, churn)
- Revenue analytics
- User analytics
- Feature usage stats
- Webhook monitoring
- Failed payments tracking
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date
from typing import Optional, List, Dict, Any
import csv
import io

from backend.middleware.admin_gate import get_current_admin_required, log_admin_action
from backend.analytics.subscription_queries import (
    calculate_mrr,
    calculate_arr,
    get_conversion_rate,
    get_churn_rate,
    get_arpu,
    get_customer_lifetime_value,
    get_cohort_retention,
    get_upgrade_funnel,
    get_revenue_trend,
    get_supabase_client
)
from backend.database.connection import get_db
from backend.database.schema import Card, Binder
from backend.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ============================================================================
# Helper Functions
# ============================================================================

def parse_date_range(period: str = "7d") -> tuple[str, str]:
    """
    Parse period string into date range.
    
    Args:
        period: Period string (7d, 30d, 90d, custom)
        
    Returns:
        Tuple of (start_date, end_date) in ISO format
    """
    end_date = datetime.now()
    
    if period == "7d":
        start_date = end_date - timedelta(days=7)
    elif period == "30d":
        start_date = end_date - timedelta(days=30)
    elif period == "90d":
        start_date = end_date - timedelta(days=90)
    elif period == "1y":
        start_date = end_date - timedelta(days=365)
    else:
        # Default to 30 days
        start_date = end_date - timedelta(days=30)
    
    return (start_date.isoformat(), end_date.isoformat())


# ============================================================================
# Admin Dashboard Endpoints
# ============================================================================

@router.get("/metrics/overview")
async def get_metrics_overview(
    period: str = Query("30d", description="Time period: 7d, 30d, 90d, 1y"),
    admin: dict = Depends(get_current_admin_required)
):
    """
    Get key metrics for admin dashboard overview.
    
    **Admin Only** - Requires admin authentication
    
    **Returns:**
    - `mrr`: Current Monthly Recurring Revenue
    - `mrr_change`: % change from previous period
    - `arr`: Annual Recurring Revenue
    - `total_users`: Total number of users
    - `users_by_tier`: Breakdown by tier (free, member, founder)
    - `conversion_rate`: Free to paid conversion %
    - `churn_rate`: Monthly churn percentage
    - `arpu`: Average Revenue Per User
    - `clv`: Customer Lifetime Value
    """
    logger.info(f"[ADMIN] Metrics overview requested by {admin.get('sub')} for period {period}")
    
    try:
        await log_admin_action(admin.get('sub'), 'view_metrics_overview', {'period': period})
        
        date_range = parse_date_range(period)
        
        # Calculate MRR
        mrr_df = calculate_mrr(date_range)
        current_mrr = mrr_df['mrr'].iloc[0]
        member_mrr = mrr_df['member_mrr'].iloc[0]
        founder_mrr = mrr_df['founder_mrr'].iloc[0]
        active_subs = mrr_df['active_subscriptions'].iloc[0]
        
        # Calculate ARR
        arr = calculate_arr(date_range)
        
        # Get conversion rate
        conversion_data = get_conversion_rate(date_range)
        
        # Get churn rate
        churn_data = get_churn_rate(date_range)
        
        # Get ARPU
        arpu = get_arpu(date_range)
        
        # Get CLV
        clv_data = get_customer_lifetime_value()
        
        # Calculate MRR change (compare to previous period)
        # For now, set to 0 - would need historical data
        mrr_change = 0.0
        
        return {
            'mrr': current_mrr,
            'mrr_change': mrr_change,
            'mrr_by_tier': {
                'member': member_mrr,
                'founder': founder_mrr
            },
            'arr': arr,
            'total_users': conversion_data['total_users'],
            'users_by_tier': {
                'free': conversion_data['free_users'],
                'member': 0,  # Would need to query Supabase
                'founder': 0,  # Would need to query Supabase
                'paid': conversion_data['paid_users']
            },
            'conversion_rate': conversion_data['conversion_rate'],
            'churn_rate': churn_data['churn_rate'],
            'arpu': arpu,
            'clv': clv_data['clv'],
            'active_subscriptions': active_subs,
            'period': period,
            'date_range': {
                'start': date_range[0],
                'end': date_range[1]
            }
        }
        
    except Exception as e:
        logger.error(f"[ADMIN] Error fetching metrics overview: {e}")
        raise HTTPException(500, f"Error fetching metrics: {str(e)}")


@router.get("/metrics/revenue")
async def get_revenue_metrics(
    period: str = Query("30d", description="Time period: 7d, 30d, 90d, 1y"),
    admin: dict = Depends(get_current_admin_required)
):
    """
    Get detailed revenue analytics.
    
    **Admin Only** - Requires admin authentication
    
    **Returns:**
    - `daily_trend`: Daily MRR trend
    - `mrr_growth_rate`: Month-over-month growth percentage
    - `arr`: Annual Recurring Revenue
    - `arpu`: Average Revenue Per User
    - `revenue_by_tier`: Breakdown by subscription tier
    - `revenue_by_interval`: Breakdown by billing interval (monthly vs annual)
    """
    logger.info(f"[ADMIN] Revenue metrics requested by {admin.get('sub')} for period {period}")
    
    try:
        await log_admin_action(admin.get('sub'), 'view_revenue_metrics', {'period': period})
        
        # Get revenue trend
        days = 30 if period == "30d" else 90 if period == "90d" else 7
        trend_df = get_revenue_trend(days)
        
        # Calculate MRR
        date_range = parse_date_range(period)
        mrr_df = calculate_mrr(date_range)
        
        # Get ARR
        arr = calculate_arr(date_range)
        
        # Get ARPU
        arpu = get_arpu(date_range)
        
        # Query revenue by interval from Supabase
        supabase = get_supabase_client()
        subs_response = supabase.table('subscriptions')\
            .select('tier, billing_interval')\
            .in_('status', ['active', 'trialing'])\
            .execute()
        
        monthly_count = sum(1 for s in subs_response.data if s.get('billing_interval') == 'monthly') if subs_response.data else 0
        annual_count = sum(1 for s in subs_response.data if s.get('billing_interval') == 'annual') if subs_response.data else 0
        
        return {
            'daily_trend': trend_df.to_dict(orient='records'),
            'mrr': mrr_df['mrr'].iloc[0],
            'mrr_growth_rate': 0.0,  # Would need historical MRR data
            'arr': arr,
            'arpu': arpu,
            'revenue_by_tier': {
                'member': mrr_df['member_mrr'].iloc[0],
                'founder': mrr_df['founder_mrr'].iloc[0]
            },
            'revenue_by_interval': {
                'monthly': monthly_count,
                'annual': annual_count
            },
            'period': period
        }
        
    except Exception as e:
        logger.error(f"[ADMIN] Error fetching revenue metrics: {e}")
        raise HTTPException(500, f"Error fetching revenue metrics: {str(e)}")


@router.get("/metrics/users")
async def get_user_metrics(
    period: str = Query("30d", description="Time period: 7d, 30d, 90d, 1y"),
    admin: dict = Depends(get_current_admin_required)
):
    """
    Get user analytics and growth metrics.
    
    **Admin Only** - Requires admin authentication
    
    **Returns:**
    - `total_users`: Total number of users
    - `new_signups`: New users in period
    - `conversions`: Free to paid conversions in period
    - `cancellations`: Subscription cancellations in period
    - `conversion_rate`: Overall conversion rate
    - `churn_rate`: Monthly churn rate
    - `users_by_tier`: User count by tier
    - `upgrade_funnel`: Most common upgrade paths
    """
    logger.info(f"[ADMIN] User metrics requested by {admin.get('sub')} for period {period}")
    
    try:
        await log_admin_action(admin.get('sub'), 'view_user_metrics', {'period': period})
        
        date_range = parse_date_range(period)
        start_date, end_date = date_range
        
        supabase = get_supabase_client()
        
        # Get total users
        total_users_resp = supabase.table('subscriptions').select('id', count='exact').execute()
        total_users = len(total_users_resp.data) if total_users_resp.data else 0
        
        # Get new signups in period
        new_signups_resp = supabase.table('subscriptions')\
            .select('id', count='exact')\
            .gte('created_at', start_date)\
            .lte('created_at', end_date)\
            .execute()
        new_signups = len(new_signups_resp.data) if new_signups_resp.data else 0
        
        # Get conversions (new paid subscriptions in period)
        conversions_resp = supabase.table('subscriptions')\
            .select('id', count='exact')\
            .neq('tier', 'free')\
            .gte('created_at', start_date)\
            .lte('created_at', end_date)\
            .execute()
        conversions = len(conversions_resp.data) if conversions_resp.data else 0
        
        # Get cancellations
        cancellations_resp = supabase.table('subscriptions')\
            .select('id', count='exact')\
            .eq('status', 'canceled')\
            .gte('updated_at', start_date)\
            .lte('updated_at', end_date)\
            .execute()
        cancellations = len(cancellations_resp.data) if cancellations_resp.data else 0
        
        # Get conversion and churn rates
        conversion_data = get_conversion_rate(date_range)
        churn_data = get_churn_rate(date_range)
        
        # Get users by tier
        users_by_tier_resp = supabase.table('subscriptions')\
            .select('tier', count='exact')\
            .in_('status', ['active', 'trialing'])\
            .execute()
        
        tier_counts = {'free': 0, 'member': 0, 'founder': 0}
        for sub in users_by_tier_resp.data if users_by_tier_resp.data else []:
            tier = sub.get('tier', 'free')
            tier_counts[tier] = tier_counts.get(tier, 0) + 1
        
        # Get upgrade funnel
        upgrade_funnel_df = get_upgrade_funnel()
        
        return {
            'total_users': total_users,
            'new_signups': new_signups,
            'conversions': conversions,
            'cancellations': cancellations,
            'conversion_rate': conversion_data['conversion_rate'],
            'churn_rate': churn_data['churn_rate'],
            'users_by_tier': tier_counts,
            'upgrade_funnel': upgrade_funnel_df.to_dict(orient='records'),
            'period': period
        }
        
    except Exception as e:
        logger.error(f"[ADMIN] Error fetching user metrics: {e}")
        raise HTTPException(500, f"Error fetching user metrics: {str(e)}")


@router.get("/metrics/usage")
async def get_usage_metrics(
    period: str = Query("30d", description="Time period: 7d, 30d, 90d"),
    admin: dict = Depends(get_current_admin_required),
    db: Session = Depends(get_db)
):
    """
    Get feature usage statistics.
    
    **Admin Only** - Requires admin authentication
    
    **Returns:**
    - `total_searches`: Total searches across all users
    - `searches_by_tier`: Searches broken down by tier
    - `total_cards`: Total cards in collections
    - `cards_by_tier`: Card counts by tier
    - `auto_valuations_enabled`: Cards with auto-valuation enabled
    - `avg_searches_per_user`: Average daily searches per user
    """
    logger.info(f"[ADMIN] Usage metrics requested by {admin.get('sub')} for period {period}")
    
    try:
        await log_admin_action(admin.get('sub'), 'view_usage_metrics', {'period': period})
        
        date_range = parse_date_range(period)
        start_date, end_date = date_range
        
        supabase = get_supabase_client()
        
        # Get search usage from daily_usage table
        usage_resp = supabase.table('daily_usage')\
            .select('searches_count, user_id')\
            .gte('usage_date', start_date[:10])\
            .lte('usage_date', end_date[:10])\
            .execute()
        
        total_searches = sum(row['searches_count'] for row in usage_resp.data) if usage_resp.data else 0
        
        # Get total cards from SQLite
        total_cards = db.query(Card).count()
        
        # Get cards with auto-valuation enabled
        auto_val_cards = db.query(Card).filter(Card.auto_update == True).count()
        
        # Get users count for average calculation
        users_resp = supabase.table('subscriptions').select('id', count='exact').execute()
        total_users = len(users_resp.data) if users_resp.data else 1
        
        avg_searches = total_searches / total_users if total_users > 0 else 0
        
        return {
            'total_searches': total_searches,
            'searches_by_tier': {
                'free': 0,  # Would need to join with subscriptions table
                'member': 0,
                'founder': 0
            },
            'total_cards': total_cards,
            'cards_by_tier': {
                'free': 0,  # Would need to join binders with user subscriptions
                'member': 0,
                'founder': 0
            },
            'auto_valuations_enabled': auto_val_cards,
            'avg_searches_per_user': round(avg_searches, 2),
            'period': period
        }
        
    except Exception as e:
        logger.error(f"[ADMIN] Error fetching usage metrics: {e}")
        raise HTTPException(500, f"Error fetching usage metrics: {str(e)}")


@router.get("/webhooks/recent")
async def get_recent_webhooks(
    limit: int = Query(50, description="Number of recent events to return"),
    admin: dict = Depends(get_current_admin_required)
):
    """
    Get recent Stripe webhook events.
    
    **Admin Only** - Requires admin authentication
    
    **Returns:**
    List of recent webhook events with:
    - `event_id`: Stripe event ID
    - `event_type`: Type of event
    - `processed`: Whether event was successfully processed
    - `error_message`: Error message if processing failed
    - `created_at`: When event was received
    """
    logger.info(f"[ADMIN] Recent webhooks requested by {admin.get('sub')}")
    
    try:
        await log_admin_action(admin.get('sub'), 'view_recent_webhooks', {'limit': limit})
        
        supabase = get_supabase_client()
        
        webhooks_resp = supabase.table('stripe_events')\
            .select('stripe_event_id, event_type, processed, error_message, created_at, customer_id, subscription_id')\
            .order('created_at', desc=True)\
            .limit(limit)\
            .execute()
        
        events = webhooks_resp.data if webhooks_resp.data else []
        
        # Calculate success/failure stats
        total_events = len(events)
        successful = sum(1 for e in events if e.get('processed'))
        failed = sum(1 for e in events if not e.get('processed'))
        
        return {
            'events': events,
            'stats': {
                'total': total_events,
                'successful': successful,
                'failed': failed,
                'success_rate': (successful / total_events * 100) if total_events > 0 else 100.0
            }
        }
        
    except Exception as e:
        logger.error(f"[ADMIN] Error fetching recent webhooks: {e}")
        raise HTTPException(500, f"Error fetching webhooks: {str(e)}")


@router.get("/subscriptions/failing")
async def get_failing_subscriptions(
    admin: dict = Depends(get_current_admin_required)
):
    """
    Get subscriptions with payment issues.
    
    **Admin Only** - Requires admin authentication
    
    **Returns:**
    List of subscriptions with:
    - `user_id`: User ID
    - `tier`: Subscription tier
    - `status`: Subscription status (past_due, incomplete, etc.)
    - `stripe_customer_id`: Stripe customer ID
    - `current_period_end`: When subscription period ends
    """
    logger.info(f"[ADMIN] Failing subscriptions requested by {admin.get('sub')}")
    
    try:
        await log_admin_action(admin.get('sub'), 'view_failing_subscriptions', {})
        
        supabase = get_supabase_client()
        
        # Get subscriptions with payment issues
        failing_resp = supabase.table('subscriptions')\
            .select('user_id, tier, status, stripe_customer_id, current_period_end, billing_interval')\
            .in_('status', ['past_due', 'incomplete', 'incomplete_expired'])\
            .execute()
        
        subscriptions = failing_resp.data if failing_resp.data else []
        
        return {
            'failing_subscriptions': subscriptions,
            'count': len(subscriptions),
            'requires_attention': len(subscriptions) > 0
        }
        
    except Exception as e:
        logger.error(f"[ADMIN] Error fetching failing subscriptions: {e}")
        raise HTTPException(500, f"Error fetching failing subscriptions: {str(e)}")


@router.get("/export/subscriptions")
async def export_subscriptions_csv(
    admin: dict = Depends(get_current_admin_required)
):
    """
    Export all subscriptions to CSV file.
    
    **Admin Only** - Requires admin authentication
    
    **Returns:**
    CSV file download with all subscription data
    """
    logger.info(f"[ADMIN] Subscriptions CSV export requested by {admin.get('sub')}")
    
    try:
        await log_admin_action(admin.get('sub'), 'export_subscriptions_csv', {})
        
        supabase = get_supabase_client()
        
        # Get all subscriptions
        subs_resp = supabase.table('subscriptions')\
            .select('*')\
            .execute()
        
        if not subs_resp.data:
            raise HTTPException(404, "No subscriptions found")
        
        # Create CSV
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=subs_resp.data[0].keys())
        writer.writeheader()
        writer.writerows(subs_resp.data)
        
        # Return as streaming response
        output.seek(0)
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=subscriptions_{datetime.now().strftime('%Y%m%d')}.csv"
            }
        )
        
    except Exception as e:
        logger.error(f"[ADMIN] Error exporting subscriptions: {e}")
        raise HTTPException(500, f"Error exporting subscriptions: {str(e)}")


@router.get("/export/usage")
async def export_usage_csv(
    period: str = Query("30d", description="Time period: 7d, 30d, 90d"),
    admin: dict = Depends(get_current_admin_required)
):
    """
    Export usage data to CSV file.
    
    **Admin Only** - Requires admin authentication
    
    **Returns:**
    CSV file download with usage data
    """
    logger.info(f"[ADMIN] Usage CSV export requested by {admin.get('sub')}")
    
    try:
        await log_admin_action(admin.get('sub'), 'export_usage_csv', {'period': period})
        
        date_range = parse_date_range(period)
        start_date, end_date = date_range
        
        supabase = get_supabase_client()
        
        # Get usage data
        usage_resp = supabase.table('daily_usage')\
            .select('*')\
            .gte('usage_date', start_date[:10])\
            .lte('usage_date', end_date[:10])\
            .execute()
        
        if not usage_resp.data:
            raise HTTPException(404, "No usage data found for period")
        
        # Create CSV
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=usage_resp.data[0].keys())
        writer.writeheader()
        writer.writerows(usage_resp.data)
        
        output.seek(0)
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=usage_{datetime.now().strftime('%Y%m%d')}.csv"
            }
        )
        
    except Exception as e:
        logger.error(f"[ADMIN] Error exporting usage: {e}")
        raise HTTPException(500, f"Error exporting usage: {str(e)}")


@router.get("/cohort-analysis")
async def get_cohort_analysis(
    cohort_month: str = Query(..., description="Cohort month in YYYY-MM format"),
    admin: dict = Depends(get_current_admin_required)
):
    """
    Get cohort retention analysis for a specific month.
    
    **Admin Only** - Requires admin authentication
    
    **Parameters:**
    - `cohort_month`: Month in YYYY-MM format (e.g., '2026-01')
    
    **Returns:**
    Retention data showing what % of users from that cohort are still active
    """
    logger.info(f"[ADMIN] Cohort analysis requested by {admin.get('sub')} for {cohort_month}")
    
    try:
        await log_admin_action(admin.get('sub'), 'view_cohort_analysis', {'cohort_month': cohort_month})
        
        retention_df = get_cohort_retention(cohort_month)
        
        return {
            'cohort_month': cohort_month,
            'retention_data': retention_df.to_dict(orient='records')
        }
        
    except Exception as e:
        logger.error(f"[ADMIN] Error fetching cohort analysis: {e}")
        raise HTTPException(500, f"Error fetching cohort analysis: {str(e)}")
