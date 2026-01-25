/**
 * Subscription Management Module
 * Handles subscription tiers, usage tracking, and billing interactions
 */

const SubscriptionManager = (function() {
    'use strict';
    
    // Private variables
    let currentSubscription = null;
    let currentUsage = null;
    let usageCheckInterval = null;
    
    // Subscription tier constants
    const TIERS = {
        FREE: 'free',
        MEMBER: 'member',
        FOUNDER: 'founder'
    };
    
    const TIER_LIMITS = {
        [TIERS.FREE]: {
            dailySearches: 5,
            cards: 50,
            autoValuation: false
        },
        [TIERS.MEMBER]: {
            dailySearches: 50,
            cards: null, // unlimited
            autoValuation: true
        },
        [TIERS.FOUNDER]: {
            dailySearches: null, // unlimited
            cards: null, // unlimited
            autoValuation: true
        }
    };
    
    // Pricing constants
    const PRICING = {
        [TIERS.MEMBER]: {
            monthly: 5.00,
            annual: 50.00
        },
        [TIERS.FOUNDER]: {
            monthly: 10.00,
            annual: 100.00
        }
    };
    
    /**
     * Initialize the subscription module
     */
    async function init() {
        try {
            console.log('[SUBSCRIPTION] Initializing subscription module...');
            
            // Check if user is authenticated
            if (!AuthModule || !AuthModule.isAuthenticated()) {
                console.log('[SUBSCRIPTION] User not authenticated, using free tier');
                currentSubscription = {
                    tier: TIERS.FREE,
                    status: 'active',
                    billing_cycle: null,
                    current_period_end: null
                };
                return;
            }
            
            // Fetch current subscription
            await fetchCurrentSubscription();
            
            // Fetch current usage
            await fetchUsageStats();
            
            // Start periodic usage check (every 30 seconds)
            startUsageCheck();
            
            // Update usage indicator in UI
            updateUsageIndicator();
            
            console.log('[SUBSCRIPTION] Module initialized successfully');
            
        } catch (error) {
            console.error('[SUBSCRIPTION] Initialization error:', error);
        }
    }
    
    /**
     * Fetch current subscription from backend
     */
    async function fetchCurrentSubscription() {
        try {
            const user = AuthModule.getCurrentUser();
            if (!user) {
                currentSubscription = { tier: TIERS.FREE, status: 'active' };
                return;
            }
            
            const token = (await AuthModule.getClient().auth.getSession()).data.session?.access_token;
            
            const response = await fetch('/api/billing/subscription', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            currentSubscription = data;
            
            console.log('[SUBSCRIPTION] Current subscription:', currentSubscription);
            
        } catch (error) {
            console.error('[SUBSCRIPTION] Error fetching subscription:', error);
            // Default to free tier on error
            currentSubscription = { tier: TIERS.FREE, status: 'active' };
        }
    }
    
    /**
     * Fetch usage statistics from backend
     */
    async function fetchUsageStats() {
        try {
            const user = AuthModule.getCurrentUser();
            if (!user) {
                currentUsage = { searches_used: 0, cards_count: 0 };
                return;
            }
            
            const token = (await AuthModule.getClient().auth.getSession()).data.session?.access_token;
            
            const response = await fetch('/api/billing/usage', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            currentUsage = data;
            
            console.log('[SUBSCRIPTION] Current usage:', currentUsage);
            
            // Check if approaching limits
            checkUsageLimits();
            
        } catch (error) {
            console.error('[SUBSCRIPTION] Error fetching usage:', error);
            currentUsage = { searches_used: 0, cards_count: 0 };
        }
    }
    
    /**
     * Start periodic usage check
     */
    function startUsageCheck() {
        if (usageCheckInterval) {
            clearInterval(usageCheckInterval);
        }
        
        // Check usage every 30 seconds
        usageCheckInterval = setInterval(async () => {
            await fetchUsageStats();
            updateUsageIndicator();
        }, 30000);
    }
    
    /**
     * Stop periodic usage check
     */
    function stopUsageCheck() {
        if (usageCheckInterval) {
            clearInterval(usageCheckInterval);
            usageCheckInterval = null;
        }
    }
    
    /**
     * Check if user is approaching or at limits
     */
    function checkUsageLimits() {
        if (!currentSubscription || !currentUsage) return;
        
        const tier = currentSubscription.tier;
        const limits = TIER_LIMITS[tier];
        
        // Check search limit
        if (limits.dailySearches !== null) {
            const searchesUsed = currentUsage.searches_used || 0;
            const searchLimit = limits.dailySearches;
            
            // Show warning at 80% usage
            if (searchesUsed >= searchLimit * 0.8 && searchesUsed < searchLimit) {
                console.log('[SUBSCRIPTION] Approaching search limit:', searchesUsed, '/', searchLimit);
            }
        }
        
        // Check card limit
        if (limits.cards !== null) {
            const cardsCount = currentUsage.cards_count || 0;
            const cardLimit = limits.cards;
            
            // Show warning at 80% usage
            if (cardsCount >= cardLimit * 0.8 && cardsCount < cardLimit) {
                console.log('[SUBSCRIPTION] Approaching card limit:', cardsCount, '/', cardLimit);
            }
        }
    }
    
    /**
     * Update usage indicator in navbar/header
     */
    function updateUsageIndicator() {
        // Find or create usage indicator element
        let indicator = document.getElementById('usage-indicator');
        
        if (!indicator) {
            // Create indicator if it doesn't exist
            const authButton = document.getElementById('auth-button');
            if (!authButton) return;
            
            indicator = document.createElement('div');
            indicator.id = 'usage-indicator';
            indicator.style.cssText = `
                font-size: 0.85rem;
                font-weight: 600;
                padding: 0.5rem 1rem;
                border-radius: 8px;
                background: var(--background-color);
                border: 1px solid var(--border-color);
                transition: all 0.3s ease;
                white-space: nowrap;
                margin-right: 0.75rem;
            `;
            authButton.parentElement.insertBefore(indicator, authButton);
        }
        
        if (!currentSubscription || !currentUsage) {
            indicator.style.display = 'none';
            return;
        }
        
        const tier = currentSubscription.tier;
        const limits = TIER_LIMITS[tier];
        
        // Show searches for Free and Member tiers
        if (tier === TIERS.FOUNDER) {
            indicator.innerHTML = `<span style="color: var(--accent-green);">∞ Unlimited</span>`;
            indicator.style.display = 'block';
        } else if (limits.dailySearches !== null) {
            const searchesUsed = currentUsage.searches_used || 0;
            const searchLimit = limits.dailySearches;
            const percentage = (searchesUsed / searchLimit) * 100;
            
            // Color based on usage
            let color = 'var(--subtle-text-color)';
            if (percentage >= 100) {
                color = 'var(--accent-red)';
            } else if (percentage >= 80) {
                color = 'var(--accent-orange)';
            }
            
            indicator.innerHTML = `<span style="color: ${color};">${searchesUsed}/${searchLimit} searches</span>`;
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    }
    
    /**
     * Create Stripe checkout session
     * @param {string} tier - Subscription tier (member or founder)
     * @param {string} interval - Billing interval (monthly or annual)
     * @returns {Promise<void>}
     */
    async function createCheckoutSession(tier, interval) {
        try {
            console.log('[SUBSCRIPTION] Creating checkout session:', tier, interval);
            
            const user = AuthModule.getCurrentUser();
            if (!user) {
                showAuthRequired();
                return;
            }
            
            const token = (await AuthModule.getClient().auth.getSession()).data.session?.access_token;
            
            const response = await fetch('/api/billing/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    tier: tier,
                    interval: interval
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to create checkout session');
            }
            
            const data = await response.json();
            
            if (data.checkout_url) {
                // Redirect to Stripe checkout
                console.log('[SUBSCRIPTION] Redirecting to checkout:', data.checkout_url);
                window.location.href = data.checkout_url;
            } else {
                throw new Error('No checkout URL returned');
            }
            
        } catch (error) {
            console.error('[SUBSCRIPTION] Error creating checkout session:', error);
            showError('Failed to start checkout. Please try again.');
        }
    }
    
    /**
     * Open Stripe Customer Portal
     * @returns {Promise<void>}
     */
    async function openCustomerPortal() {
        try {
            console.log('[SUBSCRIPTION] Opening customer portal');
            
            const user = AuthModule.getCurrentUser();
            if (!user) {
                showAuthRequired();
                return;
            }
            
            const token = (await AuthModule.getClient().auth.getSession()).data.session?.access_token;
            
            const response = await fetch('/api/billing/create-portal-session', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to open customer portal');
            }
            
            const data = await response.json();
            
            if (data.portal_url) {
                // Redirect to Stripe portal
                console.log('[SUBSCRIPTION] Redirecting to portal:', data.portal_url);
                window.location.href = data.portal_url;
            } else {
                throw new Error('No portal URL returned');
            }
            
        } catch (error) {
            console.error('[SUBSCRIPTION] Error opening portal:', error);
            showError('Failed to open billing portal. Please try again.');
        }
    }
    
    /**
     * Show search limit warning banner (soft warning)
     * @param {number} used - Searches used
     * @param {number} limit - Search limit
     */
    function showSearchLimitWarning(used, limit) {
        // Remove existing warning
        const existing = document.getElementById('limit-warning-banner');
        if (existing) existing.remove();
        
        const banner = document.createElement('div');
        banner.id = 'limit-warning-banner';
        banner.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #ff9500, #ff6b35);
            color: white;
            padding: 1rem 2rem;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(255, 149, 0, 0.4);
            z-index: 9999;
            font-family: var(--font-family);
            font-size: 0.95rem;
            font-weight: 600;
            text-align: center;
            animation: slideDown 0.5s ease;
            max-width: 90%;
        `;
        
        banner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem;">
                <span style="font-size: 1.5rem;">⚠️</span>
                <div>
                    <div>You've used ${used} of ${limit} daily searches</div>
                    <button onclick="SubscriptionManager.showUpgradeModal('search_limit_warning')" style="
                        background: white;
                        color: #ff9500;
                        border: none;
                        padding: 0.5rem 1rem;
                        border-radius: 6px;
                        font-size: 0.85rem;
                        font-weight: 600;
                        margin-top: 0.5rem;
                        cursor: pointer;
                    ">Upgrade for More</button>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: transparent;
                    border: none;
                    color: white;
                    font-size: 1.5rem;
                    cursor: pointer;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                ">&times;</button>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Auto-remove after 10 seconds
        setTimeout(() => banner.remove(), 10000);
    }
    
    /**
     * Show search limit blocked modal (hard limit)
     * @param {number} limit - Search limit
     */
    function showSearchLimitBlocked(limit) {
        showLimitModal({
            title: 'Daily Search Limit Reached',
            icon: '🔒',
            message: `You've reached your daily limit of ${limit} searches.`,
            subtext: 'Upgrade to get more searches or unlimited access.',
            feature: 'search_limit_exceeded'
        });
    }
    
    /**
     * Show card limit blocked modal
     * @param {number} count - Current card count
     * @param {number} limit - Card limit
     */
    function showCardLimitBlocked(count, limit) {
        showLimitModal({
            title: `${limit} Card Limit Reached`,
            icon: '📦',
            message: `You have ${count} cards in your collection. The free tier is limited to ${limit} cards.`,
            subtext: 'Upgrade to Member or Founder for unlimited card storage.',
            feature: 'card_limit_exceeded'
        });
    }
    
    /**
     * Show tier required modal (generic feature gate)
     * @param {string} feature - Feature name
     * @param {string} requiredTier - Required subscription tier
     */
    function showTierRequired(feature, requiredTier) {
        const tierName = requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1);
        
        showLimitModal({
            title: `${tierName} Subscription Required`,
            icon: '⭐',
            message: `This feature requires a ${tierName} subscription.`,
            subtext: `Upgrade to ${tierName} to unlock this and other premium features.`,
            feature: feature,
            requiredTier: requiredTier
        });
    }
    
    // Modal instance for subscription/upgrade prompts
    let subscriptionModal = null;
    
    /**
     * Show upgrade modal with limit information
     * @param {Object} options - Modal configuration
     */
    function showLimitModal(options) {
        const { title, icon, message, subtext, feature, requiredTier } = options;
        
        // Generate pricing content HTML
        const memberCard = requiredTier !== TIERS.FOUNDER ? `
            <div class="modal-pricing-card featured">
                <h3 class="modal-pricing-title">Member</h3>
                <div class="modal-pricing-price">
                    $5<span>/month</span>
                </div>
                <ul class="modal-pricing-features">
                    <li>50 searches/day</li>
                    <li>Unlimited cards</li>
                    <li>Auto-valuation updates</li>
                </ul>
                <button class="modal-btn modal-btn-primary" onclick="SubscriptionManager.createCheckoutSession('member', 'monthly'); Modal.getInstance('subscription-limit-modal').close();">
                    Upgrade to Member
                </button>
            </div>
        ` : '';
        
        const founderCard = `
            <div class="modal-pricing-card founder">
                <h3 class="modal-pricing-title" style="color: var(--accent-purple);">Founder</h3>
                <div class="modal-pricing-price">
                    $10<span>/month</span>
                </div>
                <ul class="modal-pricing-features">
                    <li>Unlimited searches</li>
                    <li>Unlimited cards</li>
                    <li>Auto-valuation updates</li>
                    <li>Priority support</li>
                </ul>
                <button class="modal-btn modal-btn-primary" style="background: linear-gradient(135deg, var(--accent-purple), var(--primary-blue)); box-shadow: 0 4px 12px rgba(88, 86, 214, 0.3);" onclick="SubscriptionManager.createCheckoutSession('founder', 'monthly'); Modal.getInstance('subscription-limit-modal').close();">
                    Upgrade to Founder
                </button>
            </div>
        `;
        
        const footerNote = feature === 'search_limit_exceeded'
            ? 'Searches reset at midnight UTC'
            : 'See all features on the pricing page';
        
        const content = `
            <div style="text-align: center;">
                <div class="modal-icon-box">
                    <span class="modal-icon">${icon}</span>
                </div>
                <p style="font-size: 1rem; color: var(--text-color); margin: 0 0 0.5rem 0;">${message}</p>
                <p style="font-size: 0.9rem; color: var(--subtle-text-color); margin: 0 0 2rem 0;">${subtext}</p>
                
                <div class="modal-pricing-grid">
                    ${memberCard}
                    ${founderCard}
                </div>
                
                <p style="font-size: 0.85rem; color: var(--subtle-text-color); margin: 1.5rem 0 1rem 0;">
                    ${footerNote}
                </p>
                
                <button class="modal-btn modal-btn-secondary" onclick="Modal.getInstance('subscription-limit-modal').close();">
                    Maybe Later
                </button>
            </div>
        `;
        
        // Check if Modal component is available
        if (typeof Modal !== 'undefined') {
            // Destroy existing modal if it exists
            const existing = Modal.getInstance('subscription-limit-modal');
            if (existing) {
                existing.destroy();
            }
            
            // Create new modal using Modal component
            subscriptionModal = new Modal({
                id: 'subscription-limit-modal',
                title: title,
                content: content,
                size: 'medium',
                showCloseButton: true,
                closeOnOverlayClick: true,
                closeOnEscape: true
            });
            
            subscriptionModal.open();
        } else {
            // Fallback to original implementation
            const existing = document.getElementById('subscription-limit-modal');
            if (existing) existing.remove();
            
            const overlay = document.createElement('div');
            overlay.id = 'subscription-limit-modal';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(8px);
                z-index: 10000;
                display: flex;
                justify-content: center;
                align-items: center;
                animation: fadeIn 0.3s ease;
            `;
            
            const modal = document.createElement('div');
            modal.style.cssText = `
                background: var(--card-background);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 500px;
                padding: 2rem;
                position: relative;
                border: 1px solid var(--border-color);
                animation: scaleIn 0.3s ease;
            `;
            
            modal.innerHTML = `
                <button onclick="this.closest('#subscription-limit-modal').remove()" style="
                    position: absolute;
                    top: 1rem;
                    right: 1rem;
                    background: transparent;
                    border: none;
                    font-size: 1.5rem;
                    color: var(--subtle-text-color);
                    cursor: pointer;
                    padding: 0;
                    width: 32px;
                    height: 32px;
                ">&times;</button>
                <h2 style="font-size: 1.75rem; font-weight: 700; margin: 0 0 1rem 0; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-align: center;">${title}</h2>
                ${content}
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                }
            });
        }
    }
    
    /**
     * Show generic upgrade modal
     */
    function showUpgradeModal(reason) {
        showLimitModal({
            title: 'Upgrade Your Plan',
            icon: '⭐',
            message: 'Get more searches, unlimited cards, and automated valuations.',
            subtext: 'Choose the plan that\'s right for you.',
            feature: reason || 'upgrade_prompt'
        });
    }
    
    /**
     * Show auth required message
     */
    function showAuthRequired() {
        // Check if Modal component is available
        if (typeof Modal !== 'undefined') {
            const existing = Modal.getInstance('auth-required-modal');
            if (existing) {
                existing.destroy();
            }
            
            const content = `
                <div style="text-align: center; padding: 1rem 0;">
                    <div class="modal-icon-box">
                        <span class="modal-icon">🔐</span>
                    </div>
                    <p style="margin: 0 0 1.5rem 0; color: var(--subtle-text-color);">Please log in to manage your subscription.</p>
                    <button class="modal-btn modal-btn-primary" onclick="AuthModule.showAuthModal(); Modal.getInstance('auth-required-modal').close();">
                        Log In
                    </button>
                </div>
            `;
            
            const modal = new Modal({
                id: 'auth-required-modal',
                title: 'Login Required',
                content: content,
                size: 'small',
                closeOnOverlayClick: true,
                closeOnEscape: true
            });
            
            modal.open();
            
            // Auto-close after 5 seconds
            setTimeout(() => {
                if (modal.isOpen) {
                    modal.close();
                }
            }, 5000);
        } else {
            // Fallback to original implementation
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--card-background);
                padding: 2rem;
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                z-index: 10001;
                text-align: center;
                border: 1px solid var(--border-color);
            `;
            
            modal.innerHTML = `
                <h3 style="margin: 0 0 1rem 0; font-size: 1.5rem; font-weight: 700; color: var(--text-color);">Login Required</h3>
                <p style="margin: 0 0 1.5rem 0; color: var(--subtle-text-color);">Please log in to manage your subscription.</p>
                <button onclick="AuthModule.showAuthModal(); this.parentElement.remove();" style="
                    background: var(--gradient-primary);
                    color: white;
                    border: none;
                    padding: 1rem 2rem;
                    border-radius: 10px;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
                ">Log In</button>
            `;
            
            document.body.appendChild(modal);
            
            setTimeout(() => modal.remove(), 5000);
        }
    }
    
    /**
     * Show error message
     * Uses showAlertModal if Modal component is available, otherwise falls back to banner
     */
    function showError(message) {
        // Check if showAlertModal is available (from modal.js)
        if (typeof showAlertModal === 'function') {
            showAlertModal('Error', message, {
                id: 'subscription-error-modal',
                icon: '❌',
                size: 'small',
                buttonText: 'OK'
            });
        } else {
            // Fallback to banner
            const banner = document.createElement('div');
            banner.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #ff3b30, #ff6b6b);
                color: white;
                padding: 1rem 2rem;
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(255, 59, 48, 0.4);
                z-index: 10001;
                font-family: var(--font-family);
                font-size: 0.95rem;
                font-weight: 600;
                text-align: center;
                animation: slideDown 0.5s ease;
                max-width: 90%;
            `;
            
            banner.textContent = message;
            document.body.appendChild(banner);
            
            setTimeout(() => banner.remove(), 5000);
        }
    }
    
    /**
     * Get current subscription tier
     * @returns {string} Current tier
     */
    function getCurrentTier() {
        return currentSubscription?.tier || TIERS.FREE;
    }
    
    /**
     * Get subscription limits for current tier
     * @returns {Object} Tier limits
     */
    function getTierLimits() {
        const tier = getCurrentTier();
        return TIER_LIMITS[tier];
    }
    
    /**
     * Check if feature is available for current tier
     * @param {string} feature - Feature to check
     * @returns {boolean} True if available
     */
    function hasFeature(feature) {
        const limits = getTierLimits();
        return limits[feature] === true || limits[feature] === null;
    }
    
    // Public API
    return {
        init,
        fetchCurrentSubscription,
        fetchUsageStats,
        updateUsageIndicator,
        createCheckoutSession,
        openCustomerPortal,
        showSearchLimitWarning,
        showSearchLimitBlocked,
        showCardLimitBlocked,
        showTierRequired,
        showUpgradeModal,
        getCurrentTier,
        getTierLimits,
        hasFeature,
        getCurrentSubscription: () => currentSubscription,
        getCurrentUsage: () => currentUsage,
        TIERS,
        PRICING
    };
})();

// Initialize subscription module when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Wait for AuthModule to initialize first
        setTimeout(() => SubscriptionManager.init(), 500);
    });
} else {
    setTimeout(() => SubscriptionManager.init(), 500);
}

// Expose globally
window.SubscriptionManager = SubscriptionManager;
