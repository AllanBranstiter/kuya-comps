/**
 * Onboarding Tour Manager
 * 
 * Provides a first-time user guided tour using Driver.js
 * 
 * Features:
 * - localStorage persistence to show tour only once
 * - Restart capability via OnboardingTour.restart()
 * - Conditional steps based on authentication state
 * - Accessible keyboard navigation
 * 
 * Created: January 25, 2026
 * @version 1.0.0
 */

const OnboardingTour = (function() {
    'use strict';

    // Private variables
    const STORAGE_KEY = 'onboardingComplete';
    let driverInstance = null;

    /**
     * Check if user has completed onboarding
     * @returns {boolean} True if onboarding was completed
     */
    function hasCompletedOnboarding() {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        } catch (e) {
            console.warn('[ONBOARDING] localStorage not available:', e);
            return true; // Fail safe - don't show tour if storage unavailable
        }
    }

    /**
     * Mark onboarding as complete
     */
    function markOnboardingComplete() {
        try {
            localStorage.setItem(STORAGE_KEY, 'true');
            console.log('[ONBOARDING] Tour marked as complete');
        } catch (e) {
            console.warn('[ONBOARDING] Could not save completion state:', e);
        }
    }

    /**
     * Clear onboarding completion state (for restart)
     */
    function clearOnboardingState() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('[ONBOARDING] Onboarding state cleared');
        } catch (e) {
            console.warn('[ONBOARDING] Could not clear state:', e);
        }
    }

    /**
     * Check if user is authenticated
     * @returns {boolean} True if user is logged in
     */
    function isUserAuthenticated() {
        return window.AuthModule && typeof AuthModule.isAuthenticated === 'function' && AuthModule.isAuthenticated();
    }

    /**
     * Get tour steps configuration
     * @returns {Array} Array of tour step objects
     */
    function getTourSteps() {
        const steps = [
            // Step 1: Welcome overlay (no element target)
            {
                popover: {
                    title: '👋 Welcome to Kuya Comps!',
                    description: `
                        <p>Your personal dugout for baseball card values and market analysis.</p>
                        <p>This quick tour will show you how to find fair market values for any card in seconds.</p>
                        <p style="font-size: 0.9rem; color: var(--subtle-text-color); margin-top: 1rem;">
                            <strong>⏱️ This tour takes about 60 seconds</strong>
                        </p>
                    `,
                    side: 'center',
                    align: 'center'
                }
            },

            // Step 2: Search box
            {
                element: '#query',
                popover: {
                    title: '🔍 Search for Any Card',
                    description: `
                        <p>Enter any baseball card details here:</p>
                        <ul style="margin: 0.75rem 0; padding-left: 1.25rem;">
                            <li>Year and set (e.g., "2024 Topps Chrome")</li>
                            <li>Player name (e.g., "Elly De La Cruz")</li>
                            <li>Parallel or variation (e.g., "refractor")</li>
                            <li>Card number for precise matches</li>
                        </ul>
                        <p style="font-size: 0.9rem; color: var(--subtle-text-color);">
                            Pro tip: Use quotes around multi-word phrases!
                        </p>
                    `,
                    side: 'bottom',
                    align: 'center'
                }
            },

            // Step 3: Search tips
            {
                element: '.ebay-tips summary',
                popover: {
                    title: '💡 Search Tips',
                    description: `
                        <p>Click here to expand helpful tips for crafting the perfect search query.</p>
                        <p>Learn how to:</p>
                        <ul style="margin: 0.75rem 0; padding-left: 1.25rem;">
                            <li>Use quotes for exact phrases</li>
                            <li>Exclude unwanted results with minus signs</li>
                            <li>Get cleaner results with card numbers</li>
                        </ul>
                    `,
                    side: 'bottom',
                    align: 'start'
                }
            },

            // Step 4: Filter checkboxes
            {
                element: '#exclude_lots',
                popover: {
                    title: '⚙️ Smart Filters',
                    description: `
                        <p>Use these filters to refine your results:</p>
                        <ul style="margin: 0.75rem 0; padding-left: 1.25rem;">
                            <li><strong>Exclude Lots:</strong> Remove bulk listings</li>
                            <li><strong>Raw Only:</strong> Show only ungraded cards</li>
                            <li><strong>Base Only:</strong> Exclude parallels and inserts</li>
                        </ul>
                    `,
                    side: 'bottom',
                    align: 'start'
                }
            },

            // Step 5: Comps sub-tab
            {
                element: '#subtab-comps',
                popover: {
                    title: '📊 Comps Tab',
                    description: `
                        <p>View recent eBay sold listings (comps) for your search.</p>
                        <p>You'll see:</p>
                        <ul style="margin: 0.75rem 0; padding-left: 1.25rem;">
                            <li>Fair Market Value (FMV) estimates</li>
                            <li>Price distribution visualization</li>
                            <li>Recent sold listings with details</li>
                        </ul>
                    `,
                    side: 'bottom',
                    align: 'start'
                }
            },

            // Step 6: Analysis sub-tab
            {
                element: '#subtab-analysis',
                popover: {
                    title: '📈 Market Analysis',
                    description: `
                        <p>Deep dive into advanced market analytics:</p>
                        <ul style="margin: 0.75rem 0; padding-left: 1.25rem;">
                            <li>Market pressure indicators</li>
                            <li>Liquidity profiles</li>
                            <li>Price trend analysis</li>
                        </ul>
                        <p style="font-size: 0.9rem; color: var(--subtle-text-color);">
                            Available after you run a search
                        </p>
                    `,
                    side: 'bottom',
                    align: 'start'
                }
            },

            // Step 7: Grading Intelligence tab
            {
                element: '#tab-intelligence',
                popover: {
                    title: '🧠 Grading Intelligence',
                    description: `
                        <p>Compare prices across different grading companies!</p>
                        <p>See how PSA 10, BGS 9.5, and SGC 10 values compare for the same card.</p>
                        <p style="font-size: 0.9rem; color: var(--subtle-text-color);">
                            Perfect for deciding which grade to buy or whether to cross-grade.
                        </p>
                    `,
                    side: 'bottom',
                    align: 'center'
                }
            }
        ];

        // Step 8: Login button (conditional - only for non-authenticated users)
        if (!isUserAuthenticated()) {
            steps.push({
                element: '#auth-button',
                popover: {
                    title: '🔐 Create Your Free Account',
                    description: `
                        <p>Sign up to unlock additional features:</p>
                        <ul style="margin: 0.75rem 0; padding-left: 1.25rem;">
                            <li>Save your collection</li>
                            <li>Track card values over time</li>
                            <li>Access advanced analytics</li>
                        </ul>
                        <p style="font-size: 0.9rem; color: var(--subtle-text-color);">
                            It's free and takes less than a minute!
                        </p>
                    `,
                    side: 'bottom',
                    align: 'end'
                }
            });
        }

        // Final step: Completion
        steps.push({
            popover: {
                title: '🎉 You\'re All Set!',
                description: `
                    <p>You're ready to start finding card values!</p>
                    <p style="margin-top: 1rem;">
                        <strong>Try it now:</strong> Search for a card you own or want to buy.
                    </p>
                    <p style="font-size: 0.9rem; color: var(--subtle-text-color); margin-top: 1rem;">
                        You can restart this tour anytime from the footer.
                    </p>
                `,
                side: 'center',
                align: 'center'
            }
        });

        return steps;
    }

    /**
     * Initialize the tour driver instance
     */
    function createDriver() {
        // Check if Driver.js is loaded
        if (typeof driver === 'undefined') {
            console.error('[ONBOARDING] Driver.js library not loaded');
            return null;
        }

        return driver({
            // Core configuration
            showProgress: true,
            showButtons: ['next', 'previous', 'close'],
            
            // Button text
            progressText: '{{current}} of {{total}}',
            doneBtnText: 'Finish Tour',
            nextBtnText: 'Next →',
            prevBtnText: '← Back',
            
            // Behavior
            allowClose: true,
            overlayClickNext: false,
            keyboardControl: true,
            
            // Animation
            animate: true,
            smoothScroll: true,
            
            // Overlay
            overlayColor: 'rgba(0, 0, 0, 0.7)',
            
            // Popover styling
            popoverClass: 'kuya-tour-popover',
            
            // Callbacks
            onDestroyStarted: () => {
                console.log('[ONBOARDING] Tour ending...');
            },
            
            onDestroyed: () => {
                markOnboardingComplete();
                console.log('[ONBOARDING] Tour completed and saved');
                
                // Focus the search input after tour completion
                const searchInput = document.getElementById('query');
                if (searchInput) {
                    searchInput.focus();
                }
            },
            
            onNextClick: (element, step, options) => {
                console.log('[ONBOARDING] Advancing to next step');
                driverInstance.moveNext();
            },
            
            onPrevClick: (element, step, options) => {
                console.log('[ONBOARDING] Going to previous step');
                driverInstance.movePrevious();
            },
            
            onCloseClick: () => {
                console.log('[ONBOARDING] Tour closed by user');
                driverInstance.destroy();
            }
        });
    }

    /**
     * Start the onboarding tour
     * @param {boolean} force - Force start even if already completed
     */
    function start(force = false) {
        // Check for disable flag
        if (window.DISABLE_ONBOARDING_TOUR) {
            console.log('[ONBOARDING] Tour disabled via flag');
            return false;
        }

        if (!force && hasCompletedOnboarding()) {
            console.log('[ONBOARDING] Tour already completed, skipping');
            return false;
        }

        // Create driver instance
        driverInstance = createDriver();
        
        if (!driverInstance) {
            console.error('[ONBOARDING] Could not create driver instance');
            return false;
        }

        // Configure steps
        const steps = getTourSteps();
        driverInstance.setSteps(steps);

        // Start the tour
        console.log('[ONBOARDING] Starting tour with', steps.length, 'steps');
        driverInstance.drive();
        
        return true;
    }

    /**
     * Restart the tour (clears completion state)
     */
    function restart() {
        clearOnboardingState();
        return start(true);
    }

    /**
     * Stop the tour if running
     */
    function stop() {
        if (driverInstance) {
            driverInstance.destroy();
            driverInstance = null;
        }
    }

    /**
     * Check if tour is currently active
     * @returns {boolean} True if tour is running
     */
    function isActive() {
        return driverInstance && driverInstance.isActive();
    }

    /**
     * Initialize onboarding on page load
     */
    function init() {
        // Check for disable flag
        if (window.DISABLE_ONBOARDING_TOUR) {
            console.log('[ONBOARDING] Tour disabled via flag');
            return;
        }

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Small delay to ensure all elements are rendered
                setTimeout(() => {
                    if (!hasCompletedOnboarding()) {
                        start();
                    }
                }, 1000);
            });
        } else {
            // DOM already loaded
            setTimeout(() => {
                if (!hasCompletedOnboarding()) {
                    start();
                }
            }, 1000);
        }
        
        console.log('[ONBOARDING] Onboarding module initialized');
    }

    // Public API
    return {
        init,
        start,
        restart,
        stop,
        isActive,
        hasCompleted: hasCompletedOnboarding
    };
})();

// Auto-initialize
OnboardingTour.init();

// Expose globally
window.OnboardingTour = OnboardingTour;

console.log('[ONBOARDING] Onboarding module loaded');
