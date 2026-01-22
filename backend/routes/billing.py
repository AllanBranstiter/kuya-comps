# backend/routes/billing.py
"""
Billing API routes for Stripe subscription management.

Provides endpoints for:
- Creating Stripe checkout sessions
- Managing customer portal access
- Handling Stripe webhooks
- Fetching subscription details
"""
import os
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from backend.middleware.supabase_auth import get_current_user_required
from backend.services.subscription_service import SubscriptionService
from backend.database.connection import get_db
from backend.config import (
    STRIPE_SECRET_KEY,
    STRIPE_PRICES,
    FRONTEND_URL,
    STRIPE_WEBHOOK_SECRET,
    TIER_LIMITS
)
from backend.logging_config import get_logger

logger = get_logger(__name__)

# Initialize Stripe
stripe.api_key = STRIPE_SECRET_KEY

router = APIRouter(prefix="/api/billing", tags=["Billing"])


# ============================================================================
# Helper Functions
# ============================================================================

def get_supabase_client():
    """
    Get Supabase client for subscription operations.
    
    Returns:
        Supabase Client instance
    """
    from supabase import create_client, Client
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')  # Use service role for admin operations
    
    if not supabase_url or not supabase_key:
        raise HTTPException(500, "Supabase not configured")
    
    return create_client(supabase_url, supabase_key)


async def log_stripe_event(event_id: str, event_type: str, payload: dict, 
                          customer_id: Optional[str] = None, 
                          subscription_id: Optional[str] = None,
                          error_message: Optional[str] = None,
                          processed: bool = False):
    """
    Log Stripe webhook event to database for debugging and audit trail.
    
    Args:
        event_id: Stripe event ID
        event_type: Event type (e.g., 'checkout.session.completed')
        payload: Full event payload
        customer_id: Stripe customer ID (if applicable)
        subscription_id: Stripe subscription ID (if applicable)
        error_message: Error message if processing failed
        processed: Whether event was successfully processed
    """
    try:
        supabase = get_supabase_client()
        
        supabase.table('stripe_events').insert({
            'stripe_event_id': event_id,
            'event_type': event_type,
            'customer_id': customer_id,
            'subscription_id': subscription_id,
            'payload': payload,
            'processed': processed,
            'error_message': error_message
        }).execute()
        
        logger.info(f"[STRIPE] Logged event {event_id} ({event_type}) to database")
    except Exception as e:
        logger.error(f"[STRIPE] Failed to log event {event_id}: {e}")


# ============================================================================
# Request/Response Models
# ============================================================================

class CheckoutSessionRequest(BaseModel):
    """Request to create a Stripe checkout session."""
    tier: str  # 'member' or 'founder'
    interval: str  # 'monthly' or 'annual'


class CheckoutSessionResponse(BaseModel):
    """Response containing checkout session URL."""
    checkout_url: str
    session_id: str


class CustomerPortalResponse(BaseModel):
    """Response containing customer portal URL."""
    portal_url: str


