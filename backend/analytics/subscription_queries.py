# backend/analytics/subscription_queries.py
"""
Subscription analytics SQL queries for business intelligence.

Provides reusable functions for calculating subscription metrics:
- MRR (Monthly Recurring Revenue)
- ARR (Annual Recurring Revenue)
- Conversion rates
- Churn rates
- ARPU (Average Revenue Per User)
- Customer Lifetime Value (CLV)
- Cohort retention analysis
- Upgrade funnel analysis
"""
import os
from datetime import datetime, timedelta, date
from typing import Optional, Dict, Any, List, Tuple
import pandas as pd
from supabase import create_client, Client
import stripe
from backend.logging_config import get_logger

logger = get_logger(__name__)

# Initialize Stripe
from backend.config import STRIPE_SECRET_KEY
stripe.api_key = STRIPE_SECRET_KEY

# Pricing constants (monthly equivalents)
TIER_PRICING = {
    'free': 0.00,
    'member_monthly': 4.99,
    'member_annual': 3.99,  # $47.88/year = $3.99/month
    'founder_monthly': 14.99,
    'founder_annual': 12.49  # $149.88/year = $12.49/month
}


def get_supabase_client() -> Client:
    """Get Supabase client for analytics queries."""
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not supabase_key:
        raise ValueError("Supabase not configured")
    
    return create_client(supabase_url, supabase_key)


def calculate_mrr(date_range: Optional[Tuple[str, str]] = None) -> pd.DataFrame:
    """
    Calculate Monthly Recurring Revenue (MRR).
    
    MRR = Sum of all active monthly subscription values
    For annual subscriptions, divide by 12 to get monthly equivalent.
    
    Args:
        date_range: Optional tuple of (start_date, end_date) in ISO format
        
    Returns:
        DataFrame with columns:
            - date: Date of calculation
            - mrr: Monthly Recurring Revenue
            - member_mrr: MRR from Member tier
            - founder_mrr: MRR from Founder tier
            - active_subscriptions: Count of active subscriptions
    """
    logger.info(f"[ANALYTICS] Calculating MRR for date range: {date_range}")
    
    try:
        supabase = get_supabase_client()
        
        # Query active subscriptions
        query = supabase.table('subscriptions')\
            .select('tier, billing_interval, created_at, updated_at')\
            .in_('status', ['active', 'trialing'])
        
        if date_range:
            start_date, end_date = date_range
            query = query.gte('created_at', start_date).lte('created_at', end_date)
        
        response = query.execute()
        
        if not response.data:
            logger.warning("[ANALYTICS] No active subscriptions found")
            return pd.DataFrame({
                'date': [datetime.now().date()],
                'mrr': [0.0],
                'member_mrr': [0.0],
                'founder_mrr': [0.0],
                'active_subscriptions': [0]
            })
        
        # Calculate MRR
        total_mrr = 0.0
        member_mrr = 0.0
        founder_mrr = 0.0
        
        for sub in response.data:
            tier = sub['tier']
            interval = sub['billing_interval']
            
            if tier == 'free':
                continue
            
            # Get monthly price
            price_key = f"{tier}_{interval}"
            monthly_price = TIER_PRICING.get(price_key, 0.0)
            
            total_mrr += monthly_price
            
            if tier == 'member':
                member_mrr += monthly_price
            elif tier == 'founder':
                founder_mrr += monthly_price
        
        return pd.DataFrame({
            'date': [datetime.now().date()],
            'mrr': [round(total_mrr, 2)],
            'member_mrr': [round(member_mrr, 2)],
            'founder_mrr': [round(founder_mrr, 2)],
            'active_subscriptions': [len(response.data)]
        })
        
    except Exception as e:
        logger.error(f"[ANALYTICS] Error calculating MRR: {e}")
        raise


