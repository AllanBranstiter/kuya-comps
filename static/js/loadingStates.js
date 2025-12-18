/**
 * Loading States Module
 * Handles loading spinners, progress indicators, and skeleton screens
 */

// ============================================================================
// LOADING STATE HTML GENERATORS
// ============================================================================

/**
 * Generate detailed multi-stage loading UI
 * @returns {string} HTML for loading container
 */
function generateDetailedLoadingState() {
    return `
      <div class="loading-container">
        <div class="loading-stage active" id="search-stage">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <h4>Searching eBay listings...</h4>
            <p>Fetching recent sales data</p>
          </div>
        </div>
        <div class="loading-stage" id="analysis-stage">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <h4>Analyzing Results...</h4>
            <p>Calculating market values and statistics</p>
          </div>
        </div>
        <div class="loading-stage" id="render-stage">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <h4>Preparing Display...</h4>
            <p>Generating visualizations and insights</p>
          </div>
        </div>
        <div class="progress-info" style="text-align: center; margin-top: 1rem; color: var(--subtle-text-color);">
          <p>Estimated time remaining: ~15 seconds</p>
        </div>
      </div>
    `;
}

/**
 * Generate simple loading message
 * @param {string} message - Loading message to display
 * @returns {string} HTML for simple loading state
 */
function generateSimpleLoadingState(message = 'Loading...') {
    return `<div class="loading">${message}</div>`;
}

/**
 * Generate error container HTML
 * @param {string} errorMessage - Error message to display
 * @returns {string} HTML for error display
 */
function generateErrorState(errorMessage) {
    return `
        <div class="error-container">
          <div class="error-icon">⚠️</div>
          <div class="error-content">
            <h4>Search Failed</h4>
            <p>${escapeHtml(errorMessage)}</p>
          </div>
        </div>
    `;
}

// ============================================================================
// LOADING STATE UPDATERS
// ============================================================================

/**
 * Update loading stage to active
 * @param {string} stageId - ID of the stage element to activate
 */
function activateLoadingStage(stageId) {
    // Deactivate all stages
    document.querySelectorAll('.loading-stage').forEach(stage => {
        stage.classList.remove('active');
    });
    
    // Activate specified stage
    const stage = document.getElementById(stageId);
    if (stage) {
        stage.classList.add('active');
    }
}

/**
 * Update progress info text
 * @param {string} message - Message to display
 */
function updateProgressInfo(message) {
    const progressInfo = document.querySelector('.progress-info p');
    if (progressInfo) {
        progressInfo.textContent = message;
    }
}

/**
 * Update progress info with elapsed time
 * @param {number} elapsedSeconds - Number of seconds elapsed
 */
function updateProgressWithTime(elapsedSeconds) {
    updateProgressInfo(`Processing time: ${elapsedSeconds} seconds`);
}

// ============================================================================
// BUTTON STATE MANAGEMENT
// ============================================================================

/**
 * Set button to loading state
 * @param {HTMLElement} button - Button element
 * @param {string} loadingText - Text to display while loading
 * @returns {Object} Object containing original state to restore later
 */
function setButtonLoading(button, loadingText = '⏳ Loading...') {
    if (!button) return null;
    
    const originalState = {
        text: button.innerHTML,
        background: button.style.background,
        disabled: button.disabled
    };
    
    button.innerHTML = loadingText;
    button.style.background = 'linear-gradient(135deg, #6c757d, #858a91)';
    button.disabled = true;
    
    return originalState;
}

/**
 * Restore button to original state
 * @param {HTMLElement} button - Button element
 * @param {Object} originalState - Original state object from setButtonLoading
 */
function restoreButtonState(button, originalState) {
    if (!button || !originalState) return;
    
    button.innerHTML = originalState.text;
    button.style.background = originalState.background;
    button.disabled = originalState.disabled;
}

// ============================================================================
// CSS INJECTION
// ============================================================================