class SubscriptionResponse(BaseModel):
    """User's subscription details with limits."""
    tier: str
    status: str
    billing_interval: Optional[str] = None
    current_period_end: Optional[str] = None
    cancel_at_period_end: bool = False
    limits: dict


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/create-checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    request: CheckoutSessionRequest,
    current_user: dict = Depends(get_current_user_required)
):
    """
    Create Stripe checkout session for subscription purchase.
    
    **Authentication Required:** Yes
    
    **Parameters:**
    - `tier`: Subscription tier ('member' or 'founder')
    - `interval`: Billing interval ('monthly' or 'annual')
    
    **Returns:**
    - `checkout_url`: Stripe checkout page URL to redirect user to
    - `session_id`: Stripe session ID for tracking
    
    **Process:**
    1. Validates tier and interval
    2. Creates or retrieves Stripe customer
    3. Creates checkout session with automatic tax
    4. Returns checkout URL for frontend redirect
    """
    logger.info(f"[BILLING] Checkout session requested by user {current_user['sub']}: {request.tier}/{request.interval}")
    
    # Validate tier and interval
    if request.tier not in ['member', 'founder']:
        raise HTTPException(400, "Invalid tier. Must be 'member' or 'founder'")
    if request.interval not in ['monthly', 'annual']:
        raise HTTPException(400, "Invalid interval. Must be 'monthly' or 'annual'")
    
    # Get price ID from config
    price_key = f"{request.tier}_{request.interval}"
    price_id = STRIPE_PRICES.get(price_key)
    
    if not price_id:
        logger.error(f"[BILLING] Price ID not configured for {price_key}")
        raise HTTPException(500, f"Price not configured for {price_key}")
    
    try:
        # Check if user already has a Stripe customer ID
        supabase = get_supabase_client()
        existing_sub = supabase.table('subscriptions')\
            .select('stripe_customer_id')\
            .eq('user_id', current_user['sub'])\
            .execute()
        
        if existing_sub.data and existing_sub.data[0].get('stripe_customer_id'):
            # Use existing customer
            customer_id = existing_sub.data[0]['stripe_customer_id']
            logger.info(f"[BILLING] Using existing Stripe customer: {customer_id}")
        else:
            # Create new Stripe customer
            customer = stripe.Customer.create(
                email=current_user.get('email'),
                metadata={
                    'user_id': current_user['sub'],
                    'supabase_user_id': current_user['sub']
                }
            )
            customer_id = customer.id
            logger.info(f"[BILLING] Created new Stripe customer: {customer_id}")
        
        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode='subscription',
            line_items=[{
                'price': price_id,
                'quantity': 1
            }],
            success_url=f"{FRONTEND_URL}/?checkout=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_URL}/?checkout=canceled",
            metadata={
                'user_id': current_user['sub'],
                'tier': request.tier,
                'interval': request.interval
            },
            allow_promotion_codes=True,  # Allow discount codes
            billing_address_collection='auto',
            automatic_tax={'enabled': True}  # Enable Stripe Tax
        )
        
        logger.info(f"[BILLING] Created checkout session {session.id} for user {current_user['sub']}")
        
        return CheckoutSessionResponse(
            checkout_url=session.url,
            session_id=session.id
        )
    
    except stripe.error.StripeError as e:
        logger.error(f"[BILLING] Stripe error creating checkout session: {e}")
        raise HTTPException(500, f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error(f"[BILLING] Unexpected error creating checkout session: {e}")
        raise HTTPException(500, f"Error creating checkout session: {str(e)}")


@router.get("/customer-portal", response_model=CustomerPortalResponse)
async def get_customer_portal(
    current_user: dict = Depends(get_current_user_required)
):
    """
    Get Stripe Customer Portal URL for subscription management.
    
    **Authentication Required:** Yes
    
    **Returns:**
    - `portal_url`: Stripe Customer Portal URL
    
    **Customer Portal Features:**
    - Update payment method
    - Cancel subscription
    - View invoice history
    - Download receipts
    """
    logger.info(f"[BILLING] Customer portal requested by user {current_user['sub']}")
    
    # Get user's subscription
    supabase = get_supabase_client()
    
    try:
        subscription = supabase.table('subscriptions')\
            .select('stripe_customer_id')\
            .eq('user_id', current_user['sub'])\
            .execute()
        
        if not subscription.data or not subscription.data[0].get('stripe_customer_id'):
            raise HTTPException(404, "No active subscription found")
        
        customer_id = subscription.data[0]['stripe_customer_id']
        
        # Create portal session
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{FRONTEND_URL}/"
        )
        
        logger.info(f"[BILLING] Created customer portal session for user {current_user['sub']}")
        
        return CustomerPortalResponse(portal_url=session.url)
    
    except stripe.error.StripeError as e:
        logger.error(f"[BILLING] Stripe error creating portal session: {e}")
        raise HTTPException(500, f"Stripe error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[BILLING] Unexpected error creating portal session: {e}")
        raise HTTPException(500, f"Error creating portal session: {str(e)}")


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    current_user: dict = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """
    Get current user's subscription details with tier limits.
    
    **Authentication Required:** Yes
    
    **Returns:**
    - `tier`: Current subscription tier
    - `status`: Subscription status (active, canceled, past_due, etc.)
    - `billing_interval`: Billing cycle (monthly or annual)
    - `current_period_end`: When current billing period ends
    - `cancel_at_period_end`: Whether subscription will cancel at period end
    - `limits`: Dictionary of tier limits (searches, cards, etc.)
    """
    logger.debug(f"[BILLING] Subscription details requested by user {current_user['sub']}")
    
    supabase = get_supabase_client()
    service = SubscriptionService(supabase, db)
    
    subscription = await service.get_user_subscription(current_user['sub'])
    
    if not subscription:
        # User is on free tier
        return SubscriptionResponse(
            tier='free',
            status='active',
            billing_interval=None,
            current_period_end=None,
            cancel_at_period_end=False,
            limits=TIER_LIMITS['free']
        )
    
    return SubscriptionResponse(
        tier=subscription.get('tier', 'free'),
        status=subscription.get('status', 'active'),
        billing_interval=subscription.get('billing_interval'),
        current_period_end=subscription.get('current_period_end'),
        cancel_at_period_end=subscription.get('cancel_at_period_end', False),
        limits=TIER_LIMITS[subscription.get('tier', 'free')]
    )


