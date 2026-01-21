/**
 * Profile Management Module
 * Manages user profile data and settings
 */

const ProfileModule = (function() {
    'use strict';
    
    let currentProfile = null;
    
    /**
     * Fetch user profile from backend
     * @returns {Promise<Object>} Profile data
     */
    async function fetchProfile() {
        try {
            console.log('[PROFILE] Fetching user profile...');
            
            if (!AuthModule || !AuthModule.isAuthenticated()) {
                console.error('[PROFILE] User not authenticated');
                return { error: 'User not authenticated' };
            }
            
            const client = AuthModule.getClient();
            if (!client) {
                console.error('[PROFILE] Supabase client not available');
                return { error: 'Auth not initialized' };
            }
            
            // Get session to extract access token
            const { data: { session }, error: sessionError } = await client.auth.getSession();
            
            if (sessionError || !session) {
                console.error('[PROFILE] No valid session:', sessionError);
                return { error: 'No valid session' };
            }
            
            const accessToken = session.access_token;
            
            // Fetch profile from backend
            const response = await fetch('/api/profile', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('[PROFILE] Error fetching profile:', errorData);
                return { error: errorData.detail || 'Failed to fetch profile' };
            }
            
            const profileData = await response.json();
            currentProfile = profileData;
            console.log('[PROFILE] Profile fetched successfully');
            
            return { data: profileData };
            
        } catch (error) {
            console.error('[PROFILE] Exception fetching profile:', error);
            return { error: error.message || 'Failed to fetch profile' };
        }
    }
    
    /**
     * Update user profile
     * @param {Object} updates - Profile fields to update
     * @returns {Promise<Object>} Updated profile data
     */
    async function updateProfile(updates) {
        try {
            console.log('[PROFILE] Updating profile...', updates);
            
            if (!AuthModule || !AuthModule.isAuthenticated()) {
                console.error('[PROFILE] User not authenticated');
                return { error: 'User not authenticated' };
            }
            
            const client = AuthModule.getClient();
            if (!client) {
                console.error('[PROFILE] Supabase client not available');
                return { error: 'Auth not initialized' };
            }
            
            // Get session to extract access token
            const { data: { session }, error: sessionError } = await client.auth.getSession();
            
            if (sessionError || !session) {
                console.error('[PROFILE] No valid session:', sessionError);
                return { error: 'No valid session' };
            }
            
            const accessToken = session.access_token;
            
            // Update profile on backend
            const response = await fetch('/api/profile', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('[PROFILE] Error updating profile:', errorData);
                return { error: errorData.detail || 'Failed to update profile' };
            }
            
            const profileData = await response.json();
            currentProfile = profileData;
            console.log('[PROFILE] Profile updated successfully');
            
            return { data: profileData };
            
        } catch (error) {
            console.error('[PROFILE] Exception updating profile:', error);
            return { error: error.message || 'Failed to update profile' };
        }
    }
    
    /**
     * Get current cached profile
     * @returns {Object|null} Current profile data
     */
    function getCurrentProfile() {
        return currentProfile;
    }
    
    /**
     * Render profile settings form
     * @param {string} containerId - ID of container element
     */
    async function renderProfileSettings(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('[PROFILE] Container not found:', containerId);
            return;
        }
        
        // Show loading state
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div class="loading-spinner"></div>
                <p style="color: var(--subtle-text-color); margin-top: 1rem;">Loading profile...</p>
            </div>
        `;
        
        // Fetch profile data
        const result = await fetchProfile();
        
        if (result.error) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <p style="color: var(--accent-red);">Error loading profile: ${result.error}</p>
                    <button class="button" onclick="ProfileModule.renderProfileSettings('${containerId}')">Retry</button>
                </div>
            `;
            return;
        }
        
        const profile = result.data;
        
        // Render profile form
        container.innerHTML = `
            <form id="profile-form" class="profile-form">
                <div class="form-row">
                    <div class="form-group">
                        <label for="profile-first-name">First Name</label>
                        <input type="text" id="profile-first-name" value="${profile.first_name || ''}" placeholder="John">
                    </div>
                    
                    <div class="form-group">
                        <label for="profile-last-name">Last Name</label>
                        <input type="text" id="profile-last-name" value="${profile.last_name || ''}" placeholder="Doe">
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="profile-display-name">Display Name</label>
                    <input type="text" id="profile-display-name" value="${profile.display_name || ''}" placeholder="Username or nickname">
                    <small style="color: var(--subtle-text-color); font-size: 0.85rem; display: block; margin-top: 0.25rem;">
                        This is how your name will be displayed publicly
                    </small>
                </div>
                
                <div class="form-group">
                    <label for="profile-email">Email</label>
                    <input type="email" id="profile-email" value="${profile.email || ''}" disabled>
                    <small style="color: var(--subtle-text-color); font-size: 0.85rem; display: block; margin-top: 0.25rem;">
                        Email cannot be changed here. Contact support to change your email.
                    </small>
                </div>
                
                <div class="form-group">
                    <label for="profile-phone">Phone Number</label>
                    <input type="tel" id="profile-phone" value="${profile.phone || ''}" placeholder="+1 (555) 123-4567">
                </div>
                
                <div class="form-group">
                    <label for="profile-company">Company</label>
                    <input type="text" id="profile-company" value="${profile.company || ''}" placeholder="Company name">
                </div>
                
                <div id="profile-message" style="display: none; padding: 0.875rem; border-radius: 8px; margin-bottom: 1rem;"></div>
                
                <div class="button-group">
                    <button type="submit" class="button">Save Changes</button>
                    <button type="button" class="button secondary" onclick="ProfileModule.renderProfileSettings('${containerId}')">Cancel</button>
                </div>
            </form>
        `;
        
        // Attach form submit handler
        const form = document.getElementById('profile-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await handleProfileUpdate(containerId);
            });
        }
    }
    
    /**
     * Handle profile form submission
     * @param {string} containerId - ID of container element
     */
    async function handleProfileUpdate(containerId) {
        const messageEl = document.getElementById('profile-message');
        
        // Get form values
        const updates = {
            first_name: document.getElementById('profile-first-name')?.value.trim() || null,
            last_name: document.getElementById('profile-last-name')?.value.trim() || null,
            display_name: document.getElementById('profile-display-name')?.value.trim() || null,
            phone: document.getElementById('profile-phone')?.value.trim() || null,
            company: document.getElementById('profile-company')?.value.trim() || null
        };
        
        // Update full_name if first and last name are provided
        if (updates.first_name && updates.last_name) {
            updates.full_name = `${updates.first_name} ${updates.last_name}`;
        }
        
        // Hide previous messages
        if (messageEl) {
            messageEl.style.display = 'none';
        }
        
        // Disable submit button
        const submitBtn = document.querySelector('#profile-form button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
        }
        
        try {
            const result = await updateProfile(updates);
            
            if (result.error) {
                // Show error message
                if (messageEl) {
                    messageEl.textContent = `Error: ${result.error}`;
                    messageEl.style.display = 'flex';
                    messageEl.style.background = '#ffebee';
                    messageEl.style.color = '#c62828';
                    messageEl.style.border = '1px solid #ef9a9a';
                }
            } else {
                // Show success message
                if (messageEl) {
                    messageEl.textContent = '✓ Profile updated successfully!';
                    messageEl.style.display = 'flex';
                    messageEl.style.background = '#e6ffe6';
                    messageEl.style.color = '#2e7d32';
                    messageEl.style.border = '1px solid #99ff99';
                }
                
                // Reload profile data after short delay
                setTimeout(() => {
                    renderProfileSettings(containerId);
                }, 2000);
            }
        } catch (error) {
            console.error('[PROFILE] Update error:', error);
            if (messageEl) {
                messageEl.textContent = 'An unexpected error occurred. Please try again.';
                messageEl.style.display = 'flex';
                messageEl.style.background = '#ffebee';
                messageEl.style.color = '#c62828';
                messageEl.style.border = '1px solid #ef9a9a';
            }
        } finally {
            // Re-enable submit button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Changes';
            }
        }
    }
    
    // Public API
    return {
        fetchProfile,
        updateProfile,
        getCurrentProfile,
        renderProfileSettings
    };
})();

// Expose ProfileModule globally
window.ProfileModule = ProfileModule;
