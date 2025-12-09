let lastData = null;

// globals for expected sale band so we can draw it on the beeswarm
let expectLowGlobal = null;
let expectHighGlobal = null;

// Store current beeswarm data for redrawing on resize
let currentBeeswarmPrices = [];

// Password Protection
const CORRECT_PASSWORD = 'BreakersOnBudget25!';
const MAX_LOGIN_ATTEMPTS = 3;
const COOLDOWN_PERIOD = 15 * 60 * 1000; // 15 minutes in milliseconds

// API key is now handled securely on the backend
const DEFAULT_API_KEY = 'backend-handled';

// Check if user is currently in cooldown
function isInCooldown() {
    const cooldownData = localStorage.getItem('kuya-comps-cooldown');
    if (!cooldownData) return false;
    
    const { endTime } = JSON.parse(cooldownData);
    return Date.now() < endTime;
}

// Get remaining cooldown time in seconds
function getRemainingCooldownTime() {
    const cooldownData = localStorage.getItem('kuya-comps-cooldown');
    if (!cooldownData) return 0;
    
    const { endTime } = JSON.parse(cooldownData);
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    return remaining;
}

// Get current failed attempt count
function getFailedAttempts() {
    const attemptData = localStorage.getItem('kuya-comps-attempts');
    if (!attemptData) return 0;
    
    const { count, lastAttempt } = JSON.parse(attemptData);
    
    // Reset attempts if it's been more than 1 hour since last attempt
    if (Date.now() - lastAttempt > 60 * 60 * 1000) {
        localStorage.removeItem('kuya-comps-attempts');
        return 0;
    }
    
    return count;
}

// Increment failed attempts
function incrementFailedAttempts() {
    const currentAttempts = getFailedAttempts();
    const newCount = currentAttempts + 1;
    
    localStorage.setItem('kuya-comps-attempts', JSON.stringify({
        count: newCount,
        lastAttempt: Date.now()
    }));
    
    return newCount;
}

// Start cooldown period
function startCooldown() {
    const endTime = Date.now() + COOLDOWN_PERIOD;
    localStorage.setItem('kuya-comps-cooldown', JSON.stringify({ endTime }));
    updateCooldownDisplay();
}

// Clear all attempt tracking
function clearAttemptTracking() {
    localStorage.removeItem('kuya-comps-attempts');
    localStorage.removeItem('kuya-comps-cooldown');
}

// Update cooldown display
function updateCooldownDisplay() {
    const passwordError = document.getElementById('password-error');
    const passwordSubmit = document.getElementById('password-submit');
    const passwordInput = document.getElementById('password-input');
    const toggleBtn = document.querySelector('.password-toggle-btn');
    
    if (isInCooldown()) {
        const remainingTime = getRemainingCooldownTime();
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        
        passwordError.innerHTML = `🔒 <strong>Account locked.</strong><br>Too many failed attempts.<br>Try again in ${minutes}:${seconds.toString().padStart(2, '0')}.`;
        passwordError.style.display = 'block';
        passwordSubmit.disabled = true;
        passwordInput.disabled = true;
        if (toggleBtn) toggleBtn.style.display = 'none';
        
        passwordSubmit.style.background = 'linear-gradient(135deg, #6c757d, #858a91)';
        passwordSubmit.style.cursor = 'not-allowed';
        
        // Update every second
        setTimeout(updateCooldownDisplay, 1000);
    } else {
        // Cooldown expired, re-enable login
        passwordError.style.display = 'none';
        passwordSubmit.disabled = false;
        passwordInput.disabled = false;
        if (toggleBtn) toggleBtn.style.display = 'flex';
        
        passwordSubmit.style.background = 'var(--gradient-primary)';
        passwordSubmit.style.cursor = 'pointer';
        
        // Clear cooldown data if expired
        localStorage.removeItem('kuya-comps-cooldown');
    }
}

function checkPassword() {
    // Check if in cooldown period
    if (isInCooldown()) {
        updateCooldownDisplay();
        return;
    }
    const passwordInput = document.getElementById('password-input');
    const passwordError = document.getElementById('password-error');
    const passwordOverlay = document.getElementById('password-overlay');
    const mainContent = document.querySelector('.main-content');
    const rememberMe = document.getElementById('remember-me');
    
    if (passwordInput.value === CORRECT_PASSWORD) {
        // Correct password - clear all attempt tracking and grant access
        clearAttemptTracking();
        
        passwordOverlay.style.display = 'none';
        mainContent.classList.add('authenticated');
        mainContent.style.display = 'block';
        
        // Store authentication based on remember me checkbox
        if (rememberMe.checked) {
            localStorage.setItem('kuya-comps-authenticated', 'true');
            localStorage.setItem('kuya-comps-remember', 'true');
        } else {
            sessionStorage.setItem('kuya-comps-authenticated', 'true');
        }
        
        // Clear the password field and uncheck remember me
        passwordInput.value = '';
        rememberMe.checked = false;
        
        // Initialize the application
        initializeApp();
    } else {
        // Incorrect password - increment attempts
        const currentAttempts = incrementFailedAttempts();
        const remainingAttempts = MAX_LOGIN_ATTEMPTS - currentAttempts;
        
        passwordInput.value = '';
        passwordInput.focus();
        
        if (currentAttempts >= MAX_LOGIN_ATTEMPTS) {
            // Max attempts reached - start cooldown
            startCooldown();
        } else {
            // Show attempt warning
            passwordError.innerHTML = `❌ <strong>Incorrect password</strong><br>${remainingAttempts} ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining before lockout.`;
            passwordError.style.display = 'block';
            
            // Hide error after 5 seconds
            setTimeout(() => {
                if (!isInCooldown()) {
                    passwordError.style.display = 'none';
                }
            }, 5000);
        }
    }
}

// Check if user is already authenticated on page load
function checkAuthentication() {
    // Check both localStorage (remember me) and sessionStorage (single session)
    const isRemembered = localStorage.getItem('kuya-comps-authenticated') === 'true';
    const isSessionAuth = sessionStorage.getItem('kuya-comps-authenticated') === 'true';
    
    if (isRemembered || isSessionAuth) {
        document.getElementById('password-overlay').style.display = 'none';
        document.querySelector('.main-content').classList.add('authenticated');
        document.querySelector('.main-content').style.display = 'block';
        initializeApp();
    } else {
        // Ensure content is hidden and overlay is shown
        document.getElementById('password-overlay').style.display = 'flex';
        document.querySelector('.main-content').classList.remove('authenticated');
        document.querySelector('.main-content').style.display = 'none';
    }
}

