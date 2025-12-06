let lastData = null;

// globals for expected sale band so we can draw it on the beeswarm
let expectLowGlobal = null;
let expectHighGlobal = null;

// Store current beeswarm data for redrawing on resize
let currentBeeswarmPrices = [];

// Password Protection
const CORRECT_PASSWORD = 'BreakersOnBudget25!';

// API key is now handled securely on the backend
const DEFAULT_API_KEY = 'backend-handled';

function checkPassword() {
    const passwordInput = document.getElementById('password-input');
    const passwordError = document.getElementById('password-error');
    const passwordOverlay = document.getElementById('password-overlay');
    const mainContent = document.querySelector('.main-content');
    const rememberMe = document.getElementById('remember-me');
    
    if (passwordInput.value === CORRECT_PASSWORD) {
        // Correct password - hide overlay and show main content
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
        // Incorrect password - show error
        passwordError.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
        
        // Hide error after 3 seconds
        setTimeout(() => {
            passwordError.style.display = 'none';
        }, 3000);
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

// Allow Enter key to submit password
document.addEventListener('DOMContentLoaded', () => {
    checkAuthentication();
    
    const passwordInput = document.getElementById('password-input');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
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
    
    // Test mode check - API key is handled on backend
    const testMode = document.getElementById("test_mode").checked;
    const apiKey = testMode ? "test" : "backend-handled";
    
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
                api_key: testMode ? "test" : apiKey,
                test_mode: testMode.toString()
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

async function renderData(data) {
    // ----- RESULTS TABLE -----
    let html = "<table>";
    html += `
      <tr>
        <th>Title</th>
        <th>Price</th>
        <th>Item ID</th>
      </tr>
    `;

    for (const item of data.items) {
      html += `
        <tr>
          <td>${item.title}</td>
          <td>${formatMoney(item.total_price)}</td>
          <td><a href="${item.link}" target="_blank">${item.item_id}</a></td>
        </tr>
      `;
    }

    html += "</table>";
    document.getElementById("results").innerHTML = html;

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

async function runSearch() {
  let query = document.getElementById("query").value;
  const delay = 2; // Fixed at 2 seconds
  const pages = 1; // Fixed at 1 page
  const ungradedOnly = document.getElementById("ungraded_only").checked;
  
  // Properly get test mode checkbox
  const testModeElement = document.getElementById("test_mode");
  const testMode = testModeElement ? testModeElement.checked : false;
  const apiKey = testMode ? "test" : "backend-handled";

  console.log('[DEBUG] Test Mode checkbox checked:', testMode);

  if (!query) {
    alert("Please enter a search query.");
    return;
  }

  if (ungradedOnly && !testMode) {
    const excludedPhrases = [
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
    
    query = `${query} ${excludedPhrases.join(' ')}`;
  }

  const params = new URLSearchParams({
    query: query,
    pages: pages,
    delay: delay,
    ungraded_only: ungradedOnly,
    api_key: testMode ? "test" : apiKey,
    test_mode: testMode.toString()
  });
const url = `/comps?${params.toString()}`;
console.log('[DEBUG] Request URL:', url);
console.log('[DEBUG] Final test mode value:', testMode);

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

    await renderData(data);
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



// ---- CSV EXPORT ----

function downloadCSV() {
  if (!lastData || !lastData.items || lastData.items.length === 0) {
    alert("No data to export yet. Run a search first.");
    return;
  }

  // Add brief loading state to download button
  const downloadButton = document.querySelector('button[onclick="downloadCSV()"]');
  const originalDownloadText = downloadButton.textContent;
  downloadButton.textContent = '⏳ Downloading...';
  downloadButton.disabled = true;

  const rows = [];
  rows.push([
    "Title", "Item ID", "URL", "Subtitle", "Listing Type", "Price",
    "Shipping Price", "Shipping Type", "Best Offer Enabled", "Has Best Offer",
    "Sold Price", "End Time", "Auction Sold", "Total Bids", "Sold"
  ]);

  for (const item of lastData.items) {
    rows.push([
      item.title,
      item.item_id,
      item.url,
      item.subtitle,
      item.listing_type,
      item.price,
      item.shipping_price,
      item.shipping_type,
      item.best_offer_enabled,
      item.has_best_offer,
      item.sold_price,
      item.end_time,
      item.auction_sold,
      item.total_bids,
      item.sold,
    ]);
  }

  const csvContent = rows
    .map(row =>
      row
        .map(value => {
          const v = value == null ? "" : String(value);
          if (v.includes(",") || v.includes('"') || v.includes("\n")) {
            return `"${v.replace(/"/g, '""')}"`;
          }
          return v;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "comps.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  // Restore button state after brief delay
  setTimeout(() => {
    downloadButton.textContent = originalDownloadText;
    downloadButton.disabled = false;
  }, 500);
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
    if (!intelligence || Object.keys(intelligence).length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--subtle-text-color);">
                <h3>🧠 No Market Intelligence Available</h3>
                <p>Run a search to see advanced analytics and insights</p>
            </div>
        `;
        return;
    }

    let intelligenceHtml = `
      <div id="market-intelligence">
        <h3>🧠 Smart Market Insights</h3>
    `;

    // Parallel Premium Insights
    if (intelligence.parallel_premiums && intelligence.parallel_premiums.length > 0) {
        intelligenceHtml += `<div class="insight-section">
            <h4>💎 Parallel Premiums</h4>
            <ul class="insight-list">`;
        intelligence.parallel_premiums.forEach(insight => {
            intelligenceHtml += `<li>${insight}</li>`;
        });
        intelligenceHtml += `</ul></div>`;
    }

    // Grading Premium
    if (intelligence.grading_premium) {
        intelligenceHtml += `<div class="insight-section">
            <h4>⭐ Grading Premium</h4>
            <p class="insight-highlight">${intelligence.grading_premium}</p>
        </div>`;
    }

    // Year Trends
    if (intelligence.year_trends && intelligence.year_trends.length > 0) {
        intelligenceHtml += `<div class="insight-section">
            <h4>📈 Year-over-Year Trends</h4>
            <ul class="insight-list">`;
        intelligence.year_trends.forEach(trend => {
            intelligenceHtml += `<li>${trend}</li>`;
        });
        intelligenceHtml += `</ul></div>`;
    }

    // Activity Premium
    if (intelligence.activity_premium) {
        intelligenceHtml += `<div class="insight-section">
            <h4>🔥 High-Activity Premium</h4>
            <p class="insight-highlight">${intelligence.activity_premium}</p>
        </div>`;
    }

    // Card Type Breakdown
    if (intelligence.parallel_breakdown && Object.keys(intelligence.parallel_breakdown).length > 0) {
        intelligenceHtml += `<div class="insight-section">
            <h4>📊 Card Type Breakdown</h4>
            <div class="breakdown-grid">`;
        Object.entries(intelligence.parallel_breakdown).forEach(([type, info]) => {
            const displayType = type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            intelligenceHtml += `
                <div class="breakdown-item">
                    <span class="breakdown-type">${displayType}:</span>
                    <span class="breakdown-value">${info}</span>
                </div>`;
        });
        intelligenceHtml += `</div></div>`;
    }

    // If no insights were generated
    if (!intelligence.parallel_premiums && !intelligence.grading_premium &&
        !intelligence.year_trends && !intelligence.activity_premium &&
        (!intelligence.parallel_breakdown || Object.keys(intelligence.parallel_breakdown).length === 0)) {
        intelligenceHtml += `
            <div style="text-align: center; padding: 2rem; color: var(--subtle-text-color);">
                <p>🔍 Not enough data variety to generate insights</p>
                <p style="font-size: 0.9rem;">Try searching for broader terms to get more diverse card types</p>
            </div>
        `;
    }

    intelligenceHtml += `</div>`;
    container.innerHTML = intelligenceHtml;
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
        <h3>📈 Volume-Weighted Fair Market Value</h3>
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
          Based on ${fmvData.count} volume-weighted sales
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