/**
 * Inject loading styles if not already present
 */
function injectLoadingStyles() {
    if (document.getElementById('loading-styles')) {
        return; // Styles already injected
    }
    
    const style = document.createElement('style');
    style.id = 'loading-styles';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-10px); }
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .loading-container {
            padding: 2rem;
            background: var(--background-color);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }
        
        .loading-stage {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: 6px;
            background: var(--card-background);
            opacity: 0.5;
            transition: all 0.3s ease;
        }
        
        .loading-stage.active {
            opacity: 1;
            transform: scale(1.02);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .loading-spinner {
            width: 24px;
            height: 24px;
            border: 3px solid var(--border-color);
            border-top-color: var(--primary-blue);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        .loading-text {
            flex: 1;
        }
        
        .loading-text h4 {
            margin: 0;
            color: var(--text-color);
        }
        
        .loading-text p {
            margin: 0.25rem 0 0;
            color: var(--subtle-text-color);
            font-size: 0.9rem;
        }
        
        .progress-info {
            text-align: center;
            margin-top: 1rem;
            color: var(--subtle-text-color);
            font-size: 0.9rem;
        }
        
        .loading {
            padding: 2rem;
            text-align: center;
            color: var(--subtle-text-color);
            font-size: 1rem;
        }
        
        .error-container {
            padding: 2rem;
            background: var(--card-background);
            border-radius: 8px;
            border: 1px solid #ff3b30;
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }
        
        .error-icon {
            font-size: 3rem;
            flex-shrink: 0;
        }
        
        .error-content h4 {
            margin: 0 0 0.5rem 0;
            color: #ff3b30;
        }
        
        .error-content p {
            margin: 0;
            color: var(--text-color);
        }
    `;
    document.head.appendChild(style);
}

// Auto-inject styles when module loads
injectLoadingStyles();

// ============================================================================
// SKELETON SCREENS
// ============================================================================

/**
 * Generate skeleton screen for table
 * @param {number} rows - Number of skeleton rows to show
 * @returns {string} HTML for skeleton table
 */
function generateTableSkeleton(rows = 5) {
    let skeletonRows = '';
    for (let i = 0; i < rows; i++) {
        skeletonRows += `
            <tr>
                <td><div class="skeleton-line" style="width: 70%;"></div></td>
                <td><div class="skeleton-line" style="width: 40%;"></div></td>
                <td><div class="skeleton-line" style="width: 50%;"></div></td>
            </tr>
        `;
    }
    
    return `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Price</th>
                        <th>Item ID</th>
                    </tr>
                </thead>
                <tbody>
                    ${skeletonRows}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Generate skeleton screen for stats cards
 * @returns {string} HTML for skeleton stats
 */
function generateStatsSkeleton() {
    return `
        <div class="stat-grid">
            <div class="stat-item">
                <div class="skeleton-line" style="width: 60%; margin-bottom: 0.5rem;"></div>
                <div class="skeleton-line" style="width: 80%;"></div>
            </div>
            <div class="stat-item">
                <div class="skeleton-line" style="width: 60%; margin-bottom: 0.5rem;"></div>
                <div class="skeleton-line" style="width: 80%;"></div>
            </div>
            <div class="stat-item">
                <div class="skeleton-line" style="width: 60%; margin-bottom: 0.5rem;"></div>
                <div class="skeleton-line" style="width: 80%;"></div>
            </div>
        </div>
    `;
}

/**
 * Inject skeleton screen styles
 */
function injectSkeletonStyles() {
    if (document.getElementById('skeleton-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'skeleton-styles';
    style.textContent = `
        @keyframes skeleton-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .skeleton-line {
            height: 1rem;
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: skeleton-pulse 1.5s ease-in-out infinite;
            border-radius: 4px;
        }
    `;
    document.head.appendChild(style);
}

// Auto-inject skeleton styles when module loads
injectSkeletonStyles();