// Function to logout (clear all authentication)
function logout() {
    localStorage.removeItem('kuya-comps-authenticated');
    localStorage.removeItem('kuya-comps-remember');
    sessionStorage.removeItem('kuya-comps-authenticated');
    location.reload(); // Refresh page to show login screen
}

// Toggle password visibility
function togglePasswordVisibility(event) {
    // Prevent default button behavior
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const passwordInput = document.getElementById('password-input');
    const toggleIcon = document.getElementById('password-toggle-icon');
    const toggleBtn = document.querySelector('.password-toggle-btn');
    
    if (!passwordInput || !toggleIcon || !toggleBtn) {
        console.error('Password toggle elements not found');
        return;
    }
    
    console.log('Toggle clicked - current input type:', passwordInput.type);
    
    if (passwordInput.type === 'password') {
        // Show password
        passwordInput.type = 'text';
        toggleIcon.textContent = '🙈';
        toggleBtn.setAttribute('aria-label', 'Hide password');
        toggleBtn.title = 'Hide password';
        console.log('Password visibility: SHOWN');
    } else {
        // Hide password
        passwordInput.type = 'password';
        toggleIcon.textContent = '👁️';
        toggleBtn.setAttribute('aria-label', 'Show password');
        toggleBtn.title = 'Show password';
        console.log('Password visibility: HIDDEN');
    }
    
    // Keep focus on password input to continue typing
    passwordInput.focus();
    
    return false;
}

// Allow Enter key to submit password
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    
    // Check for cooldown status on page load
    if (isInCooldown()) {
        updateCooldownDisplay();
    }
    
    const passwordInput = document.getElementById('password-input');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !isInCooldown()) {
                checkPassword();
            }
        });
    }
});

// Tab management
function switchTab(tabName, clickedElement = null) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Use passed element or try to get from event
    const targetElement = clickedElement || (window.event && window.event.target);
    if (targetElement) {
        targetElement.classList.add('active');
    } else {
        // Fallback: find and activate the correct tab button
        document.querySelector(`button[onclick="switchTab('${tabName}')"]`)?.classList.add('active');
    }
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const tabContent = document.getElementById(tabName + '-tab');
    if (tabContent) {
        tabContent.classList.add('active');
    }
    
    // Redraw chart if switching to comps tab and we have data
    if (tabName === 'comps' && currentBeeswarmPrices.length > 0) {
        setTimeout(() => {
            resizeCanvas();
            drawBeeswarm(currentBeeswarmPrices);
        }, 100);
    }
}

// PSA Grade Selection Management
function limitPsaSelection() {
    const psaCheckboxes = document.querySelectorAll('.psa-grade');
    const checkedBoxes = document.querySelectorAll('.psa-grade:checked');
    
    if (checkedBoxes.length >= 4) {
        // Disable unchecked boxes
        psaCheckboxes.forEach(checkbox => {
            if (!checkbox.checked) {
                checkbox.disabled = true;
            }
        });
    } else {
        // Enable all boxes
        psaCheckboxes.forEach(checkbox => {
            checkbox.disabled = false;
        });
    }
    
    // Update Find Card button availability
    updateFindCardButton();
}

// Update Find Card button state based on PSA grade selection
function updateFindCardButton() {
    const checkedBoxes = document.querySelectorAll('.psa-grade:checked');
    const findCardButton = document.querySelector('button[onclick="runIntelligenceSearch()"]');
    
    if (checkedBoxes.length === 0) {
        // No grades selected - disable button
        findCardButton.disabled = true;
        findCardButton.style.background = 'linear-gradient(135deg, #6c757d, #858a91)';
        findCardButton.style.color = '#8e8e93';
        findCardButton.style.cursor = 'not-allowed';
        findCardButton.innerHTML = '🔍 Find Card';
    } else {
        // At least one grade selected - enable button
        findCardButton.disabled = false;
        findCardButton.style.background = 'linear-gradient(135deg, #ff9500, #ff6b35)';
        findCardButton.style.color = 'white';
        findCardButton.style.cursor = 'pointer';
        findCardButton.innerHTML = '🔍 Find Card';
    }
}

// Intelligence Search Function - Multiple PSA Grade Searches
async function runIntelligenceSearch() {
    const query = document.getElementById("intelligence-query").value;
    const selectedGrades = [];
    
    document.querySelectorAll('.psa-grade:checked').forEach(checkbox => {
        const gradeNumber = checkbox.id.replace('psa', '');
        selectedGrades.push(gradeNumber);
    });
    
    if (!query.trim()) {
        alert("Please enter a card search query.");
        return;
    }
    
    if (selectedGrades.length === 0) {
        alert("Please select at least one PSA grade.");
        return;
    }
    
    // API key is handled on backend
    const apiKey = "backend-handled";
    
    // Show loading state
    const insightsContainer = document.getElementById("insights-container");
    insightsContainer.innerHTML = '<div class="loading">Searching across PSA grades...</div>';
    
    // Add loading state to button
    const findCardButton = document.querySelector('button[onclick="runIntelligenceSearch()"]');
    const originalFindCardText = findCardButton.innerHTML;
    findCardButton.innerHTML = '⏳ Searching...';
    findCardButton.style.background = 'linear-gradient(135deg, #6c757d, #858a91)';
    findCardButton.disabled = true;
    
    const gradeResults = [];
    
    try {
        // Perform search for each selected PSA grade
        for (const grade of selectedGrades) {
            const psaQuery = `${query} "PSA ${grade}"`;
            console.log(`[INTELLIGENCE] Searching for: ${psaQuery}`);
            
            const params = new URLSearchParams({
                query: psaQuery,
                pages: 1,
                delay: 2,
                ungraded_only: false, // Include graded cards
                api_key: apiKey
            });
            
            const url = `/comps?${params.toString()}`;
            const resp = await fetch(url);
            const data = await resp.json();
            
            if (data.detail) {
                console.error(`[INTELLIGENCE] Error for PSA ${grade}:`, data.detail);
                continue;
            }
            
            // Log that this PSA grade search was saved to CSV
            console.log(`[INTELLIGENCE] PSA ${grade} results saved to results_library_complete.csv (${data.items.length} items)`);
            
            // Calculate FMV for this grade
            let marketValue = null;
            if (data.items && data.items.length > 0) {
                const fmvResp = await fetch('/fmv', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data.items)
                });
                const fmvData = await fmvResp.json();
                marketValue = fmvData.market_value;
            }
            
            gradeResults.push({
                grade: grade,
                data: data,
                marketValue: marketValue
            });
            
            console.log(`[INTELLIGENCE] PSA ${grade}: Found ${data.items.length} items, Market Value: ${marketValue ? '$' + marketValue.toFixed(2) : 'N/A'}`);
        }
        
        // Display results
        renderPsaComparison(gradeResults);
        
    } catch (error) {
        console.error('[INTELLIGENCE] Search error:', error);
        insightsContainer.innerHTML = `<div style="color: #ff3b30; text-align: center; padding: 2rem;">
            <strong>Error:</strong> ${error}
        </div>`;
    } finally {
        // Restore button state based on PSA selection
        findCardButton.innerHTML = originalFindCardText;
        updateFindCardButton();
    }
}

