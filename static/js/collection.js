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
     * @param {Object} cardData - Optional pre-filled card data
     */
    function showAddToCollectionModal(searchQuery = '', cardData = {}) {
        console.log('[COLLECTION] Opening Add to Collection modal');
        console.log('[COLLECTION] Search query:', searchQuery);
        
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
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Purchase Price ($)</label>
                                <input type="number" id="card-purchase-price" placeholder="0.00" step="0.01" min="0">
                            </div>
                            
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Date Purchased</label>
                                <input type="date" id="card-purchase-date" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color);">
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
                                        Automatically update Fair Market Value every 30 days
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Hidden field for search query -->
                    <input type="hidden" id="card-search-query" value="${searchQuery}">
                    
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
            binder: document.getElementById('card-binder')?.value || null,
            newBinderName: document.getElementById('new-binder-name')?.value || null,
            tags: document.getElementById('card-tags')?.value || null,
            autoUpdate: document.getElementById('card-auto-update')?.checked || false,
            searchQuery: document.getElementById('card-search-query')?.value || null
        };
        
        console.log('[COLLECTION] Form data:', formData);
        
        // Validation
        if (!formData.athlete) {
            alert('Please enter the athlete name');
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
                year: formData.year,
                set_name: formData.set,
                athlete: formData.athlete,
                card_number: formData.cardNumber,
                variation: formData.variation,
                grading_company: formData.gradingCompany,
                grade: formData.grade,
                purchase_price: formData.purchasePrice,
                purchase_date: formData.purchaseDate,
                search_query_string: formData.searchQuery,
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
    async function displayBinderView() {
        console.log('[COLLECTION] Displaying binder view...');
        
        const container = document.getElementById('portfolio-container');
        if (!container) {
            console.error('[COLLECTION] Portfolio container not found');
            return;
        }
        
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
            
            // Render binder dashboard
            renderBinderDashboard(bindersWithStats);
            
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
    function renderBinderDashboard(binders) {
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
            
            <!-- Binders Grid -->
            <div style="margin-bottom: 1.5rem;">
                <h3 style="margin: 0 0 1rem 0; font-size: 1.25rem; font-weight: 600; color: var(--text-color);">📁 Your Binders</h3>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
        `;
        
        // Render each binder card
        binders.forEach(binder => {
            const stats = binder.stats || {};
            const roiColor = (stats.roi || 0) >= 0 ? '#34c759' : '#ff3b30';
            
            html += `
                <div class="binder-card" onclick="CollectionModule.showBinderDetails('${binder.id}')" style="background: var(--card-background); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); transition: all 0.3s ease; cursor: pointer;">
                    <h4 style="margin: 0 0 1rem 0; font-size: 1.2rem; font-weight: 600; color: var(--text-color);">
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
     * Show detailed view of a specific binder with all cards
     */
    async function showBinderDetails(binderId) {
        console.log('[COLLECTION] Showing binder details for:', binderId);
        
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
            
            // Render binder detail view
            renderBinderDetailView(binder, cards);
            
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
    function renderBinderDetailView(binder, cards) {
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
                    📁 ${escapeHtml(binder.name)}
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
                    <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color);">
                        <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--text-color);">Cards (${totalCards})</h3>
                    </div>
                    
                    <div style="overflow-x: auto;">
                        <table class="card-list-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
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
                        <td style="padding: 0.75rem;">
                            <div style="font-weight: 600; color: var(--text-color); margin-bottom: 0.25rem;">${escapeHtml(cardDesc || 'Untitled Card')}</div>
                            ${card.tags ? `<div style="font-size: 0.75rem; color: var(--subtle-text-color);">${Array.isArray(card.tags) ? card.tags.map(t => '#' + t).join(' ') : '#' + card.tags}</div>` : ''}
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
    
    // Public API
    return {
        showAddToCollectionModal,
        hideAddToCollectionModal,
        parseSearchString,
        displayBinderView,
        showBinderDetails
    };
})();

// Expose CollectionModule globally
window.CollectionModule = CollectionModule;