def calculate_arr(date_range: Optional[Tuple[str, str]] = None) -> float:
    """
    Calculate Annual Recurring Revenue (ARR).
    
    ARR = MRR * 12
    
    Args:
        date_range: Optional tuple of (start_date, end_date) in ISO format
        
    Returns:
        Annual Recurring Revenue
    """
    logger.info(f"[ANALYTICS] Calculating ARR for date range: {date_range}")
    
    mrr_df = calculate_mrr(date_range)
    arr = mrr_df['mrr'].iloc[0] * 12
    
    logger.info(f"[ANALYTICS] ARR: ${arr:,.2f}")
    return round(arr, 2)


def get_conversion_rate(date_range: Optional[Tuple[str, str]] = None) -> Dict[str, Any]:
    """
    Calculate free-to-paid conversion rate.
    
    Conversion Rate = (Paid Subscriptions / Total Users) * 100
    
    Args:
        date_range: Optional tuple of (start_date, end_date) in ISO format
        
    Returns:
        Dict with:
            - conversion_rate: Percentage (0-100)
            - total_users: Total number of users
            - free_users: Number of free tier users
            - paid_users: Number of paid tier users
    """
    logger.info(f"[ANALYTICS] Calculating conversion rate for date range: {date_range}")
    
    try:
        supabase = get_supabase_client()
        
        # Get total users
        query = supabase.table('subscriptions').select('tier', count='exact')
        
        if date_range:
            start_date, end_date = date_range
            query = query.gte('created_at', start_date).lte('created_at', end_date)
        
        response = query.execute()
        
        total_users = len(response.data) if response.data else 0
        
        if total_users == 0:
            return {
                'conversion_rate': 0.0,
                'total_users': 0,
                'free_users': 0,
                'paid_users': 0
            }
        
        # Count free vs paid
        free_users = sum(1 for sub in response.data if sub['tier'] == 'free')
        paid_users = total_users - free_users
        
        conversion_rate = (paid_users / total_users) * 100
        
        return {
            'conversion_rate': round(conversion_rate, 2),
            'total_users': total_users,
            'free_users': free_users,
            'paid_users': paid_users
        }
        
    except Exception as e:
        logger.error(f"[ANALYTICS] Error calculating conversion rate: {e}")
        raise


def get_churn_rate(date_range: Optional[Tuple[str, str]] = None) -> Dict[str, Any]:
    """
    Calculate monthly churn rate.
    
    Churn Rate = (Canceled Subscriptions / Active Subscriptions at Start) * 100
    
    Args:
        date_range: Optional tuple of (start_date, end_date) in ISO format
                   Defaults to last 30 days
        
    Returns:
        Dict with:
            - churn_rate: Percentage (0-100)
            - canceled_count: Number of subscriptions canceled
            - active_at_start: Number of active subscriptions at period start
    """
    logger.info(f"[ANALYTICS] Calculating churn rate for date range: {date_range}")
    
    try:
        supabase = get_supabase_client()
        
        # Default to last 30 days
        if not date_range:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)
            date_range = (start_date.isoformat(), end_date.isoformat())
        
        start_date, end_date = date_range
        
        # Get subscriptions that were active at start of period
        active_at_start = supabase.table('subscriptions')\
            .select('id', count='exact')\
            .lte('created_at', start_date)\
            .in_('status', ['active', 'trialing'])\
            .execute()
        
        active_count = len(active_at_start.data) if active_at_start.data else 0
        
        if active_count == 0:
            return {
                'churn_rate': 0.0,
                'canceled_count': 0,
                'active_at_start': 0
            }
        
        # Get subscriptions canceled during period
        canceled = supabase.table('subscriptions')\
            .select('id', count='exact')\
            .eq('status', 'canceled')\
            .gte('updated_at', start_date)\
            .lte('updated_at', end_date)\
            .execute()
        
        canceled_count = len(canceled.data) if canceled.data else 0
        
        churn_rate = (canceled_count / active_count) * 100
        
        return {
            'churn_rate': round(churn_rate, 2),
            'canceled_count': canceled_count,
            'active_at_start': active_count
        }
        
    except Exception as e:
        logger.error(f"[ANALYTICS] Error calculating churn rate: {e}")
        raise


