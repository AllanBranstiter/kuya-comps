# backend/services/reporting_service.py
"""
Automated reporting service for subscription metrics.

Generates and sends automated reports:
- Daily metrics summary
- Weekly business review
- Monthly board deck
- CSV/PDF exports

Can be scheduled using APScheduler or cron jobs.
"""
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import csv
import io
from jinja2 import Template

from backend.analytics.subscription_queries import (
    calculate_mrr,
    calculate_arr,
    get_conversion_rate,
    get_churn_rate,
    get_arpu,
    get_customer_lifetime_value,
    get_revenue_trend
)
from backend.logging_config import get_logger

logger = get_logger(__name__)


class ReportingService:
    """Service for generating automated subscription reports."""
    
    def __init__(self):
        """Initialize reporting service."""
        self.report_recipients = os.getenv('REPORT_RECIPIENTS', '').split(',')
        self.report_recipients = [email.strip() for email in self.report_recipients if email.strip()]
        
    def generate_daily_report(self) -> Dict[str, Any]:
        """
        Generate daily metrics summary.
        
        Includes:
        - Yesterday's new subscriptions
        - Yesterday's cancellations
        - Current MRR
        - Active subscription count
        - Failed payments (if any)
        
        Returns:
            Dict with report data
        """
        logger.info("[REPORTING] Generating daily report")
        
        try:
            # Calculate date range (yesterday)
            yesterday = (datetime.now() - timedelta(days=1)).date()
            date_range = (
                yesterday.isoformat(),
                datetime.now().isoformat()
            )
            
            # Get current MRR
            mrr_df = calculate_mrr()
            
            # Get conversion data
            conversion_data = get_conversion_rate(date_range)
            
            # Get churn data
            churn_data = get_churn_rate(date_range)
            
            report = {
                'date': yesterday.isoformat(),
                'type': 'daily',
                'metrics': {
                    'mrr': mrr_df['mrr'].iloc[0],
                    'active_subscriptions': mrr_df['active_subscriptions'].iloc[0],
                    'new_subscriptions': conversion_data['paid_users'],
                    'cancellations': churn_data['canceled_count'],
                    'conversion_rate': conversion_data['conversion_rate'],
                    'churn_rate': churn_data['churn_rate']
                },
                'generated_at': datetime.now().isoformat()
            }
            
            logger.info(f"[REPORTING] Daily report generated: MRR=${report['metrics']['mrr']:.2f}")
            
            return report
            
        except Exception as e:
            logger.error(f"[REPORTING] Error generating daily report: {e}")
            raise
    
    def generate_weekly_report(self) -> Dict[str, Any]:
        """
        Generate weekly business review.
        
        Includes:
        - Week-over-week MRR growth
        - New subscriptions this week
        - Cancellations this week
        - Conversion rate
        - Churn rate
        - ARPU
        - Top metrics trends
        
        Returns:
            Dict with report data
        """
        logger.info("[REPORTING] Generating weekly report")
        
        try:
            # Calculate date range (last 7 days)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=7)
            date_range = (start_date.isoformat(), end_date.isoformat())
            
            # Get metrics
            mrr_df = calculate_mrr(date_range)
            arr = calculate_arr(date_range)
            conversion_data = get_conversion_rate(date_range)
            churn_data = get_churn_rate(date_range)
            arpu = get_arpu(date_range)
            clv_data = get_customer_lifetime_value()
            
            # Get revenue trend
            trend_df = get_revenue_trend(7)
            
            report = {
                'week_ending': end_date.date().isoformat(),
                'type': 'weekly',
                'metrics': {
                    'mrr': mrr_df['mrr'].iloc[0],
                    'mrr_by_tier': {
                        'member': mrr_df['member_mrr'].iloc[0],
                        'founder': mrr_df['founder_mrr'].iloc[0]
                    },
                    'arr': arr,
                    'arpu': arpu,
                    'clv': clv_data['clv'],
                    'active_subscriptions': mrr_df['active_subscriptions'].iloc[0],
                    'new_subscriptions': sum(trend_df['new_subscriptions']),
                    'cancellations': sum(trend_df['churned_subscriptions']),
                    'conversion_rate': conversion_data['conversion_rate'],
                    'churn_rate': churn_data['churn_rate']
                },
                'trends': {
                    'daily_new_subs': trend_df['new_subscriptions'].tolist(),
                    'daily_churned_subs': trend_df['churned_subscriptions'].tolist()
                },
                'generated_at': datetime.now().isoformat()
            }
            
            logger.info(f"[REPORTING] Weekly report generated: MRR=${report['metrics']['mrr']:.2f}, ARR=${report['metrics']['arr']:.2f}")
            
            return report
            
        except Exception as e:
            logger.error(f"[REPORTING] Error generating weekly report: {e}")
            raise
    
    def generate_monthly_report(self) -> Dict[str, Any]:
        """
        Generate monthly board deck.
        
        Comprehensive monthly report including:
        - MRR and ARR
        - Month-over-month growth
        - User acquisition and churn
        - Conversion funnel
        - Revenue by tier and interval
        - Customer lifetime value
        - Key performance indicators
        
        Returns:
            Dict with comprehensive report data
        """
        logger.info("[REPORTING] Generating monthly report")
        
        try:
            # Calculate date range (last 30 days)
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)
            date_range = (start_date.isoformat(), end_date.isoformat())
            
            # Get all metrics
            mrr_df = calculate_mrr(date_range)
            arr = calculate_arr(date_range)
            conversion_data = get_conversion_rate(date_range)
            churn_data = get_churn_rate(date_range)
            arpu = get_arpu(date_range)
            clv_data = get_customer_lifetime_value()
            
            # Get 30-day trend
            trend_df = get_revenue_trend(30)
            
            report = {
                'month': end_date.strftime('%Y-%m'),
                'type': 'monthly',
                'executive_summary': {
                    'mrr': mrr_df['mrr'].iloc[0],
                    'arr': arr,
                    'active_subscriptions': mrr_df['active_subscriptions'].iloc[0],
                    'conversion_rate': conversion_data['conversion_rate'],
                    'churn_rate': churn_data['churn_rate'],
                    'arpu': arpu,
                    'clv': clv_data['clv']
                },
                'revenue_metrics': {
                    'mrr_by_tier': {
                        'member': mrr_df['member_mrr'].iloc[0],
                        'founder': mrr_df['founder_mrr'].iloc[0]
                    },
                    'mrr_growth_rate': 0.0,  # Would need previous month MRR
                    'arr': arr
                },
                'user_metrics': {
                    'total_users': conversion_data['total_users'],
                    'free_users': conversion_data['free_users'],
                    'paid_users': conversion_data['paid_users'],
                    'new_subscriptions': sum(trend_df['new_subscriptions']),
                    'cancellations': sum(trend_df['churned_subscriptions']),
                    'net_new': sum(trend_df['new_subscriptions']) - sum(trend_df['churned_subscriptions'])
                },
                'customer_metrics': {
                    'arpu': arpu,
                    'clv': clv_data['clv'],
                    'avg_lifetime_months': clv_data['avg_customer_lifetime_months'],
                    'conversion_rate': conversion_data['conversion_rate'],
                    'churn_rate': churn_data['churn_rate']
                },
                'trends': {
                    'dates': trend_df['date'].tolist(),
                    'new_subscriptions': trend_df['new_subscriptions'].tolist(),
                    'churned_subscriptions': trend_df['churned_subscriptions'].tolist()
                },
                'generated_at': datetime.now().isoformat()
            }
            
            logger.info(f"[REPORTING] Monthly report generated: MRR=${report['executive_summary']['mrr']:.2f}")
            
            return report
            
        except Exception as e:
            logger.error(f"[REPORTING] Error generating monthly report: {e}")
            raise
    
    def export_to_csv(self, report_data: Dict[str, Any], filename: Optional[str] = None) -> str:
        """
        Export report data to CSV format.
        
        Args:
            report_data: Report data dictionary
            filename: Optional filename (defaults to report_YYYYMMDD.csv)
            
        Returns:
            CSV string content
        """
        logger.info("[REPORTING] Exporting report to CSV")
        
        if not filename:
            filename = f"report_{datetime.now().strftime('%Y%m%d')}.csv"
        
        output = io.StringIO()
        
        # Flatten nested dict for CSV
        flat_data = []
        
        if 'metrics' in report_data:
            flat_data.append(report_data['metrics'])
        elif 'executive_summary' in report_data:
            # Monthly report
            row = {
                **report_data['executive_summary'],
                'month': report_data.get('month'),
                'type': report_data.get('type')
            }
            flat_data.append(row)
        
        if flat_data:
            writer = csv.DictWriter(output, fieldnames=flat_data[0].keys())
            writer.writeheader()
            writer.writerows(flat_data)
        
        return output.getvalue()
    
    def format_email_report(self, report_data: Dict[str, Any]) -> str:
        """
        Format report as HTML email.
        
        Args:
            report_data: Report data dictionary
            
        Returns:
            HTML email content
        """
        report_type = report_data.get('type', 'unknown')
        
        if report_type == 'daily':
            return self._format_daily_email(report_data)
        elif report_type == 'weekly':
            return self._format_weekly_email(report_data)
        elif report_type == 'monthly':
            return self._format_monthly_email(report_data)
        else:
            return "<p>Unknown report type</p>"
    
    def _format_daily_email(self, report_data: Dict[str, Any]) -> str:
        """Format daily report as HTML email."""
        metrics = report_data.get('metrics', {})
        
        template = Template("""
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007aff; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .metric { background: #f5f5f7; padding: 15px; border-radius: 8px; margin-bottom: 10px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007aff; }
        .metric-label { font-size: 14px; color: #666; margin-bottom: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Daily Subscription Report</h1>
            <p>{{ date }}</p>
        </div>
        
        <div class="metric">
            <div class="metric-label">Monthly Recurring Revenue</div>
            <div class="metric-value">${{ "%.2f"|format(mrr) }}</div>
        </div>
        
        <div class="metric">
            <div class="metric-label">Active Subscriptions</div>
            <div class="metric-value">{{ active_subscriptions }}</div>
        </div>
        
        <div class="metric">
            <div class="metric-label">New Subscriptions</div>
            <div class="metric-value">{{ new_subscriptions }}</div>
        </div>
        
        <div class="metric">
            <div class="metric-label">Cancellations</div>
            <div class="metric-value">{{ cancellations }}</div>
        </div>
        
        <div class="metric">
            <div class="metric-label">Conversion Rate</div>
            <div class="metric-value">{{ "%.1f"|format(conversion_rate) }}%</div>
        </div>
    </div>
</body>
</html>
        """)
        
        return template.render(
            date=report_data.get('date'),
            mrr=metrics.get('mrr', 0),
            active_subscriptions=metrics.get('active_subscriptions', 0),
            new_subscriptions=metrics.get('new_subscriptions', 0),
            cancellations=metrics.get('cancellations', 0),
            conversion_rate=metrics.get('conversion_rate', 0)
        )
    
    def _format_weekly_email(self, report_data: Dict[str, Any]) -> str:
        """Format weekly report as HTML email."""
        metrics = report_data.get('metrics', {})
        
        template = Template("""
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007aff; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .metric { background: #f5f5f7; padding: 15px; border-radius: 8px; }
        .metric-value { font-size: 20px; font-weight: bold; color: #007aff; }
        .metric-label { font-size: 12px; color: #666; margin-bottom: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Weekly Business Review</h1>
            <p>Week ending {{ week_ending }}</p>
        </div>
        
        <div class="metric-grid">
            <div class="metric">
                <div class="metric-label">MRR</div>
                <div class="metric-value">${{ "%.2f"|format(mrr) }}</div>
            </div>
            
            <div class="metric">
                <div class="metric-label">ARR</div>
                <div class="metric-value">${{ "%.2f"|format(arr) }}</div>
            </div>
            
            <div class="metric">
                <div class="metric-label">ARPU</div>
                <div class="metric-value">${{ "%.2f"|format(arpu) }}</div>
            </div>
            
            <div class="metric">
                <div class="metric-label">CLV</div>
                <div class="metric-value">${{ "%.2f"|format(clv) }}</div>
            </div>
            
            <div class="metric">
                <div class="metric-label">New Subscriptions</div>
                <div class="metric-value">{{ new_subscriptions }}</div>
            </div>
            
            <div class="metric">
                <div class="metric-label">Cancellations</div>
                <div class="metric-value">{{ cancellations }}</div>
            </div>
            
            <div class="metric">
                <div class="metric-label">Conversion Rate</div>
                <div class="metric-value">{{ "%.1f"|format(conversion_rate) }}%</div>
            </div>
            
            <div class="metric">
                <div class="metric-label">Churn Rate</div>
                <div class="metric-value">{{ "%.1f"|format(churn_rate) }}%</div>
            </div>
        </div>
    </div>
</body>
</html>
        """)
        
        return template.render(
            week_ending=report_data.get('week_ending'),
            mrr=metrics.get('mrr', 0),
            arr=metrics.get('arr', 0),
            arpu=metrics.get('arpu', 0),
            clv=metrics.get('clv', 0),
            new_subscriptions=metrics.get('new_subscriptions', 0),
            cancellations=metrics.get('cancellations', 0),
            conversion_rate=metrics.get('conversion_rate', 0),
            churn_rate=metrics.get('churn_rate', 0)
        )
    
    def _format_monthly_email(self, report_data: Dict[str, Any]) -> str:
        """Format monthly report as HTML email."""
        summary = report_data.get('executive_summary', {})
        revenue = report_data.get('revenue_metrics', {})
        users = report_data.get('user_metrics', {})
        
        template = Template("""
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }
        .container { max-width: 700px; margin: 0 auto; padding: 20px; }
        .header { background: #007aff; color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #1d1d1f; }
        .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
        .metric { background: #f5f5f7; padding: 20px; border-radius: 8px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007aff; }
        .metric-label { font-size: 12px; color: #666; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Monthly Board Report</h1>
            <p style="font-size: 18px; margin: 0;">{{ month }}</p>
        </div>
        
        <div class="section">
            <div class="section-title">Executive Summary</div>
            <div class="metric-grid">
                <div class="metric">
                    <div class="metric-value">${{ "%.2f"|format(mrr) }}</div>
                    <div class="metric-label">MRR</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${{ "%.2f"|format(arr) }}</div>
                    <div class="metric-label">ARR</div>
                </div>
                <div class="metric">
                    <div class="metric-value">{{ active_subscriptions }}</div>
                    <div class="metric-label">Active Subscriptions</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">User Growth</div>
            <div class="metric-grid">
                <div class="metric">
                    <div class="metric-value">{{ total_users }}</div>
                    <div class="metric-label">Total Users</div>
                </div>
                <div class="metric">
                    <div class="metric-value">{{ new_subscriptions }}</div>
                    <div class="metric-label">New This Month</div>
                </div>
                <div class="metric">
                    <div class="metric-value">{{ "%.1f"|format(conversion_rate) }}%</div>
                    <div class="metric-label">Conversion Rate</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">Customer Metrics</div>
            <div class="metric-grid">
                <div class="metric">
                    <div class="metric-value">${{ "%.2f"|format(arpu) }}</div>
                    <div class="metric-label">ARPU</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${{ "%.2f"|format(clv) }}</div>
                    <div class="metric-label">CLV</div>
                </div>
                <div class="metric">
                    <div class="metric-value">{{ "%.1f"|format(churn_rate) }}%</div>
                    <div class="metric-label">Churn Rate</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
        """)
        
        return template.render(
            month=report_data.get('month'),
            mrr=summary.get('mrr', 0),
            arr=summary.get('arr', 0),
            active_subscriptions=summary.get('active_subscriptions', 0),
            total_users=users.get('total_users', 0),
            new_subscriptions=users.get('new_subscriptions', 0),
            conversion_rate=summary.get('conversion_rate', 0),
            arpu=summary.get('arpu', 0),
            clv=summary.get('clv', 0),
            churn_rate=summary.get('churn_rate', 0)
        )
    
    async def send_report_email(self, report_data: Dict[str, Any], recipients: Optional[List[str]] = None):
        """
        Send report via email.
        
        Note: This is a placeholder. In production, integrate with:
        - SendGrid
        - AWS SES
        - Mailgun
        - SMTP
        
        Args:
            report_data: Report data dictionary
            recipients: Optional list of recipient emails (defaults to REPORT_RECIPIENTS env var)
        """
        if recipients is None:
            recipients = self.report_recipients
        
        if not recipients:
            logger.warning("[REPORTING] No report recipients configured")
            return
        
        logger.info(f"[REPORTING] Would send {report_data.get('type')} report to: {recipients}")
        
        # TODO: Implement actual email sending
        # Example with SendGrid:
        # import sendgrid
        # from sendgrid.helpers.mail import Mail
        # 
        # html_content = self.format_email_report(report_data)
        # message = Mail(
        #     from_email='reports@kuyacomps.com',
        #     to_emails=recipients,
        #     subject=f"Kuya Comps {report_data['type'].title()} Report",
        #     html_content=html_content
        # )
        # sg = sendgrid.SendGridAPIClient(api_key=os.getenv('SENDGRID_API_KEY'))
        # response = sg.send(message)
        
        logger.info(f"[REPORTING] Email report queued for {len(recipients)} recipients")


# Scheduled task examples (for use with APScheduler or cron)

async def run_daily_report():
    """Run daily report (to be scheduled)."""
    service = ReportingService()
    report = service.generate_daily_report()
    await service.send_report_email(report)
    logger.info("[REPORTING] Daily report completed")


async def run_weekly_report():
    """Run weekly report (to be scheduled for Monday mornings)."""
    service = ReportingService()
    report = service.generate_weekly_report()
    await service.send_report_email(report)
    logger.info("[REPORTING] Weekly report completed")


async def run_monthly_report():
    """Run monthly report (to be scheduled for 1st of each month)."""
    service = ReportingService()
    report = service.generate_monthly_report()
    await service.send_report_email(report)
    logger.info("[REPORTING] Monthly report completed")
