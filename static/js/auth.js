/**
 * Authentication Module
 * Manages Supabase authentication and user session state
 */

const AuthModule = (function() {
    'use strict';
    
    // Private variables
    let supabaseClient = null;
    let currentUser = null;
    let sessionCheckInterval = null;
    
    /**
     * Initialize the Supabase client and check for existing session
     */
    async function init() {
        try {
            console.log('[AUTH] Initializing Supabase client...');
            
            // Check if Supabase library is loaded
            if (typeof supabase === 'undefined') {
                console.error('[AUTH] Supabase library not loaded. Make sure the CDN script is included.');
                return false;
            }
            
            // Check if configuration is set
            if (!SUPABASE_CONFIG || 
                SUPABASE_CONFIG.URL === 'YOUR_SUPABASE_URL' || 
                SUPABASE_CONFIG.ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
                console.warn('[AUTH] Supabase configuration not set. Please update SUPABASE_CONFIG in config.js');
                console.log('[AUTH] Auth module initialized in placeholder mode (no actual connection)');
                return false;
            }
            
            // Initialize Supabase client
            supabaseClient = supabase.createClient(
                SUPABASE_CONFIG.URL,
                SUPABASE_CONFIG.ANON_KEY
            );
            
            console.log('[AUTH] Supabase client created successfully');
            
            // Check for existing session
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            
            if (error) {
                console.error('[AUTH] Error checking session:', error);
                return false;
            }
            
            if (session) {
                currentUser = session.user;
                console.log('[AUTH] Existing session found for user:', currentUser.email);
                console.log('[AUTH] User ID:', currentUser.id);
                console.log('[AUTH] Session expires at:', new Date(session.expires_at * 1000).toLocaleString());
            } else {
                console.log('[AUTH] No existing session found - user is not logged in');
            }
            
            // Set up auth state change listener
            supabaseClient.auth.onAuthStateChange((event, session) => {
                console.log('[AUTH] Auth state changed:', event);
                
                if (session) {
                    currentUser = session.user;
                    console.log('[AUTH] User logged in:', currentUser.email);
                    
                    // Handle email confirmation
                    if (event === 'SIGNED_IN' && session.user.email_confirmed_at) {
                        // Check if this is from email confirmation (URL will have token)
                        const urlParams = new URLSearchParams(window.location.search);
                        if (urlParams.has('token') || urlParams.has('type')) {
                            showWelcomeMessage(session.user.email);
                            // Clean up URL parameters
                            window.history.replaceState({}, document.title, window.location.pathname);
                        }
                    }
                    
                    // Update UI when user logs in
                    updateAuthUI();
                } else {
                    currentUser = null;
                    console.log('[AUTH] User logged out');
                    updateAuthUI();
                }
            });
            
            // Start periodic session check (every 5 minutes)
            startSessionCheck();
            
            console.log('[AUTH] Auth module initialized successfully');
            return true;
            
        } catch (error) {
            console.error('[AUTH] Initialization error:', error);
            return false;
        }
    }
    
    /**
     * Start periodic session validity check
     */
    function startSessionCheck() {
        // Clear any existing interval
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
        }
        
        // Check session every 5 minutes
        sessionCheckInterval = setInterval(async () => {
            if (!supabaseClient) return;
            
            const { data: { session }, error } = await supabaseClient.auth.getSession();
            
            if (error) {
                console.error('[AUTH] Session check error:', error);
                return;
            }
            
            if (session) {
                console.log('[AUTH] Session still valid, expires at:', 
                    new Date(session.expires_at * 1000).toLocaleString());
            } else {
                console.log('[AUTH] Session expired or invalid');
                currentUser = null;
            }
        }, 5 * 60 * 1000); // 5 minutes
    }
    
    /**
     * Get current user
     * @returns {Object|null} Current user object or null if not logged in
     */
    function getCurrentUser() {
        return currentUser;
    }
    
    /**
     * Check if user is authenticated
     * @returns {boolean} True if user is logged in
     */
    function isAuthenticated() {
        return currentUser !== null;
    }
    
    /**
     * Get Supabase client instance
     * @returns {Object|null} Supabase client or null if not initialized
     */
    function getClient() {
        return supabaseClient;
    }
    
    /**
     * Sign in with email and password
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} Sign in result
     */
    async function signIn(email, password) {
        if (!supabaseClient) {
            console.error('[AUTH] Supabase client not initialized');
            return { error: 'Auth not initialized' };
        }
        
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) {
                console.error('[AUTH] Sign in error:', error);
                return { error };
            }
            
            currentUser = data.user;
            console.log('[AUTH] Sign in successful:', currentUser.email);
            return { data };
            
        } catch (error) {
            console.error('[AUTH] Sign in exception:', error);
            return { error };
        }
    }
    
    /**
     * Sign out current user
     * @returns {Promise<Object>} Sign out result
     */
    async function signOut() {
        if (!supabaseClient) {
            console.error('[AUTH] Supabase client not initialized');
            return { error: 'Auth not initialized' };
        }
        
        try {
            const { error } = await supabaseClient.auth.signOut();
            
            if (error) {
                console.error('[AUTH] Sign out error:', error);
                return { error };
            }
            
            currentUser = null;
            console.log('[AUTH] Sign out successful');
            return { error: null };
            
        } catch (error) {
            console.error('[AUTH] Sign out exception:', error);
            return { error };
        }
    }
    
    /**
     * Sign up new user
     * @param {string} email - User email
     * @param {string} password - User password
     * @param {Object} metadata - Optional user metadata
     * @returns {Promise<Object>} Sign up result
     */
    async function signUp(email, password, metadata = {}) {
        if (!supabaseClient) {
            console.error('[AUTH] Supabase client not initialized');
            return { error: 'Auth not initialized' };
        }
        
        try {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: metadata
                }
            });
            
            if (error) {
                console.error('[AUTH] Sign up error:', error);
                return { error };
            }
            
            console.log('[AUTH] Sign up successful:', data.user?.email);
            return { data };
            
        } catch (error) {
            console.error('[AUTH] Sign up exception:', error);
            return { error };
        }
    }
    
    /**
     * Show authentication modal
     */
    function showAuthModal() {
        const overlay = document.getElementById('auth-modal-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            // Default to login tab
            switchAuthTab('login');
            
            // Activate focus trap for accessibility
            if (window.FocusTrap) {
                FocusTrap.activate(document.querySelector('.auth-modal'));
            }
        }
    }
    
    /**
     * Hide authentication modal
     */
    function hideAuthModal() {
        // Deactivate focus trap before hiding modal
        if (window.FocusTrap) {
            FocusTrap.deactivate();
        }
        
        const overlay = document.getElementById('auth-modal-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            // Clear forms
            clearAuthForms();
        }
    }
    
    /**
     * Switch between login and signup tabs
     * @param {string} tab - 'login' or 'signup'
     */
    function switchAuthTab(tab) {
        // Update tabs
        document.querySelectorAll('.auth-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        // Update forms
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.toggle('active', form.id === `${tab}-form`);
        });
        
        // Update modal title
        const title = document.getElementById('auth-modal-title');
        if (title) {
            title.textContent = tab === 'login' ? 'Welcome Back' : 'Create Account';
        }
        
        // Clear messages
        clearAuthMessages();
    }
    
    /**
     * Clear all auth forms
     */
    function clearAuthForms() {
        document.getElementById('login-form')?.reset();
        document.getElementById('signup-form')?.reset();
        clearAuthMessages();
    }
    
    /**
     * Clear auth error/success messages
     */
    function clearAuthMessages() {
        const messageIds = ['login-error', 'login-success', 'signup-error', 'signup-success'];
        messageIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.textContent = '';
            }
        });
    }
    
    /**
     * Show auth message
     * @param {string} elementId - ID of message element
     * @param {string} message - Message to display
     */
    function showAuthMessage(elementId, message) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = message;
            el.style.display = 'flex';
        }
    }
    
    /**
     * Handle login form submission
     * @param {Event} event - Form submit event
     */
    async function handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('login-email')?.value;
        const password = document.getElementById('login-password')?.value;
        
        if (!email || !password) {
            showAuthMessage('login-error', 'Please enter both email and password');
            return;
        }
        
        // Clear previous messages
        clearAuthMessages();
        
        // Disable submit button
        const submitBtn = event.target.querySelector('.auth-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Logging in...';
        }
        
        try {
            const result = await signIn(email, password);
            
            if (result.error) {
                showAuthMessage('login-error', result.error.message || 'Login failed. Please try again.');
            } else {
                showAuthMessage('login-success', 'Login successful! Welcome back.');
                
                // Update UI
                updateAuthUI();
                
                // Close modal after short delay
                setTimeout(() => {
                    hideAuthModal();
                }, 1500);
            }
        } catch (error) {
            showAuthMessage('login-error', 'An unexpected error occurred. Please try again.');
            console.error('[AUTH] Login error:', error);
        } finally {
            // Re-enable submit button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Login';
            }
        }
    }
    
    /**
     * Handle signup form submission
     * @param {Event} event - Form submit event
     */
    async function handleSignUp(event) {
        event.preventDefault();
        
        const firstName = document.getElementById('signup-first-name')?.value;
        const lastName = document.getElementById('signup-last-name')?.value;
        const email = document.getElementById('signup-email')?.value;
        const password = document.getElementById('signup-password')?.value;
        const confirmPassword = document.getElementById('signup-password-confirm')?.value;
        
        if (!firstName || !lastName || !email || !password || !confirmPassword) {
            showAuthMessage('signup-error', 'Please fill in all fields');
            return;
        }
        
        if (password !== confirmPassword) {
            showAuthMessage('signup-error', 'Passwords do not match');
            return;
        }
        
        if (password.length < 6) {
            showAuthMessage('signup-error', 'Password must be at least 6 characters');
            return;
        }
        
        // Clear previous messages
        clearAuthMessages();
        
        // Disable submit button
        const submitBtn = event.target.querySelector('.auth-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating account...';
        }
        
        try {
            // Create user metadata with name information
            const metadata = {
                first_name: firstName,
                last_name: lastName,
                full_name: `${firstName} ${lastName}`
            };
            
            const result = await signUp(email, password, metadata);
            
            if (result.error) {
                showAuthMessage('signup-error', result.error.message || 'Sign up failed. Please try again.');
            } else {
                showAuthMessage('signup-success', 'Account created successfully! Please check your email to verify your account.');
                
                // Clear form
                event.target.reset();
                
                // Switch to login tab after delay
                setTimeout(() => {
                    switchAuthTab('login');
                }, 3000);
            }
        } catch (error) {
            showAuthMessage('signup-error', 'An unexpected error occurred. Please try again.');
            console.error('[AUTH] Sign up error:', error);
        } finally {
            // Re-enable submit button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Account';
            }
        }
    }
    
    /**
     * Update UI based on authentication state
     */
    function updateAuthUI() {
        const authButton = document.getElementById('auth-button');
        if (!authButton) return;
        
        // Show/hide Portfolio tab based on auth state
        const portfolioTabBtn = document.getElementById('portfolio-tab-btn');
        
        // Show/hide Account navigation link
        const accountNavLink = document.getElementById('account-nav-link');
        
        if (isAuthenticated()) {
            const user = getCurrentUser();
            authButton.textContent = 'Logout';
            authButton.onclick = () => {
                if (confirm('Do you want to log out?')) {
                    handleLogout();
                }
            };
            
            // Show Portfolio tab
            if (portfolioTabBtn) {
                portfolioTabBtn.style.display = 'block';
            }
            
            // Show Account link
            if (accountNavLink) {
                accountNavLink.style.display = 'block';
            }
            
            // Apply route gating - show Market Analysis
            enableMarketAnalysis();
        } else {
            authButton.textContent = 'Login';
            authButton.onclick = showAuthModal;
            
            // Hide Portfolio tab
            if (portfolioTabBtn) {
                portfolioTabBtn.style.display = 'none';
            }
            
            // Hide Account link
            if (accountNavLink) {
                accountNavLink.style.display = 'none';
            }
            
            // Apply route gating - hide Market Analysis
            disableMarketAnalysis();
        }
    }
    
    /**
     * Handle logout
     */
    async function handleLogout() {
        try {
            const result = await signOut();
            
            if (result.error) {
                console.error('[AUTH] Logout error:', result.error);
                if (typeof showError === 'function') {
                    showError('Logout failed. Please try again.', 'error');
                }
            } else {
                console.log('[AUTH] Logout successful');
                
                // Update UI
                updateAuthUI();
                
                // Switch to comps tab if on portfolio tab
                const portfolioTab = document.getElementById('portfolio-tab');
                if (portfolioTab && portfolioTab.classList.contains('active')) {
                    if (typeof switchTab === 'function') {
                        switchTab('comps');
                    }
                }
                
                // Show success message
                if (typeof showSuccess === 'function') {
                    showSuccess('Logged out successfully');
                } else {
                    console.log('[AUTH] Logged out successfully');
                }
            }
        } catch (error) {
            console.error('[AUTH] Logout exception:', error);
        }
    }
    
    /**
     * Initialize auth UI and event listeners
     */
    function initAuthUI() {
        // Set up form event listeners
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
        
        const signupForm = document.getElementById('signup-form');
        if (signupForm) {
            signupForm.addEventListener('submit', handleSignUp);
        }
        
        // Close modal when clicking outside
        const overlay = document.getElementById('auth-modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    hideAuthModal();
                }
            });
        }
        
        // Update auth button based on current state
        updateAuthUI();
        
        console.log('[AUTH] UI initialized');
    }
    
    /**
     * Save search results to Supabase database
     * @param {Object} searchData - Search data to save
     * @returns {Promise<Object>} Save result
     */
    async function saveSearchToSupabase(searchData) {
        if (!supabaseClient) {
            console.error('[AUTH] Supabase client not initialized');
            return { error: 'Auth not initialized' };
        }
        
        if (!currentUser) {
            console.error('[AUTH] User not logged in');
            return { error: 'User not logged in' };
        }
        
        try {
            console.log('[AUTH] Saving search to Supabase:', searchData);
            
            // Prepare data for insertion
            const dataToSave = {
                user_id: currentUser.id,
                query: searchData.query || '',
                fmv: searchData.fmv || null,
                quick_sale: searchData.quick_sale || null,
                patient_sale: searchData.patient_sale || null,
                market_confidence: searchData.market_confidence || null,
                liquidity_score: searchData.liquidity_score || null,
                market_pressure: searchData.market_pressure || null,
                sold_count: searchData.sold_count || 0,
                active_count: searchData.active_count || 0,
                min_price: searchData.min_price || null,
                max_price: searchData.max_price || null,
                avg_price: searchData.avg_price || null,
                search_metadata: searchData.metadata || {}
            };
            
            const { data, error } = await supabaseClient
                .from('saved_searches')
                .insert([dataToSave])
                .select();
            
            if (error) {
                console.error('[AUTH] Error saving search:', error);
                return { error };
            }
            
            console.log('[AUTH] Search saved successfully:', data);
            return { data };
            
        } catch (error) {
            console.error('[AUTH] Exception saving search:', error);
            return { error };
        }
    }
    
    /**
     * Fetch all saved searches for the logged-in user
     * @returns {Promise<Object>} Saved searches result
     */
    async function fetchSavedSearches() {
        if (!supabaseClient) {
            console.error('[AUTH] Supabase client not initialized');
            return { error: 'Auth not initialized' };
        }
        
        if (!currentUser) {
            console.error('[AUTH] User not logged in');
            return { error: 'User not logged in' };
        }
        
        try {
            console.log('[AUTH] Fetching saved searches for user:', currentUser.id);
            
            const { data, error } = await supabaseClient
                .from('saved_searches')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('[AUTH] Error fetching saved searches:', error);
                return { error };
            }
            
            console.log('[AUTH] Fetched', data?.length || 0, 'saved searches');
            return { data };
            
        } catch (error) {
            console.error('[AUTH] Exception fetching saved searches:', error);
            return { error };
        }
    }
    
    /**
     * Display the collection portfolio (binder view)
     * Delegates to CollectionModule for Phase 3 implementation
     */
    async function displayPortfolio() {
        // Use the new binder view from CollectionModule (Phase 3)
        if (window.CollectionModule && window.CollectionModule.displayBinderView) {
            await window.CollectionModule.displayBinderView();
        } else {
            // Fallback if CollectionModule not loaded
            const container = document.getElementById('portfolio-container');
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                        <h3 style="margin: 0 0 1rem 0; color: #ff3b30; font-size: 1.5rem; font-weight: 600;">⚠️ Module Not Loaded</h3>
                        <p style="margin: 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color);">Collection module failed to load. Please refresh the page.</p>
                    </div>
                `;
            }
        }
    }
    
    /**
     * Enable Market Analysis tab (remove route gating)
     */
    function enableMarketAnalysis() {
        // Market Analysis is always visible in the Analysis sub-tab
        // No gating needed - all users can see it
        console.log('[AUTH] Market Analysis enabled for authenticated user');
    }
    
    /**
     * Disable Market Analysis tab (apply route gating)
     */
    function disableMarketAnalysis() {
        // Show login prompt in Analysis sub-tab when not authenticated
        const analysisSubtab = document.getElementById('analysis-subtab');
        if (analysisSubtab) {
            analysisSubtab.innerHTML = `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">🔒 Login Required</h3>
                    <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto;">Please log in to view advanced market pressure and liquidity analytics</p>
                    <button onclick="AuthModule.showAuthModal()" style="background: var(--gradient-primary); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 10px; font-size: 0.95rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3); transition: all 0.3s ease;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(0, 122, 255, 0.4)'" onmouseout="this.style.transform=''; this.style.boxShadow='0 4px 12px rgba(0, 122, 255, 0.3)'">
                        Login / Sign Up
                    </button>
                </div>
            `;
        }
        console.log('[AUTH] Market Analysis disabled for unauthenticated user');
    }
    
    /**
     * Show welcome message after email confirmation
     * @param {string} email - User's email address
     */
    function showWelcomeMessage(email) {
        console.log('[AUTH] Showing welcome message for:', email);
        
        // Create welcome banner
        const banner = document.createElement('div');
        banner.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #34c759, #30d158);
            color: white;
            padding: 1.25rem 2rem;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(52, 199, 89, 0.4);
            z-index: 10001;
            font-family: var(--font-family);
            font-size: 1rem;
            font-weight: 600;
            text-align: center;
            animation: slideDown 0.5s ease;
            max-width: 90%;
        `;
        
        banner.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1.5rem;">✅</span>
                <div style="text-align: left;">
                    <div style="font-weight: 700; margin-bottom: 0.25rem;">Welcome to Kuya Comps!</div>
                    <div style="font-size: 0.9rem; opacity: 0.95;">Your email has been confirmed. You're now logged in.</div>
                </div>
            </div>
        `;
        
        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(banner);
        
        // Remove banner after 5 seconds
        setTimeout(() => {
            banner.style.animation = 'slideDown 0.5s ease reverse';
            setTimeout(() => {
                banner.remove();
                style.remove();
            }, 500);
        }, 5000);
    }
    
    /**
     * Helper function to escape HTML for safe display
     */
    function escapeHtml(unsafe) {
        if (unsafe == null) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    // Public API
    return {
        init,
        getCurrentUser,
        isAuthenticated,
        getClient,
        signIn,
        signOut,
        signUp,
        showAuthModal,
        hideAuthModal,
        switchAuthTab,
        updateAuthUI,
        initAuthUI,
        saveSearchToSupabase,
        fetchSavedSearches,
        displayPortfolio
    };
})();

// Initialize auth module when DOM is ready
// This runs independently and won't interfere with existing initializeApp()
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AuthModule.init();
        AuthModule.initAuthUI();
    });
} else {
    // DOM already loaded
    AuthModule.init();
    AuthModule.initAuthUI();
}

// Expose AuthModule globally for access from other scripts
window.AuthModule = AuthModule;