def get_arpu(date_range: Optional[Tuple[str, str]] = None) -> float:
    """
    Calculate Average Revenue Per User (ARPU).
    
    ARPU = Total MRR / Total Active Users
    
    Args:
        date_range: Optional tuple of (start_date, end_date) in ISO format
        
    Returns:
        Average Revenue Per User (monthly)
    """
    logger.info(f"[ANALYTICS] Calculating ARPU for date range: {date_range}")
    
    try:
        mrr_df = calculate_mrr(date_range)
        total_mrr = mrr_df['mrr'].iloc[0]
        active_users = mrr_df['active_subscriptions'].iloc[0]
        
        if active_users == 0:
            return 0.0
        
        arpu = total_mrr / active_users
        
        logger.info(f"[ANALYTICS] ARPU: ${arpu:.2f}")
        return round(arpu, 2)
        
    except Exception as e:
        logger.error(f"[ANALYTICS] Error calculating ARPU: {e}")
        raise


def get_customer_lifetime_value() -> Dict[str, Any]:
    """
    Calculate Customer Lifetime Value (CLV).
    
    CLV = ARPU / Churn Rate * 100
    
    This is a simplified CLV calculation. For more accurate CLV,
    consider factors like:
    - Customer acquisition cost (CAC)
    - Gross margin
    - Discount rate
    
    Returns:
        Dict with:
            - clv: Customer Lifetime Value
            - arpu: Average Revenue Per User
            - churn_rate: Monthly churn rate
            - avg_customer_lifetime_months: Expected months a customer stays
    """
    logger.info("[ANALYTICS] Calculating Customer Lifetime Value")
    
    try:
        arpu = get_arpu()
        churn_data = get_churn_rate()
        churn_rate = churn_data['churn_rate']
        
        if churn_rate == 0:
            # Assume 1% churn if no churn data
            churn_rate = 1.0
        
        # Average customer lifetime in months
        avg_lifetime_months = 1 / (churn_rate / 100)
        
        # CLV = ARPU * Average Lifetime
        clv = arpu * avg_lifetime_months
        
        return {
            'clv': round(clv, 2),
            'arpu': arpu,
            'churn_rate': churn_rate,
            'avg_customer_lifetime_months': round(avg_lifetime_months, 1)
        }
        
    except Exception as e:
        logger.error(f"[ANALYTICS] Error calculating CLV: {e}")
        raise


