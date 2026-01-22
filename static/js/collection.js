/**
 * Collection Module - Phase 1: Add to Collection Modal
 * Handles card collection management with smart parsing and metadata
 */

const CollectionModule = (function() {
    'use strict';
    
    /**
     * Smart parser for card search strings
     * Attempts to extract: Year, Set, Athlete, Card #, Variation/Parallel
     */
    function parseSearchString(searchString) {
        if (!searchString) return {};
        
        const parsed = {
            year: null,
            set: null,
            athlete: null,
            cardNumber: null,
            variation: null
        };
        
        // Extract year (4-digit number, typically 1950-2099)
        const yearMatch = searchString.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) {
            parsed.year = yearMatch[1];
        }
        
        // Common card sets (case-insensitive)
        const setPatterns = [
            /topps\s+chrome/i,
            /bowman\s+chrome/i,
            /prizm/i,
            /optic/i,
            /select/i,
            /donruss/i,
            /panini/i,
            /topps/i,
            /bowman/i,
            /upper\s+deck/i,
            /fleer/i,
            /score/i
        ];
        
        for (const pattern of setPatterns) {
            const setMatch = searchString.match(pattern);
            if (setMatch) {
                parsed.set = setMatch[0];
                break;
            }
        }
        
        // Extract card number (# followed by digits, or just digits with context)
        const cardNumMatch = searchString.match(/#\s*(\d+[A-Za-z]*)|card\s+(\d+[A-Za-z]*)/i);
        if (cardNumMatch) {
            parsed.cardNumber = cardNumMatch[1] || cardNumMatch[2];
        }
        
        // Extract variation/parallel keywords
        const variationPatterns = [
            /refractor/i,
            /prizm/i,
            /silver/i,
            /gold/i,
            /auto(?:graph)?/i,
            /rookie/i,
            /rc\b/i,
            /parallel/i,
            /numbered/i,
            /\/\d+/  // e.g., /99, /25
        ];
        
        const variations = [];
        for (const pattern of variationPatterns) {
            const varMatch = searchString.match(pattern);
            if (varMatch) {
                variations.push(varMatch[0]);
            }
        }
        
        if (variations.length > 0) {
            parsed.variation = variations.join(' ');
        }
        
        // Extract athlete name (heuristic: quoted strings or capitalized words)
        const quotedMatch = searchString.match(/"([^"]+)"/);
        if (quotedMatch) {
            // Check if it's not a set name
            const quoted = quotedMatch[1];
            if (!setPatterns.some(p => p.test(quoted))) {
                parsed.athlete = quoted;
            }
        } else {
            // Try to find capitalized words that aren't set names
            const words = searchString.split(/\s+/);
            const capitalizedWords = words.filter(word => 
                /^[A-Z][a-z]+/.test(word) && 
                !setPatterns.some(p => p.test(word))
            );
            
            if (capitalizedWords.length >= 2) {
                parsed.athlete = capitalizedWords.slice(0, 3).join(' ');
            }
        }
        
        return parsed;
    }
    
    /**
     * Show the Add to Collection modal
     * @param {string} searchQuery - Current search query to parse
     * @param {number} currentFMV - Current Fair Market Value to auto-populate
     * @param {Object} cardData - Optional pre-filled card data
     */
    function showAddToCollectionModal(searchQuery = '', currentFMV = null, cardData = {}) {
        console.log('[COLLECTION] Opening Add to Collection modal');
        console.log('[COLLECTION] Search query:', searchQuery);
        console.log('[COLLECTION] Current FMV:', currentFMV);
        
        // Parse the search string for smart auto-fill
        const parsed = parseSearchString(searchQuery);
        console.log('[COLLECTION] Parsed metadata:', parsed);
        
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'collection-modal-overlay';
        overlay.className = 'auth-modal-overlay';
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
            overflow-y: auto;
            padding: 1rem;
        `;
        
        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'auth-modal';
        modal.style.cssText = `
            background: var(--card-background);
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
            border: 1px solid var(--border-color);
            animation: scaleIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div class="auth-modal-header" style="padding: 2rem 2rem 1rem 2rem; border-bottom: 1px solid var(--border-color); position: relative; text-align: center;">
                <h2 style="margin: 0; font-size: 1.75rem; font-weight: 700; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                    ⭐ Add to Collection
                </h2>
                <button class="auth-modal-close" onclick="CollectionModule.hideAddToCollectionModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: transparent; border: none; font-size: 2rem; color: var(--subtle-text-color); cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease; padding: 0; box-shadow: none;">
                    &times;
                </button>
            </div>
            
            <div class="auth-modal-body" style="padding: 2rem;">
                <form id="add-to-collection-form">
                    <!-- Card Identity Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            📋 Card Identity
                        </h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Year</label>
                                <input type="text" id="card-year" placeholder="e.g., 2024" value="${parsed.year || ''}" maxlength="4">
                            </div>
                            
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Card Number</label>
                                <input type="text" id="card-number" placeholder="e.g., 1, RC-1" value="${parsed.cardNumber || ''}">
                            </div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Set</label>
                            <input type="text" id="card-set" placeholder="e.g., Topps Chrome" value="${parsed.set || ''}">
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Athlete Name</label>
                            <input type="text" id="card-athlete" placeholder="e.g., Shohei Ohtani" value="${parsed.athlete || ''}">
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Variation / Parallel</label>
                            <input type="text" id="card-variation" placeholder="e.g., Silver Refractor, Base" value="${parsed.variation || ''}">
                        </div>
                    </div>
                    
                    <!-- Condition Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            💎 Condition
                        </h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Grading Company</label>
                                <select id="card-grading-company" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color); transition: all 0.3s ease;">
                                    <option value="">Raw (Ungraded)</option>
                                    <option value="PSA">PSA</option>
                                    <option value="BGS">BGS (Beckett)</option>
                                    <option value="SGC">SGC</option>
                                    <option value="CGC">CGC</option>
                                    <option value="CSG">CSG</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Grade</label>
                                <input type="text" id="card-grade" placeholder="e.g., 10, 9.5" maxlength="4">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Financial Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            💰 Financial Details
                        </h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Purchase Price ($)</label>
                                <input type="number" id="card-purchase-price" placeholder="0.00" step="0.01" min="0">
                            </div>
                            
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Date Purchased</label>
                                <input type="date" id="card-purchase-date" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color);">
                            </div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Current FMV ($)</label>
                            <input type="number" id="card-current-fmv" placeholder="0.00" step="0.01" min="0" value="${currentFMV || ''}">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-top: 0.25rem;">
                                ${currentFMV ? 'Auto-filled from search results' : 'Optional - will be updated automatically if enabled'}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Organization Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            📁 Organization
                        </h3>
                        
                        <div class="auth-form-group">
                            <label>Binder</label>
                            <select id="card-binder" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color); transition: all 0.3s ease;">
                                <option value="">Select a binder...</option>
                                <option value="__new__">+ Create New Binder</option>
                            </select>
                        </div>
                        
                        <div id="new-binder-input" style="display: none; margin-top: 1rem;">
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>New Binder Name</label>
                                <input type="text" id="new-binder-name" placeholder="e.g., Rookie Cards 2024">
                            </div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Tags (comma-separated)</label>
                            <input type="text" id="card-tags" placeholder="e.g., rookie, investment, PC">
                        </div>
                    </div>
                    
                    <!-- Settings Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            ⚙️ Settings
                        </h3>
                        
                        <div style="background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); padding: 1rem; border-radius: 8px;">
                            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 500; color: var(--text-color);">
                                <input type="checkbox" id="card-auto-update" checked style="width: 20px; height: 20px; cursor: pointer;">
                                <div>
                                    <div>Auto-Update Value</div>
                                    <div style="font-size: 0.85rem; font-weight: 400; color: var(--subtle-text-color); margin-top: 0.25rem;">
                                        Automatically update Fair Market Value every 90 days
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Hidden field for search query -->
                    <input type="hidden" id="card-search-query" value="${escapeHtml(searchQuery)}">
                    
                    <!-- Submit Button -->
                    <button type="submit" class="auth-submit-btn" style="width: 100%; padding: 1rem; background: var(--gradient-primary); color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3); margin-top: 1rem;">
                        ⭐ Add to Collection
                    </button>
                </form>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Set up event listeners
        setupModalEventListeners();
        
        // Load user's binders
        loadUserBinders();
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideAddToCollectionModal();
            }
        });
        
        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                hideAddToCollectionModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    /**
     * Set up event listeners for the modal
     */
    function setupModalEventListeners() {
        // Binder selection change
        const binderSelect = document.getElementById('card-binder');
        const newBinderInput = document.getElementById('new-binder-input');
        
        if (binderSelect && newBinderInput) {
            binderSelect.addEventListener('change', (e) => {
                if (e.target.value === '__new__') {
                    newBinderInput.style.display = 'block';
                } else {
                    newBinderInput.style.display = 'none';
                }
            });
        }
        
        // Form submission
        const form = document.getElementById('add-to-collection-form');
        if (form) {
            form.addEventListener('submit', handleAddToCollection);
        }
    }
    
    /**
     * Load user's existing binders from database
     */
    async function loadUserBinders() {
        console.log('[COLLECTION] Loading user binders...');
        
        // Check if user is authenticated
        if (!window.AuthModule || !window.AuthModule.isAuthenticated()) {
            console.log('[COLLECTION] User not authenticated');
            return;
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            if (!supabase) {
                console.error('[COLLECTION] Supabase client not available');
                return;
            }
            
            const user = window.AuthModule.getCurrentUser();
            if (!user) {
                console.error('[COLLECTION] No current user');
                return;
            }
            
            // Fetch binders from database
            const { data, error } = await supabase
                .from('binders')
                .select('id, name')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('[COLLECTION] Error loading binders:', error);
                return;
            }
            
            console.log('[COLLECTION] Loaded', data?.length || 0, 'binders');
            
            // Populate binder dropdown
            const binderSelect = document.getElementById('card-binder');
            if (binderSelect && data && data.length > 0) {
                // Clear existing options except the first two
                while (binderSelect.options.length > 2) {
                    binderSelect.remove(2);
                }
                
                // Add binders
                data.forEach(binder => {
                    const option = document.createElement('option');
                    option.value = binder.id;
                    option.textContent = binder.name;
                    binderSelect.appendChild(option);
                });
            }
            
        } catch (error) {
            console.error('[COLLECTION] Exception loading binders:', error);
        }
    }
    
    /**
     * Handle form submission
     */
    async function handleAddToCollection(event) {
        event.preventDefault();
        console.log('[COLLECTION] Submitting card to collection...');
        
        // Check authentication
        if (!window.AuthModule || !window.AuthModule.isAuthenticated()) {
            alert('Please log in to add cards to your collection');
            return;
        }
        
        // Gather form data
        const formData = {
            year: document.getElementById('card-year')?.value || null,
            set: document.getElementById('card-set')?.value || null,
            athlete: document.getElementById('card-athlete')?.value || null,
            cardNumber: document.getElementById('card-number')?.value || null,
            variation: document.getElementById('card-variation')?.value || null,
            gradingCompany: document.getElementById('card-grading-company')?.value || null,
            grade: document.getElementById('card-grade')?.value || null,
            purchasePrice: parseFloat(document.getElementById('card-purchase-price')?.value) || null,
            purchaseDate: document.getElementById('card-purchase-date')?.value || null,
            currentFmv: parseFloat(document.getElementById('card-current-fmv')?.value) || null,
            binder: document.getElementById('card-binder')?.value || null,
            newBinderName: document.getElementById('new-binder-name')?.value || null,
            tags: document.getElementById('card-tags')?.value || null,
            autoUpdate: document.getElementById('card-auto-update')?.checked || false,
            searchQuery: document.getElementById('card-search-query')?.value ?? ''
        };
        
        console.log('[COLLECTION] Form data:', formData);
        
        // Validation
        if (!formData.athlete) {
            alert('Please enter the athlete name');
            return;
        }
        
        // Validate search query is not empty (required for automated valuation)
        if (!formData.searchQuery || formData.searchQuery.trim() === '') {
            alert('Search query is required for automated valuation. Please run a search first, then click "Save to Collection".');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '⭐ Add to Collection';
            }
            return;
        }
        
        // Disable submit button
        const submitBtn = event.target.querySelector('.auth-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Adding to Collection...';
        }
        
        try {
            // Save to database
            const result = await saveCardToCollection(formData);
            
            if (result.error) {
                console.error('[COLLECTION] Error saving card:', result.error);
                alert('Failed to add card: ' + (result.error.message || 'Unknown error'));
                
                // Re-enable button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '⭐ Add to Collection';
                }
            } else {
                console.log('[COLLECTION] Card saved successfully:', result.data);
                
                // Show success message
                if (submitBtn) {
                    submitBtn.textContent = '✅ Added to Collection!';
                    submitBtn.style.background = 'linear-gradient(135deg, #34c759, #30d158)';
                }
                
                // Close modal after delay
                setTimeout(() => {
                    hideAddToCollectionModal();
                    
                    // Refresh portfolio if on that tab
                    if (window.AuthModule && window.AuthModule.displayPortfolio) {
                        const portfolioTab = document.getElementById('portfolio-tab');
                        if (portfolioTab && portfolioTab.classList.contains('active')) {
                            window.AuthModule.displayPortfolio();
                        }
                    }
                }, 1500);
            }
            
        } catch (error) {
            console.error('[COLLECTION] Exception saving card:', error);
            alert('An error occurred while adding the card: ' + error.message);
            
            // Re-enable button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '⭐ Add to Collection';
            }
        }
    }
    
    /**
     * Save card to collection database
     */
    async function saveCardToCollection(formData) {
        const supabase = window.AuthModule.getClient();
        if (!supabase) {
            return { error: { message: 'Database not available' } };
        }
        
        const user = window.AuthModule.getCurrentUser();
        if (!user) {
            return { error: { message: 'User not logged in' } };
        }
        
        try {
            let binderId = formData.binder;
            
            // Create new binder if needed
            if (formData.binder === '__new__' && formData.newBinderName) {
                console.log('[COLLECTION] Creating new binder:', formData.newBinderName);
                
                const { data: binderData, error: binderError } = await supabase
                    .from('binders')
                    .insert([{
                        user_id: user.id,
                        name: formData.newBinderName
                    }])
                    .select()
                    .single();
                
                if (binderError) {
                    console.error('[COLLECTION] Error creating binder:', binderError);
                    return { error: binderError };
                }
                
                binderId = binderData.id;
                console.log('[COLLECTION] Created binder with ID:', binderId);
            }
            
            // Prepare card data
            const cardData = {
                binder_id: binderId,
                user_id: user.id,  // NEW: Add user_id directly to card
                year: formData.year,
                set_name: formData.set,
                athlete: formData.athlete,
                card_number: formData.cardNumber,
                variation: formData.variation,
                grading_company: formData.gradingCompany,
                grade: formData.grade,
                purchase_price: formData.purchasePrice,
                purchase_date: formData.purchaseDate,
                current_fmv: formData.currentFmv,
                search_query_string: formData.searchQuery || '',
                auto_update: formData.autoUpdate,
                tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : []
            };
            
            console.log('[COLLECTION] Saving card data:', cardData);
            
            // Insert card
            const { data, error } = await supabase
                .from('cards')
                .insert([cardData])
                .select();
            
            if (error) {
                console.error('[COLLECTION] Error inserting card:', error);
                return { error };
            }
            
            console.log('[COLLECTION] Card inserted successfully:', data);
            
            // Create initial price history entry if current_fmv was provided
            if (cardData.current_fmv && cardData.current_fmv > 0 && data && data[0]) {
                console.log('[COLLECTION] Creating initial price history entry...');
                
                const { error: historyError } = await supabase
                    .from('price_history')
                    .insert([{
                        card_id: data[0].id,
                        value: cardData.current_fmv,
                        num_sales: null,
                        confidence: 'user_provided'
                    }]);
                
                if (historyError) {
                    console.error('[COLLECTION] Error creating price history:', historyError);
                    // Don't fail the entire save - price history is supplementary
                } else {
                    console.log('[COLLECTION] Price history entry created successfully');
                }
            }
            
            return { data };
            
        } catch (error) {
            console.error('[COLLECTION] Exception in saveCardToCollection:', error);
            return { error: { message: error.message } };
        }
    }
    
    /**
     * Hide the Add to Collection modal
     */
    function hideAddToCollectionModal() {
        const overlay = document.getElementById('collection-modal-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    }
    
    /**
     * Display the binder view dashboard
     * This is the main view for the "My Collection" tab
     */
    async function displayBinderView(sortBy = null) {
        console.log('[COLLECTION] Displaying binder view...');
        
        const container = document.getElementById('portfolio-container');
        if (!container) {
            console.error('[COLLECTION] Portfolio container not found');
            return;
        }
        
        // Get sort preference from localStorage or parameter
        const sortOption = sortBy || localStorage.getItem('binderSort') || 'newest';
        
        // Check authentication
        if (!window.AuthModule || !window.AuthModule.isAuthenticated()) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">🔒 Login Required</h3>
                    <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto 1.5rem auto;">Please log in to view your collection</p>
                    <button onclick="AuthModule.showAuthModal()" style="background: var(--gradient-primary); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                        Login
                    </button>
                </div>
            `;
            return;
        }
        
        // Show loading state
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 2rem;">
                <div class="loading">Loading your collection...</div>
            </div>
        `;
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            // Fetch user's binders with card counts
            const { data: binders, error: bindersError } = await supabase
                .from('binders')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (bindersError) {
                throw bindersError;
            }
            
            console.log('[COLLECTION] Loaded', binders?.length || 0, 'binders');
            
            // If no binders, show empty state
            if (!binders || binders.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                        <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📂 No Binders Yet</h3>
                        <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto 1.5rem auto;">Start building your collection by adding cards from the Comps & Analysis tab</p>
                        <button onclick="switchTab('comps')" style="background: var(--gradient-primary); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                            Search for Cards
                        </button>
                    </div>
                `;
                return;
            }
            
            // Fetch cards for each binder to calculate stats
            const bindersWithStats = await Promise.all(binders.map(async (binder) => {
                const { data: cards, error: cardsError } = await supabase
                    .from('cards')
                    .select('*')
                    .eq('binder_id', binder.id);
                
                if (cardsError) {
                    console.error('[COLLECTION] Error loading cards for binder', binder.id, cardsError);
                    return { ...binder, cards: [], stats: null };
                }
                
                // Calculate stats
                const totalCards = cards.length;
                const totalCost = cards.reduce((sum, card) => sum + (parseFloat(card.purchase_price) || 0), 0);
                const totalFMV = cards.reduce((sum, card) => sum + (parseFloat(card.current_fmv) || 0), 0);
                const roi = totalCost > 0 ? ((totalFMV - totalCost) / totalCost * 100) : 0;
                
                return {
                    ...binder,
                    cards,
                    stats: {
                        totalCards,
                        totalCost,
                        totalFMV,
                        roi
                    }
                };
            }));
            
            // Apply sorting based on selection
            bindersWithStats.sort((a, b) => {
                switch(sortOption) {
                    case 'oldest':
                        return new Date(a.created_at) - new Date(b.created_at);
                    case 'az':
                        return a.name.localeCompare(b.name);
                    case 'za':
                        return b.name.localeCompare(a.name);
                    case 'value_high':
                        return (b.stats?.totalFMV || 0) - (a.stats?.totalFMV || 0);
                    case 'value_low':
                        return (a.stats?.totalFMV || 0) - (b.stats?.totalFMV || 0);
                    case 'newest':
                    default:
                        return new Date(b.created_at) - new Date(a.created_at);
                }
            });
            
            // Render binder dashboard
            renderBinderDashboard(bindersWithStats, sortOption);
            
        } catch (error) {
            console.error('[COLLECTION] Error loading binders:', error);
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: #ff3b30; font-size: 1.5rem; font-weight: 600;">⚠️ Error Loading Collection</h3>
                    <p style="margin: 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color);">${error.message || 'Unknown error occurred'}</p>
                </div>
            `;
        }
    }
    
    /**
     * Render the binder dashboard with all binders
     */
    function renderBinderDashboard(binders, sortOption = 'newest') {
        const container = document.getElementById('portfolio-container');
        if (!container) return;
        
        // Calculate overall collection stats
        const totalCards = binders.reduce((sum, b) => sum + (b.stats?.totalCards || 0), 0);
        const totalCost = binders.reduce((sum, b) => sum + (b.stats?.totalCost || 0), 0);
        const totalFMV = binders.reduce((sum, b) => sum + (b.stats?.totalFMV || 0), 0);
        const overallROI = totalCost > 0 ? ((totalFMV - totalCost) / totalCost * 100) : 0;
        
        let html = `
            <!-- Overall Collection Stats -->
            <div style="margin-bottom: 2rem; padding: 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                <h3 style="margin: 0 0 1.5rem 0; font-size: 1.5rem; font-weight: 600; color: var(--text-color);">📊 Collection Overview</h3>
                
                <div class="stat-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                    <div class="stat-item">
                        <div class="stat-label">Total Cards</div>
                        <div class="stat-value">${totalCards}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">Total Cost</div>
                        <div class="stat-value">$${totalCost.toFixed(2)}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">Current FMV</div>
                        <div class="stat-value">$${totalFMV.toFixed(2)}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">ROI</div>
                        <div class="stat-value" style="color: ${overallROI >= 0 ? '#34c759' : '#ff3b30'}">
                            ${overallROI >= 0 ? '+' : ''}${overallROI.toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Binders Grid Header with Sort -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--text-color);">📁 Your Binders</h3>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="font-size: 0.9rem; color: var(--subtle-text-color);">Sort by:</label>
                    <select id="binder-sort" onchange="CollectionModule.sortBindersView(this.value)" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--card-background); color: var(--text-color); cursor: pointer; font-family: var(--font-family);">
                        <option value="newest" ${sortOption === 'newest' ? 'selected' : ''}>Newest</option>
                        <option value="oldest" ${sortOption === 'oldest' ? 'selected' : ''}>Oldest</option>
                        <option value="az" ${sortOption === 'az' ? 'selected' : ''}>A-Z</option>
                        <option value="za" ${sortOption === 'za' ? 'selected' : ''}>Z-A</option>
                        <option value="value_high" ${sortOption === 'value_high' ? 'selected' : ''}>Highest Value</option>
                        <option value="value_low" ${sortOption === 'value_low' ? 'selected' : ''}>Lowest Value</option>
                    </select>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
        `;
        
        // Render each binder card
        binders.forEach(binder => {
            const stats = binder.stats || {};
            const roiColor = (stats.roi || 0) >= 0 ? '#34c759' : '#ff3b30';
            
            html += `
                <div class="binder-card" onclick="CollectionModule.showBinderDetails('${binder.id}')" style="background: var(--card-background); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); transition: all 0.3s ease; cursor: pointer; position: relative;">
                    <div style="position: absolute; top: 1rem; right: 1rem;">
                        <button
                            onclick="CollectionModule.showBinderContextMenu('${binder.id}', '${escapeHtml(binder.name).replace(/'/g, "\\'")}', event); event.stopPropagation();"
                            class="options-button"
                            style="
                                background: #f5f5f7;
                                border: 1px solid #e5e5e7;
                                border-radius: 12px;
                                padding: 6px 10px;
                                cursor: pointer;
                                transition: all 0.2s ease;
                                display: inline-flex;
                                flex-direction: column;
                                gap: 3px;
                                align-items: center;
                                justify-content: center;
                                min-width: 32px;
                                min-height: 32px;
                            "
                            onmouseover="
                                this.style.background='#007aff';
                                this.style.borderColor='#007aff';
                                Array.from(this.querySelectorAll('.dot')).forEach(dot => dot.style.background='white');
                            "
                            onmouseout="
                                this.style.background='#f5f5f7';
                                this.style.borderColor='#e5e5e7';
                                Array.from(this.querySelectorAll('.dot')).forEach(dot => dot.style.background='#1d1d1f');
                            "
                            title="Options"
                        >
                            <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                            <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                            <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                        </button>
                    </div>
                    <h4 style="margin: 0 0 1rem 0; font-size: 1.2rem; font-weight: 600; color: var(--text-color); padding-right: 80px;">
                        ${escapeHtml(binder.name)}
                    </h4>
                    
                    <div class="binder-stats" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                        <div style="text-align: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-bottom: 0.25rem;">Cards</div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-color);">${stats.totalCards || 0}</div>
                        </div>
                        
                        <div style="text-align: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-bottom: 0.25rem;">FMV</div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-color);">$${(stats.totalFMV || 0).toFixed(0)}</div>
                        </div>
                        
                        <div style="text-align: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-bottom: 0.25rem;">Cost</div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-color);">$${(stats.totalCost || 0).toFixed(0)}</div>
                        </div>
                        
                        <div style="text-align: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-bottom: 0.25rem;">ROI</div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: ${roiColor};">
                                ${(stats.roi || 0) >= 0 ? '+' : ''}${(stats.roi || 0).toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color); font-size: 0.85rem; color: var(--subtle-text-color);">
                        Created ${new Date(binder.created_at).toLocaleDateString()}
                    </div>
                </div>
            `;
        });
        
        html += `
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    /**
     * Sort binders view with specified option
     */
    function sortBindersView(sortBy) {
        localStorage.setItem('binderSort', sortBy);
        displayBinderView(sortBy);
    }
    
    /**
     * Sort cards view with specified option
     */
    function sortCardsView(binderId, sortBy) {
        localStorage.setItem('cardSort', sortBy);
        showBinderDetails(binderId, sortBy);
    }
    
    /**
     * Show detailed view of a specific binder with all cards
     */
    async function showBinderDetails(binderId, sortBy = null) {
        console.log('[COLLECTION] Showing binder details for:', binderId);
        
        // Get sort preference from localStorage or parameter
        const sortOption = sortBy || localStorage.getItem('cardSort') || 'newest';
        
        const container = document.getElementById('portfolio-container');
        if (!container) return;
        
        // Show loading state
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 2rem;">
                <div class="loading">Loading binder...</div>
            </div>
        `;
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            // Fetch binder details
            const { data: binder, error: binderError } = await supabase
                .from('binders')
                .select('*')
                .eq('id', binderId)
                .eq('user_id', user.id)
                .single();
            
            if (binderError) {
                throw binderError;
            }
            
            // Fetch all cards in this binder
            const { data: cards, error: cardsError } = await supabase
                .from('cards')
                .select('*')
                .eq('binder_id', binderId)
                .order('created_at', { ascending: false });
            
            if (cardsError) {
                throw cardsError;
            }
            
            console.log('[COLLECTION] Loaded', cards?.length || 0, 'cards for binder');
            
            // Apply sorting based on selection
            cards.sort((a, b) => {
                switch(sortOption) {
                    case 'oldest':
                        return new Date(a.created_at) - new Date(b.created_at);
                    case 'az':
                        return (a.athlete || '').localeCompare(b.athlete || '');
                    case 'za':
                        return (b.athlete || '').localeCompare(a.athlete || '');
                    case 'value_high':
                        return (parseFloat(b.current_fmv) || 0) - (parseFloat(a.current_fmv) || 0);
                    case 'value_low':
                        return (parseFloat(a.current_fmv) || 0) - (parseFloat(b.current_fmv) || 0);
                    case 'newest':
                    default:
                        return new Date(b.created_at) - new Date(a.created_at);
                }
            });
            
            // Render binder detail view
            renderBinderDetailView(binder, cards, sortOption);
            
        } catch (error) {
            console.error('[COLLECTION] Error loading binder details:', error);
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: #ff3b30; font-size: 1.5rem; font-weight: 600;">⚠️ Error Loading Binder</h3>
                    <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color);">${error.message || 'Unknown error occurred'}</p>
                    <button onclick="CollectionModule.displayBinderView()" style="background: var(--gradient-primary); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                        Back to Binders
                    </button>
                </div>
            `;
        }
    }
    
    /**
     * Render detailed view of a binder with card list
     */
    function renderBinderDetailView(binder, cards, sortOption = 'newest') {
        const container = document.getElementById('portfolio-container');
        if (!container) return;
        
        // Calculate binder stats
        const totalCards = cards.length;
        const totalCost = cards.reduce((sum, card) => sum + (parseFloat(card.purchase_price) || 0), 0);
        const totalFMV = cards.reduce((sum, card) => sum + (parseFloat(card.current_fmv) || 0), 0);
        const roi = totalCost > 0 ? ((totalFMV - totalCost) / totalCost * 100) : 0;
        
        // Check for stale cards (>30 days since last update)
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        let html = `
            <!-- Back Button -->
            <div style="margin-bottom: 1.5rem;">
                <button onclick="CollectionModule.displayBinderView()" style="background: var(--background-color); color: var(--text-color); border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.3s ease;">
                    ← Back to Binders
                </button>
            </div>
            
            <!-- Binder Header -->
            <div style="margin-bottom: 2rem; padding: 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                <h2 style="margin: 0 0 1.5rem 0; font-size: 2rem; font-weight: 700; color: var(--text-color);">
                    ${escapeHtml(binder.name)}
                </h2>
                
                <!-- Binder Stats -->
                <div class="stat-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                    <div class="stat-item">
                        <div class="stat-label">Total Cards</div>
                        <div class="stat-value">${totalCards}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">Total Cost</div>
                        <div class="stat-value">$${totalCost.toFixed(2)}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">Current FMV</div>
                        <div class="stat-value">$${totalFMV.toFixed(2)}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">ROI</div>
                        <div class="stat-value" style="color: ${roi >= 0 ? '#34c759' : '#ff3b30'}">
                            ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // If no cards, show empty state
        if (cards.length === 0) {
            html += `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📋 No Cards Yet</h3>
                    <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto 1.5rem auto;">Add cards to this binder from the Comps & Analysis tab</p>
                    <button onclick="switchTab('comps')" style="background: var(--gradient-primary); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                        Search for Cards
                    </button>
                </div>
            `;
        } else {
            // Render card list table
            html += `
                <div style="background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); overflow: hidden;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; border-bottom: 1px solid var(--border-color);">
                        <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--text-color);">Cards (${totalCards})</h3>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <label style="font-size: 0.9rem; color: var(--subtle-text-color);">Sort by:</label>
                            <select id="card-sort" onchange="CollectionModule.sortCardsView('${binder.id}', this.value)" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--card-background); color: var(--text-color); cursor: pointer; font-family: var(--font-family);">
                                <option value="newest" ${sortOption === 'newest' ? 'selected' : ''}>Newest</option>
                                <option value="oldest" ${sortOption === 'oldest' ? 'selected' : ''}>Oldest</option>
                                <option value="az" ${sortOption === 'az' ? 'selected' : ''}>A-Z (Athlete)</option>
                                <option value="za" ${sortOption === 'za' ? 'selected' : ''}>Z-A (Athlete)</option>
                                <option value="value_high" ${sortOption === 'value_high' ? 'selected' : ''}>Highest Value</option>
                                <option value="value_low" ${sortOption === 'value_low' ? 'selected' : ''}>Lowest Value</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="overflow-x: auto;">
                        <table class="card-list-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th style="padding: 0.75rem; text-align: center; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color); width: 40px;"></th>
                                    <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">Card</th>
                                    <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">Condition</th>
                                    <th style="padding: 0.75rem; text-align: right; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">Cost</th>
                                    <th style="padding: 0.75rem; text-align: right; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">FMV</th>
                                    <th style="padding: 0.75rem; text-align: center; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">Status</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            cards.forEach(card => {
                const cost = parseFloat(card.purchase_price) || 0;
                const fmv = parseFloat(card.current_fmv) || 0;
                const cardROI = cost > 0 ? ((fmv - cost) / cost * 100) : 0;
                
                // Check if data is stale
                const lastUpdated = card.last_updated_at ? new Date(card.last_updated_at) : null;
                const isStale = !lastUpdated || lastUpdated < thirtyDaysAgo;
                
                // Build card description
                let cardDesc = '';
                if (card.year) cardDesc += card.year + ' ';
                if (card.set_name) cardDesc += card.set_name + ' ';
                if (card.athlete) cardDesc += card.athlete;
                if (card.card_number) cardDesc += ' #' + card.card_number;
                if (card.variation) cardDesc += ' (' + card.variation + ')';
                
                // Build condition badge
                let conditionBadge = '';
                if (card.grading_company) {
                    const gradeClass = card.grading_company === 'PSA' && card.grade === '10' ? 'psa-10' : '';
                    conditionBadge = `<span class="condition-badge ${gradeClass}" style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem; font-weight: 600; background: ${gradeClass ? 'linear-gradient(135deg, #34c759, #30d158)' : 'linear-gradient(135deg, #6e6e73, #8e8e93)'}; color: white;">
                        ${card.grading_company} ${card.grade || ''}
                    </span>`;
                } else {
                    conditionBadge = `<span class="condition-badge raw" style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem; font-weight: 600; background: linear-gradient(135deg, #6e6e73, #8e8e93); color: white;">Raw</span>`;
                }
                
                // Status indicators
                let statusHTML = '';
                if (card.review_required) {
                    statusHTML += `<span class="review-flag" title="${escapeHtml(card.review_reason || 'Review required')}" style="color: #ff3b30; font-size: 1rem; cursor: help;">⚠️</span> `;
                }
                if (isStale && card.auto_update) {
                    statusHTML += `<span class="stale-warning" title="Data older than 30 days" style="color: #ff9500; font-size: 0.85rem;">⏰</span>`;
                }
                if (!statusHTML) {
                    statusHTML = '<span style="color: #34c759;">✓</span>';
                }
                
                html += `
                    <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.2s ease;" onmouseover="this.style.background='linear-gradient(135deg, #f8fafd 0%, #f0f4ff 100%)'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 0.5rem; text-align: center; width: 50px;">
                            <button
                                onclick="CollectionModule.showCardContextMenu('${card.id}', '${card.binder_id}', event); event.stopPropagation();"
                                class="options-button"
                                style="
                                    background: #f5f5f7;
                                    border: 1px solid #e5e5e7;
                                    border-radius: 12px;
                                    padding: 6px 10px;
                                    cursor: pointer;
                                    transition: all 0.2s ease;
                                    display: inline-flex;
                                    flex-direction: column;
                                    gap: 3px;
                                    align-items: center;
                                    justify-content: center;
                                    min-width: 32px;
                                    min-height: 32px;
                                "
                                onmouseover="
                                    this.style.background='#007aff';
                                    this.style.borderColor='#007aff';
                                    Array.from(this.querySelectorAll('.dot')).forEach(dot => dot.style.background='white');
                                "
                                onmouseout="
                                    this.style.background='#f5f5f7';
                                    this.style.borderColor='#e5e5e7';
                                    Array.from(this.querySelectorAll('.dot')).forEach(dot => dot.style.background='#1d1d1f');
                                "
                                title="Options"
                            >
                                <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                                <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                                <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                            </button>
                        </td>
                        <td style="padding: 0.75rem;">
                            <div style="font-weight: 600; color: var(--text-color); margin-bottom: 0.25rem;">${escapeHtml(cardDesc || 'Untitled Card')}</div>
                            ${card.tags ? `<div style="font-size: 0.75rem; color: var(--subtle-text-color);">${Array.isArray(card.tags) ? card.tags.map(t => '#' + t).join(' ') : (typeof card.tags === 'string' ? '#' + card.tags : '')}</div>` : ''}
                        </td>
                        <td style="padding: 0.75rem;">${conditionBadge}</td>
                        <td style="padding: 0.75rem; text-align: right; font-weight: 600; color: var(--text-color);">$${cost.toFixed(2)}</td>
                        <td style="padding: 0.75rem; text-align: right;">
                            <div style="font-weight: 600; color: var(--text-color);">$${fmv.toFixed(2)}</div>
                            ${fmv > 0 ? `<div style="font-size: 0.75rem; color: ${cardROI >= 0 ? '#34c759' : '#ff3b30'};">${cardROI >= 0 ? '+' : ''}${cardROI.toFixed(1)}%</div>` : ''}
                        </td>
                        <td style="padding: 0.75rem; text-align: center;">${statusHTML}</td>
                    </tr>
                `;
            });
            
            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }
    
    /**
     * Helper function to escape HTML (prevent XSS)
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Delete a binder and all its cards
     */
    async function deleteBinder(binderId) {
        console.log('[COLLECTION] Deleting binder:', binderId);
        
        if (!confirm('Are you sure you want to delete this binder and all its cards? This action cannot be undone.')) {
            return;
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            // Delete binder (cards will be cascade deleted by database)
            const { error } = await supabase
                .from('binders')
                .delete()
                .eq('id', binderId)
                .eq('user_id', user.id);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Binder deleted successfully');
            
            // Refresh the binder view
            displayBinderView();
            
        } catch (error) {
            console.error('[COLLECTION] Error deleting binder:', error);
            alert('Failed to delete binder: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Delete a card from a binder
     */
    async function deleteCard(cardId, binderId) {
        console.log('[COLLECTION] Deleting card:', cardId);
        
        if (!confirm('Are you sure you want to delete this card? This action cannot be undone.')) {
            return;
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            
            if (!supabase) {
                throw new Error('Database not available');
            }
            
            // Delete card
            const { error } = await supabase
                .from('cards')
                .delete()
                .eq('id', cardId);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Card deleted successfully');
            
            // Refresh the binder detail view
            showBinderDetails(binderId);
            
        } catch (error) {
            console.error('[COLLECTION] Error deleting card:', error);
            alert('Failed to delete card: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Show edit binder modal
     */
    function showEditBinderModal(binderId, binderName) {
        console.log('[COLLECTION] Opening Edit Binder modal for:', binderId);
        
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'edit-binder-modal-overlay';
        overlay.className = 'auth-modal-overlay';
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
        modal.className = 'auth-modal';
        modal.style.cssText = `
            background: var(--card-background);
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 500px;
            position: relative;
            border: 1px solid var(--border-color);
            animation: scaleIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div class="auth-modal-header" style="padding: 2rem 2rem 1rem 2rem; border-bottom: 1px solid var(--border-color); position: relative; text-align: center;">
                <h2 style="margin: 0; font-size: 1.75rem; font-weight: 700; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                    ✏️ Edit Binder
                </h2>
                <button class="auth-modal-close" onclick="CollectionModule.hideEditBinderModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: transparent; border: none; font-size: 2rem; color: var(--subtle-text-color); cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease; padding: 0;">
                    &times;
                </button>
            </div>
            
            <div class="auth-modal-body" style="padding: 2rem;">
                <form id="edit-binder-form">
                    <input type="hidden" id="edit-binder-id" value="${binderId}">
                    
                    <div class="auth-form-group">
                        <label>Binder Name</label>
                        <input type="text" id="edit-binder-name" value="${binderName}" required>
                    </div>
                    
                    <button type="submit" class="auth-submit-btn" style="width: 100%; padding: 1rem; background: var(--gradient-primary); color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3); margin-top: 1rem;">
                        💾 Save Changes
                    </button>
                </form>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Set up form submission
        const form = document.getElementById('edit-binder-form');
        form.addEventListener('submit', handleEditBinder);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideEditBinderModal();
            }
        });
        
        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                hideEditBinderModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    /**
     * Hide edit binder modal
     */
    function hideEditBinderModal() {
        const overlay = document.getElementById('edit-binder-modal-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    }
    
    /**
     * Handle edit binder form submission
     */
    async function handleEditBinder(event) {
        event.preventDefault();
        
        const binderId = document.getElementById('edit-binder-id')?.value;
        const binderName = document.getElementById('edit-binder-name')?.value;
        
        if (!binderName) {
            alert('Please enter a binder name');
            return;
        }
        
        const submitBtn = event.target.querySelector('.auth-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Saving...';
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            const { error } = await supabase
                .from('binders')
                .update({ name: binderName })
                .eq('id', binderId)
                .eq('user_id', user.id);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Binder updated successfully');
            
            if (submitBtn) {
                submitBtn.textContent = '✅ Saved!';
                submitBtn.style.background = 'linear-gradient(135deg, #34c759, #30d158)';
            }
            
            setTimeout(() => {
                hideEditBinderModal();
                displayBinderView();
            }, 1000);
            
        } catch (error) {
            console.error('[COLLECTION] Error updating binder:', error);
            alert('Failed to update binder: ' + (error.message || 'Unknown error'));
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '💾 Save Changes';
            }
        }
    }
    
    /**
     * Show edit card modal
     */
    async function showEditCardModal(cardId) {
        console.log('[COLLECTION] Opening Edit Card modal for:', cardId);
        
        try {
            const supabase = window.AuthModule.getClient();
            
            if (!supabase) {
                throw new Error('Database not available');
            }
            
            // Fetch card data
            const { data: card, error } = await supabase
                .from('cards')
                .select('*')
                .eq('id', cardId)
                .single();
            
            if (error) {
                throw error;
            }
            
            // Format tags for display
            const tagsValue = Array.isArray(card.tags) ? card.tags.join(', ') : (card.tags || '');
            
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.id = 'edit-card-modal-overlay';
            overlay.className = 'auth-modal-overlay';
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
                overflow-y: auto;
                padding: 1rem;
            `;
            
            const modal = document.createElement('div');
            modal.className = 'auth-modal';
            modal.style.cssText = `
                background: var(--card-background);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                position: relative;
                border: 1px solid var(--border-color);
                animation: scaleIn 0.3s ease;
            `;
            
            modal.innerHTML = `
                <div class="auth-modal-header" style="padding: 2rem 2rem 1rem 2rem; border-bottom: 1px solid var(--border-color); position: relative; text-align: center;">
                    <h2 style="margin: 0; font-size: 1.75rem; font-weight: 700; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                        ✏️ Edit Card
                    </h2>
                    <button class="auth-modal-close" onclick="CollectionModule.hideEditCardModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: transparent; border: none; font-size: 2rem; color: var(--subtle-text-color); cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease; padding: 0;">
                        &times;
                    </button>
                </div>
                
                <div class="auth-modal-body" style="padding: 2rem;">
                    <form id="edit-card-form">
                        <input type="hidden" id="edit-card-id" value="${cardId}">
                        <input type="hidden" id="edit-card-binder-id" value="${card.binder_id}">
                        
                        <!-- Card Identity Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                📋 Card Identity
                            </h3>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Year</label>
                                    <input type="text" id="edit-card-year" value="${card.year || ''}" maxlength="4">
                                </div>
                                
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Card Number</label>
                                    <input type="text" id="edit-card-number" value="${card.card_number || ''}">
                                </div>
                            </div>
                            
                            <div class="auth-form-group">
                                <label>Set</label>
                                <input type="text" id="edit-card-set" value="${card.set_name || ''}">
                            </div>
                            
                            <div class="auth-form-group">
                                <label>Athlete Name</label>
                                <input type="text" id="edit-card-athlete" value="${card.athlete || ''}">
                            </div>
                            
                            <div class="auth-form-group">
                                <label>Variation / Parallel</label>
                                <input type="text" id="edit-card-variation" value="${card.variation || ''}">
                            </div>
                        </div>
                        
                        <!-- Condition Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                💎 Condition
                            </h3>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Grading Company</label>
                                    <select id="edit-card-grading-company" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color);">
                                        <option value="" ${!card.grading_company ? 'selected' : ''}>Raw (Ungraded)</option>
                                        <option value="PSA" ${card.grading_company === 'PSA' ? 'selected' : ''}>PSA</option>
                                        <option value="BGS" ${card.grading_company === 'BGS' ? 'selected' : ''}>BGS (Beckett)</option>
                                        <option value="SGC" ${card.grading_company === 'SGC' ? 'selected' : ''}>SGC</option>
                                        <option value="CGC" ${card.grading_company === 'CGC' ? 'selected' : ''}>CGC</option>
                                        <option value="CSG" ${card.grading_company === 'CSG' ? 'selected' : ''}>CSG</option>
                                        <option value="Other" ${card.grading_company === 'Other' ? 'selected' : ''}>Other</option>
                                    </select>
                                </div>
                                
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Grade</label>
                                    <input type="text" id="edit-card-grade" value="${card.grade || ''}" maxlength="4">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Financial Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                💰 Financial Details
                            </h3>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Purchase Price ($)</label>
                                    <input type="number" id="edit-card-purchase-price" value="${card.purchase_price || ''}" step="0.01" min="0">
                                </div>
                                
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Date Purchased</label>
                                    <input type="date" id="edit-card-purchase-date" value="${card.purchase_date || ''}" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color);">
                                </div>
                            </div>
                            
                            <div class="auth-form-group">
                                <label>Current FMV ($)</label>
                                <input type="number" id="edit-card-current-fmv" value="${card.current_fmv || ''}" step="0.01" min="0">
                            </div>
                        </div>
                        
                        <!-- Organization Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                📁 Organization
                            </h3>
                            
                            <div class="auth-form-group">
                                <label>Tags (comma-separated)</label>
                                <input type="text" id="edit-card-tags" value="${tagsValue}">
                            </div>
                        </div>
                        
                        <!-- Search & Automation Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                🔍 Search & Automation
                            </h3>
                            
                            <div class="auth-form-group">
                                <label>Search Query</label>
                                <input type="text" id="editCardSearchQuery" value="${escapeHtml(card.search_query_string || '')}" placeholder="e.g., 2024 Topps Chrome Shohei Ohtani PSA 10">
                                <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-top: 0.25rem;">
                                    This search query is used to automatically update the card's Fair Market Value. You can refine it if needed (e.g., after grading).
                                </div>
                            </div>
                        </div>
                        
                        <!-- Settings Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                ⚙️ Settings
                            </h3>
                            
                            <div style="background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); padding: 1rem; border-radius: 8px;">
                                <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 500; color: var(--text-color);">
                                    <input type="checkbox" id="edit-card-auto-update" ${card.auto_update ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
                                    <div>
                                        <div>Auto-Update Value</div>
                                        <div style="font-size: 0.85rem; font-weight: 400; color: var(--subtle-text-color); margin-top: 0.25rem;">
                                            Automatically update Fair Market Value every 90 days
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        
                        <button type="submit" class="auth-submit-btn" style="width: 100%; padding: 1rem; background: var(--gradient-primary); color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3); margin-top: 1rem;">
                            💾 Save Changes
                        </button>
                    </form>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Set up form submission
            const form = document.getElementById('edit-card-form');
            form.addEventListener('submit', handleEditCard);
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    hideEditCardModal();
                }
            });
            
            // Close on Escape key
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    hideEditCardModal();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
            
        } catch (error) {
            console.error('[COLLECTION] Error loading card for edit:', error);
            alert('Failed to load card: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Hide edit card modal
     */
    function hideEditCardModal() {
        const overlay = document.getElementById('edit-card-modal-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    }
    
    /**
     * Handle edit card form submission
     */
    async function handleEditCard(event) {
        event.preventDefault();
        
        const cardId = document.getElementById('edit-card-id')?.value;
        const binderId = document.getElementById('edit-card-binder-id')?.value;
        
        const cardData = {
            year: document.getElementById('edit-card-year')?.value || null,
            set_name: document.getElementById('edit-card-set')?.value || null,
            athlete: document.getElementById('edit-card-athlete')?.value || null,
            card_number: document.getElementById('edit-card-number')?.value || null,
            variation: document.getElementById('edit-card-variation')?.value || null,
            grading_company: document.getElementById('edit-card-grading-company')?.value || null,
            grade: document.getElementById('edit-card-grade')?.value || null,
            purchase_price: parseFloat(document.getElementById('edit-card-purchase-price')?.value) || null,
            purchase_date: document.getElementById('edit-card-purchase-date')?.value || null,
            current_fmv: parseFloat(document.getElementById('edit-card-current-fmv')?.value) || null,
            search_query_string: document.getElementById('editCardSearchQuery')?.value.trim() || '',
            tags: document.getElementById('edit-card-tags')?.value ?
                  document.getElementById('edit-card-tags').value.split(',').map(t => t.trim()) : [],
            auto_update: document.getElementById('edit-card-auto-update')?.checked || false
        };
        
        const submitBtn = event.target.querySelector('.auth-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Saving...';
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            
            if (!supabase) {
                throw new Error('Database not available');
            }
            
            // Fetch the old card data to compare current_fmv
            const { data: oldCard, error: fetchError } = await supabase
                .from('cards')
                .select('current_fmv')
                .eq('id', cardId)
                .single();
            
            if (fetchError) {
                console.warn('[COLLECTION] Could not fetch old card data for price history comparison:', fetchError);
            }
            
            const { error } = await supabase
                .from('cards')
                .update(cardData)
                .eq('id', cardId);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Card updated successfully');
            
            // Create price history entry if current_fmv was changed and is valid
            const oldFmv = oldCard ? parseFloat(oldCard.current_fmv) : null;
            const newFmv = cardData.current_fmv;
            
            if (newFmv && newFmv > 0 && oldFmv !== newFmv) {
                console.log('[COLLECTION] Current FMV changed from', oldFmv, 'to', newFmv, '- creating price history entry...');
                
                const { error: historyError } = await supabase
                    .from('price_history')
                    .insert([{
                        card_id: cardId,
                        value: newFmv,
                        num_sales: null,
                        confidence: 'user_provided'
                    }]);
                
                if (historyError) {
                    console.error('[COLLECTION] Error creating price history:', historyError);
                    // Don't fail the entire save - price history is supplementary
                } else {
                    console.log('[COLLECTION] Price history entry created successfully');
                }
            }
            
            if (submitBtn) {
                submitBtn.textContent = '✅ Saved!';
                submitBtn.style.background = 'linear-gradient(135deg, #34c759, #30d158)';
            }
            
            setTimeout(() => {
                hideEditCardModal();
                showBinderDetails(binderId);
            }, 1000);
            
        } catch (error) {
            console.error('[COLLECTION] Error updating card:', error);
            alert('Failed to update card: ' + (error.message || 'Unknown error'));
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '💾 Save Changes';
            }
        }
    }
    
    /**
     * Show context menu for binder
     */
    function showBinderContextMenu(binderId, binderName, event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Remove any existing context menu
        closeContextMenu();
        
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            background: var(--card-background);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            z-index: 10001;
            min-width: 150px;
            overflow: hidden;
            animation: scaleIn 0.15s ease;
        `;
        
        menu.innerHTML = `
            <div class="context-menu-item" onclick="CollectionModule.showEditBinderModal('${binderId}', '${binderName.replace(/'/g, "\\'")}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem;" onmouseover="this.style.background='linear-gradient(135deg, #f0f4ff 0%, #e6f0ff 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">✏️</span>
                <span>Edit</span>
            </div>
            <div class="context-menu-item" onclick="CollectionModule.deleteBinder('${binderId}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem; color: #ff3b30;" onmouseover="this.style.background='linear-gradient(135deg, #fff0f0 0%, #ffe6e6 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">🗑️</span>
                <span>Delete</span>
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Position the menu near the clicked button
        const rect = event.target.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        
        let left = rect.right + 5;
        let top = rect.top;
        
        // Adjust if menu goes off screen
        if (left + menuRect.width > window.innerWidth) {
            left = rect.left - menuRect.width - 5;
        }
        if (top + menuRect.height > window.innerHeight) {
            top = window.innerHeight - menuRect.height - 10;
        }
        
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', closeContextMenu);
        }, 0);
    }
    
    /**
     * Show context menu for card
     */
    function showCardContextMenu(cardId, binderId, event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Remove any existing context menu
        closeContextMenu();
        
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            background: var(--card-background);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            z-index: 10001;
            min-width: 150px;
            overflow: hidden;
            animation: scaleIn 0.15s ease;
        `;
        
        menu.innerHTML = `
            <div class="context-menu-item" onclick="CollectionModule.showEditCardModal('${cardId}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem;" onmouseover="this.style.background='linear-gradient(135deg, #f0f4ff 0%, #e6f0ff 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">✏️</span>
                <span>Edit</span>
            </div>
            <div class="context-menu-item" onclick="CollectionModule.showMoveCardModal('${cardId}', '${binderId}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem;" onmouseover="this.style.background='linear-gradient(135deg, #f0f4ff 0%, #e6f0ff 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">📁</span>
                <span>Move</span>
            </div>
            <div class="context-menu-item" onclick="CollectionModule.deleteCard('${cardId}', '${binderId}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem; color: #ff3b30;" onmouseover="this.style.background='linear-gradient(135deg, #fff0f0 0%, #ffe6e6 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">🗑️</span>
                <span>Delete</span>
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Position the menu near the clicked button
        const rect = event.target.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        
        let left = rect.right + 5;
        let top = rect.top;
        
        // Adjust if menu goes off screen
        if (left + menuRect.width > window.innerWidth) {
            left = rect.left - menuRect.width - 5;
        }
        if (top + menuRect.height > window.innerHeight) {
            top = window.innerHeight - menuRect.height - 10;
        }
        
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', closeContextMenu);
        }, 0);
    }
    
    /**
     * Close context menu
     */
    function closeContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) {
            menu.remove();
        }
        document.removeEventListener('click', closeContextMenu);
    }
    
    /**
     * Show move card modal
     */
    async function showMoveCardModal(cardId, currentBinderId) {
        console.log('[COLLECTION] Opening Move Card modal for:', cardId);
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            // Fetch all user's binders
            const { data: binders, error: bindersError } = await supabase
                .from('binders')
                .select('id, name')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (bindersError) {
                throw bindersError;
            }
            
            // Filter out current binder
            const otherBinders = binders.filter(b => b.id !== currentBinderId);
            
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.id = 'move-card-modal-overlay';
            overlay.className = 'auth-modal-overlay';
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
            modal.className = 'auth-modal';
            modal.style.cssText = `
                background: var(--card-background);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 500px;
                position: relative;
                border: 1px solid var(--border-color);
                animation: scaleIn 0.3s ease;
            `;
            
            let binderOptions = '';
            if (otherBinders.length > 0) {
                binderOptions = otherBinders.map(b =>
                    `<div class="binder-option" onclick="CollectionModule.handleMoveCard('${cardId}', '${b.id}', '${currentBinderId}')" style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s; margin-bottom: 0.75rem;" onmouseover="this.style.background='linear-gradient(135deg, #f0f4ff 0%, #e6f0ff 100%)'; this.style.borderColor='#007aff';" onmouseout="this.style.background='transparent'; this.style.borderColor='var(--border-color)'">
                        <div style="font-weight: 600; color: var(--text-color);">📁 ${escapeHtml(b.name)}</div>
                    </div>`
                ).join('');
            } else {
                binderOptions = `<div style="text-align: center; padding: 2rem; color: var(--subtle-text-color);">No other binders available</div>`;
            }
            
            modal.innerHTML = `
                <div class="auth-modal-header" style="padding: 2rem 2rem 1rem 2rem; border-bottom: 1px solid var(--border-color); position: relative; text-align: center;">
                    <h2 style="margin: 0; font-size: 1.75rem; font-weight: 700; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                        📁 Move Card to Binder
                    </h2>
                    <button class="auth-modal-close" onclick="CollectionModule.hideMoveCardModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: transparent; border: none; font-size: 2rem; color: var(--subtle-text-color); cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease; padding: 0;">
                        &times;
                    </button>
                </div>
                
                <div class="auth-modal-body" style="padding: 2rem;">
                    <div style="margin-bottom: 1.5rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1rem; font-weight: 600; color: var(--text-color);">Select Destination Binder:</h3>
                        ${binderOptions}
                    </div>
                    
                    <div style="border-top: 1px solid var(--border-color); padding-top: 1.5rem;">
                        <div class="binder-option" onclick="CollectionModule.showCreateBinderForMove('${cardId}', '${currentBinderId}')" style="padding: 1rem; border: 2px dashed var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s; text-align: center;" onmouseover="this.style.background='linear-gradient(135deg, #f0fff4 0%, #e6ffe6 100%)'; this.style.borderColor='#34c759';" onmouseout="this.style.background='transparent'; this.style.borderColor='var(--border-color)'">
                            <div style="font-weight: 600; color: #34c759;">+ Create New Binder</div>
                        </div>
                    </div>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    hideMoveCardModal();
                }
            });
            
            // Close on Escape key
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    hideMoveCardModal();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
            
        } catch (error) {
            console.error('[COLLECTION] Error showing move card modal:', error);
            alert('Failed to load binders: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Hide move card modal
     */
    function hideMoveCardModal() {
        const overlay = document.getElementById('move-card-modal-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    }
    
    /**
     * Show create binder input for move operation
     */
    function showCreateBinderForMove(cardId, currentBinderId) {
        const modalBody = document.querySelector('#move-card-modal-overlay .auth-modal-body');
        if (!modalBody) return;
        
        modalBody.innerHTML = `
            <form id="create-binder-for-move-form">
                <div class="auth-form-group">
                    <label>New Binder Name</label>
                    <input type="text" id="new-binder-name-for-move" placeholder="e.g., Rookie Cards 2024" required autofocus>
                </div>
                
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button type="button" onclick="CollectionModule.showMoveCardModal('${cardId}', '${currentBinderId}')" style="flex: 1; padding: 0.875rem; background: var(--background-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                        Cancel
                    </button>
                    <button type="submit" class="auth-submit-btn" style="flex: 1; padding: 0.875rem; background: var(--gradient-primary); color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                        Create & Move
                    </button>
                </div>
            </form>
        `;
        
        const form = document.getElementById('create-binder-for-move-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const binderName = document.getElementById('new-binder-name-for-move')?.value;
            if (!binderName) return;
            
            const submitBtn = form.querySelector('.auth-submit-btn');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '⏳ Creating...';
            }
            
            try {
                const supabase = window.AuthModule.getClient();
                const user = window.AuthModule.getCurrentUser();
                
                if (!supabase || !user) {
                    throw new Error('Authentication error');
                }
                
                // Create new binder
                const { data: binderData, error: binderError } = await supabase
                    .from('binders')
                    .insert([{
                        user_id: user.id,
                        name: binderName
                    }])
                    .select()
                    .single();
                
                if (binderError) {
                    throw binderError;
                }
                
                // Move card to new binder
                await handleMoveCard(cardId, binderData.id, currentBinderId);
                
            } catch (error) {
                console.error('[COLLECTION] Error creating binder:', error);
                alert('Failed to create binder: ' + (error.message || 'Unknown error'));
                
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create & Move';
                }
            }
        });
    }
    
    /**
     * Handle moving a card to a different binder
     */
    async function handleMoveCard(cardId, newBinderId, currentBinderId) {
        console.log('[COLLECTION] Moving card', cardId, 'to binder', newBinderId);
        
        try {
            const supabase = window.AuthModule.getClient();
            
            if (!supabase) {
                throw new Error('Database not available');
            }
            
            // Update card's binder_id (user_id remains unchanged - same user)
            const { error } = await supabase
                .from('cards')
                .update({ binder_id: newBinderId })
                .eq('id', cardId);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Card moved successfully');
            
            // Close modal
            hideMoveCardModal();
            
            // Refresh the current binder view
            showBinderDetails(currentBinderId);
            
        } catch (error) {
            console.error('[COLLECTION] Error moving card:', error);
            alert('Failed to move card: ' + (error.message || 'Unknown error'));
        }
    }
    
    // Public API
    return {
        showAddToCollectionModal,
        hideAddToCollectionModal,
        parseSearchString,
        displayBinderView,
        showBinderDetails,
        deleteBinder,
        deleteCard,
        showEditBinderModal,
        hideEditBinderModal,
        showEditCardModal,
        hideEditCardModal,
        showBinderContextMenu,
        showCardContextMenu,
        closeContextMenu,
        showMoveCardModal,
        hideMoveCardModal,
        showCreateBinderForMove,
        handleMoveCard,
        sortBindersView,
        sortCardsView
    };
})();

// Expose CollectionModule globally
window.CollectionModule = CollectionModule;