@router.get("/usage")
async def get_usage_stats(
    current_user: dict = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """
    Get current user's usage statistics and tier information.
    
    **Authentication Required:** Yes
    
    **Returns:**
    - `tier`: Current subscription tier
    - `searches_used`: Number of searches used today
    - `searches_limit`: Daily search limit (-1 = unlimited)
    - `searches_remaining`: Searches remaining today
    - `cards_count`: Total number of cards in collection
    - `card_limit`: Maximum cards allowed (-1 = unlimited)
    - `cards_remaining`: Cards remaining before limit
    - `auto_valuation_count`: Number of cards with auto-valuation enabled
    - `auto_valuation_limit`: Maximum auto-valuations allowed
    - `has_analytics_access`: Whether user can access advanced analytics
    
    **Use Case:**
    Frontend uses this endpoint to:
    - Display usage indicators in the UI
    - Show upgrade prompts when limits are approached
    - Enable/disable features based on tier
    """
    logger.info(f"[BILLING_DEBUG] ========== Usage stats endpoint called ==========")
    logger.info(f"[BILLING_DEBUG] current_user object: {current_user}")
    logger.info(f"[BILLING_DEBUG] User ID from JWT token: {current_user['sub']}")
    logger.info(f"[BILLING_DEBUG] User email: {current_user.get('email', 'N/A')}")
    
    try:
        supabase = get_supabase_client()
        service = SubscriptionService(supabase, db)
        
        user_id = current_user['sub']
        logger.info(f"[BILLING_DEBUG] Calling SubscriptionService with user_id: {user_id}")
        
        # Get tier
        tier = await service.get_user_tier(user_id)
        logger.info(f"[BILLING_DEBUG] User tier: {tier}")
        
        # Get search usage
        search_check = await service.check_search_limit(user_id)
        logger.info(f"[BILLING_DEBUG] Search check result: {search_check}")
        
        # Get card usage
        logger.info(f"[BILLING_DEBUG] About to call check_card_limit with user_id: {user_id}")
        card_check = await service.check_card_limit(user_id)
        logger.info(f"[BILLING_DEBUG] Card check result: {card_check}")
        
        # Get auto-valuation usage (if binder_id provided, otherwise just check limits)
        # For the usage endpoint, we'll just show aggregate data
        # We don't need a specific binder_id, so we'll check against user's first binder
        from backend.database.schema import Binder
        binders = db.query(Binder.id).filter(Binder.user_id == user_id).first()
        binder_id = binders[0] if binders else 1  # Default to 1 if no binders
        
        auto_val_check = await service.check_auto_valuation_limit(user_id, binder_id)
        
        # Get analytics access
        has_analytics = await service.can_access_analytics(user_id)
        
        return {
            'tier': tier,
            'searches_used': search_check['used'],
            'searches_limit': search_check['limit'],
            'searches_remaining': search_check['remaining'],
            'cards_count': card_check['count'],
            'card_limit': card_check['limit'],
            'cards_remaining': card_check['remaining'],
            'auto_valuation_count': auto_val_check['count'],
            'auto_valuation_limit': auto_val_check['limit'],
            'auto_valuation_remaining': auto_val_check['remaining'],
            'has_analytics_access': has_analytics
        }
        
    except Exception as e:
        logger.error(f"[BILLING] Error fetching usage stats: {e}")
        raise HTTPException(500, f"Error fetching usage stats: {str(e)}")


# ============================================================================
# Webhook Handlers
# ============================================================================

async def handle_checkout_completed(session: dict):
    """
    Handle successful checkout - create or update subscription record.
    
    Args:
        session: Stripe checkout session object
    """
    user_id = session['metadata']['user_id']
    tier = session['metadata']['tier']
    interval = session['metadata']['interval']
    customer_id = session['customer']
    subscription_id = session['subscription']
    
    logger.info(f"[WEBHOOK] Processing checkout completion for user {user_id}: {tier}/{interval}")
    
    try:
        # Get subscription details from Stripe
        subscription = stripe.Subscription.retrieve(subscription_id)
        
        # Create or update subscription in Supabase
        supabase = get_supabase_client()
        
        subscription_data = {
            'user_id': user_id,
            'tier': tier,
            'billing_interval': interval,
            'status': subscription['status'],
            'stripe_customer_id': customer_id,
            'stripe_subscription_id': subscription_id,
            'current_period_start': datetime.fromtimestamp(subscription['current_period_start']).isoformat(),
            'current_period_end': datetime.fromtimestamp(subscription['current_period_end']).isoformat(),
            'cancel_at_period_end': subscription['cancel_at_period_end'],
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Check if subscription already exists
        existing = supabase.table('subscriptions')\
            .select('id')\
            .eq('user_id', user_id)\
            .execute()
        
        if existing.data:
            # Update existing subscription
            supabase.table('subscriptions')\
                .update(subscription_data)\
                .eq('user_id', user_id)\
                .execute()
            logger.info(f"[WEBHOOK] Updated subscription for user {user_id}")
        else:
            # Create new subscription
            supabase.table('subscriptions').insert(subscription_data).execute()
            logger.info(f"[WEBHOOK] Created subscription for user {user_id}")
        
    except Exception as e:
        logger.error(f"[WEBHOOK] Error handling checkout completion: {e}")
        raise


async def handle_subscription_updated(subscription: dict):
    """
    Handle subscription updates (upgrades, downgrades, renewals).
    
    Args:
        subscription: Stripe subscription object
    """
    subscription_id = subscription['id']
    logger.info(f"[WEBHOOK] Processing subscription update: {subscription_id}")
    
    try:
        supabase = get_supabase_client()
        
        # Find subscription by stripe_subscription_id
        existing = supabase.table('subscriptions')\
            .select('user_id')\
            .eq('stripe_subscription_id', subscription_id)\
            .execute()
        
        if not existing.data:
            logger.warning(f"[WEBHOOK] No subscription found for Stripe ID {subscription_id}")
            return
        
        # Update subscription details
        update_data = {
            'status': subscription['status'],
            'current_period_start': datetime.fromtimestamp(subscription['current_period_start']).isoformat(),
            'current_period_end': datetime.fromtimestamp(subscription['current_period_end']).isoformat(),
            'cancel_at_period_end': subscription['cancel_at_period_end'],
            'updated_at': datetime.utcnow().isoformat()
        }
        
        supabase.table('subscriptions')\
            .update(update_data)\
            .eq('stripe_subscription_id', subscription_id)\
            .execute()
        
        logger.info(f"[WEBHOOK] Updated subscription {subscription_id}")
        
    except Exception as e:
        logger.error(f"[WEBHOOK] Error handling subscription update: {e}")
        raise


async def handle_subscription_deleted(subscription: dict):
    """
    Handle subscription cancellation - mark as canceled.
    
    Note: We keep the user's data but enforce free tier limits.
    
    Args:
        subscription: Stripe subscription object
    """
    subscription_id = subscription['id']
    logger.info(f"[WEBHOOK] Processing subscription deletion: {subscription_id}")
    
    try:
        supabase = get_supabase_client()
        
        # Update subscription status to canceled and downgrade to free tier
        supabase.table('subscriptions')\
            .update({
                'tier': 'free',
                'status': 'canceled',
                'cancel_at_period_end': False,
                'updated_at': datetime.utcnow().isoformat()
            })\
            .eq('stripe_subscription_id', subscription_id)\
            .execute()
        
        logger.info(f"[WEBHOOK] Marked subscription {subscription_id} as canceled, downgraded to free tier")
        
    except Exception as e:
        logger.error(f"[WEBHOOK] Error handling subscription deletion: {e}")
        raise


async def handle_payment_failed(invoice: dict):
    """
    Handle failed payment - mark subscription as past_due.
    
    Args:
        invoice: Stripe invoice object
    """
    subscription_id = invoice.get('subscription')
    logger.info(f"[WEBHOOK] Processing payment failure for subscription: {subscription_id}")
    
    if not subscription_id:
        logger.warning("[WEBHOOK] Payment failure event has no subscription ID")
        return
    
    try:
        supabase = get_supabase_client()
        
        # Update subscription status to past_due
        supabase.table('subscriptions')\
            .update({
                'status': 'past_due',
                'updated_at': datetime.utcnow().isoformat()
            })\
            .eq('stripe_subscription_id', subscription_id)\
            .execute()
        
        logger.info(f"[WEBHOOK] Marked subscription {subscription_id} as past_due")
        
        # TODO: Send notification email to user
        
    except Exception as e:
        logger.error(f"[WEBHOOK] Error handling payment failure: {e}")
        raise


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature")
):
    """
    Handle Stripe webhook events.
    
    **Authentication:** Verified via Stripe signature
    
    **Supported Events:**
    - `checkout.session.completed`: New subscription created
    - `customer.subscription.updated`: Subscription modified
    - `customer.subscription.deleted`: Subscription canceled
    - `invoice.payment_failed`: Payment failed
    
    **Security:**
    - Verifies webhook signature using STRIPE_WEBHOOK_SECRET
    - Logs all events to stripe_events table
    - Idempotent processing (same event won't be processed twice)
    """
    payload = await request.body()
    
    if not stripe_signature:
        logger.warning("[WEBHOOK] Missing Stripe signature header")
        raise HTTPException(400, "Missing signature")
    
    if not STRIPE_WEBHOOK_SECRET:
        logger.error("[WEBHOOK] STRIPE_WEBHOOK_SECRET not configured")
        raise HTTPException(500, "Webhook secret not configured")
    
    try:
        # Verify webhook signature
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        logger.warning(f"[WEBHOOK] Invalid payload: {e}")
        raise HTTPException(400, "Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        logger.warning(f"[WEBHOOK] Invalid signature: {e}")
        raise HTTPException(400, "Invalid signature")
    
    event_id = event['id']
    event_type = event['type']
    event_data = event['data']['object']
    
    logger.info(f"[WEBHOOK] Received event: {event_type} (ID: {event_id})")
    
    # Check for duplicate events
    try:
        supabase = get_supabase_client()
        existing = supabase.table('stripe_events')\
            .select('id')\
            .eq('stripe_event_id', event_id)\
            .execute()
        
        if existing.data:
            logger.info(f"[WEBHOOK] Event {event_id} already processed, skipping")
            return {'status': 'duplicate', 'event_id': event_id}
    except Exception as e:
        logger.warning(f"[WEBHOOK] Could not check for duplicate event: {e}")
    
    # Process event
    error_message = None
    processed = False
    
    try:
        if event_type == 'checkout.session.completed':
            await handle_checkout_completed(event_data)
            processed = True
        elif event_type == 'customer.subscription.updated':
            await handle_subscription_updated(event_data)
            processed = True
        elif event_type == 'customer.subscription.deleted':
            await handle_subscription_deleted(event_data)
            processed = True
        elif event_type == 'invoice.payment_failed':
            await handle_payment_failed(event_data)
            processed = True
        else:
            logger.info(f"[WEBHOOK] Unhandled event type: {event_type}")
            processed = False
    except Exception as e:
        logger.error(f"[WEBHOOK] Error processing event {event_id}: {e}")
        error_message = str(e)
        processed = False
    
    # Log event to database
    await log_stripe_event(
        event_id=event_id,
        event_type=event_type,
        payload=event,
        customer_id=event_data.get('customer'),
        subscription_id=event_data.get('subscription') or event_data.get('id'),
        error_message=error_message,
        processed=processed
    )
    
    if error_message:
        raise HTTPException(500, f"Error processing webhook: {error_message}")
    
    return {'status': 'success', 'event_id': event_id}