def get_cohort_retention(cohort_month: str) -> pd.DataFrame:
    """
    Calculate retention by signup cohort.
    
    Shows what percentage of users who signed up in a given month
    are still active in subsequent months.
    
    Args:
        cohort_month: Month in YYYY-MM format (e.g., '2026-01')
        
    Returns:
        DataFrame with columns:
            - month: Months since signup (0, 1, 2, ...)
            - active_count: Number of active users
            - retention_rate: Percentage still active
    """
    logger.info(f"[ANALYTICS] Calculating cohort retention for {cohort_month}")
    
    try:
        supabase = get_supabase_client()
        
        # Parse cohort month
        cohort_date = datetime.strptime(cohort_month, '%Y-%m')
        start_of_month = cohort_date.replace(day=1)
        end_of_month = (start_of_month + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        
        # Get all users who signed up in cohort month
        cohort_users = supabase.table('subscriptions')\
            .select('user_id, created_at')\
            .gte('created_at', start_of_month.isoformat())\
            .lte('created_at', end_of_month.isoformat())\
            .execute()
        
        if not cohort_users.data:
            logger.warning(f"[ANALYTICS] No users found for cohort {cohort_month}")
            return pd.DataFrame({
                'month': [0],
                'active_count': [0],
                'retention_rate': [0.0]
            })
        
        cohort_size = len(cohort_users.data)
        user_ids = [u['user_id'] for u in cohort_users.data]
        
        # Calculate retention for each month
        retention_data = []
        current_date = datetime.now()
        months_since_cohort = (current_date.year - cohort_date.year) * 12 + (current_date.month - cohort_date.month)
        
        for month in range(min(months_since_cohort + 1, 12)):  # Max 12 months
            # Count how many are still active
            active = supabase.table('subscriptions')\
                .select('user_id', count='exact')\
                .in_('user_id', user_ids)\
                .in_('status', ['active', 'trialing'])\
                .execute()
            
            active_count = len(active.data) if active.data else 0
            retention_rate = (active_count / cohort_size) * 100 if cohort_size > 0 else 0
            
            retention_data.append({
                'month': month,
                'active_count': active_count,
                'retention_rate': round(retention_rate, 2)
            })
        
        return pd.DataFrame(retention_data)
        
    except Exception as e:
        logger.error(f"[ANALYTICS] Error calculating cohort retention: {e}")
        raise


def get_upgrade_funnel() -> pd.DataFrame:
    """
    Analyze most common upgrade paths.
    
    Shows how users upgrade from free → member → founder
    
    Returns:
        DataFrame with columns:
            - from_tier: Starting tier
            - to_tier: Ending tier
            - upgrade_count: Number of upgrades
            - avg_days_to_upgrade: Average days before upgrade
    """
    logger.info("[ANALYTICS] Calculating upgrade funnel")
    
    try:
        supabase = get_supabase_client()
        
        # This requires tracking tier changes over time
        # For now, we'll provide a simplified version based on current state
        # A full implementation would need a subscription_history table
        
        # Get all paid subscriptions
        paid_subs = supabase.table('subscriptions')\
            .select('tier, created_at')\
            .neq('tier', 'free')\
            .in_('status', ['active', 'trialing'])\
            .execute()
        
        if not paid_subs.data:
            return pd.DataFrame({
                'from_tier': ['free'],
                'to_tier': ['member'],
                'upgrade_count': [0],
                'avg_days_to_upgrade': [0.0]
            })
        
        # Simplified analysis: count current tier distribution
        member_count = sum(1 for s in paid_subs.data if s['tier'] == 'member')
        founder_count = sum(1 for s in paid_subs.data if s['tier'] == 'founder')
        
        return pd.DataFrame({
            'from_tier': ['free', 'free', 'member'],
            'to_tier': ['member', 'founder', 'founder'],
            'upgrade_count': [member_count, founder_count, 0],  # Need history for member→founder
            'avg_days_to_upgrade': [0.0, 0.0, 0.0]  # Would need subscription history
        })
        
    except Exception as e:
        logger.error(f"[ANALYTICS] Error calculating upgrade funnel: {e}")
        raise


def get_revenue_trend(days: int = 30) -> pd.DataFrame:
    """
    Get daily revenue trend over specified period.
    
    Args:
        days: Number of days to analyze (default 30)
        
    Returns:
        DataFrame with columns:
            - date: Date
            - mrr: MRR on that date
            - new_subscriptions: New subscriptions that day
            - churned_subscriptions: Cancellations that day
    """
    logger.info(f"[ANALYTICS] Calculating revenue trend for last {days} days")
    
    try:
        supabase = get_supabase_client()
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        trend_data = []
        
        for i in range(days):
            current_date = start_date + timedelta(days=i)
            date_str = current_date.date().isoformat()
            
            # Count new subscriptions
            new_subs = supabase.table('subscriptions')\
                .select('id', count='exact')\
                .gte('created_at', date_str)\
                .lt('created_at', (current_date + timedelta(days=1)).date().isoformat())\
                .execute()
            
            # Count cancellations
            churned = supabase.table('subscriptions')\
                .select('id', count='exact')\
                .eq('status', 'canceled')\
                .gte('updated_at', date_str)\
                .lt('updated_at', (current_date + timedelta(days=1)).date().isoformat())\
                .execute()
            
            trend_data.append({
                'date': date_str,
                'new_subscriptions': len(new_subs.data) if new_subs.data else 0,
                'churned_subscriptions': len(churned.data) if churned.data else 0
            })
        
        # Calculate MRR for current state
        mrr_df = calculate_mrr()
        current_mrr = mrr_df['mrr'].iloc[0]
        
        # Add MRR to each row (simplified - in reality MRR would change daily)
        for row in trend_data:
            row['mrr'] = current_mrr
        
        return pd.DataFrame(trend_data)
        
    except Exception as e:
        logger.error(f"[ANALYTICS] Error calculating revenue trend: {e}")
        raise