function renderPsaComparison(gradeResults) {
    const container = document.getElementById("insights-container");
    
    if (!gradeResults || gradeResults.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--subtle-text-color);">
                <h3>🔍 No Results Found</h3>
                <p>No data found for the selected PSA grades. Try different grades or search terms.</p>
            </div>
        `;
        return;
    }
    
    let comparisonHtml = `
        <div id="psa-comparison">
            <h3>💎 PSA Grade Price Comparison</h3>
            <div class="psa-results-grid">
    `;
    
    // Create a card for each PSA grade
    gradeResults.forEach(result => {
        const data = result.data;
        const grade = result.grade;
        const marketValue = result.marketValue;
        
        if (data.items.length === 0) {
            // No results for this grade
            comparisonHtml += `
                <div class="psa-result-card">
                    <h4>PSA ${grade}</h4>
                    <div style="text-align: center; padding: 2rem; color: var(--subtle-text-color);">
                        <p>No results found</p>
                    </div>
                </div>
            `;
        } else {
            comparisonHtml += `
                <div class="psa-result-card">
                    <h4>PSA ${grade} <span class="item-count">(${data.items.length} items)</span></h4>
                    <div class="psa-stats">
                        <div class="psa-stat">
                            <span class="psa-stat-label">Min Price:</span>
                            <span class="psa-stat-value">${formatMoney(data.min_price)}</span>
                        </div>
                        <div class="psa-stat">
                            <span class="psa-stat-label">Max Price:</span>
                            <span class="psa-stat-value">${formatMoney(data.max_price)}</span>
                        </div>
                        <div class="psa-stat">
                            <span class="psa-stat-label">Market Value:</span>
                            <span class="psa-stat-value">${formatMoney(marketValue)}</span>
                        </div>
                    </div>
                </div>
            `;
        }
    });
    
    comparisonHtml += `
            </div>
        </div>
    `;
    
    container.innerHTML = comparisonHtml;
}

function formatMoney(value) {
  if (value == null || isNaN(value)) return "N/A";
  return "$" + value.toFixed(2);
}

// helper to make a “.99” style list price
function toNinetyNine(value) {
  if (value == null || isNaN(value)) return null;
  const ceil = Math.ceil(value);
  const base = Math.max(ceil, 1);
  return base - 0.01;
}

// This function is called after authentication
function initializeApp() {
    setupResponsiveCanvas();
    // Initialize Find Card button state based on default checked PSA grades
    updateFindCardButton();
}

function setupResponsiveCanvas() {
    // Handle window resize
    window.addEventListener('resize', () => {
        if (currentBeeswarmPrices.length > 0) {
            resizeCanvas();
            drawBeeswarm(currentBeeswarmPrices);
        }
    });
}

function resizeCanvas() {
    const canvas = document.getElementById("beeswarmCanvas");
    if (!canvas) return;
    
    const container = canvas.parentElement;
    const containerWidth = container.offsetWidth;
    
    // Set canvas actual size (in pixels)
    canvas.width = containerWidth;
    canvas.height = 200;
    
    // Update CSS size to match
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = '200px';
}

async function renderData(data, showFindDealsButton = true) {
    const resultsDiv = document.getElementById("results");
    
    // Create a container for the table with fixed height and scrolling
    let html = `
      <div class="table-container" style="border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 1.5rem;">
        <table>
          <tr>
            <th>Title</th>
            <th>Price</th>
            <th>Item ID</th>
          </tr>
          ${data.items.map(item => `
            <tr>
              <td>${item.title}</td>
              <td>${formatMoney(item.total_price)}</td>
              <td><a href="${item.link}" target="_blank">${item.item_id}</a></td>
            </tr>
          `).join('')}
        </table>
      </div>
    `;
    
    // Calculate market value from the current data being rendered
    const marketValue = data.items.length > 0 ?
        data.items.reduce((sum, item) => sum + (item.total_price || 0), 0) / data.items.length : 0;
    
    // Conditionally add the Find Deals button section
    if (showFindDealsButton) {
        html += `
          <div style="text-align: center; padding: 1rem; background: var(--background-color); border-radius: 8px; margin-top: 1rem; border: 1px solid var(--border-color);">
            <h4 style="margin: 0 0 0.5rem 0; color: var(--text-color);">💰 Market Value: ${formatMoney(marketValue)}</h4>
            <p style="margin: 0 0 1rem 0; color: var(--subtle-text-color); font-size: 0.9rem;">Search for current listings below market value</p>
            <button id="find-deals-button"
                    style="background: linear-gradient(135deg, #ff4500, #ff6b35);
                           box-shadow: 0 4px 12px rgba(255, 69, 0, 0.3);
                           padding: 12px 24px;
                           font-size: 1rem;
                           border: none;
                           border-radius: 8px;
                           color: white;
                           cursor: pointer;
                           font-weight: 600;">
              🎯 Find Deals
            </button>
          </div>
        `;
    }
      
    // Deals Results Section (initially empty)
    html += `<div id="deals-results" style="margin-top: 1.5rem;"></div>`;
    
    resultsDiv.innerHTML = html;
    console.log('[DEBUG] renderData - HTML set, resultsDiv content:', resultsDiv.innerHTML.substring(0, 200));

    // Add event listener to Find Deals button (only if it exists in the rendered HTML)
    if (showFindDealsButton) {
        const findDealsButton = document.getElementById('find-deals-button');
        if (findDealsButton) {
            findDealsButton.addEventListener('click', findDeals);
            console.log('[DEALS] Event listener added to Find Deals button');
        } else {
            console.error('[DEALS] Could not find Find Deals button to add event listener');
        }
    }

    // Clear old stats and chart with smooth transition
    clearBeeswarm();
    
    // Add loading state
    document.getElementById("stats-container").innerHTML = '<div class="loading">Calculating statistics...</div>';
    
    // Smooth delay for better UX
    await new Promise(resolve => setTimeout(resolve, 300));
    
    renderStats(data);
    
    // Render market intelligence insights in separate tab
    if (data.market_intelligence) {
        renderMarketIntelligence(data.market_intelligence);
    } else {
        renderMarketIntelligence(null); // Show empty state
    }
    
    // Update FMV first, then draw beeswarm chart
    await updateFmv(data);
    const prices = data.items.map(item => item.total_price);
    currentBeeswarmPrices = prices; // Store for resize
    drawBeeswarm(prices);
    
    // Trigger chart animation
    const chartContainer = document.getElementById("chart-container");
    chartContainer.style.opacity = '0';
    await new Promise(resolve => setTimeout(resolve, 100));
    chartContainer.style.opacity = '1';
}

// Combined search: Run comps search then immediately find deals
async function runCompsAndDeals() {
    const query = document.getElementById("query").value;
    if (!query) {
        alert("Please enter a search query.");
        return;
    }

    // Add loading state to the Find Deals button
    const compsAndDealsButton = document.querySelector('button[onclick="runCompsAndDeals()"]');
    const originalButtonText = compsAndDealsButton.innerHTML;
    compsAndDealsButton.innerHTML = '⏳ Searching...';
    compsAndDealsButton.style.background = 'linear-gradient(135deg, #6c757d, #858a91)';
    compsAndDealsButton.disabled = true;

    try {
        // First, run the regular comps search
        console.log('[COMPS+DEALS] Starting comps search...');
        await runSearchInternal(false); // Don't show Find Deals button
        
        // Wait for comps search to complete
        if (!lastData || !lastData.items || lastData.items.length === 0) {
            alert("No comp data found. Cannot search for deals without market value.");
            return;
        }

        // Call the /fmv endpoint to get the volume-weighted market value
        console.log('[COMPS+DEALS] Calculating FMV...');
        const fmvResp = await fetch('/fmv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lastData.items)
        });
        const fmvData = await fmvResp.json();

        if (fmvData.detail) {
            alert("Error calculating FMV: " + fmvData.detail);
            return;
        }

        const marketValue = fmvData.market_value;
        if (!marketValue || marketValue <= 0) {
            alert("Could not determine a valid market value for deals. Try a different search query.");
            return;
        }
        console.log('[COMPS+DEALS] Market value from FMV:', marketValue);

        // Now search for deals
        console.log('[COMPS+DEALS] Starting deals search...');
        await findDealsInternal(marketValue);
        
        console.log('[COMPS+DEALS] Both searches completed successfully');
        
    } catch (error) {
        console.error('[COMPS+DEALS] Error:', error);
        const resultsDiv = document.getElementById("results");
        resultsDiv.innerHTML = `<div style="color: #ff3b30; text-align: center; padding: 2rem;">
            <strong>Error:</strong> ${error}
        </div>`;
    } finally {
        // Restore button state
        compsAndDealsButton.innerHTML = originalButtonText;
        compsAndDealsButton.style.background = 'linear-gradient(135deg, #ff4500, #ff6b35)';
        compsAndDealsButton.disabled = false;
    }
}

async function runSearch() {
    await runSearchInternal(true); // Show Find Deals button for normal search
}

// Helper function to construct the search query with all selected exclusions
function getSearchQueryWithExclusions(baseQuery) {
    const ungradedOnly = document.getElementById("ungraded_only").checked;
    const baseOnly = document.getElementById("base_only").checked;
    const excludeAutos = document.getElementById("exclude_autos").checked;

    let allExcludedPhrases = [];

    if (ungradedOnly) {
        const rawOnlyExclusions = [
            // PSA related
            '-psa', '-"Professional Sports Authenticator"', '-"Professional Authenticator"',
            '-"Pro Sports Authenticator"', '-"Certified 10"', '-"Certified Gem"', '-"Certified Mint"',
            '-slabbed', '-"Red Label"', '-lighthouse', '-"Gem Mint 10"', '-"Graded 10"', '-"Mint 10"',
            
            // BGS related
            '-bgs', '-beckett', '-"Gem 10"', '-"Black Label"', '-"Gold Label"', '-"Silver Label"',
            '-subgrades', '-subs', '-"Quad 9.5"', '-"True Gem"', '-"True Gem+"', '-"Gem+"', '-bvg',
            
            // SGC related
            '-sgc', '-"Tuxedo Slab"', '-"Black Slab"', '-"Green Label"', '-"SG LLC"',
            '-"SG Grading"', '-"Mint+ 9.5"', '-"10 Pristine"',
            
            // CGC related
            '-csg', '-cgc', '-"Certified Collectibles Group"', '-"CGC Trading Cards"', '-"CSG Gem"',
            '-"Pristine 10"', '-"Perfect 10"', '-"Green Slab"',
            
            // General grading terms
            '-encapsulated', '-authenticated', '-verified', '-"Slabbed Card"', '-"Third-Party Graded"',
            '-graded', '-gem', '-"Gem Mint"', '-pristine', '-"Mint+"', '-"NM-MT"',
            '-"Certified Authentic"', '-"Pro Graded"',
            
            // Other grading companies
            '-gma', '-hga', '-ksa', '-fgs', '-pgi', '-pro', '-isa', '-mnt', '-"MNT Grading"',
            '-rcg', '-"TCG Grading"', '-bccg', '-tag', '-pgs', '-tga', '-ace', '-usg',
            
            // Slab related
            '-slab', '-"Slabbed up"', '-"In case"', '-holdered', '-encased',
            '-"Graded Rookie"', '-"Graded RC"', '-"Gem Rookie"', '-"Gem RC"'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(rawOnlyExclusions);
    }

    if (baseOnly) {
        const baseOnlyExclusions = [
            '-refractors', '-red', '-aqua', '-blue', '-magenta', '-yellow', '-lot',
            '-x-fractors', '-xfractors', '-helix', '-superfractor', '-x-fractor',
            '-logofractor', '-stars', '-hyper', '-all', '-etch', '-silver', '-variation',
            '-variations', '-refractor', '-prism', '-prizm', '-xfractor', '-gilded',
            '-"buy-back"', '-buyback'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(baseOnlyExclusions);
    }

    if (excludeAutos) {
        const autoExclusions = [
            '-auto', '-autos', '-autograph', '-autographs', '-autographes', '-signed'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(autoExclusions);
    }

    let finalQuery = baseQuery;
    if (allExcludedPhrases.length > 0) {
        finalQuery = `${baseQuery} ${allExcludedPhrases.join(' ')}`;
    }
    console.log('[DEBUG] Constructed query with exclusions:', finalQuery);
    return finalQuery;
}

async function runSearchInternal(showFindDealsButton = true) {
  let baseQuery = document.getElementById("query").value;
  const delay = 2; // Fixed at 2 seconds
  const pages = 1; // Fixed at 1 page
  const ungradedOnly = document.getElementById("ungraded_only").checked; // Still needed for backend param
  const apiKey = "backend-handled"; // Always use production mode

  console.log('[DEBUG] Raw Only checkbox checked:', ungradedOnly);
  console.log('[DEBUG] Base Only checkbox checked:', document.getElementById("base_only").checked);
  console.log('[DEBUG] Exclude Autographs checkbox checked:', document.getElementById("exclude_autos").checked);

  if (!baseQuery) {
    alert("Please enter a search query.");
    return;
  }

  let query = getSearchQueryWithExclusions(baseQuery);

  const params = new URLSearchParams({
    query: query,
    pages: pages,
    delay: delay,
    ungraded_only: ungradedOnly,
    api_key: apiKey
  });
const url = `/comps?${params.toString()}`;
console.log('[DEBUG] Request URL:', url);

// Enhanced loading states
document.getElementById("results").innerHTML = '<div class="loading">Fetching comp data...</div>';
document.getElementById("stats-container").innerHTML = '<div class="loading">Loading analytics...</div>';
clearBeeswarm();

// Add loading animation to button
const searchButton = document.querySelector('button[onclick="runSearch()"]');
const originalText = searchButton.textContent;
searchButton.textContent = '⏳ Searching...';
searchButton.style.background = 'linear-gradient(135deg, #6c757d, #858a91)';
searchButton.disabled = true;

  // reset globals
  expectLowGlobal = null;
  expectHighGlobal = null;

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.detail) {
      document.getElementById("results").innerHTML = "Error: " + data.detail;
      lastData = null;
      return;
    }
    
    // Add query to data object before saving
    data.query = query;
    
    // Debug logging for pagination results
    console.log(`[DEBUG] Search completed:`);
    console.log(`  - Pages requested: ${pages}`);
    console.log(`  - Pages scraped: ${data.pages_scraped}`);
    console.log(`  - Raw items scraped: ${data.raw_items_scraped || 'N/A'}`);
    console.log(`  - Duplicates filtered: ${data.duplicates_filtered || 'N/A'}`);
    console.log(`  - Zero-price filtered: ${data.zero_price_filtered || 'N/A'}`);
    console.log(`  - Final unique items: ${data.items.length}`);
    console.log(`  - Min/Max/Avg prices: ${formatMoney(data.min_price)} / ${formatMoney(data.max_price)} / ${formatMoney(data.avg_price)}`);

    lastData = data;

    await renderData(data, showFindDealsButton);
    // Store prices for resize handling
    currentBeeswarmPrices = data.items.map(item => item.total_price);

} catch (err) {
    document.getElementById("results").innerHTML = `<div style="color: #ff3b30; text-align: center; padding: 2rem;">
      <strong>Error:</strong> ${err}
    </div>`;
    document.getElementById("stats-container").innerHTML = "";
    lastData = null;
  } finally {
    // Restore button state
    searchButton.textContent = originalText;
    searchButton.style.background = 'var(--gradient-primary)';
    searchButton.disabled = false;
  }
}


function clearBeeswarm() {
  const canvas = document.getElementById("beeswarmCanvas");
  if (canvas) {
    resizeCanvas(); // Ensure proper sizing
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  // Clear stored data
  currentBeeswarmPrices = [];
}




function renderStats(data) {
    const container = document.getElementById("stats-container");
    if (!data || !data.items || data.items.length === 0) {
        container.innerHTML = "";
        return;
    }

    // Simple item count info
    const sourceInfo = `📊 ${data.items.length} results found`;

    const statsHtml = `
      <div id="stats">
        <h3>💰 Price Statistics</h3>
        <p style="font-size: 0.85rem; text-align: center; color: var(--subtle-text-color); margin-bottom: 1.5rem;">
          ${sourceInfo}
        </p>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">Min Price</div>
            <div class="stat-value">${formatMoney(data.min_price)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Max Price</div>
            <div class="stat-value">${formatMoney(data.max_price)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Avg Price</div>
            <div class="stat-value">${formatMoney(data.avg_price)}</div>
          </div>
        </div>
      </div>
    `;
    container.innerHTML = statsHtml;
}

function renderMarketIntelligence(intelligence) {
    const container = document.getElementById("insights-container");
    // Always show empty state - no market intelligence UI
    container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--subtle-text-color);">
            <h3>🧠 Grading Intelligence</h3>
            <p>Enter a specific card search above to see PSA grade comparison results</p>
        </div>
    `;
}

async function updateFmv(data) {
  const container = document.getElementById("stats-container");
  if (!data || !data.items || data.items.length === 0) {
    container.innerHTML = "";
    return;
  }

  try {
    const resp = await fetch('/fmv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data.items),
    });
    const fmvData = await resp.json();

    if (fmvData.detail) {
      container.innerHTML = "Error calculating FMV: " + fmvData.detail;
      return;
    }

    // store for beeswarm chart
    expectLowGlobal = fmvData.expected_low;
    expectHighGlobal = fmvData.expected_high;

    const listPrice = toNinetyNine(fmvData.expected_high);

    // Use new volume-weighted values with fallbacks
    const marketValue = fmvData.market_value || fmvData.expected_high;
    const quickSale = fmvData.quick_sale || fmvData.expected_low;
    const patientSale = fmvData.patient_sale || fmvData.expected_high;

    const fmvHtml = `
      <div id="fmv">
        <h3>📈 Fair Market Value</h3>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">🏃‍♂️ Quick Sale</div>
            <div class="stat-value">${formatMoney(quickSale)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">⚖️ Market Value</div>
            <div class="stat-value">${formatMoney(marketValue)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">🕰️ Patient Sale</div>
            <div class="stat-value">${formatMoney(patientSale)}</div>
          </div>
        </div>
        <p style="font-size: 0.8rem; text-align: center; color: var(--subtle-text-color); margin-top: 1.5rem;">
          Based on ${fmvData.count} recent sales
        </p>
      </div>
    `;
    // Technical details hidden from UI: Auction sales weighted higher than Buy-It-Now • More bids = higher weight
    container.innerHTML += fmvHtml;

  } catch (err) {
    container.innerHTML = "Error calculating FMV: " + err;
  }
}

function filterOutliers(prices) {
  if (prices.length < 4) {
    // Need at least 4 data points for meaningful outlier detection
    return prices;
  }
  
  // Sort prices to find quartiles
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  
  // Calculate Q1, Q3, and IQR
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;
  
  // Define outlier bounds (1.5 * IQR is the standard threshold)
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  
  // Filter out outliers
  const filtered = prices.filter(price => price >= lowerBound && price <= upperBound);
  
  console.log(`[OUTLIER FILTER] Original: ${prices.length} items, Filtered: ${filtered.length} items (${prices.length - filtered.length} outliers removed)`);
  console.log(`[OUTLIER FILTER] Bounds: $${lowerBound.toFixed(2)} - $${upperBound.toFixed(2)}`);
  
  return filtered;
}

function drawBeeswarm(prices) {
  const canvas = document.getElementById("beeswarmCanvas");
  if (!canvas || !prices || prices.length === 0) return;

  // Ensure canvas is properly sized to its container
  resizeCanvas();
  
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const margin = { top: 50, right: 40, bottom: 50, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  ctx.clearRect(0, 0, width, height);

  // Filter out null/undefined prices and convert to numbers
  const validPrices = prices.filter(p => p != null && !isNaN(p) && p > 0).map(p => parseFloat(p));
  
  if (validPrices.length === 0) {
    // Draw "No data" message
    ctx.fillStyle = "#6e6e73";
    ctx.font = "16px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.fillText("No valid price data to display", width / 2, height / 2);
    return;
  }

  // Filter outliers using IQR method
  const filteredPrices = filterOutliers(validPrices);
  
  if (filteredPrices.length === 0) {
    // Draw "No data after filtering" message
    ctx.fillStyle = "#6e6e73";
    ctx.font = "16px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.fillText("No data after outlier filtering", width / 2, height / 2);
    return;
  }

  const minPrice = Math.min(...filteredPrices);
  const maxPrice = Math.max(...filteredPrices);
  const outliersRemoved = validPrices.length - filteredPrices.length;
  
  // Handle case where all prices are the same
  const priceRange = maxPrice - minPrice;
  
  const xScale = (price) => {
    if (priceRange === 0) {
      return width / 2; // Center all points if all prices are the same
    }
    return margin.left + ((price - minPrice) / priceRange) * innerWidth;
  };

  // --- Draw Premium FMV Band ---
  console.log('FMV values:', expectLowGlobal, expectHighGlobal, 'Price range:', priceRange);
  if (expectLowGlobal !== null && expectHighGlobal !== null && priceRange > 0) {
    const x1 = xScale(expectLowGlobal);
    const x2 = xScale(expectHighGlobal);
    
    // Create modern gradient for FMV band
    const gradient = ctx.createLinearGradient(x1, margin.top, x2, height - margin.bottom);
    gradient.addColorStop(0, 'rgba(52, 199, 89, 0.2)');
    gradient.addColorStop(0.5, 'rgba(48, 209, 88, 0.15)');
    gradient.addColorStop(1, 'rgba(52, 199, 89, 0.1)');
    
    // Draw gradient background band with subtle shadow
    ctx.shadowColor = 'rgba(52, 199, 89, 0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = gradient;
    ctx.fillRect(x1, margin.top, x2 - x1, innerHeight);
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    // Draw modern FMV range border lines with gradient
    const lineGradient = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom);
    lineGradient.addColorStop(0, 'rgba(0, 122, 255, 0.8)');
    lineGradient.addColorStop(0.5, 'rgba(52, 199, 89, 0.9)');
    lineGradient.addColorStop(1, 'rgba(0, 122, 255, 0.6)');
    
    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    
    // FMV Low line with glow effect
    ctx.shadowColor = 'rgba(0, 122, 255, 0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x1, margin.top);
    ctx.lineTo(x1, height - margin.bottom);
    ctx.stroke();
    
    // FMV High line with glow effect
    ctx.beginPath();
    ctx.moveTo(x2, margin.top);
    ctx.lineTo(x2, height - margin.bottom);
    ctx.stroke();
    
    // Reset effects
    ctx.setLineDash([]);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    
    // Add modern "FMV Range" label with solid text
    const centerX = (x1 + x2) / 2;
    
    ctx.fillStyle = "#1d1d1f";
    ctx.font = "bold 14px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    
    // Add text shadow for depth
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 2;
    
    ctx.fillText("🎯 FMV Range", centerX, 15);
    
    // Reset text shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
    
    // Add FMV dollar value labels (horizontal) with solid text
    ctx.fillStyle = "#34c759";
    ctx.font = "bold 12px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    
    // FMV Low dollar value label
    ctx.fillText(formatMoney(expectLowGlobal), x1, 35);
    
    // FMV High dollar value label
    ctx.fillText(formatMoney(expectHighGlobal), x2, 35);
  }

  // --- Draw Points with improved collision detection ---
  const points = filteredPrices.map(price => ({
    x: xScale(price),
    y: height / 2,
    r: 4,
    originalY: height / 2
  }));
  
  const placedPoints = [];
  const centerY = height / 2;
  const maxYOffset = Math.min(innerHeight / 2 - 10, 60); // Limit vertical spread

  for (const point of points) {
    let y = point.originalY;
    let collided = true;
    let attempts = 0;
    let yOffset = 0;

    while (collided && attempts < 200) {
      collided = false;
      
      // Check collision with previously placed points
      for (const placed of placedPoints) {
        const dx = point.x - placed.x;
        const dy = y - placed.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = point.r + placed.r + 1;
        
        if (distance < minDistance) {
          collided = true;
          break;
        }
      }
      
      if (collided) {
        attempts++;
        // Use systematic offset instead of random
        yOffset = Math.ceil(attempts / 2) * (point.r * 2 + 1);
        const direction = attempts % 2 === 1 ? 1 : -1;
        y = centerY + (direction * yOffset);
        
        // Keep within bounds
        if (y < margin.top + point.r) {
          y = margin.top + point.r;
        } else if (y > height - margin.bottom - point.r) {
          y = height - margin.bottom - point.r;
        }
        
        // If we've exceeded max offset, force placement
        if (yOffset > maxYOffset) {
          break;
        }
      }
    }
    
    point.y = y;
    placedPoints.push(point);

    // Draw point
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.r, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(0, 122, 255, 0.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 122, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // --- Draw Axis ---
  ctx.beginPath();
  ctx.moveTo(margin.left, height - margin.bottom);
  ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.strokeStyle = "#d2d2d7";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Draw Labels ---
  ctx.fillStyle = "#6e6e73";
  ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";

  if (priceRange > 0) {
    // Min
    ctx.fillText(formatMoney(minPrice), margin.left, height - margin.bottom + 20);
    // Max
    ctx.fillText(formatMoney(maxPrice), width - margin.right, height - margin.bottom + 20);
    
    // Avg
    const avgPrice = filteredPrices.reduce((a, b) => a + b, 0) / filteredPrices.length;
    const avgX = xScale(avgPrice);
    ctx.fillText("Avg: " + formatMoney(avgPrice), avgX, height - margin.bottom + 35);
    
    // Draw line for avg
    ctx.beginPath();
    ctx.moveTo(avgX, height - margin.bottom);
    ctx.lineTo(avgX, height - margin.bottom + 5);
    ctx.strokeStyle = "#d92a2a";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // All prices are the same
    ctx.fillText(formatMoney(minPrice), width / 2, height - margin.bottom + 20);
    ctx.fillText("(All prices identical)", width / 2, height - margin.bottom + 35);
  }
  
  // Draw count with outlier information
  ctx.font = "10px " + getComputedStyle(document.body).fontFamily;
  if (outliersRemoved > 0) {
    ctx.fillText(`${filteredPrices.length} items (${outliersRemoved} outliers removed)`, width - 120, margin.top + 15);
  } else {
    ctx.fillText(`${filteredPrices.length} items`, width - 60, margin.top + 15);
  }
}

// Find deals by searching for current listings below market value
async function findDeals() {
    console.log('[DEALS] Button clicked, starting findDeals function');
    
    if (!lastData || !lastData.items || lastData.items.length === 0) {
        alert("No data to analyze. Run a search first.");
        return;
    }

    // Get the current search query
    const query = document.getElementById("query").value;
    if (!query) {
        alert("Please enter a search query first.");
        return;
    }

    // Get market value from FMV data by calling the /fmv endpoint
    console.log('[DEALS] Calculating FMV for direct call...');
    const fmvResp = await fetch('/fmv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastData.items)
    });
    const fmvData = await fmvResp.json();

    if (fmvData.detail) {
        alert("Error calculating FMV: " + fmvData.detail);
        return;
    }

    const marketValue = fmvData.market_value;
    if (!marketValue || marketValue <= 0) {
        alert("Could not determine a valid market value for deals. Try a different search query.");
        return;
    }
    console.log('[DEALS] Market value calculated from FMV:', marketValue);

    await findDealsInternal(marketValue);
}

// Internal function to find deals (can be called programmatically)
async function findDealsInternal(marketValue) {
    let query = document.getElementById("query").value;
    console.log('[DEALS] Internal search started with market value:', marketValue);

    // Show loading state in deals results section
    const dealsResultsDiv = document.getElementById("deals-results");
    dealsResultsDiv.innerHTML = '<div class="loading">Searching for deals...</div>';
    console.log('[DEALS] Loading state set in deals section');

    // Handle button state (may not exist in combined search mode)
    const findDealsButton = document.getElementById('find-deals-button');
    let originalButtonText = '';
    if (findDealsButton) {
        originalButtonText = findDealsButton.innerHTML;
        findDealsButton.innerHTML = '⏳ Searching...';
        findDealsButton.style.background = 'linear-gradient(135deg, #6c757d, #858a91)';
        findDealsButton.disabled = true;
    }

    try {
        // Get exclusion terms from checkboxes, similar to runSearchInternal
        const ungradedOnly = document.getElementById("ungraded_only").checked;
        const baseOnly = document.getElementById("base_only").checked;
        const excludeAutos = document.getElementById("exclude_autos").checked;

        let allExcludedPhrases = [];

        if (ungradedOnly) {
            const rawOnlyExclusions = [
                '-psa', '-"Professional Sports Authenticator"', '-"Professional Authenticator"',
                '-"Pro Sports Authenticator"', '-"Certified 10"', '-"Certified Gem"', '-"Certified Mint"',
                '-slabbed', '-"Red Label"', '-lighthouse', '-"Gem Mint 10"', '-"Graded 10"', '-"Mint 10"',
                '-bgs', '-beckett', '-"Gem 10"', '-"Black Label"', '-"Gold Label"', '-"Silver Label"',
                '-subgrades', '-subs', '-"Quad 9.5"', '-"True Gem"', '-"True Gem+"', '-"Gem+"', '-bvg',
                '-sgc', '-"Tuxedo Slab"', '-"Black Slab"', '-"Green Label"', '-"SG LLC"',
                '-"SG Grading"', '-"Mint+ 9.5"', '-"10 Pristine"',
                '-csg', '-cgc', '-"Certified Collectibles Group"', '-"CGC Trading Cards"', '-"CSG Gem"',
                '-"Pristine 10"', '-"Perfect 10"', '-"Green Slab"',
                '-encapsulated', '-authenticated', '-verified', '-"Slabbed Card"', '-"Third-Party Graded"',
                '-graded', '-gem', '-"Gem Mint"', '-pristine', '-"Mint+"', '-"NM-MT"',
                '-"Certified Authentic"', '-"Pro Graded"',
                '-gma', '-hga', '-ksa', '-fgs', '-pgi', '-pro', '-isa', '-mnt', '-"MNT Grading"',
                '-rcg', '-"TCG Grading"', '-bccg', '-tag', '-pgs', '-tga', '-ace', '-usg',
                '-slab', '-"Slabbed up"', '-"In case"', '-holdered', '-encased',
                '-"Graded Rookie"', '-"Graded RC"', '-"Gem Rookie"', '-"Gem RC"'
            ];
            allExcludedPhrases = allExcludedPhrases.concat(rawOnlyExclusions);
        }

        if (baseOnly) {
            const baseOnlyExclusions = [
                '-refractors', '-red', '-aqua', '-blue', '-magenta', '-yellow', '-lot',
                '-x-fractors', '-xfractors', '-helix', '-superfractor', '-x-fractor',
                '-logofractor', '-stars', '-hyper', '-all', '-etch', '-silver', '-variation',
                '-variations', '-refractor', '-prism', '-prizm', '-xfractor', '-gilded',
                '-"buy-back"', '-buyback'
            ];
            allExcludedPhrases = allExcludedPhrases.concat(baseOnlyExclusions);
        }

        if (excludeAutos) {
            const autoExclusions = [
                '-auto', '-autos', '-autograph', '-autographs', '-autographes', '-signed'
            ];
            allExcludedPhrases = allExcludedPhrases.concat(autoExclusions);
        }

        // Apply all exclusions to query if any are selected
        if (allExcludedPhrases.length > 0) {
            query = `${query} ${allExcludedPhrases.join(' ')}`;
            console.log('[DEALS] Modified query with exclusions:', query);
        }

        // Search for active deals using the new /deals endpoint
        const params = new URLSearchParams({
            query: query,
            market_value: marketValue,
            pages: 1,
            delay: 2,
            sort_by: "price_low_to_high",
            api_key: "backend-handled"
        });

        console.log('[DEALS] Fetching deals with params:', params.toString());
        console.log('[DEALS] Market value threshold:', marketValue);
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        console.log('[DEALS] About to fetch URL:', `/deals?${params.toString()}`);
        
        const resp = await fetch(`/deals?${params.toString()}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        console.log('[DEALS] Response status:', resp.status);
        console.log('[DEALS] Response headers:', resp.headers);
        
        if (!resp.ok) {
            const errorText = await resp.text();
            console.error('[DEALS] Error response text:', errorText);
            throw new Error(`HTTP ${resp.status}: ${resp.statusText} - ${errorText}`);
        }
        
        const data = await resp.json();
        console.log('[DEALS] Response data:', data);

        if (data.detail) {
            // Assuming 'resultsDiv' is available in this scope or passed
            // If not, you might need to adjust where this error is displayed
            const resultsDiv = document.getElementById("results");
            if (resultsDiv) {
                resultsDiv.innerHTML = "Error: " + data.detail;
            } else {
                console.error("Error: " + data.detail);
            }
            return;
        }

        // All items returned are already filtered to be below market value
        // Sort deals by Total Price (lowest to highest)
        const deals = data.items.sort((a, b) => {
            const priceA = a.total_price || ((a.extracted_price || 0) + (a.extracted_shipping || 0));
            const priceB = b.total_price || ((b.extracted_price || 0) + (b.extracted_shipping || 0));
            return priceA - priceB; // Lowest Total Price first
        });

        // Render deals or no deals message in the dedicated deals section
        let dealsHtml = `
            <div style="background: var(--card-background); border: 1px solid var(--border-color); border-radius: 8px; padding: 1.5rem; margin-top: 1rem;">
                <div style="text-align: center; margin-bottom: 1rem;">
                    <h3 style="margin: 0; color: var(--text-color);">🎯 Current Deals</h3>
                    <p style="color: var(--subtle-text-color); margin: 0.5rem 0;">
                        Active listings below market value (${formatMoney(marketValue)})
                    </p>
                </div>`;

        if (deals.length > 0) {
            dealsHtml += `
                <div class="table-container" style="border: 1px solid var(--border-color); border-radius: 8px;">
                    <table>
                        <tr>
                            <th>Title</th>
                            <th>Price</th>
                            <th>Type</th>
                            <th>Item ID</th>
                        </tr>
                        ${deals.map(item => {
                            const totalPrice = item.total_price || ((item.extracted_price || 0) + (item.extracted_shipping || 0));
                            const listingType = item.listing_type || "Buy It Now";
                            const discount = ((marketValue - totalPrice) / marketValue * 100).toFixed(1);
                            return `
                                <tr>
                                    <td>${item.title}</td>
                                    <td>
                                        ${formatMoney(totalPrice)}
                                        <span style="color: #ff4500; font-weight: 600; margin-left: 8px;">
                                            (-${discount}%)
                                        </span>
                                    </td>
                                    <td>${listingType}</td>
                                    <td><a href="${item.link}" target="_blank">${item.item_id}</a></td>
                                </tr>
                            `;
                        }).join('')}
                    </table>
                </div>
                <div style="text-align: center; margin-top: 1rem; color: var(--subtle-text-color);">
                    ✅ Found ${deals.length} deals below market value
                </div>`;
        } else {
            dealsHtml += `
                <div style="text-align: center; padding: 2rem; color: var(--subtle-text-color); background: var(--background-color); border-radius: 8px;">
                    <p style="margin: 0; font-size: 1.1rem;">🔍 No deals found at this time</p>
                    <p style="margin: 0.5rem 0; font-size: 0.9rem;">All current listings are priced at or above market value</p>
                    <p style="margin: 0.5rem 0; font-size: 0.9rem;">Try searching again later</p>
                </div>`;
        }

        dealsHtml += `</div>`;

        // Update only the deals results section
        const dealsResultsDiv = document.getElementById("deals-results");
        dealsResultsDiv.innerHTML = dealsHtml;

    } catch (error) {
        const dealsResultsDiv = document.getElementById("deals-results");
        dealsResultsDiv.innerHTML = `
            <div style="background: var(--card-background); border: 1px solid #ff3b30; border-radius: 8px; padding: 1.5rem; margin-top: 1rem;">
                <div style="color: #ff3b30; text-align: center;">
                    <h3 style="margin: 0; color: #ff3b30;">⚠️ Error Finding Deals</h3>
                    <p style="margin: 0.5rem 0;"><strong>Error:</strong> ${error}</p>
                    <p style="margin: 0.5rem 0; font-size: 0.9rem; color: var(--subtle-text-color);">Please try again or check your connection</p>
                </div>
            </div>`;
    } finally {
        // Restore Find Deals button state (only if button exists)
        if (findDealsButton) {
            findDealsButton.innerHTML = originalButtonText;
            findDealsButton.style.background = 'linear-gradient(135deg, #ff4500, #ff6b35)';
            findDealsButton.disabled = false;
        }
    }
}

// Clear the deals results
function closeDeals() {
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = '';
}
