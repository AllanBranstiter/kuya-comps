let lastData = null;
let lastActiveData = null; // Store active listings data
let aiFilteringRan = false; // Set to true when AI relevance scoring runs successfully
let lastMarketValue = null; // Store market value for filtering
let priceDistributionChartTimeout = null; // Track pending chart draw
let lastChartData = { soldData: null, activeData: null }; // Store data for chart redraws
let currentSearchController = null; // AbortController for the in-progress search; replaced on each new search
let currentPriceTier = null; // Store tier from most recent search
let volumeProfileBins = null; // Store current number of bins for Volume Profile chart (null = auto)
let beeswarmCrosshairX = null; // Store crosshair position for FMV beeswarm chart (persists)
let volumeProfileCrosshairX = null; // Store crosshair position for Volume Profile chart (persists)

// PERFORMANCE FIX: Guard flags to prevent infinite redraw loops
let isRedrawingBeeswarm = false;
let isRedrawingVolumeProfile = false;
let beeswarmListenersAttached = false;
let volumeProfileListenersAttached = false;

// PERFORMANCE FIX: Track pending redraws to batch updates
let pendingBeeswarmRedraw = null;
let pendingVolumeProfileRedraw = null;

// Mobile detection for deep link functionality
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// iOS-specific detection for link handling
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

// Debug configuration - set to false in production
window.DEBUG_MODE = {
  PRICE_CALC: false,
  OUTLIER_FILTER: false,
  BEESWARM: false,
  CHART: false,
  API: false
};

// Track page visibility for iOS app switching diagnostics and fix touch issues
if (isIOS) {
    document.addEventListener('visibilitychange', () => {
        console.log('[iOS VISIBILITY]', document.hidden ? 'Page hidden (switched to app)' : 'Page visible (returned from app)');
        if (!document.hidden) {
            console.log('[iOS VISIBILITY] Page became visible - forcing reflow to restore touch');
            
            // Force a reflow/repaint to restore touch event handling
            // This fixes the iOS Safari bug where touch events are laggy after app switch
            document.body.style.transform = 'translateZ(0)';
            setTimeout(() => {
                document.body.style.transform = '';
            }, 50);
            
            // Re-enable all links (in case they were disabled)
            document.querySelectorAll('a').forEach(link => {
                link.style.pointerEvents = 'auto';
            });
        }
    });
    
    window.addEventListener('focus', () => {
        console.log('[iOS FOCUS] Window gained focus');
    });
    
    window.addEventListener('blur', () => {
        console.log('[iOS FOCUS] Window lost focus (app switch)');
    });
    
    window.addEventListener('pagehide', () => {
        console.log('[iOS LIFECYCLE] Page hide event');
    });
    
    window.addEventListener('pageshow', (event) => {
        console.log('[iOS LIFECYCLE] Page show event, persisted:', event.persisted);
        if (event.persisted) {
            // Page was loaded from cache - force reflow
            console.log('[iOS LIFECYCLE] Page from cache - forcing touch restoration');
            document.body.offsetHeight; // Force reflow
        }
    });
}

// globals for expected sale band so we can draw it on the beeswarm
let expectLowGlobal = null;
let expectHighGlobal = null;
let marketValueGlobal = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Debounce helper function to prevent rapid-fire function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait before executing
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Security: HTML sanitization function to prevent XSS attacks
function escapeHtml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================================================
// POPUP CONTENT RENDERING UTILITIES
// ============================================================================

/**
 * Render popup sections from content object
 * @param {Array} sections - Array of section objects from JSON
 * @returns {string} HTML string
 */
function renderPopupSections(sections) {
    if (!sections || !Array.isArray(sections)) {
        return '';
    }
    
    return sections.map(section => {
        let html = '';
        
        if (section.type === 'header') {
            html = `<h3 style="font-size: 1.1rem; margin-top: 1.5rem; margin-bottom: 1rem; color: var(--text-color);">${section.content}</h3>`;
        } else if (section.type === 'text') {
            html = `<p style="font-size: 0.95rem; color: var(--text-color); line-height: 1.6; margin-bottom: 1.5rem;">${section.content}</p>`;
        } else if (section.type === 'formula') {
            html = `
                <div style="background: linear-gradient(135deg, #f0f0f0 0%, #f8f8f8 100%); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                    <code style="background: white; padding: 0.5rem; border-radius: 4px; display: inline-block; margin-top: 0.5rem; font-size: 0.9rem;">
                        ${section.content}
                    </code>
                </div>
            `;
        } else if (section.type === 'bands') {
            html = '<div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">';
            section.items.forEach(band => {
                const borderColor = band.color || '#d1d1d6';
                const bgColor = getBandBackgroundColor(band.color);
                html += `
                    <div style="background: ${bgColor}; padding: 1rem; border-radius: 8px; border-left: 4px solid ${borderColor};">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                            <span style="font-size: 1.2rem;">${band.icon}</span>
                            <strong style="color: ${band.color};">${band.title}</strong>
                        </div>
                        <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                            <strong>What it means:</strong> ${band.meaning}<br>
                            <strong>What to do:</strong> ${band.action}
                        </p>
                    </div>
                `;
            });
            html += '</div>';
        } else if (section.type === 'list') {
            html = '<ul style="margin: 0.5rem 0 1.5rem 0; padding-left: 1.5rem; font-size: 0.85rem; color: #333; line-height: 1.4;">';
            section.items.forEach(item => {
                html += `<li style="margin-bottom: 0.25rem;">${item}</li>`;
            });
            html += '</ul>';
        }
        
        return html;
    }).join('');
}

/**
 * Get background gradient for interpretation bands based on color
 * @param {string} color - Band color hex code
 * @returns {string} CSS gradient
 */
function getBandBackgroundColor(color) {
    const colorMap = {
        '#34c759': 'linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%)',
        '#007aff': 'linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%)',
        '#ff9500': 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)',
        '#ff3b30': 'linear-gradient(135deg, #ffebee 0%, #fff5f5 100%)',
        '#5856d6': 'linear-gradient(135deg, #f0e6ff 0%, #f5f0ff 100%)'
    };
    return colorMap[color] || 'linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%)';
}

// ============================================================================
// FALLBACK POPUP CONTENT (mirrors current hardcoded content)
// ============================================================================

const FALLBACK_POPUP_MARKET_PRESSURE = {
    title: "📊 Understanding Market Pressure",
    sections: [
        { type: "text", content: "Market Pressure compares what sellers are <strong>asking today</strong> to what buyers <strong>recently paid</strong>. It does not affect Fair Market Value." },
        { type: "header", content: "Formula" },
        { type: "formula", content: "(Median Asking Price - FMV) / FMV × 100" },
        { type: "text", content: "<em>Note: Outlier prices are filtered using IQR method for accuracy.</em>" },
        { type: "header", content: "Interpretation Bands" },
        {
            type: "bands",
            items: [
                { icon: "🟢", title: "0% to 15% (HEALTHY)", color: "#34c759", meaning: "Normal pricing friction. Sellers price slightly above recent sales to leave room for negotiation.", action: "Fair pricing - safe to buy at asking prices or make small offers." },
                { icon: "🔵", title: "15% to 30% (OPTIMISTIC)", color: "#007aff", meaning: "Seller optimism. Prices drifting above recent buyer behavior.", action: "Make offers 10-20% below asking - sellers are likely open to negotiation." },
                { icon: "🟠", title: "30% to 50% (RESISTANCE)", color: "#ff9500", meaning: "Overpriced market. Clear resistance between buyers and sellers.", action: "Be patient. Sellers will likely need to lower prices or accept significantly lower offers (20-30% below ask)." },
                { icon: "🔴", title: "50%+ (UNREALISTIC)", color: "#ff3b30", meaning: "Unrealistic asking prices. Listings unlikely to transact near current levels.", action: "Wait for price corrections or look for better-priced alternatives. These sellers are detached from market reality." },
                { icon: "🟣", title: "Negative % (BELOW FMV)", color: "#5856d6", meaning: "Opportunity! Sellers are asking less than recent sale prices.", action: "Act fast - these may be undervalued or motivated sellers." }
            ]
        },
        { type: "header", content: "💡 Quick Tip" },
        { type: "text", content: "Market Pressure above 30% suggests waiting for price corrections or making significantly lower offers. Below 0% indicates potential buying opportunities." },
        { type: "header", content: "📝 Example" },
        { type: "text", content: "If cards recently sold for <strong>$100</strong> (FMV), but current listings ask <strong>$140</strong>, that's <strong>+40% Market Pressure</strong> (Resistance) = sellers are asking too much." },
        { type: "header", content: "📊 Data Confidence" },
        {
            type: "list",
            items: [
                "<strong>High:</strong> 10+ active listings",
                "<strong>Medium:</strong> 5-9 active listings",
                "<strong>Low:</strong> Less than 5 active listings (use with caution)"
            ]
        }
    ]
};

const FALLBACK_POPUP_MARKET_CONFIDENCE = {
    title: "🎯 Understanding Market Confidence",
    sections: [
        { type: "text", content: "Market Confidence measures how <strong>consistent</strong> prices are in the market. Higher consistency = more reliable data and clearer pricing signals." },
        { type: "header", content: "Formula" },
        { type: "formula", content: "100 / (1 + Coefficient of Variation / 100)" },
        { type: "text", content: "<em>Coefficient of Variation = (Standard Deviation ÷ Average Price) × 100</em>" },
        { type: "header", content: "Confidence Bands" },
        {
            type: "bands",
            items: [
                { icon: "🟢", title: "85-100 (EXCELLENT CONSENSUS)", color: "#34c759", meaning: "Exceptional price consistency with tight clustering - excellent market consensus on value.", action: "FMV estimates are highly reliable. Safe to use for pricing decisions." },
                { icon: "🔵", title: "70-84 (GOOD CONSENSUS)", color: "#007aff", meaning: "Solid price consistency - market has good agreement on value.", action: "FMV estimates are reliable. Good for most pricing decisions." },
                { icon: "🟡", title: "55-69 (MODERATE VARIATION)", color: "#ff9500", meaning: "Noticeable price variation but overall market is functional.", action: "FMV estimates are reasonably reliable. Consider using price ranges and watching for trends." },
                { icon: "🟠", title: "40-54 (HIGH VARIATION)", color: "#ff9500", meaning: "High price variation - market shows significant uncertainty.", action: "Use caution with FMV estimates. Consider refining search terms or gathering more data." },
                { icon: "🔴", title: "25-39 (VERY HIGH VARIATION)", color: "#ff3b30", meaning: "Very high price variation - unreliable market signals.", action: "FMV estimates may not be accurate. Refine search or check for data quality issues." },
                { icon: "⚫", title: "0-24 (MARKET CHAOS)", color: "#1d1d1f", meaning: "Extreme price scatter - no market consensus.", action: "Data is unreliable. Check for miscategorized listings or search errors." }
            ]
        },
        { type: "header", content: "💡 Key Principle" },
        { type: "text", content: "Market Confidence tells you how <strong>reliable</strong> the data is, not what the value is. High confidence means prices are clustered together. Low confidence means prices are scattered and unpredictable." },
        { type: "header", content: "📝 Example" },
        { type: "text", content: "If 20 cards sold between $95-$105 (tight range), confidence is <strong>EXCELLENT (85+)</strong>. If they sold between $50-$200 (wide range), confidence is <strong>LOW (30 or less)</strong>." },
        { type: "header", content: "🔧 Improve Confidence" },
        {
            type: "list",
            items: [
                "Make search terms more specific (exact card number, parallel type)",
                "Filter out unrelated variations (use \"Base Only\" or exclude parallels)",
                "Exclude lots and multi-card listings",
                "Check for grading consistency (don't mix raw with graded)"
            ]
        }
    ]
};

const FALLBACK_POPUP_LIQUIDITY_RISK = {
    title: "📊 Understanding Market Activity",
    sections: [
        { type: "text", content: "Market Activity measures how much recent sales activity exists relative to current supply. It describes the market landscape — not how fast your specific listing will sell." },
        { type: "header", content: "Absorption Ratio" },
        { type: "formula", content: "Recent Sales (decay-weighted) / Active Buy It Now Listings" },
        { type: "text", content: "<em>A ratio above 1.0 means recent sales outpace current supply. Below 1.0 means more supply than recent sales activity.</em>" },
        { type: "header", content: "Activity Tiers" },
        {
            type: "bands",
            items: [
                { icon: "🟢", title: "Ratio ≥ 1.0 (BUYERS ARE ACTIVE)", color: "#34c759", meaning: "Recent sales are outpacing active listings — demand is strong relative to current supply.", action: "Healthy market conditions for sellers. Competitive pricing is rewarded." },
                { icon: "🔵", title: "Ratio 0.5–1.0 (MODERATE ACTIVITY)", color: "#007aff", meaning: "Balanced market — sales activity and supply are reasonably matched.", action: "Normal market conditions. No strong signal in either direction." },
                { icon: "🟠", title: "Ratio 0.2–0.5 (MORE SELLERS THAN BUYERS)", color: "#ff9500", meaning: "Active listings outnumber recent sales — buyers have plenty of options.", action: "A crowded market. Pricing toward the lower end of the FMV range may attract more attention." },
                { icon: "🔴", title: "Ratio < 0.2 (FEW ACTIVE BUYERS)", color: "#ff3b30", meaning: "Very few recent sales relative to current supply — a thin market.", action: "Proceed cautiously. Both the FMV and the selling environment carry more uncertainty here." }
            ]
        },
        { type: "header", content: "💡 Key Principle" },
        { type: "text", content: "Market Activity does NOT predict how fast your listing will sell. Sell speed depends on your ask price, listing quality, and timing — none of which this metric can measure. It describes the market environment, not your outcome." },
        { type: "header", content: "📊 Data Coverage" },
        {
            type: "list",
            items: [
                "<strong>More reliable:</strong> 10+ recent sales AND 10+ active listings",
                "<strong>Reasonable:</strong> 5+ recent sales AND 5+ active listings",
                "<strong>Use with caution:</strong> Below these thresholds"
            ]
        }
    ]
};

// ============================================================================
// INFO POPUP FUNCTIONS
// ============================================================================

// Show Market Pressure info popup
async function showMarketPressureInfo() {
    // Load content
    let popupContent;
    try {
        popupContent = await window.contentLoader.getPopup('marketPressure');
    } catch (error) {
        console.error('[showMarketPressureInfo] Failed to load content:', error);
        // Use hardcoded fallback
        popupContent = FALLBACK_POPUP_MARKET_PRESSURE;
    }
    const overlay = document.createElement('div');
    overlay.id = 'market-pressure-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 1rem;
        animation: fadeIn 0.2s ease;
    `;
    
    const popup = document.createElement('div');
    popup.style.cssText = `
        background: var(--card-background);
        border-radius: 16px;
        padding: 2rem;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        position: relative;
        animation: slideUp 0.3s ease;
    `;
    
    // Build HTML from loaded content
    popup.innerHTML = `
        <button id="close-popup" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-color); padding: 0.25rem 0.5rem; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='var(--border-color)'" onmouseout="this.style.background='transparent'">×</button>
        
        <h2 style="margin-top: 0; margin-bottom: 1rem; color: var(--text-color);">${popupContent.title}</h2>
        
        ${renderPopupSections(popupContent.sections)}
    `;
    
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    
    // Close on overlay click or close button
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.id === 'close-popup') {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    });
    
    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Show Market Confidence info popup
async function showMarketConfidenceInfo() {
    // Load content
    let popupContent;
    try {
        popupContent = await window.contentLoader.getPopup('marketConfidence');
    } catch (error) {
        console.error('[showMarketConfidenceInfo] Failed to load content:', error);
        // Use hardcoded fallback
        popupContent = FALLBACK_POPUP_MARKET_CONFIDENCE;
    }
    const overlay = document.createElement('div');
    overlay.id = 'market-confidence-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 1rem;
        animation: fadeIn 0.2s ease;
    `;
    
    const popup = document.createElement('div');
    popup.style.cssText = `
        background: var(--card-background);
        border-radius: 16px;
        padding: 2rem;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        position: relative;
        animation: slideUp 0.3s ease;
    `;
    
    // Build HTML from loaded content
    popup.innerHTML = `
        <button id="close-popup" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-color); padding: 0.25rem 0.5rem; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='var(--border-color)'" onmouseout="this.style.background='transparent'">×</button>
        
        <h2 style="margin-top: 0; margin-bottom: 1rem; color: var(--text-color);">${popupContent.title}</h2>
        
        ${renderPopupSections(popupContent.sections)}
    `;
    
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    
    // Close on overlay click or close button
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.id === 'close-popup') {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    });
    
    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Show Liquidity Risk info popup
async function showLiquidityRiskInfo() {
    const tier = currentPriceTier;
    
    // Load main popup content
    let popupContent;
    try {
        popupContent = await window.contentLoader.getPopup('liquidityRisk');
    } catch (error) {
        console.error('[showLiquidityRiskInfo] Failed to load content:', error);
        // Use hardcoded fallback
        popupContent = FALLBACK_POPUP_LIQUIDITY_RISK;
    }
    
    // Fetch tier-specific popup content if we have a tier
    let tierContent = null;
    if (tier && tier.tier_id) {
        try {
            const response = await fetch(`/liquidity-popup/${tier.tier_id}`);
            if (response.ok) {
                const data = await response.json();
                tierContent = data.content;
            }
        } catch (error) {
            console.error('[LIQUIDITY POPUP] Error fetching tier content:', error);
        }
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'liquidity-risk-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 1rem;
        animation: fadeIn 0.2s ease;
    `;
    
    const popup = document.createElement('div');
    popup.style.cssText = `
        background: var(--card-background);
        border-radius: 16px;
        padding: 2rem;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        position: relative;
        animation: slideUp 0.3s ease;
    `;
    
    // Build HTML from loaded content with tier badge if available
    popup.innerHTML = `
        <button id="close-popup" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-color); padding: 0.25rem 0.5rem; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='var(--border-color)'" onmouseout="this.style.background='transparent'">×</button>
        
        <h2 style="margin-top: 0; margin-bottom: 1rem; color: var(--text-color);">${popupContent.title}</h2>
        
        ${tier && tier.tier_name ? `
        <div style="display: inline-flex; align-items: center; gap: 0.5rem;
                    background: ${tier.tier_color}15;
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    border: 1px solid ${tier.tier_color}40;
                    margin-bottom: 1.5rem;">
            <span style="font-size: 1.25rem;">${tier.tier_emoji}</span>
            <strong style="color: ${tier.tier_color};">${tier.tier_name}</strong>
        </div>
        ` : ''}
        
        ${tierContent ? `
        <div style="background: linear-gradient(135deg, #f0f0f0 0%, #f8f8f8 100%); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
            <p style="margin: 0; font-size: 0.95rem; color: var(--text-color); line-height: 1.6;">
                ${tierContent}
            </p>
        </div>
        ` : ''}
        
        ${renderPopupSections(popupContent.sections)}
    `;
    
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    
    // Close on overlay click or close button
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.id === 'close-popup') {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    });
    
    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Calculate Liquidity Risk Score based on Absorption Ratio
function calculateLiquidityRisk(soldData, activeData) {
    console.log('[LIQUIDITY RISK] Calculating with:', {
        soldItems: soldData?.items?.length || 0,
        activeItems: activeData?.items?.length || 0
    });
    
    const completedSales = soldData?.items?.length || 0;
    
    // Filter active listings to Buy It Now only (exclude pure auctions)
    const buyItNowListings = activeData?.items?.filter(item => {
        const buyingFormat = (item.buying_format || '').toLowerCase();
        return buyingFormat.includes('buy it now');
    }) || [];
    
    const activeListings = buyItNowListings.length;
    
    console.log('[LIQUIDITY RISK] After filtering:', {
        totalActive: activeData?.items?.length || 0,
        buyItNowOnly: activeListings
    });
    
    // Insufficient data check
    if (activeListings === 0) {
        return {
            score: null,
            label: 'Insufficient Data',
            absorptionRatio: null,
            salesCount: completedSales,
            listingsCount: 0,
            confidence: 'N/A',
            statusColor: '#6e6e73',
            gradient: 'linear-gradient(135deg, #f5f5f7 0%, #e5e5ea 100%)',
            border: '#d1d1d6',
            message: 'No active Buy It Now listings found'
        };
    }
    
    // Calculate Absorption Ratio
    const absorptionRatio = completedSales / activeListings;
    
    console.log('[LIQUIDITY RISK] Absorption Ratio:', absorptionRatio);
    
    // Determine confidence level
    let confidence = 'Low';
    if (completedSales >= 10 && activeListings >= 10) {
        confidence = 'High';
    } else if (completedSales >= 5 && activeListings >= 5) {
        confidence = 'Medium';
    }
    
    // Calculate 0-100 score and determine band
    let score;
    let label;
    let statusColor;
    let gradient;
    let border;
    let message;
    
    if (absorptionRatio >= 1.0) {
        // High Liquidity: 80-100 range
        score = Math.min(100, 80 + (absorptionRatio - 1.0) * 20);
        label = 'High Liquidity';
        statusColor = '#34c759';
        gradient = 'linear-gradient(135deg, #e6ffe6 0%, #ccffcc 100%)';
        border = '#99ff99';
        message = 'Recent sales are outpacing active listings — strong buyer activity';
    } else if (absorptionRatio >= 0.5) {
        // Moderate Liquidity: 50-79 range
        score = 50 + (absorptionRatio - 0.5) * 60;
        label = 'Moderate Liquidity';
        statusColor = '#007aff';
        gradient = 'linear-gradient(135deg, #e6f7ff 0%, #ccedff 100%)';
        border = '#99daff';
        message = 'Balanced market — sales activity and supply are reasonably matched';
    } else if (absorptionRatio >= 0.2) {
        // Low Liquidity: 25-49 range
        score = 25 + (absorptionRatio - 0.2) * 83;
        label = 'Low Liquidity';
        statusColor = '#ff9500';
        gradient = 'linear-gradient(135deg, #fff5e6 0%, #ffe8cc 100%)';
        border = '#ffd699';
        message = 'Active listings outnumber recent sales — buyers have plenty of options';
    } else {
        // Very Low Liquidity: 10-24 range
        score = Math.max(10, absorptionRatio * 125);
        label = 'Very Low Liquidity';
        statusColor = '#ff3b30';
        gradient = 'linear-gradient(135deg, #ffebee 0%, #ffcccc 100%)';
        border = '#ff9999';
        message = 'Very few recent buyers relative to current supply — a thin market';
    }
    
    console.log('[LIQUIDITY RISK] Result:', {
        score: Math.round(score),
        label,
        confidence
    });
    
    return {
        score: Math.round(score),
        label,
        absorptionRatio: absorptionRatio.toFixed(2),
        salesCount: completedSales,
        listingsCount: activeListings,
        confidence,
        statusColor,
        gradient,
        border,
        message
    };
}

// Store current beeswarm data for redrawing on resize
let currentBeeswarmPrices = [];
let currentBeeswarmActivePrices = [];

// Shared axis range for mirrored strip + KDE charts (computed once per search)
let sharedChartAxisMin = null;
let sharedChartAxisMax = null;
let currentSoldData = null;
let currentActiveData = null;

// API key is now handled securely on the backend
const DEFAULT_API_KEY = 'backend-handled';

// Initialize the application on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Tab management
function switchTab(tabName, clickedElement = null) {
    // Update tab buttons - remove active class and set aria-selected to false
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    
    // Use passed element or try to get from event
    const targetElement = clickedElement || (window.event && window.event.target);
    if (targetElement) {
        targetElement.classList.add('active');
        targetElement.setAttribute('aria-selected', 'true');
    } else {
        // Fallback: find and activate the correct tab button
        const tabBtn = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
        if (tabBtn) {
            tabBtn.classList.add('active');
            tabBtn.setAttribute('aria-selected', 'true');
        }
    }
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    const tabContent = document.getElementById(tabName + '-tab');
    if (tabContent) {
        tabContent.classList.add('active');
    }
    
    // Load portfolio data when switching to portfolio tab
    if (tabName === 'portfolio' && window.CollectionModule) {
        window.CollectionModule.displayBinderView();
    }
    
    // Redraw chart if switching to comps tab and we have data
    if (tabName === 'comps' && currentBeeswarmPrices.length > 0) {
        setTimeout(() => {
            resizeCanvas();
            drawBeeswarm(currentBeeswarmPrices, currentBeeswarmActivePrices);
            drawMirroredStrip(currentBeeswarmPrices, currentBeeswarmActivePrices);
        }, 100);
    }
}

// Sub-tab management
function switchSubTab(subTabName) {
    // Update sub-tab buttons - remove active class and set aria-selected to false
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    
    // Activate clicked button
    const clickedButton = window.event && window.event.target;
    if (clickedButton) {
        clickedButton.classList.add('active');
        clickedButton.setAttribute('aria-selected', 'true');
    } else {
        // Fallback: find and activate the correct sub-tab button
        const subTabBtn = document.querySelector(`button[onclick="switchSubTab('${subTabName}')"]`);
        if (subTabBtn) {
            subTabBtn.classList.add('active');
            subTabBtn.setAttribute('aria-selected', 'true');
        }
    }
    
    // Update sub-tab content
    document.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));
    const subTabContent = document.getElementById(subTabName + '-subtab');
    if (subTabContent) {
        subTabContent.classList.add('active');
    }
    
    // Redraw chart if switching to comps sub-tab and we have data
    if (subTabName === 'comps' && currentBeeswarmPrices.length > 0) {
        setTimeout(() => {
            resizeCanvas();
            drawBeeswarm(currentBeeswarmPrices, currentBeeswarmActivePrices);
            drawMirroredStrip(currentBeeswarmPrices, currentBeeswarmActivePrices);
        }, 100);
    }

    // Redraw price distribution chart if switching to analysis sub-tab
    if (subTabName === 'analysis') {
        setTimeout(() => {
            const canvas = document.getElementById("priceDistributionCanvas");
            if (canvas && canvas.offsetParent !== null) {
                if (window.DEBUG_MODE.CHART) {
                    console.log('[CHART] Analysis tab activated, redrawing price distribution chart');
                }
                // Chart will be redrawn using stored data from last search
                const analysisContainer = document.getElementById("analysis-subtab");
                if (analysisContainer && analysisContainer.innerHTML.includes('priceDistributionCanvas')) {
                    // Trigger a redraw by dispatching a custom event
                    window.dispatchEvent(new CustomEvent('redrawPriceDistribution'));
                }
            }
        }, 100);
    }
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
}

function setupResponsiveCanvas() {
    // Handle window resize with debouncing
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (currentBeeswarmPrices.length > 0) {
                resizeCanvas();
                drawBeeswarm(currentBeeswarmPrices, currentBeeswarmActivePrices);
                drawMirroredStrip(currentBeeswarmPrices, currentBeeswarmActivePrices);
            }
        }, 150); // Wait 150ms after last resize
    });

}

function resizeCanvas() {
    const canvas = document.getElementById("beeswarmCanvas");
    if (!canvas) return;
    
    const container = canvas.parentElement;
    const containerWidth = container.offsetWidth;
    
    // Set canvas actual size (in pixels)
    canvas.width = containerWidth;
    canvas.height = 400;

    // Update CSS size to match
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = '400px';
}

async function renderData(data, secondData = null, marketValue = null) {
    const resultsDiv = document.getElementById("results");

    // Capture which search owns this renderData call. If the user starts a new
    // search before we finish, currentSearchController will point to the new
    // controller and we can bail out rather than overwriting new results.
    const myController = currentSearchController;

    // Reset chart data at the start of every render so a new search never
    // inherits stale chart state from the previous search.
    lastChartData.soldData = null;
    lastChartData.activeData = null;

    // Store active data and market value globally for checkbox toggle
    lastActiveData = secondData;
    lastMarketValue = marketValue;
    
    // Expose to window object for export functionality
    window.lastActiveData = secondData;
    window.lastMarketValue = marketValue;
    
    // DIAGNOSTIC: Check if these are accessible on window object
    console.log('[EXPORT DIAGNOSTIC] After renderData storage:', {
        'lastActiveData set (module)': !!lastActiveData,
        'window.lastActiveData accessible': !!window.lastActiveData,
        'Are they the same': lastActiveData === window.lastActiveData
    });
    
    // Create first table (hidden until relevance filtering completes)
    let html = `
      <div id="listings-tables-container" style="display: none;">
      <h3 style="margin-bottom: 1rem; color: var(--text-color);">Recently Sold Listings</h3>
      <div class="table-container" style="border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 1.5rem;">
        <table>
          <thead style="position: sticky; top: 0; background: var(--card-background); z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <tr>
              <th>Title</th>
              <th>Price</th>
              <th>Item ID</th>
            </tr>
          </thead>
          <tbody class="sold-listings-tbody">
          ${data.items && data.items.length > 0 ? data.items.map((item, idx) => {
            // Use deep link on mobile devices, standard link otherwise
            const linkUrl = (isMobileDevice && item.deep_link) ? item.deep_link : item.link;

            // Debug logging for sold listings
            if (isMobileDevice) {
              console.log('[SOLD LISTING LINK DEBUG]', {
                item_id: item.item_id,
                has_deep_link: !!item.deep_link,
                deep_link: item.deep_link,
                regular_link: item.link,
                using: linkUrl
              });
            }

            // For iOS, remove target="_blank" to avoid tab confusion after app switch
            const targetAttr = isIOS ? '' : ' target="_blank"';

            // Add touch-action CSS for better iOS touch handling
            const touchStyle = isIOS ? ' style="touch-action: manipulation; -webkit-tap-highlight-color: rgba(0,0,0,0.1);"' : '';

            return `
            <tr data-sold-index="${idx}">
              <td>${escapeHtml(item.title)}</td>
              <td>${formatMoney(item.total_price)}</td>
              <td><a href="${escapeHtml(linkUrl)}"${targetAttr}${touchStyle} onclick="console.log('[LINK CLICK] Sold listing:', '${escapeHtml(item.item_id)}', new Date().toISOString())">${escapeHtml(item.item_id)}</a></td>
            </tr>
            `;
          }).join('') : `
            <tr>
              <td colspan="3" style="text-align: center; padding: 2rem; color: var(--subtle-text-color);">
                No recently sold listings found
              </td>
            </tr>
          `}
          </tbody>
        </table>
      </div>
    `;
    
    // Add second table if second data exists
    console.log('[DEBUG renderData] Checking active listings:', {
        hasSecondData: !!secondData,
        hasItems: secondData?.items ? true : false,
        itemsCount: secondData?.items?.length || 0,
        hasMarketValue: !!marketValue,
        marketValue: marketValue
    });
    
    if (secondData && secondData.items) {
        console.log('[DEBUG renderData] Starting to filter active listings. Total items:', secondData.items.length);
        
        // Get checkbox state (default to checked — show all listings)
        const seeAllCheckbox = document.getElementById('see-all-active-listings');
        const showAllListings = seeAllCheckbox ? seeAllCheckbox.checked : true;
        
        console.log('[DEBUG renderData] See All checkbox state:', showAllListings);
        
        // Filter active listings based on checkbox state and FMV availability
        let filteredItems;
        if (showAllListings || !marketValue) {
            // Show all Buy It Now items when:
            // 1. "See All" is checked, OR
            // 2. No market value available (can't filter by price)
            filteredItems = secondData.items.filter(item => {
                const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
                const buyingFormat = (item.buying_format || '').toLowerCase();
                const hasBuyItNow = buyingFormat.includes('buy it now');
                return price > 0 && hasBuyItNow;
            });
        } else {
            // Show only Buy It Now items at or below market value
            filteredItems = secondData.items.filter(item => {
                const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
                const buyingFormat = (item.buying_format || '').toLowerCase();
                
                // Only show items with "buy it now" in the format (excludes pure auctions)
                const hasBuyItNow = buyingFormat.includes('buy it now');
                const passes = price > 0 && price <= marketValue && hasBuyItNow;
                
                if (!passes) {
                    console.log('[DEBUG renderData] Filtered out item:', {
                        item_id: item.item_id,
                        title: item.title?.substring(0, 40),
                        total_price: item.total_price,
                        extracted_price: item.extracted_price,
                        extracted_shipping: item.extracted_shipping,
                        calculated_price: price,
                        marketValue: marketValue,
                        buying_format: item.buying_format,
                        hasBuyItNow: hasBuyItNow,
                        reason: !hasBuyItNow ? 'not buy it now' : (price <= 0 ? 'zero/negative price' : 'above market value')
                    });
                }
                
                return passes;
            });
        }

        console.log('[DEBUG renderData] After filtering:', {
            original: secondData.items.length,
            filtered: filteredItems.length,
            marketValue: marketValue,
            showingAll: showAllListings
        });
        
        // Sort by price (lowest to highest)
        filteredItems.sort((a, b) => {
            const priceA = a.total_price ?? ((a.extracted_price || 0) + (a.extracted_shipping || 0));
            const priceB = b.total_price ?? ((b.extracted_price || 0) + (b.extracted_shipping || 0));
            return priceA - priceB;
        });
        
        // Determine header text and checkbox state based on FMV availability
        const hasMarketValue = marketValue !== null && marketValue !== undefined;
        const headerText = 'Active Listings';
        const checkboxDisabled = !hasMarketValue;

        html += `
          <div style="margin-bottom: 1rem; margin-top: 2rem; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; color: var(--text-color);">${headerText}</h3>
            <label style="font-size: 0.95rem; font-weight: 500; cursor: ${checkboxDisabled ? 'not-allowed' : 'pointer'}; display: inline-flex; align-items: center; gap: 0.5rem; opacity: ${checkboxDisabled ? '0.5' : '1'};">
              <input type="checkbox" id="see-all-active-listings" style="transform: scale(1.3); cursor: ${checkboxDisabled ? 'not-allowed' : 'pointer'};" onchange="toggleActiveListingsView()" ${showAllListings ? 'checked' : ''} ${checkboxDisabled ? 'disabled' : ''}>
              <span>See All</span>
            </label>
          </div>
          ${!hasMarketValue && filteredItems.length > 0 ? `
          <div style="background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid #ff9500;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1.2rem;">ℹ️</span>
              <span style="font-size: 0.85rem; color: #333;">No recent sales found - showing all active listings (Fair Market Value unavailable)</span>
            </div>
          </div>
          ` : ''}
          <div id="active-listings-table" class="table-container" style="border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 1.5rem;">
            <table>
              <thead style="position: sticky; top: 0; background: var(--card-background); z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <tr>
                  <th>Title</th>
                  <th>Price</th>
                  ${hasMarketValue ? '<th>Discount</th>' : ''}
                  <th>Type</th>
                  <th>Item ID</th>
                </tr>
              </thead>
              <tbody class="active-listings-tbody">
              ${filteredItems.length > 0 ? filteredItems.map(item => {
                // All items are "Buy It Now" since we filtered out auctions
                const displayType = 'Buy It Now';
                
                // Calculate price with fallback - use total_price from API if available
                const itemPrice = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
                
                // Calculate discount only if market value is available
                let discountDisplay = '';
                let discountColor = '';
                if (hasMarketValue) {
                  const discount = ((marketValue - itemPrice) / marketValue * 100).toFixed(0);
                  discountDisplay = discount > 0 ? `-${discount}%` : `+${Math.abs(discount)}%`;
                  discountColor = discount > 0 ? '#34c759' : '#ff3b30';
                }
                
                // Debug logging for price calculation
                if (window.DEBUG_MODE.PRICE_CALC) {
                  console.log('[ACTIVE LISTING PRICE]', {
                    item_id: item.item_id,
                    title: item.title?.substring(0, 40),
                    total_price: item.total_price,
                    extracted_price: item.extracted_price,
                    extracted_shipping: item.extracted_shipping,
                    calculated_price: itemPrice,
                    displaying: itemPrice
                  });
                }
                
                // Use deep link on mobile devices, standard link otherwise
                const linkUrl = (isMobileDevice && item.deep_link) ? item.deep_link : item.link;
                
                // Debug logging for active listings
                if (isMobileDevice) {
                  console.log('[ACTIVE LISTING LINK DEBUG]', {
                    item_id: item.item_id,
                    has_deep_link: !!item.deep_link,
                    deep_link: item.deep_link,
                    regular_link: item.link,
                    using: linkUrl,
                    title: item.title?.substring(0, 50)
                  });
                }
                
                // For iOS, remove target="_blank" to avoid tab confusion after app switch
                const targetAttr = isIOS ? '' : ' target="_blank"';
                
                // Add touch-action CSS for better iOS touch handling
                const touchStyle = isIOS ? ' style="touch-action: manipulation; -webkit-tap-highlight-color: rgba(0,0,0,0.1);"' : '';
                
                return `
                  <tr data-item-id="${escapeHtml(item.item_id)}">
                    <td>${escapeHtml(item.title)}</td>
                    <td>${formatMoney(itemPrice)}</td>
                    ${hasMarketValue ? `<td style="color: ${discountColor}; font-weight: 600;">${discountDisplay}</td>` : ''}
                    <td>${escapeHtml(displayType)}</td>
                    <td><a href="${escapeHtml(linkUrl)}"${targetAttr}${touchStyle} onclick="console.log('[LINK CLICK] Active listing:', '${escapeHtml(item.item_id)}', new Date().toISOString())">See Listing</a></td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="${hasMarketValue ? '5' : '4'}" style="text-align: center; padding: 2rem; color: var(--subtle-text-color);">
                    ${hasMarketValue
                      ? (showAllListings ? 'No active listings found' : 'No active listings found below Fair Market Value')
                      : 'No active listings found'}
                  </td>
                </tr>
              `}
              </tbody>
            </table>
          </div>
          <div class="active-relevance-note"></div>
          <p style="font-size: 0.75rem; color: #666; margin-top: 0.75rem; margin-bottom: 0.5rem; line-height: 1.5;">
            ⚠️ These listings are shown for research purposes only. This is not a recommendation to buy. Always do your own due diligence before purchasing.
          </p>
          <p style="font-size: 0.75rem; color: #999; margin-top: 0.5rem; margin-bottom: 0.75rem;">
            This website is supported by affiliate links. Purchases may earn us a commission at no extra cost to you.
          </p>
        `;
    }

    html += `</div>`; // close listings-tables-container
    resultsDiv.innerHTML = html;

    // Clear old stats and chart with smooth transition
    clearBeeswarm();

    // Smooth delay for better UX
    await new Promise(resolve => setTimeout(resolve, 300));


    // Update FMV first, then draw beeswarm chart
    const fmvData = await updateFmv(data, secondData);

    // If a newer search has started since we began, bail out so we don't
    // overwrite the newer search's analysis container with our stale data.
    if (currentSearchController !== myController) return;

    // AI scoring done, now building dashboard
    updateSearchStage('stage-dashboard');
    
    // Render Analysis Dashboard with sold data, FMV, and active listings
    // Wrap in try-catch to ensure Analysis errors don't block Comps display
    if (data && fmvData) {
        try {
            console.log('[DEBUG renderData] About to call renderAnalysisDashboard with:', {
                hasData: !!data,
                hasFmvData: !!fmvData,
                hasSecondData: !!secondData,
                secondDataItemCount: secondData?.items?.length || 0,
                secondDataKeys: secondData ? Object.keys(secondData) : []
            });
            await renderAnalysisDashboard(data, fmvData, secondData);
        } catch (error) {
            console.error('[ERROR] Failed to render Analysis Dashboard, but Comps data is still available:', error);
            // Don't throw - let the Comps data display normally
        }
    } else {
        // No FMV data — clear the analysis container so stale chart from a
        // previous search doesn't remain visible in the DOM.
        const analysisContainer = document.getElementById("analysis-subtab");
        if (analysisContainer) {
            analysisContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📊 Market Analysis</h3>
                    <p style="margin: 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto;">Run a search to see advanced market analytics and insights</p>
                </div>
            `;
        }
    }
    const RELEVANCE_THRESHOLD = 0.5;
    const relevantSoldItems = data.items.filter(item => (item.ai_relevance_score ?? 1.0) >= RELEVANCE_THRESHOLD);
    const relevantActiveItems = (secondData?.items || []).filter(item => (item.ai_relevance_score ?? 1.0) >= RELEVANCE_THRESHOLD);
    const soldFiltered = data.items.length - relevantSoldItems.length;
    const activeFiltered = (secondData?.items || []).length - relevantActiveItems.length;
    if (soldFiltered > 0 || activeFiltered > 0) {
      console.log(`[RELEVANCE] Filtered out ${soldFiltered} sold + ${activeFiltered} active low-relevance listings`);
    }

    // Show AI Filtered badge on the sold listings heading if AI scoring ran
    if (aiFilteringRan) {
      const soldHeading = document.querySelector('#listings-tables-container h3');
      if (soldHeading && !soldHeading.querySelector('.ai-filtered-badge')) {
        const badge = document.createElement('span');
        badge.className = 'ai-filtered-badge';
        badge.textContent = 'AI Filtered';
        badge.style.cssText = 'display: inline-block; margin-left: 0.6rem; padding: 2px 8px; font-size: 0.7rem; font-weight: 600; border-radius: 20px; background: rgba(88, 86, 214, 0.12); color: #5856d6; border: 1px solid rgba(88, 86, 214, 0.3); vertical-align: middle; letter-spacing: 0.02em;';
        soldHeading.appendChild(badge);
      }
    }

    // Hide low-relevance rows from the already-rendered sold listings table
    if (soldFiltered > 0) {
      const soldTbody = document.querySelector('.sold-listings-tbody');
      if (soldTbody) {
        data.items.forEach((item, idx) => {
          if ((item.ai_relevance_score ?? 1.0) < RELEVANCE_THRESHOLD) {
            const row = soldTbody.querySelector(`tr[data-sold-index="${idx}"]`);
            if (row) row.style.display = 'none';
          }
        });
        // Add hidden count note
        const noteRow = document.createElement('tr');
        noteRow.innerHTML = `<td colspan="3" style="text-align: center; padding: 0.75rem; color: var(--subtle-text-color); font-size: 0.85rem; font-style: italic;">${soldFiltered} irrelevant listing${soldFiltered !== 1 ? 's' : ''} hidden by AI filter</td>`;
        soldTbody.appendChild(noteRow);
      }
    }

    // Hide low-relevance rows from the already-rendered active listings table
    if (activeFiltered > 0) {
      const activeTbody = document.querySelector('.active-listings-tbody');
      if (activeTbody) {
        activeTbody.querySelectorAll('tr[data-item-id]').forEach(row => {
          const itemId = row.getAttribute('data-item-id');
          const item = (secondData?.items || []).find(i => i.item_id === itemId);
          if (item && (item.ai_relevance_score ?? 1.0) < RELEVANCE_THRESHOLD) {
            row.style.display = 'none';
          }
        });
      }
      // Add hidden count note
      const noteEl = document.querySelector('.active-relevance-note');
      if (noteEl) {
        noteEl.innerHTML = `<p style="font-size: 0.8rem; color: var(--subtle-text-color); margin-top: 0.5rem; font-style: italic;">${activeFiltered} irrelevant listing${activeFiltered !== 1 ? 's' : ''} hidden by AI filter</p>`;
      }
    }

    // Show the tables now that filtering is complete
    const tablesContainer = document.getElementById('listings-tables-container');
    if (tablesContainer) tablesContainer.style.display = '';

    const prices = relevantSoldItems.map(item => item.total_price);
    const activePrices = relevantActiveItems
        .map(item => item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0)))
        .filter(p => p > 0);
    currentBeeswarmPrices = prices;
    currentBeeswarmActivePrices = activePrices;

    // Compute shared axis range for both charts
    const filteredForAxis = filterOutliers(prices.filter(p => p != null && !isNaN(p) && p > 0).map(Number));
    const fmvVals = [expectLowGlobal, expectHighGlobal, marketValueGlobal].filter(v => v != null && !isNaN(v));
    if (filteredForAxis.length > 0) {
      const dMin = Math.min(Math.min(...filteredForAxis), ...fmvVals);
      const dMax = Math.max(Math.max(...filteredForAxis), ...fmvVals);
      const dMid = (dMin + dMax) / 2;
      const hSpan = (dMax - dMin) / 2;
      const dPad = hSpan * 0.15 || dMin * 0.10 || 0.10;
      sharedChartAxisMin = dMid - hSpan - dPad;
      sharedChartAxisMax = dMid + hSpan + dPad;
    }

    drawBeeswarm(prices, activePrices);
    const mirroredContainer = document.getElementById("mirrored-chart-container");
    if (mirroredContainer) mirroredContainer.style.display = '';
    drawMirroredStrip(prices, activePrices);
    currentSoldData = data;
    currentActiveData = secondData;

    // Trigger chart animation
    const chartContainer = document.getElementById("chart-container");
    chartContainer.style.opacity = '0';
    await new Promise(resolve => setTimeout(resolve, 100));
    chartContainer.style.opacity = '1';

    // Clear loading UI from stats-container
    const loadingUi = document.getElementById('search-loading-ui');
    if (loadingUi) loadingUi.remove();
}

function toggleActiveListingsView() {
    console.log('[DEBUG] Toggle active listings view called');
    
    // Re-render the active listings table with the new checkbox state
    if (lastData && lastActiveData) {
        console.log('[DEBUG] Re-rendering active listings with stored data');
        
        // Get checkbox state
        const seeAllCheckbox = document.getElementById('see-all-active-listings');
        const showAllListings = seeAllCheckbox ? seeAllCheckbox.checked : true;

        console.log('[DEBUG] Checkbox state:', showAllListings);
        
        // Check if market value is available
        const hasMarketValue = lastMarketValue !== null && lastMarketValue !== undefined;
        
        // Filter active listings based on checkbox state and FMV availability
        let filteredItems;
        if (showAllListings || !hasMarketValue) {
            // Show all Buy It Now items when:
            // 1. "See All" is checked, OR
            // 2. No market value available (can't filter by price)
            filteredItems = lastActiveData.items.filter(item => {
                const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
                const buyingFormat = (item.buying_format || '').toLowerCase();
                const hasBuyItNow = buyingFormat.includes('buy it now');
                return price > 0 && hasBuyItNow;
            });
        } else {
            // Show only Buy It Now items at or below market value
            filteredItems = lastActiveData.items.filter(item => {
                const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
                const buyingFormat = (item.buying_format || '').toLowerCase();
                const hasBuyItNow = buyingFormat.includes('buy it now');
                return price > 0 && price <= lastMarketValue && hasBuyItNow;
            });
        }
        
        // Sort by price (lowest to highest)
        filteredItems.sort((a, b) => {
            const priceA = a.total_price ?? ((a.extracted_price || 0) + (a.extracted_shipping || 0));
            const priceB = b.total_price ?? ((b.extracted_price || 0) + (b.extracted_shipping || 0));
            return priceA - priceB;
        });
        
        console.log('[DEBUG] Filtered items:', filteredItems.length);
        
        // Rebuild the active listings table HTML
        let tableHtml = `
          <thead style="position: sticky; top: 0; background: var(--card-background); z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <tr>
              <th>Title</th>
              <th>Price</th>
              ${hasMarketValue ? '<th>Discount</th>' : ''}
              <th>Type</th>
              <th>Item ID</th>
            </tr>
          </thead>
          <tbody>
        `;
        
        if (filteredItems.length > 0) {
            filteredItems.forEach(item => {
                const displayType = 'Buy It Now';
                const itemPrice = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
                
                // Calculate discount only if market value is available
                let discountDisplay = '';
                let discountColor = '';
                if (hasMarketValue) {
                  const discount = ((lastMarketValue - itemPrice) / lastMarketValue * 100).toFixed(0);
                  discountDisplay = discount > 0 ? `-${discount}%` : `+${Math.abs(discount)}%`;
                  discountColor = discount > 0 ? '#34c759' : '#ff3b30';
                }
                
                const linkUrl = (isMobileDevice && item.deep_link) ? item.deep_link : item.link;
                const targetAttr = isIOS ? '' : ' target="_blank"';
                const touchStyle = isIOS ? ' style="touch-action: manipulation; -webkit-tap-highlight-color: rgba(0,0,0,0.1);"' : '';
                
                tableHtml += `
                  <tr>
                    <td>${escapeHtml(item.title)}</td>
                    <td>${formatMoney(itemPrice)}</td>
                    ${hasMarketValue ? `<td style="color: ${discountColor}; font-weight: 600;">${discountDisplay}</td>` : ''}
                    <td>${escapeHtml(displayType)}</td>
                    <td><a href="${escapeHtml(linkUrl)}"${targetAttr}${touchStyle} onclick="console.log('[LINK CLICK] Active listing:', '${escapeHtml(item.item_id)}', new Date().toISOString())">See Listing</a></td>
                  </tr>
                `;
            });
        } else {
            tableHtml += `
              <tr>
                <td colspan="${hasMarketValue ? '5' : '4'}" style="text-align: center; padding: 2rem; color: var(--subtle-text-color);">
                  ${hasMarketValue
                    ? (showAllListings ? 'No active listings found' : 'No active listings found below Fair Market Value')
                    : 'No active listings found'}
                </td>
              </tr>
            `;
        }
        
        tableHtml += '</tbody>';
        
        // Update the table content
        const tableContainer = document.getElementById('active-listings-table');
        if (tableContainer) {
            const table = tableContainer.querySelector('table');
            if (table) {
                table.innerHTML = tableHtml;
            }
        }
        
        // Update the heading based on FMV availability
        const headingContainer = tableContainer?.previousElementSibling?.previousElementSibling;
        if (headingContainer && headingContainer.querySelector('h3')) {
            const headerText = 'Active Listings';
            headingContainer.querySelector('h3').textContent = headerText;
        }
        
        console.log('[DEBUG] Active listings table updated');
    } else {
        console.warn('[DEBUG] Cannot toggle - missing stored data');
    }
}

function clearSearch() {
    // Cancel any in-progress search
    if (currentSearchController) {
      currentSearchController.abort();
      currentSearchController = null;
    }

    // Clear the query input
    document.getElementById("query").value = "";
    
    // Clear results in Comps tab
    const resultsDiv = document.getElementById("results");
    if (resultsDiv) {
        resultsDiv.innerHTML = "";
    }
    
    // Clear stats container and show empty state
    const statsContainer = document.getElementById("stats-container");
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📊 Comps & Statistics</h3>
                <p style="margin: 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto;">Search for a card above to see recent sales, price statistics, and fair market value</p>
            </div>
        `;
    }
    
    // Clear FMV container
    const fmvContainer = document.getElementById("fmv-container");
    if (fmvContainer) {
        fmvContainer.innerHTML = "";
    }
    
    // Clear Analysis tab and show empty state
    const analysisContainer = document.getElementById("analysis-subtab");
    if (analysisContainer) {
        analysisContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📊 Market Analysis</h3>
                <p style="margin: 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto;">Search for a card to see advanced market analytics and insights</p>
            </div>
        `;
    }
    
    // Clear beeswarm chart
    clearBeeswarm();

    // Clear mirrored strip chart
    const mirroredContainer = document.getElementById("mirrored-chart-container");
    if (mirroredContainer) mirroredContainer.style.display = 'none';

    // Reset stored data
    lastData = null;
    lastActiveData = null;
    lastMarketValue = null;
    expectLowGlobal = null;
    expectHighGlobal = null;
    marketValueGlobal = null;
    window.backendAnalyticsScores = null;
    currentBeeswarmPrices = [];
    
    // Clear crosshair positions
    beeswarmCrosshairX = null;
    volumeProfileCrosshairX = null;
    
    // Clear window object references too
    window.lastData = null;
    window.lastActiveData = null;
    window.marketValueGlobal = null;
    window.expectLowGlobal = null;
    window.expectHighGlobal = null;
    
    // Focus on the query input
    document.getElementById("query").focus();
}

async function runSearch() {
    try {
        const query = document.getElementById("query").value.trim();
        if (!query) {
            throw new Error("Please enter a search query");
        }
        
        if (!validateSearchQuery(query)) {
            throw new Error("Please enter a search query");
        }
        
        await runSearchInternal();
    } catch (error) {
        showError(error.message);
    }
}

// Helper function to validate search query format
function validateSearchQuery(query) {
    // Only check that query is not empty - no year or content requirements
    return query && query.trim().length > 0;
}

// Helper function to show errors
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        background: #ffebee;
        color: #c62828;
        padding: 1rem;
        margin: 1rem 0;
        border-radius: 8px;
        border: 1px solid #ef9a9a;
        font-size: 0.9rem;
        text-align: center;
        animation: fadeIn 0.3s ease;
    `;
    errorDiv.textContent = message;
    
    // Remove any existing error messages
    document.querySelectorAll('.error-message').forEach(el => el.remove());
    
    // Insert error message before the results container
    const resultsContainer = document.getElementById('results');
    resultsContainer.parentNode.insertBefore(errorDiv, resultsContainer);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        errorDiv.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => errorDiv.remove(), 300);
    }, 5000);
}

// Add CSS for animations and loading states
const style = document.createElement('style');
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
`;
document.head.appendChild(style);

// Helper function to construct the search query with all selected exclusions
function getSearchQueryWithExclusions(baseQuery) {
    const excludeLots = document.getElementById("exclude_lots")?.checked || false;
    const ungradedOnly = document.getElementById("ungraded_only").checked;
    const baseOnly = document.getElementById("base_only").checked;

    let allExcludedPhrases = [];

    if (excludeLots) {
        const lotExclusions = [
            // Lot terms
            '-lot', '-"team lot"', '-"player lot"', '-"small lot"', '-"huge lot"', '-"mixed lot"',
            '-"random lot"', '-"mystery lot"', '-"assorted lot"', '-"lot of"', '-"lotof"',
            '-bulk', '-bundle',
            
            // Quantity indicators (parentheses)
            '-"(2)"', '-"(3)"', '-"(4)"', '-"(5)"', '-"(6)"', '-"(7)"', '-"(8)"', '-"(9)"',
            '-"(10)"', '-"(12)"', '-"(15)"', '-"(20)"',
            
            // Card count terms
            '-"2 cards"', '-"3 cards"', '-"4 cards"', '-"5 cards"', '-"6 cards"', '-"7 cards"',
            '-"8 cards"', '-"9 cards"', '-"10 cards"',
            '-"2 card"', '-"3 card"', '-"4 card"', '-"5 card"',
            
            // Multiplier terms
            '-"2x"', '-"3x"', '-"4x"', '-"5x"', '-"6x"', '-"10x"', '-"x cards"', '-"x card"',
            '-"count"', '-"ct"', '-"ct."',
            
            // Multi/duplicate terms
            '-multi', '-multiple', '-multiples', '-duplicate', '-duplicates', '-dupe', '-dupes',
            '-"group of"', '-"set of"'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(lotExclusions);
    }

    if (ungradedOnly) {
        const rawOnlyExclusions = [
            // PSA related
            '-psa', '-"psa 10"', '-"psa10"', '-"psa 9"', '-"psa9"', '-"psa graded"', '-"psa slab"',
            '-"Professional Sports Authenticator"', '-"Professional Authenticator"',
            '-"Pro Sports Authenticator"', '-"Certified 10"', '-"Certified Gem"', '-"Certified Mint"',
            '-"Red Label"', '-lighthouse', '-"Gem Mint 10"', '-"Graded 10"',
            
            // BGS related
            '-bgs', '-"bgs 9"', '-"bgs9"', '-"bgs 9.5"', '-"bgs9.5"', '-beckett', '-"beckett graded"',
            '-"Gem 10"', '-"Black Label"', '-"Gold Label"', '-"Silver Label"',
            '-subgrades', '-"sub grades"', '-subs', '-"Quad 9.5"', '-"quad9"', '-"quad 9"',
            '-"True Gem"', '-"True Gem+"', '-"Gem+"', '-bvg',
            
            // SGC related
            '-sgc', '-"sgc 10"', '-"sgc 9"', '-"sgc graded"',
            '-"Tuxedo Slab"', '-"Black Slab"', '-"Green Label"', '-"SG LLC"',
            '-"SG Grading"', '-"Mint+ 9.5"', '-"10 Pristine"',
            
            // CGC/CSG related
            '-csg', '-cgc', '-"csg graded"', '-"cgc graded"',
            '-"Certified Collectibles Group"', '-"CGC Trading Cards"', '-"CSG Gem"',
            '-"Pristine 10"', '-"Perfect 10"', '-"Green Slab"',
            
            // GMA related
            '-gma', '-"gma graded"', '-"gma 10"',
            
            // HGA related
            '-hga', '-"hga graded"', '-"hybrid grading"',
            
            // KSA related
            '-ksa', '-"ksa graded"',
            
            // PCA/PGSC related
            '-pca', '-"pca graded"', '-pgsc',
            
            // Other grading companies
            '-fgs', '-pgi', '-pro', '-isa', '-mnt', '-"MNT Grading"',
            '-rcg', '-"TCG Grading"', '-bccg', '-tag', '-pgs', '-tga', '-ace', '-usg',
            '-kmgs', '-egs', '-agc', '-mgs',
            
            // General grading terms
            '-slab', '-slabbed', '-encased', '-encapsulated', '-holdered',
            '-graded', '-"grade"', '-authenticated', '-"authentic"', '-"auto grade"', '-verified',
            '-gem', '-"gem mint"', '-"gem10"', '-"gem 10"', '-"gem-mint"', '-gemmint',
            '-pristine', '-"Mint 10"', '-"mint10"', '-"Mint 9"', '-"mint9"',
            '-"mt 10"', '-"10 mt"', '-"Mint+"', '-"NM-MT"',
            '-"Slabbed Card"', '-"Third-Party Graded"', '-"Certified Authentic"', '-"Pro Graded"',
            '-"Slabbed up"', '-"In case"',
            '-"Graded Rookie"', '-"Graded RC"', '-"Gem Rookie"', '-"Gem RC"',
            
            // Population and authentication terms
            '-"population"', '-"pop report"', '-"pop 1"', '-"pop1"',
            
            // Card storage/holder terms
            '-"card saver"', '-cardsaver', '-"semi rigid"', '-"semi-rigid"',
            '-"one touch"', '-"one-touch"', '-mag', '-"mag case"'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(rawOnlyExclusions);
    }

    if (baseOnly) {
        const baseOnlyExclusions = [
            // Existing exclusions
            '-refractors', '-red', '-aqua', '-blue', '-magenta', '-yellow', '-lot',
            '-x-fractors', '-xfractors', '-helix', '-superfractor', '-x-fractor',
            '-logofractor', '-stars', '-hyper', '-all', '-etch', '-silver', '-variation',
            '-variations', '-refractor', '-prism', '-prizm', '-xfractor', '-gilded',
            '-"buy-back"', '-buyback',
            '-SP', '-sp', '-"short print"', '-"Short Print"', '-ssp', '-SSP',
            '-"super short print"', '-"Super Short Print"',

            // Additional variant/parallel exclusions
            '-foil', '-shimmer', '-lava', '-wave', '-raywave', '-speckle', '-mojo',
            '-sapphire', '-ice', '-cracked', '-checker', '-optic', '-paper',
            '-sepia', '-"negative refractor"',

            // Additional color exclusions
            '-green', '-orange', '-gold', '-purple', '-pink', '-fuchsia', '-teal',
            '-sky', '-lime', '-bronze', '-copper', '-black', '-white'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(baseOnlyExclusions);
    }

    const baseChromeOnly = document.getElementById("base_chrome_only").checked;
    if (baseChromeOnly) {
        const baseChromeOnlyExclusions = [
            '-blue', '-red', '-gold', '-green', '-pink', '-prism', '-negative',
            '-x-fractor', '-xfractor', '-magenta', '-mojo', '-aqua', '-yellow',
            '-orange', '-purple', '-sepia', '-black', '-nucleus', '-white',
            '-refractor'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(baseChromeOnlyExclusions);
    }

    const baseRefractorOnly = document.getElementById("base_refractor_only").checked;
    if (baseRefractorOnly) {
        const baseRefractorOnlyExclusions = [
            '-blue', '-red', '-gold', '-green', '-pink', '-prism', '-negative',
            '-x-fractor', '-xfractor', '-magenta', '-mojo', '-aqua', '-yellow',
            '-orange', '-purple', '-sepia', '-black', '-nucleus', '-white'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(baseRefractorOnlyExclusions);
    }

    let finalQuery = baseQuery;
    if (allExcludedPhrases.length > 0) {
        finalQuery = `${baseQuery} ${allExcludedPhrases.join(' ')}`;
    }
    console.log('[DEBUG] Constructed query with exclusions:', finalQuery);
    return finalQuery;
}

const SEARCH_STAGES = ['stage-search', 'stage-active', 'stage-ai', 'stage-dashboard'];

function updateSearchStage(stageId) {
  const idx = SEARCH_STAGES.indexOf(stageId);
  if (idx === -1) return;
  SEARCH_STAGES.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active', 'completed');
    if (i < idx) el.classList.add('completed');
    else if (i === idx) el.classList.add('active');
  });
}

async function runSearchInternal() {
  try {
    const startTime = Date.now();
    let baseQuery = document.getElementById("query").value;
    const delay = 2;
    const pages = 1;
    const ungradedOnly = document.getElementById("ungraded_only").checked;
    const apiKey = "backend-handled";

    if (!baseQuery) {
      throw new Error("Please enter a search query");
    }

    // Cancel any in-progress search and immediately clear the analysis container
    // so stale results from the previous search don't linger.
    if (currentSearchController) {
      currentSearchController.abort();
    }
    currentSearchController = new AbortController();
    const analysisContainerEarly = document.getElementById("analysis-subtab");
    if (analysisContainerEarly) {
      analysisContainerEarly.innerHTML = `
        <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
          <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📊 Market Analysis</h3>
          <p style="margin: 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto;">Run a search to see advanced market analytics and insights</p>
        </div>
      `;
    }

    let query = getSearchQueryWithExclusions(baseQuery);

    // Reset crosshair positions for new search
    beeswarmCrosshairX = null;
    volumeProfileCrosshairX = null;

    // Clear previous search results so stale visuals don't persist
    clearBeeswarm();
    const fmvContainer = document.getElementById("fmv-container");
    if (fmvContainer) fmvContainer.innerHTML = "";
    const mirroredContainer = document.getElementById("mirrored-chart-container");
    if (mirroredContainer) mirroredContainer.style.display = 'none';

    // Add loading styles if not present
    if (!document.getElementById('loading-styles')) {
      const style = document.createElement('style');
      style.id = 'loading-styles';
      style.textContent = `
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
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          border-radius: 6px;
          background: var(--card-background);
          opacity: 0.4;
          transition: all 0.3s ease;
        }
        .loading-stage.active {
          opacity: 1;
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .loading-stage.completed {
          opacity: 0.7;
        }
        .loading-stage.completed .loading-spinner {
          border: none;
          animation: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .loading-stage.completed .loading-spinner::after {
          content: '✓';
          color: #22c55e;
          font-size: 16px;
          font-weight: bold;
        }
        .loading-spinner {
          width: 24px;
          height: 24px;
          border: 3px solid var(--border-color);
          border-top-color: var(--primary-blue);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          flex-shrink: 0;
        }
        .loading-text {
          flex: 1;
        }
        .loading-text h4 {
          margin: 0;
          color: var(--text-color);
          font-size: 0.95rem;
        }
        .loading-text p {
          margin: 0.25rem 0 0;
          color: var(--subtle-text-color);
          font-size: 0.85rem;
        }
        .search-progress-bar-container {
          width: 100%;
          height: 4px;
          background: var(--border-color);
          border-radius: 2px;
          margin-top: 1rem;
          overflow: hidden;
        }
        .search-progress-bar {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, var(--primary-blue), #60a5fa);
          border-radius: 2px;
          transition: width 1s linear;
        }
        .progress-time {
          text-align: center;
          color: var(--subtle-text-color);
          font-size: 0.8rem;
          margin: 0.5rem 0 0;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    // Show detailed loading state
    const resultsDiv = document.getElementById("results");
    const statsContainer = document.getElementById("stats-container");
    const analysisContainer = document.getElementById("analysis-subtab");
    
    // Add loading state to Analysis tab
    if (analysisContainer) {
        analysisContainer.innerHTML = `
            <div class="loading-container">
                <div class="loading-stage active">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">
                        <h4>Searching & Analyzing...</h4>
                        <p>Gathering market data and calculating analytics</p>
                    </div>
                </div>
                <div class="progress-info" style="text-align: center; margin-top: 1rem; color: var(--subtle-text-color);">
                    <p>Estimated time: ~15 seconds</p>
                </div>
            </div>
        `;
    }
    
    resultsDiv.innerHTML = '';

    statsContainer.innerHTML = `
      <div class="loading-container" id="search-loading-ui">
        <div class="loading-stage active" id="stage-search">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <h4>Searching eBay listings...</h4>
            <p>Fetching recent sales data</p>
          </div>
        </div>
        <div class="loading-stage" id="stage-active">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <h4>Fetching Active Listings...</h4>
            <p>Finding current market prices</p>
          </div>
        </div>
        <div class="loading-stage" id="stage-ai">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <h4>AI Relevance Scoring...</h4>
            <p>Filtering irrelevant listings</p>
          </div>
        </div>
        <div class="loading-stage" id="stage-dashboard">
          <div class="loading-spinner"></div>
          <div class="loading-text">
            <h4>Building Dashboard...</h4>
            <p>Generating visualizations</p>
          </div>
        </div>
        <div class="search-progress-bar-container">
          <div class="search-progress-bar" id="search-progress-bar"></div>
        </div>
        <p class="progress-time" id="progress-time">Elapsed: 0s</p>
      </div>
    `;

    // Start progress timer
    const progressInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const timeEl = document.getElementById('progress-time');
      if (timeEl) timeEl.textContent = `Elapsed: ${elapsed}s`;
      const barEl = document.getElementById('search-progress-bar');
      if (barEl) {
        // Asymptotic approach to 90% over ~35s
        const pct = Math.min(90, (elapsed / 35) * 90);
        barEl.style.width = pct + '%';
      }
    }, 1000);
    clearBeeswarm();

    const params = new URLSearchParams({
      query: query,
      pages: pages,
      delay: delay,
      ungraded_only: ungradedOnly,
      api_key: apiKey
    });
    const url = `/comps?${params.toString()}`;

    // Add loading animation to button and styles
    const searchButton = document.querySelector('button[onclick="runSearch()"]');
    const originalText = searchButton.textContent;
    searchButton.innerHTML = '⏳ Searching...';
    searchButton.style.background = 'linear-gradient(135deg, #6c757d, #858a91)';
    searchButton.disabled = true;

  // reset globals
  expectLowGlobal = null;
  expectHighGlobal = null;

    try {
      // Get auth token if user is logged in
      let headers = {};
      if (window.AuthModule && window.AuthModule.isAuthenticated()) {
        try {
          const supabase = window.AuthModule.getClient();
          if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`;
              console.log('[AUTH] Including JWT token in request');
            }
          }
        } catch (authError) {
          console.warn('[AUTH] Failed to get session token:', authError);
          // Continue without auth - endpoints support optional auth
        }
      }
      
      // Set up timeout and abort controller; also wire in the search-level controller
      // so a new search (or Clear) can cancel this request mid-flight.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      if (currentSearchController) {
        currentSearchController.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      const resp = await fetch(url, {
        signal: controller.signal,
        headers: headers
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errorText = await resp.text();
        
        // Check for subscription errors first
        if (resp.status === 429 || resp.status === 403) {
          try {
            const errorJson = JSON.parse(errorText);
            
            // Handle search limit exceeded (429)
            if (resp.status === 429 && errorJson.error?.code === 'SEARCH_LIMIT_EXCEEDED') {
              const limit = errorJson.error?.details?.limit || 5;
              if (window.SubscriptionManager) {
                SubscriptionManager.showSearchLimitBlocked(limit);
                // Also update usage indicator
                await SubscriptionManager.fetchUsageStats();
                SubscriptionManager.updateUsageIndicator();
              }
              return; // Exit early - don't show generic error
            }
            
            // Handle tier required (403)
            if (resp.status === 403 && errorJson.error?.code === 'TIER_REQUIRED') {
              const feature = errorJson.error?.details?.feature || 'this feature';
              const requiredTier = errorJson.error?.details?.required_tier || 'member';
              if (window.SubscriptionManager) {
                SubscriptionManager.showTierRequired(feature, requiredTier);
              }
              return; // Exit early
            }
            
            // Handle card limit exceeded (403)
            if (resp.status === 403 && errorJson.error?.code === 'CARD_LIMIT_EXCEEDED') {
              const count = errorJson.error?.details?.count || 50;
              const limit = errorJson.error?.details?.limit || 50;
              if (window.SubscriptionManager) {
                SubscriptionManager.showCardLimitBlocked(count, limit);
              }
              return; // Exit early
            }
          } catch (parseError) {
            console.warn('[SUBSCRIPTION] Could not parse error response:', parseError);
            // Fall through to generic error handling
          }
        }
        
        // Check for query length validation error (422)
        if (resp.status === 422) {
          try {
            const errorJson = JSON.parse(errorText);
            // Check if it's a string_too_long error for the query field
            if (errorJson.detail && Array.isArray(errorJson.detail)) {
              const queryLengthError = errorJson.detail.find(err =>
                err.type === 'string_too_long' &&
                err.loc?.includes('query')
              );
              
              if (queryLengthError) {
                const maxLength = queryLengthError.ctx?.max_length || 5000;
                const currentLength = queryLengthError.input?.length || 'unknown';
                throw new Error(
                  `Your search query is too long (${currentLength} characters, max ${maxLength}).\n\n` +
                  `Try:\n` +
                  `• Using a shorter base search term\n` +
                  `• Unchecking some filter options (lots, graded, autographs, etc.)\n` +
                  `• Using more specific keywords instead of many exclusions`
                );
              }
            }
          } catch (parseError) {
            // If it's not the Error we threw above, fall through to generic error
            if (parseError.message.includes('search query is too long')) {
              throw parseError;
            }
          }
        }
        
        // Generic error for other cases
        throw new Error(`Request failed (${resp.status}): ${errorText}`);
      }

      // Update loading stage - comps fetched, now fetching active
      updateSearchStage('stage-active');

      const data = await resp.json();
      if (data.detail) {
        throw new Error(data.detail);
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
    
    // Expose to window object for export functionality
    window.lastData = data;
    
    // DIAGNOSTIC: Check if data is being stored correctly
    console.log('[EXPORT DIAGNOSTIC] Data storage check:', {
        'lastData set': !!lastData,
        'window.lastData exists': !!window.lastData,
        'Are they same object': lastData === window.lastData
    });

    // Calculate Fair Market Value first
    console.log('[DEBUG] Calculating Fair Market Value...');
    console.log('[FMV DIAGNOSTIC] Sending items to /fmv:', {
        itemCount: data.items.length,
        firstItemSample: data.items[0] ? {
            item_id: data.items[0].item_id,
            title: data.items[0].title?.substring(0, 50),
            total_price: data.items[0].total_price,
            date_scraped: data.items[0].date_scraped,
            typeOfDateScraped: typeof data.items[0].date_scraped
        } : null
    });
    
    const fmvResp = await fetch('/fmv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: data.items })
    });
    
    console.log('[FMV DIAGNOSTIC] Response status:', fmvResp.status, fmvResp.ok);
    
    if (!fmvResp.ok) {
        const errorText = await fmvResp.text();
        console.error('[FMV ERROR] Status:', fmvResp.status);
        console.error('[FMV ERROR] Response text:', errorText);
        try {
            const errorJson = JSON.parse(errorText);
            console.error('[FMV ERROR] Parsed error:', errorJson);
            if (errorJson.detail && Array.isArray(errorJson.detail)) {
                console.error('[FMV ERROR] Validation errors:', errorJson.detail);
                errorJson.detail.forEach((err, idx) => {
                    console.error(`[FMV ERROR] Error ${idx}:`, {
                        location: err.loc,
                        message: err.msg,
                        type: err.type,
                        input: err.input
                    });
                });
            }
        } catch (e) {
            console.error('[FMV ERROR] Could not parse error as JSON');
        }
        throw new Error(`FMV calculation failed with status ${fmvResp.status}: ${errorText.substring(0, 200)}`);
    }
    
    const fmvData = await fmvResp.json();
    const marketValue = fmvData.market_value || fmvData.expected_high;
    console.log('[DEBUG] Calculated Market Value:', formatMoney(marketValue));

    // Perform second search for ACTIVE listings (no sold filter)
    console.log('[DEBUG] Performing second search for active listings...');
const activeUrl = url.replace('/comps?', '/active?');
console.log('[DEBUG] Active listings URL:', activeUrl);
console.log('[DEBUG] Market Value before active search:', formatMoney(marketValue));
    
    const activeController = new AbortController();
    const activeTimeoutId = setTimeout(() => activeController.abort(), 30000);
    if (currentSearchController) {
      currentSearchController.signal.addEventListener('abort', () => activeController.abort(), { once: true });
    }

    try {
        console.log('[DEBUG] Fetching active listings from:', activeUrl);

        // Reuse the same auth headers for active listings
        const secondResp = await fetch(activeUrl, {
            signal: activeController.signal,
            headers: headers
        });
        clearTimeout(activeTimeoutId);
        
        console.log('[DEBUG] Active listings response status:', secondResp.status, secondResp.ok);
        console.log('[DEBUG] Active listings response headers:', Object.fromEntries(secondResp.headers.entries()));
        
        if (!secondResp.ok) {
            const errorText = await secondResp.text();
            console.error('[DEBUG] Active listings request failed:', secondResp.status, errorText);
            
            // Check for query length validation error (422)
            if (secondResp.status === 422) {
                try {
                    const errorJson = JSON.parse(errorText);
                    // Check if it's a string_too_long error for the query field
                    if (errorJson.detail && Array.isArray(errorJson.detail)) {
                        const queryLengthError = errorJson.detail.find(err =>
                            err.type === 'string_too_long' &&
                            err.loc?.includes('query')
                        );
                        
                        if (queryLengthError) {
                            const maxLength = queryLengthError.ctx?.max_length || 5000;
                            const currentLength = queryLengthError.input?.length || 'unknown';
                            throw new Error(
                                `Your search query is too long (${currentLength} characters, max ${maxLength}).\n\n` +
                                `Try:\n` +
                                `• Using a shorter base search term\n` +
                                `• Unchecking some filter options (lots, graded, autographs, etc.)\n` +
                                `• Using more specific keywords instead of many exclusions`
                            );
                        }
                    }
                } catch (parseError) {
                    // If it's not the Error we threw above, fall through to generic error
                    if (parseError.message.includes('search query is too long')) {
                        throw parseError;
                    }
                }
            }
            
            // Try to parse error as JSON to get detail
            let errorDetail = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.detail) {
                    errorDetail = errorJson.detail;
                }
            } catch (e) {
                // Not JSON, use raw text
            }
            
            console.error('[DEBUG] Error detail:', errorDetail);
            throw new Error(`Active listings failed: ${errorDetail}`);
        }
        
        const secondData = await secondResp.json();
        
        console.log('[DEBUG] Active listings response:', {
            items_count: secondData.items ? secondData.items.length : 0,
            has_items: !!secondData.items,
            has_detail: !!secondData.detail,
            first_item_sample: secondData.items && secondData.items[0] ? {
                item_id: secondData.items[0].item_id,
                title: secondData.items[0].title?.substring(0, 50),
                extracted_price: secondData.items[0].extracted_price,
                total_price: secondData.items[0].total_price
            } : null
        });
        
        if (secondData.detail) {
            console.error('[DEBUG] Second search error:', secondData.detail);
        }
        
        console.log('[DEBUG] Passing to renderData - marketValue:', formatMoney(marketValue), 'active items:', secondData.items ? secondData.items.length : 0);
        console.log('[DEBUG] secondData full object:', {
            hasItems: !!secondData.items,
            itemCount: secondData.items?.length || 0,
            firstItemSample: secondData.items?.[0] ? {
                item_id: secondData.items[0].item_id,
                total_price: secondData.items[0].total_price,
                extracted_price: secondData.items[0].extracted_price,
                extracted_shipping: secondData.items[0].extracted_shipping
            } : null
        });

        updateSearchStage('stage-ai');
        await renderData(data, secondData, marketValue);
    } catch (error) {
        console.error('[DEBUG] Active listings fetch failed:', error);
        if (error.name === 'AbortError') return; // New search started — bail out silently
        // Still render the sold data even if active listings fail
        await renderData(data, null, marketValue);
    }
    // Store prices for resize handling (using first search results)
    currentBeeswarmPrices = data.items.map(item => item.total_price);
    
    // Update usage statistics after successful search
    if (window.SubscriptionManager) {
      await SubscriptionManager.fetchUsageStats();
      SubscriptionManager.updateUsageIndicator();
    }

    } catch (err) {
      if (err.name === 'AbortError') return; // User started a new search or clicked Clear — bail out silently
      const errorHtml = `
        <div class="error-container">
          <div class="error-icon">⚠️</div>
          <div class="error-content">
            <h4>Search Failed</h4>
            <p>${escapeHtml(err.message)}</p>
          </div>
        </div>
      `;
      document.getElementById("results").innerHTML = errorHtml;
      document.getElementById("stats-container").innerHTML = "";
      
      // Clear Analysis tab loading state on error
      const analysisContainer = document.getElementById("analysis-subtab");
      if (analysisContainer) {
        analysisContainer.innerHTML = `
          <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
            <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📊 Market Analysis</h3>
            <p style="margin: 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto;">Run a search to see advanced market analytics and insights</p>
          </div>
        `;
      }
      
      lastData = null;
      window.lastData = null; // Clear window reference on error
      console.error('[ERROR] Search failed:', err);
    } finally {
      // Clear progress timer
      clearInterval(progressInterval);
      // Complete progress bar
      const barEl = document.getElementById('search-progress-bar');
      if (barEl) barEl.style.width = '100%';
      // Restore button state
      searchButton.textContent = originalText;
      searchButton.style.background = 'var(--gradient-primary)';
      searchButton.disabled = false;
    }
  } catch (error) {
    showError(error.message);
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

// ============================================================================
// HELPER FUNCTIONS FOR MARKET ASSESSMENT MESSAGES
// ============================================================================

/**
 * Generate confidence statement based on market confidence score and sample size
 */
function getConfidenceStatement(confidence, sampleSize) {
    if (confidence >= 85) {
        return `Excellent price consistency (${confidence}/100) based on ${sampleSize} listings`;
    } else if (confidence >= 70) {
        return `Good price consistency (${confidence}/100) based on ${sampleSize} listings`;
    } else if (confidence >= 55) {
        return `Moderate price variation (${confidence}/100) based on ${sampleSize} listings`;
    } else if (confidence >= 40) {
        return `High price variation (${confidence}/100) based on ${sampleSize} listings`;
    } else if (confidence >= 25) {
        return `⚠️ Very high price scatter (${confidence}/100) - consider refining search`;
    } else {
        return `⚠️ Market chaos (${confidence}/100) - data unreliable`;
    }
}

/**
 * Generate dominant band statement showing where most activity occurs
 * Now uses plain language instead of technical absorption ratio
 */
function getDominantBandStatement(below, at, above, absBelow, absAt, absAbove, salesBelow, salesAt, salesAbove) {
    const total = below + at + above;
    if (total === 0) return '';
    
    // Find where most volume is
    const maxListings = Math.max(below, at, above);
    let location = '';
    let absorption = 0;
    let sales = 0;
    let listings = 0;
    
    if (below === maxListings) {
        location = 'below FMV';
        absorption = absBelow !== 'N/A' ? parseFloat(absBelow) : 0;
        sales = salesBelow || 0;
        listings = below;
    } else if (at === maxListings) {
        location = 'at FMV';
        absorption = absAt !== 'N/A' ? parseFloat(absAt) : 0;
        sales = salesAt || 0;
        listings = at;
    } else {
        location = 'above FMV';
        absorption = absAbove !== 'N/A' ? parseFloat(absAbove) : 0;
        sales = salesAbove || 0;
        listings = above;
    }
    
    // Plain language version with actual numbers
    if (absorption >= 1.5) {
        return `Most activity ${location} — ${sales} recent sales vs ${listings} current listings (selling very fast)`;
    } else if (absorption >= 0.5) {
        return `Most activity ${location} — ${sales} recent sales vs ${listings} current listings (normal pace)`;
    } else if (absorption > 0) {
        return `Most activity ${location} — ${sales} recent sales vs ${listings} current listings (selling slowly)`;
    } else {
        return `Most activity ${location} — ${listings} current listings, no recent sales data`;
    }
}

/**
 * Generate velocity statement for sell time estimates
 */
function getVelocityStatement(absorptionRatio, scenario) {
    if (absorptionRatio === 'N/A' || absorptionRatio < 0) return '';
    
    const ratio = parseFloat(absorptionRatio);
    if (ratio >= 1.5) return `${scenario}: Selling within days at current demand`;
    if (ratio >= 0.8) return `${scenario}: 1-2 week sell time expected`;
    if (ratio >= 0.4) return `${scenario}: 3-4 weeks to sell`;
    return `${scenario}: 4+ weeks expected (slow absorption)`;
}

/**
 * Render price tier badge showing which tier this card is in
 */
function renderPriceTierBadge(tier) {
    if (!tier || !tier.tier_name) {
        return '';
    }
    
    const priceSourceLabel = tier.price_source === 'fmv'
        ? 'Fair Market Value'
        : 'Average Listing Price';
    
    return `
        <div style="display: inline-flex; align-items: center; gap: 0.5rem;
                    background: ${tier.tier_color}15;
                    padding: 0.5rem 1rem;
                    border-radius: 8px;
                    border: 1px solid ${tier.tier_color}40;
                    margin-bottom: 1rem;">
            <span style="font-size: 1.25rem;">${tier.tier_emoji}</span>
            <strong style="color: ${tier.tier_color};">${tier.tier_name}</strong>
            <span style="font-size: 0.8rem; color: #666;">
                (Based on ${priceSourceLabel})
            </span>
        </div>
    `;
}

/**
 * Render persona-specific advice from API message or JSON content
 * Handles both string format (from API) and array format (from JSON)
 */
function renderPersonaAdvice(advice) {
    if (!advice) {
        return '';
    }
    
    // Check if we have any advice to display
    const hasCollector = advice.collector && (Array.isArray(advice.collector) ? advice.collector.length > 0 : true);
    const hasSeller = advice.seller && (Array.isArray(advice.seller) ? advice.seller.length > 0 : true);
    const hasFlipper = advice.flipper && (Array.isArray(advice.flipper) ? advice.flipper.length > 0 : true);
    const hasBuyer = advice.buyer;
    const hasInvestor = advice.investor;
    
    if (!hasCollector && !hasSeller && !hasFlipper && !hasBuyer && !hasInvestor) {
        return '';
    }
    
    let html = '<div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.1);">';
    
    // 1. Long-term Collector (collector or buyer)
    if (hasCollector) {
        const collectorAdvice = Array.isArray(advice.collector) ? advice.collector : [advice.collector];
        html += `
            <details style="margin-bottom: 0.5rem; border: 1px solid rgba(0, 122, 255, 0.2); border-radius: 6px; background: rgba(0, 122, 255, 0.05);">
                <summary style="padding: 0.75rem; cursor: pointer; font-weight: 600; color: #007aff; font-size: 0.9rem; user-select: none; list-style: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(0, 122, 255, 0.1)'" onmouseout="this.style.background='transparent'">
                    <span style="display: inline-block; margin-right: 0.5rem; transition: transform 0.2s;">▶</span> Long-term Collector
                </summary>
                <ul style="margin: 0 0 0.75rem 0; padding: 0.5rem 1rem 0.5rem 2.5rem; font-size: 0.85rem; color: #333; line-height: 1.5;">
                    ${collectorAdvice.map(tip => `<li style="margin-bottom: 0.25rem;">${tip}</li>`).join('')}
                </ul>
            </details>
        `;
    } else if (hasBuyer) {
        html += `
            <details style="margin-bottom: 0.5rem; border: 1px solid rgba(0, 122, 255, 0.2); border-radius: 6px; background: rgba(0, 122, 255, 0.05);">
                <summary style="padding: 0.75rem; cursor: pointer; font-weight: 600; color: #007aff; font-size: 0.9rem; user-select: none; list-style: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(0, 122, 255, 0.1)'" onmouseout="this.style.background='transparent'">
                    <span style="display: inline-block; margin-right: 0.5rem; transition: transform 0.2s;">▶</span> Long-term Collector
                </summary>
                <p style="margin: 0; padding: 0.5rem 1rem 0.75rem 1rem; font-size: 0.85rem; color: #333; line-height: 1.5;">${advice.buyer}</p>
            </details>
        `;
    }
    
    // 2. Short-term Flipper (flipper or investor)
    if (hasFlipper) {
        const flipperAdvice = Array.isArray(advice.flipper) ? advice.flipper : [advice.flipper];
        html += `
            <details style="margin-bottom: 0.5rem; border: 1px solid rgba(88, 86, 214, 0.2); border-radius: 6px; background: rgba(88, 86, 214, 0.05);">
                <summary style="padding: 0.75rem; cursor: pointer; font-weight: 600; color: #5856d6; font-size: 0.9rem; user-select: none; list-style: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(88, 86, 214, 0.1)'" onmouseout="this.style.background='transparent'">
                    <span style="display: inline-block; margin-right: 0.5rem; transition: transform 0.2s;">▶</span> Short-term Flipper
                </summary>
                <ul style="margin: 0 0 0.75rem 0; padding: 0.5rem 1rem 0.5rem 2.5rem; font-size: 0.85rem; color: #333; line-height: 1.5;">
                    ${flipperAdvice.map(tip => `<li style="margin-bottom: 0.25rem;">${tip}</li>`).join('')}
                </ul>
            </details>
        `;
    } else if (hasInvestor) {
        html += `
            <details style="margin-bottom: 0.5rem; border: 1px solid rgba(88, 86, 214, 0.2); border-radius: 6px; background: rgba(88, 86, 214, 0.05);">
                <summary style="padding: 0.75rem; cursor: pointer; font-weight: 600; color: #5856d6; font-size: 0.9rem; user-select: none; list-style: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(88, 86, 214, 0.1)'" onmouseout="this.style.background='transparent'">
                    <span style="display: inline-block; margin-right: 0.5rem; transition: transform 0.2s;">▶</span> Short-term Flipper
                </summary>
                <p style="margin: 0; padding: 0.5rem 1rem 0.75rem 1rem; font-size: 0.85rem; color: #333; line-height: 1.5;">${advice.investor}</p>
            </details>
        `;
    }
    
    // 3. Seller
    if (hasSeller) {
        const sellerAdvice = Array.isArray(advice.seller) ? advice.seller : [advice.seller];
        html += `
            <details style="margin-bottom: 0.5rem; border: 1px solid rgba(52, 199, 89, 0.2); border-radius: 6px; background: rgba(52, 199, 89, 0.05);">
                <summary style="padding: 0.75rem; cursor: pointer; font-weight: 600; color: #34c759; font-size: 0.9rem; user-select: none; list-style: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(52, 199, 89, 0.1)'" onmouseout="this.style.background='transparent'">
                    <span style="display: inline-block; margin-right: 0.5rem; transition: transform 0.2s;">▶</span> Seller
                </summary>
                <ul style="margin: 0 0 0.75rem 0; padding: 0.5rem 1rem 0.5rem 2.5rem; font-size: 0.85rem; color: #333; line-height: 1.5;">
                    ${sellerAdvice.map(tip => `<li style="margin-bottom: 0.25rem;">${tip}</li>`).join('')}
                </ul>
            </details>
        `;
    }
    
    html += '</div>';
    return html;
}

/**
 * Render market assessment using API response
 */
function renderMarketAssessmentFromAPI(apiResponse, priceBands, data, activeData, marketConfidence) {
    const { tier, message } = apiResponse;
    const dataQualityScore = calculateDataQuality(data.items.length, activeData?.items?.length || 0, marketConfidence);
    
    // Get gradient/border from message color
    const colorMap = {
        '#ff3b30': { gradient: 'linear-gradient(135deg, #ffebee 0%, #fff5f5 100%)', border: '#ff9999' },
        '#ff9500': { gradient: 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)', border: '#ffd699' },
        '#5856d6': { gradient: 'linear-gradient(135deg, #f0e6ff 0%, #f5f0ff 100%)', border: '#d6b3ff' },
        '#34c759': { gradient: 'linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%)', border: '#99ff99' },
        '#007aff': { gradient: 'linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%)', border: '#99daff' }
    };
    
    const styling = colorMap[message.color] || colorMap['#007aff'];
    
    // Store tier globally for liquidity popup
    window.currentPriceTier = tier;
    currentPriceTier = tier;
    
    return `
        <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
            <h4 style="margin-top: 0; margin-bottom: 1.5rem; color: var(--text-color);">Market Assessment</h4>
            
            ${renderPriceTierBadge(tier)}
            
            <div style="background: ${styling.gradient}; padding: 1.5rem; border-radius: 12px; border-left: 4px solid ${styling.border};">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <span style="font-size: 2rem;">${message.icon}</span>
                    <strong style="font-size: 1.1rem; color: ${message.color};">${message.title}</strong>
                </div>
                <p style="margin: 0; font-size: 0.95rem; color: #333; line-height: 1.6;">
                    ${message.content}
                </p>
                ${renderPersonaAdvice(message.advice)}
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.8rem; color: #666;">
                    <strong>Data Quality Score:</strong> ${dataQualityScore}/100<br>
                    <strong>Activity:</strong> ${getDominantBandStatement(priceBands.belowFMV, priceBands.atFMV, priceBands.aboveFMV, priceBands.absorptionBelow, priceBands.absorptionAt, priceBands.absorptionAbove, priceBands.salesBelow, priceBands.salesAt, priceBands.salesAbove)}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render fallback Market Assessment when API is unavailable
 * Uses basic heuristics for market condition assessment
 */
function renderFallbackMarketAssessment(marketPressure, liquidityRisk, priceBands, marketConfidence, data, activeData) {
    console.log('[FALLBACK ASSESSMENT] Called with:', {
        marketPressure,
        liquidityRisk: liquidityRisk?.score || null,
        marketConfidence,
        hasPriceBands: !!priceBands,
        hasData: !!data,
        hasActiveData: !!activeData
    });
    
    if (marketPressure === null || !liquidityRisk || liquidityRisk.score === null) {
        console.log('[FALLBACK ASSESSMENT] Missing required data, returning empty');
        return '';
    }
    
    const dataQualityScore = calculateDataQuality(data.items.length, activeData?.items?.length || 0, marketConfidence);
    const liquidityScore = liquidityRisk.score || 0;
    
    // Extract all price band data including sales counts
    const { belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove, salesBelow, salesAt, salesAbove } = priceBands;
    
    // Determine message and advice based on simple heuristics
    let icon, title, message, color, gradient, border, advice;
    
    // High risk conditions
    if (marketPressure > 30 && liquidityScore < 50) {
        icon = '🚨';
        title = 'High Risk Market Conditions';
        color = '#ff3b30';
        gradient = 'linear-gradient(135deg, #ffe6e6 0%, #fff0f0 100%)';
        border = '#ffb3b3';
        message = `Sellers are asking ${marketPressure.toFixed(1)}% above Fair Market Value, but buyer demand is limited (liquidity: ${liquidityScore}/100). Consider waiting for better conditions or looking elsewhere.`;
        advice = {
            collector: ['Waiting often pays off here.', 'Markets like this tend to cool down.', 'Patience can lead to better entry prices later.'],
            seller: ['This is a tough environment to sell in.', 'Expect slow sales or price drops.', 'If you need to sell, pricing below the crowd helps.'],
            flipper: ['This is usually a bad setup.', 'High prices plus low demand leave little room for profit.', 'Better opportunities exist elsewhere.']
        };
    }
    // Overpriced but active
    else if (marketPressure > 30 && liquidityScore >= 50) {
        icon = '🔥';
        title = 'Overpriced but Active Market';
        color = '#ff9500';
        gradient = 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)';
        border = '#ffd699';
        message = `Asking prices are ${marketPressure.toFixed(1)}% above Fair Market Value, but strong liquidity (${liquidityScore}/100) suggests buyers are accepting higher prices. Market is hot but expensive.`;
        advice = {
            collector: ['You\'re paying extra to get a card immediately.', 'If you don\'t need the card now, waiting is usually safer.', 'Great cards often come back down once hype fades.'],
            seller: ['This is a strong selling window.', 'Buyers are accepting higher prices right now.', 'Consider selling while demand is hot.'],
            flipper: ['Flips are possible, but timing matters.', 'You need to buy and resell quickly.', 'Miss the timing, and you risk holding overpriced inventory.']
        };
    }
    // Good buying opportunity
    else if (marketPressure < 0 && liquidityScore >= 50) {
        icon = '💎';
        title = 'Strong Buy Opportunity';
        color = '#34c759';
        gradient = 'linear-gradient(135deg, #e6f7ed 0%, #f0faf4 100%)';
        border = '#99e6b8';
        message = `Cards are priced ${Math.abs(marketPressure).toFixed(1)}% below Fair Market Value with strong recent sales activity (market activity: ${liquidityScore}/100). This is a favorable buying opportunity.`;
        advice = {
            collector: ['This is one of the better times to buy if you\'re optimistic about the player\'s potential', 'You\'re entering below fair value in a market with active recent sales.', 'Acting sooner usually beats waiting in conditions like this.'],
            seller: ['Current asks are below recent sales — pricing at or near fair value is well-supported by market data.', 'Consider pricing closer to fair value to benefit from the gap.', 'If you\'re listing now, pricing closer to fair value—or just above it—is reasonable.'],
            flipper: ['This is an excellent setup.', 'Buy at current prices before sellers adjust to the gap.', 'Delays matter here — once sellers reprice, margins shrink.']
        };
    }
    // Healthy market
    else if (marketPressure >= 0 && marketPressure <= 15 && liquidityScore >= 50) {
        icon = '✅';
        title = 'Healthy Market Conditions';
        color = '#34c759';
        gradient = 'linear-gradient(135deg, #e6f7ed 0%, #f0faf4 100%)';
        border = '#99e6b8';
        message = `Fair pricing (${marketPressure.toFixed(1)}% vs FMV) with good liquidity (${liquidityScore}/100). Balanced market conditions for both buyers and sellers.`;
        advice = {
            collector: ['A comfortable, low-stress time to buy.', 'You\'re unlikely to overpay or miss out by waiting briefly.', 'Buy based on preference, not fear of price movement.'],
            seller: ['Fair pricing is being rewarded with steady sales.', 'No need to overthink timing—this is a good environment to list.', 'Well-presented listings should move at reasonable prices.'],
            flipper: ['Opportunities exist, but they\'re not automatic.', 'Profits depend on buying well, not on market imbalance.', 'Focus on small edges rather than big swings.']
        };
    }
    // Fair pricing, limited demand
    else if (marketPressure >= 0 && marketPressure <= 15 && liquidityScore < 50) {
        icon = '⚡';
        title = 'Fair Pricing, Limited Demand';
        color = '#ff9500';
        gradient = 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)';
        border = '#ffd699';
        message = `Prices are reasonable (${marketPressure.toFixed(1)}% vs FMV), but demand is moderate (liquidity: ${liquidityScore}/100). Sales may be slower than usual.`;
        advice = {
            collector: ['This can be a great quiet buying opportunity.', 'Fair prices without hype often age well.', 'Especially attractive for iconic or historically stable cards.'],
            seller: ['Slow sales are likely, even at fair prices.', 'If you want quicker action, slight discounts can help.', 'Otherwise, patience is required.'],
            flipper: ['Not ideal for quick flips.', 'Even good deals may take time to resell.', 'Only buy if you expect a future catalyst.']
        };
    }
    // Balanced/neutral
    else {
        icon = '📊';
        title = 'Balanced Market';
        color = '#007aff';
        gradient = 'linear-gradient(135deg, #e6f2ff 0%, #f0f7ff 100%)';
        border = '#99c9ff';
        message = `Market pressure at ${marketPressure.toFixed(1)}% with liquidity score of ${liquidityScore}/100. Standard market conditions.`;
        advice = {
            collector: [],
            seller: [],
            flipper: []
        };
    }
    
    const html = `
        <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
            <h4 style="margin-top: 0; margin-bottom: 1.5rem; color: var(--text-color);">Market Assessment</h4>
            
            <div style="background: ${gradient}; padding: 1.5rem; border-radius: 12px; border-left: 4px solid ${border};">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <span style="font-size: 2rem;">${icon}</span>
                    <strong style="font-size: 1.1rem; color: ${color};">${title}</strong>
                </div>
                <p style="margin: 0; font-size: 0.95rem; color: #333; line-height: 1.6;">
                    ${message}
                </p>
                ${renderPersonaAdvice(advice)}
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.8rem; color: #666;">
                    <strong>Data Quality Score:</strong> ${dataQualityScore}/100<br>
                    <strong>Activity:</strong> ${getDominantBandStatement(belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove, salesBelow, salesAt, salesAbove)}
                </div>
            </div>
        </div>
    `;
    
    console.log('[FALLBACK ASSESSMENT] Generated HTML length:', html.length, 'chars');
    return html;
}

/**
 * Render market assessment with tier-based messaging
 * Calls API for tier-specific messages, falls back to hardcoded logic
 */
async function renderMarketAssessment(marketPressure, liquidityRisk, priceBands, marketConfidence, data, activeData) {
    if (marketPressure === null || !liquidityRisk || liquidityRisk.score === null) {
        return '';
    }
    
    const { belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove, salesBelow, salesAt, salesAbove } = priceBands;
    
    // Try to fetch tier-specific message from backend
    const apiResponse = await fetchTierMarketMessage({
        fmv: marketValueGlobal,
        avg_listing_price: activeData?.avg_price || null,
        market_pressure: marketPressure,
        liquidity_score: liquidityRisk.score,
        market_confidence: marketConfidence,
        absorption_below: parseFloat(absorptionBelow) || null,
        absorption_above: parseFloat(absorptionAbove) || null,
        below_fmv_count: belowFMV,
        above_fmv_count: aboveFMV,
        sales_below: salesBelow,
        sales_above: salesAbove
    });
    
    // Use API response if available
    if (apiResponse && apiResponse.message) {
        return renderMarketAssessmentFromAPI(apiResponse, priceBands, data, activeData, marketConfidence);
    }
    
    // FALLBACK: Generate basic Market Assessment when API fails
    console.log('[TIER MESSAGE] Using fallback hardcoded assessment');
    return renderFallbackMarketAssessment(marketPressure, liquidityRisk, priceBands, marketConfidence, data, activeData);
}

/**
 * Fetch tier-specific market message from backend API
 * @param {Object} params - Market metrics
 * @returns {Promise} API response with tier and message data
 */
async function fetchTierMarketMessage(params) {
    try {
        const payload = {
            fmv: params.fmv || null,
            avg_listing_price: params.avg_listing_price || null,
            market_pressure: params.market_pressure || 0,
            liquidity_score: params.liquidity_score || 0,
            market_confidence: params.market_confidence || 0,
            absorption_below: params.absorption_below || null,
            absorption_above: params.absorption_above || null,
            below_fmv_count: params.below_fmv_count || 0,
            above_fmv_count: params.above_fmv_count || 0,
            sales_below: params.sales_below || 0,
            sales_above: params.sales_above || 0
        };
        
        if (window.DEBUG_MODE.API) {
            console.log('[TIER MESSAGE] Fetching with params:', params);
            console.log('[TIER MESSAGE] Payload:', payload);
        }
        
        const response = await fetch('/market-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            // Parse 400 response body for better error messages
            if (response.status === 400) {
                try {
                    const errorData = await response.json();
                    console.warn('[TIER MESSAGE] Bad request (400):', errorData);
                    return null; // Fallback to hardcoded logic
                } catch (parseError) {
                    console.warn('[TIER MESSAGE] Bad request (400), could not parse error body');
                    return null;
                }
            }
            console.warn('[TIER MESSAGE] API returned non-OK status:', response.status);
            return null;
        }
        
        const data = await response.json();
        if (window.DEBUG_MODE.API) {
            console.log('[TIER MESSAGE] Received:', data);
        }
        
        return data;
    } catch (error) {
        console.warn('[TIER MESSAGE] Request failed, using fallback:', error.message);
        // Return null to allow fallback to current hardcoded logic
        return null;
    }
}

// Render Analytics Dashboard for the Analysis sub-tab
async function renderAnalysisDashboard(data, fmvData, activeData) {
    console.log('[renderAnalysisDashboard] Function called with parameters:', {
        hasData: !!data,
        hasFmvData: !!fmvData,
        hasActiveData: !!activeData,
        activeDataType: typeof activeData,
        activeDataKeys: activeData ? Object.keys(activeData) : [],
        activeDataItemsCount: activeData?.items?.length || 0
    });
    
    const analysisContainer = document.getElementById("analysis-subtab");
    
    if (!data || !data.items || data.items.length === 0) {
        // Reset chart data so stale data from a previous search doesn't persist
        lastChartData.soldData = null;
        lastChartData.activeData = null;
        analysisContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📊 Market Analysis</h3>
                <p style="margin: 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto;">Run a search to see advanced market analytics and insights</p>
            </div>
        `;
        return;
    }
    
    // Calculate analytics metrics
    const prices = data.items.map(item => item.total_price).filter(p => p > 0);
    const priceRange = data.max_price - data.min_price;
    const priceSpread = priceRange / data.avg_price * 100; // Volatility percentage
    
    // Market confidence — prefer backend, fallback to client-side
    const backendScores = window.backendAnalyticsScores;
    let stdDev, coefficientOfVariation, marketConfidence;
    if (backendScores && backendScores.confidence && backendScores.confidence.score != null) {
        marketConfidence = backendScores.confidence.score;
        coefficientOfVariation = backendScores.confidence.cov || 0;
        stdDev = 0; // not needed when using backend
    } else {
        stdDev = calculateStdDev(prices);
        coefficientOfVariation = (stdDev / data.avg_price) * 100;
        marketConfidence = Math.round(100 / (1 + coefficientOfVariation / 100));
    }
    
    // FMV vs Average comparison
    const marketValue = fmvData?.market_value || data.avg_price;
    const quickSale = fmvData?.quick_sale || fmvData?.expected_low || marketValue * 0.85;
    const patientSale = fmvData?.patient_sale || fmvData?.expected_high || marketValue * 1.15;
    const fmvVsAvg = ((marketValue - data.avg_price) / data.avg_price * 100);

    // --- Ask-side statistics from active listings ---
    const askPricesRaw = (activeData?.items || [])
        .map(item => item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0)))
        .filter(p => p > 0)
        .sort((a, b) => a - b);
    const askCount = askPricesRaw.length;
    const askP10     = askCount >= 2 ? askPricesRaw[Math.max(0, Math.floor(askCount * 0.1))]           : (askCount === 1 ? askPricesRaw[0] : null);
    const askMedian  = askCount >= 1 ? askPricesRaw[Math.floor(askCount / 2)]                           : null;
    const askP90     = askCount >= 2 ? askPricesRaw[Math.min(askCount - 1, Math.floor(askCount * 0.9))] : (askCount === 1 ? askPricesRaw[0] : null);

    // Price gap (ask median vs FMV market value)
    const spreadAmount = (askMedian != null && marketValue) ? askMedian - marketValue : null;
    const spreadPct    = (spreadAmount != null && marketValue) ? (spreadAmount / marketValue) * 100 : null;
    let spreadSignal, spreadColor;
    if (spreadPct === null) {
        spreadSignal = 'No active listings to compare'; spreadColor = '#8e8e93';
    } else if (spreadPct < 0) {
        spreadSignal = 'Sellers are asking less than recent sales'; spreadColor = '#34c759';
    } else if (spreadPct <= 10) {
        spreadSignal = 'Sellers and buyers agree on price'; spreadColor = '#34c759';
    } else if (spreadPct <= 25) {
        spreadSignal = 'Sellers are asking a bit more than recent sales'; spreadColor = '#ff9500';
    } else if (spreadPct <= 50) {
        spreadSignal = 'Sellers are asking significantly more than recent sales'; spreadColor = '#ff6d00';
    } else {
        spreadSignal = 'Sellers are asking much more than recent sales'; spreadColor = '#ff3b30';
    }

    // --- Collectibility Score (1-10) — prefer backend, fallback to client-side ---
    const soldCount   = data.items.length;
    const activeCount = activeData?.items?.length || 0;
    let collectibilityScore;
    if (backendScores && backendScores.collectibility && backendScores.collectibility.score != null) {
        collectibilityScore = backendScores.collectibility.score;
    } else {
        collectibilityScore = (() => {
            const priceScore  = marketValue <= 5 ? 1 : marketValue <= 100 ? 2 : marketValue <= 1000 ? 4 : 6;
            const volumeScore = soldCount >= 50 ? 4 : soldCount >= 20 ? 3 : soldCount >= 5 ? 1 : 0;
            return Math.max(1, Math.min(10, priceScore + volumeScore));
        })();
    }
    const collectibilityTier =
        collectibilityScore <= 2 ? { label: 'Bulk',               color: '#8e8e93', bg: 'linear-gradient(135deg, #f5f5f7 0%, #e5e5ea 100%)', border: '#c7c7cc' }
      : collectibilityScore <= 4 ? { label: 'Common',             color: '#636366', bg: 'linear-gradient(135deg, #f5f5f7 0%, #eaeaea 100%)', border: '#c7c7cc' }
      : collectibilityScore <= 6 ? { label: 'Sought After',       color: '#c85c00', bg: 'linear-gradient(135deg, #fff8e6 0%, #fff0cc 100%)', border: '#ffd059' }
      : collectibilityScore <= 8 ? { label: 'Highly Collectible', color: '#1a7a35', bg: 'linear-gradient(135deg, #e6f9ed 0%, #ccf2d8 100%)', border: '#5dd879' }
      :                            { label: 'Blue Chip',           color: '#0051cc', bg: 'linear-gradient(135deg, #e6f0ff 0%, #cce0ff 100%)', border: '#4da3ff' };
    const collectibilityScenario = (() => {
        const highFMV    = marketValue > 100;
        const highVolume = soldCount >= 20;
        if ( highFMV &&  highVolume) return 'Blue chip — high value with an established, active market';
        if ( highFMV && !highVolume) return 'High-value card with limited market depth';
        if (!highFMV &&  highVolume) return 'Popular card — broad collector base, high turnover';
        return 'Minimal collector interest';
    })();

    // Calculate Market Pressure % — prefer backend, fallback to client-side
    let marketPressure = null;
    let medianAskingPrice = null;
    let marketPressureLabel = null;
    let marketPressureColor = null;
    let marketPressureGradient = null;
    let marketPressureBorder = null;
    let sampleSize = 0;

    if (backendScores && backendScores.pressure && backendScores.pressure.pressure_pct != null) {
        // Use backend-computed pressure
        marketPressure = backendScores.pressure.pressure_pct;
        medianAskingPrice = backendScores.pressure.median_ask;
        sampleSize = backendScores.pressure.sample_size || 0;
    } else if (activeData && activeData.items && activeData.items.length > 0) {
        // Client-side fallback
        const sellerPrices = {};
        activeData.items.forEach(item => {
            const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
            const sellerName = item.seller?.name || `unknown_${item.item_id}`;
            if (price > 0) {
                if (!sellerPrices[sellerName]) sellerPrices[sellerName] = [];
                sellerPrices[sellerName].push(price);
            }
        });
        let askingPrices = Object.values(sellerPrices).map(prices => {
            const sorted = prices.sort((a, b) => a - b);
            return sorted[Math.floor(sorted.length / 2)];
        });
        if (askingPrices.length >= 4) {
            askingPrices = filterOutliers(askingPrices);
        }
        sampleSize = askingPrices.length;
        if (askingPrices.length > 0) {
            medianAskingPrice = calculateWeightedMedian(askingPrices);
            marketPressure = ((medianAskingPrice - marketValue) / marketValue) * 100;
        }
    }

    // Assign plain-English label based on pressure value
    if (marketPressure != null) {
        if (Math.abs(marketPressure) <= 1) {
            marketPressureLabel = 'Asking prices match recent sales.';
        } else if (marketPressure > 1 && marketPressure <= 15) {
            marketPressureLabel = 'Sellers are asking slightly above recent sales prices.';
        } else if (marketPressure > 15 && marketPressure <= 30) {
            marketPressureLabel = 'Sellers are asking noticeably more than recent sales.';
        } else if (marketPressure > 30 && marketPressure <= 50) {
            marketPressureLabel = 'Sellers are asking significantly more than recent sales.';
        } else if (marketPressure > 50) {
            marketPressureLabel = 'Sellers are asking far above what this card has actually sold for.';
        } else if (marketPressure < -1 && marketPressure >= -15) {
            marketPressureLabel = 'Sellers are asking slightly below recent sales prices.';
        } else {
            marketPressureLabel = 'Sellers are asking well below recent sales prices.';
        }
        marketPressureColor = '#5856d6';
        marketPressureGradient = 'linear-gradient(135deg, #f0eeff 0%, #e0dcff 100%)';
        marketPressureBorder = '#b8b0ff';
    }
    
    // Price distribution quartiles
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const q1 = sortedPrices[Math.floor(sortedPrices.length * 0.25)];
    const median = sortedPrices[Math.floor(sortedPrices.length * 0.5)];
    const q3 = sortedPrices[Math.floor(sortedPrices.length * 0.75)];
    
    // Calculate Liquidity Risk Score — prefer backend, fallback to client-side
    let liquidityRisk = null;
    if (backendScores && backendScores.liquidity && backendScores.liquidity.score != null) {
        const liq = backendScores.liquidity;
        const liqScore = liq.score;
        let statusColor, gradient, border, message, label;
        label = liq.label;
        if (liqScore >= 80) {
            statusColor = '#34c759'; gradient = 'linear-gradient(135deg, #e6ffe6 0%, #ccffcc 100%)'; border = '#99ff99';
            message = 'Recent sales are outpacing active listings — strong buyer activity';
        } else if (liqScore >= 50) {
            statusColor = '#007aff'; gradient = 'linear-gradient(135deg, #e6f7ff 0%, #ccedff 100%)'; border = '#99daff';
            message = 'Balanced market — sales activity and supply are reasonably matched';
        } else if (liqScore >= 25) {
            statusColor = '#ff9500'; gradient = 'linear-gradient(135deg, #fff5e6 0%, #ffe8cc 100%)'; border = '#ffd699';
            message = 'Active listings outnumber recent sales — buyers have plenty of options';
        } else {
            statusColor = '#ff3b30'; gradient = 'linear-gradient(135deg, #ffebee 0%, #ffcccc 100%)'; border = '#ff9999';
            message = 'Very few recent buyers relative to current supply — a thin market';
        }
        const salesCount = liq.weighted_sold != null ? Math.round(liq.weighted_sold) : (data?.items?.length || 0);
        const listingsCount = liq.bin_active || 0;
        const confidence = salesCount >= 10 && listingsCount >= 10 ? 'High' : salesCount >= 5 && listingsCount >= 5 ? 'Medium' : 'Low';
        liquidityRisk = {
            score: liqScore, label, absorptionRatio: liq.absorption_ratio,
            salesCount, listingsCount, confidence, statusColor, gradient, border, message
        };
    } else {
        try {
            liquidityRisk = calculateLiquidityRisk(data, activeData);
        } catch (error) {
            console.error('[LIQUIDITY RISK] Error calculating (non-blocking):', error);
            liquidityRisk = {
                score: null, label: 'Calculation Error', absorptionRatio: null,
                salesCount: data?.items?.length || 0, listingsCount: 0, confidence: 'N/A',
                statusColor: '#6e6e73', gradient: 'linear-gradient(135deg, #f5f5f7 0%, #e5e5ea 100%)',
                border: '#d1d1d6', message: 'Unable to calculate liquidity risk'
            };
        }
    }
    
    // Calculate price band data early for use in market assessment messages
    let belowFMV = 0, atFMV = 0, aboveFMV = 0;
    let salesBelow = 0, salesAt = 0, salesAbove = 0;
    let absorptionBelow = 'N/A', absorptionAt = 'N/A', absorptionAbove = 'N/A';
    
    if (activeData && activeData.items && activeData.items.length > 0) {
        belowFMV = activeData.items.filter(item => {
            const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
            const buyingFormat = (item.buying_format || '').toLowerCase();
            return price > 0 && price < marketValue * 0.9 && buyingFormat.includes('buy it now');
        }).length;
        
        atFMV = activeData.items.filter(item => {
            const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
            const buyingFormat = (item.buying_format || '').toLowerCase();
            return price >= marketValue * 0.9 && price <= marketValue * 1.1 && buyingFormat.includes('buy it now');
        }).length;
        
        aboveFMV = activeData.items.filter(item => {
            const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
            const buyingFormat = (item.buying_format || '').toLowerCase();
            return price > marketValue * 1.1 && buyingFormat.includes('buy it now');
        }).length;
        
        // Calculate sales for each band
        salesBelow = data.items.filter(item => item.total_price < marketValue * 0.9).length;
        salesAt = data.items.filter(item => item.total_price >= marketValue * 0.9 && item.total_price <= marketValue * 1.1).length;
        salesAbove = data.items.filter(item => item.total_price > marketValue * 1.1).length;
        
        // Calculate absorption ratios
        absorptionBelow = belowFMV > 0 ? (salesBelow / belowFMV).toFixed(2) : 'N/A';
        absorptionAt = atFMV > 0 ? (salesAt / atFMV).toFixed(2) : 'N/A';
        absorptionAbove = aboveFMV > 0 ? (salesAbove / aboveFMV).toFixed(2) : 'N/A';
    }
    
    // --- Dev logging: post full analytics snapshot to backend ---
    try {
        const activeItemCount = activeData?.items?.length || 0;
        const buyItNowActiveCount = activeData?.items?.filter(item =>
            (item.buying_format || '').toLowerCase().includes('buy it now')
        ).length || 0;
        const medianAskingRaw = activeData?.items
            ?.map(item => item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0)))
            ?.filter(p => p > 0)
            ?.sort((a, b) => a - b);
        const medianAsking = medianAskingRaw?.length
            ? medianAskingRaw[Math.floor(medianAskingRaw.length / 2)]
            : null;

        fetch('/api/dev/analytics-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: data.query,
                market_pressure: marketPressure,
                market_pressure_label: marketPressureLabel || null,
                market_confidence: marketConfidence,
                liquidity_score: liquidityRisk?.score ?? null,
                liquidity_label: liquidityRisk?.label ?? null,
                liquidity_absorption_ratio: liquidityRisk?.absorptionRatio ?? null,
                liquidity_confidence: liquidityRisk?.confidence ?? null,
                market_value: marketValue,
                quick_sale: quickSale,
                patient_sale: patientSale,
                fmv_low: fmvData?.fmv_low ?? null,
                fmv_high: fmvData?.fmv_high ?? null,
                median_asking_price: medianAsking,
                below_fmv_active_count: belowFMV,
                at_fmv_active_count: atFMV,
                above_fmv_active_count: aboveFMV,
                sales_below_fmv: salesBelow,
                sales_at_fmv: salesAt,
                sales_above_fmv: salesAbove,
                absorption_below: absorptionBelow,
                absorption_at: absorptionAt,
                absorption_above: absorptionAbove,
                sold_item_count: data.items.length,
                active_item_count: activeItemCount,
                ask_p10: askP10,
                ask_median: askMedian,
                ask_p90: askP90,
                bid_ask_spread_amount: spreadAmount,
                bid_ask_spread_pct: spreadPct,
                collectibility_score: collectibilityScore,
                collectibility_label: collectibilityTier.label,
                collectibility_scenario: collectibilityScenario,
                summary_prompt_tokens: fmvData.summary_token_usage?.prompt_tokens || null,
                summary_completion_tokens: fmvData.summary_token_usage?.completion_tokens || null,
                summary_total_tokens: fmvData.summary_token_usage?.total_tokens || null,
                summary_model: fmvData.summary_token_usage?.model || null,
            })
        }).catch(err => console.warn('[DEV LOG] analytics-snapshot failed (non-blocking):', err));
    } catch (logErr) {
        console.warn('[DEV LOG] analytics-snapshot error (non-blocking):', logErr);
    }

    const dashboardHtml = `
        <div id="analysis-dashboard">
            <h3 style="margin-bottom: 1.5rem; color: var(--text-color); text-align: center;">📊 Market Analysis Dashboard</h3>
            
            <!-- Disclaimer -->
            <p style="margin: 0 0 2rem 0; font-size: 0.75rem; color: #666; text-align: center; line-height: 1.5;">
                ⚠️ This analysis is for informational purposes only. It is not financial or investment advice. Always do your own research before making decisions.
            </p>
            
            <!-- Sample Size Warning (Phase 1.1) -->
            ${getSampleSizeWarning(data.items.length, activeData?.items?.length || 0, sampleSize)}

            <!-- Key Indicators Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                
                <!-- Asking vs. Sold -->
                ${marketPressure !== null && sampleSize >= 5 ? `
                <div class="indicator-card" style="background: ${marketPressureGradient}; padding: 1.5rem; border-radius: 12px; border: 1px solid ${marketPressureBorder}; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">
                    <div style="margin-bottom: 0.75rem;">
                        <span style="font-size: 0.85rem; color: #666; font-weight: 500;">Asking vs. Sold</span>
                    </div>
                    <div style="font-size: 1.6rem; font-weight: 700; color: ${marketPressureColor}; margin-bottom: 0.75rem; line-height: 1.2;">
                        ${marketPressure >= 0 ? '+' : ''}${marketPressure.toFixed(1)}%
                    </div>
                    <div style="font-size: 0.8rem; color: #444; line-height: 1.5; margin-bottom: 0.75rem;">
                        ${marketPressureLabel}
                    </div>
                    <div style="font-size: 0.7rem; color: #999; line-height: 1.4; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.08);">
                        Median ask ${formatMoney(medianAskingPrice)} vs. FMV ${formatMoney(marketValue)} &middot; ${sampleSize} listings<br>
                        Reflects current asking prices, not a prediction of where prices are headed.
                    </div>
                </div>
                ` : ''}
                
                <!-- Market Confidence -->
                <div class="indicator-card" style="background: linear-gradient(135deg, #e6f7ff 0%, #ccedff 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #99daff; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.15);">
                    <div style="margin-bottom: 0.75rem;">
                        <span style="font-size: 0.85rem; color: #0055b3; font-weight: 500;">FMV Reliability</span>
                    </div>
                    <div style="font-size: 1.35rem; font-weight: 700; color: #007aff; margin-bottom: 0.75rem; line-height: 1.2;">
                        ${marketConfidence >= 85 ? 'Prices are very consistent' : marketConfidence >= 70 ? 'Prices are fairly consistent' : marketConfidence >= 55 ? 'Prices vary noticeably' : marketConfidence >= 40 ? 'Prices vary a lot' : 'Prices are all over the place'}
                    </div>
                    <div style="font-size: 0.8rem; color: #444; line-height: 1.5; margin-bottom: 0.75rem;">
                        ${marketConfidence >= 85 ? 'Sales cluster tightly — the FMV is reliable.' : marketConfidence >= 70 ? 'Some spread, but the FMV is a solid estimate.' : marketConfidence >= 55 ? 'The FMV is a reasonable midpoint, not a precise value.' : marketConfidence >= 40 ? 'Take the FMV as a rough guide only.' : 'The FMV has limited reliability here.'}
                    </div>
                    <div style="font-size: 0.7rem; color: #5599cc; line-height: 1.4; padding-top: 0.5rem; border-top: 1px solid rgba(0, 122, 255, 0.15);">
                        Based on ${data.items.length} sales
                    </div>
                </div>
                
                <!-- Liquidity Risk Score -->
                ${liquidityRisk && liquidityRisk.score !== null ? `
                <div class="indicator-card" style="background: ${liquidityRisk.gradient}; padding: 1.5rem; border-radius: 12px; border: 1px solid ${liquidityRisk.border}; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
                    <div style="margin-bottom: 0.75rem;">
                        <span style="font-size: 0.85rem; color: ${liquidityRisk.statusColor}; font-weight: 500;">Market Activity</span>
                    </div>
                    <div style="font-size: 1.35rem; font-weight: 700; color: ${liquidityRisk.statusColor}; margin-bottom: 0.75rem; line-height: 1.2;">
                        ${liquidityRisk.label === 'High Liquidity' ? 'Buyers are active' : liquidityRisk.label === 'Moderate Liquidity' ? 'Moderate buyer interest' : liquidityRisk.label === 'Low Liquidity' ? 'More sellers than buyers' : 'Few active buyers'}
                    </div>
                    <div style="font-size: 0.8rem; color: #444; line-height: 1.5; margin-bottom: 0.75rem;">
                        ${liquidityRisk.label === 'High Liquidity' ? 'Recent sales are outpacing active listings — demand is strong relative to supply.' : liquidityRisk.label === 'Moderate Liquidity' ? 'Balanced market with healthy buyer activity relative to current supply.' : liquidityRisk.label === 'Low Liquidity' ? 'Active listings outnumber recent sales — buyers have plenty of options.' : 'Very few recent buyers relative to current supply — a thin market.'}
                    </div>
                    <div style="font-size: 0.7rem; color: ${liquidityRisk.statusColor}; line-height: 1.4; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.08);">
                        ${liquidityRisk.salesCount || 0} recent sales vs. ${liquidityRisk.listingsCount || 0} active listings
                    </div>
                </div>
                ` : `
                <div class="indicator-card" style="background: linear-gradient(135deg, #f5f5f7 0%, #e5e5ea 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #d1d1d6; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);">
                    <div style="margin-bottom: 0.75rem;">
                        <span style="font-size: 0.85rem; color: #6e6e73; font-weight: 500;">Market Activity</span>
                    </div>
                    <div style="font-size: 1.35rem; font-weight: 700; color: #6e6e73; margin-bottom: 0.75rem; line-height: 1.2;">
                        Not enough data
                    </div>
                    <div style="font-size: 0.8rem; color: #888; line-height: 1.5;">
                        No active listings found to assess buyer demand.
                    </div>
                </div>
                `}

                <!-- Collectibility Score -->
                <div class="indicator-card" style="background: ${collectibilityTier.bg}; padding: 1.5rem; border-radius: 12px; border: 1px solid ${collectibilityTier.border}; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); position: relative;" title="Collectibility measures a card's sustained desirability based on price tier and sales volume. The ratio of recent sales to active listings is shown in the Market Activity card.">
                    <div style="margin-bottom: 0.5rem;">
                        <span style="font-size: 0.85rem; color: #666; font-weight: 500;">Collectibility</span>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: ${collectibilityTier.color}; margin-bottom: 0.5rem; line-height: 1;">
                        ${collectibilityScore}/10
                    </div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: ${collectibilityTier.color}; line-height: 1.4; margin-bottom: 0.5rem;">
                        ${collectibilityTier.label}
                    </div>
                    <div style="font-size: 0.7rem; color: #999; line-height: 1.3; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1);">
                        ${collectibilityScenario}<br>
                        <strong>Sold:</strong> ${soldCount} comps | <strong>FMV:</strong> $${marketValue.toFixed(0)}
                    </div>
                </div>

                <!-- Print Run / Scarcity -->
                ${(() => {
                    const pri = fmvData.print_run_info;
                    if (!pri || pri.confidence === 'unknown' || pri.print_run == null) return '';
                    const pr = typeof pri.print_run === 'number' ? pri.print_run : parseInt(pri.print_run);
                    const isRange = typeof pri.print_run === 'string' && pri.print_run.includes('-');
                    const displayValue = isRange ? pri.print_run : (isNaN(pr) ? pri.print_run : pr.toLocaleString());

                    // Scarcity tiers: [maxPrintRun, label, gradStart, gradEnd, borderColor, textColor]
                    const tiers = [
                        [1, '1 of 1', '#fff7e6', '#ffecb3', '#ffc107', '#b8860b'],
                        [50, 'Extremely Rare', '#fce4ec', '#f8bbd0', '#e91e63', '#c2185b'],
                        [100, 'Very Rare', '#fff3e0', '#ffe0b2', '#ff9800', '#e65100'],
                        [999, 'Rare', '#fefce8', '#fef9c3', '#eab308', '#92400e'],
                        [5000, 'A Little Rare', '#e8f5e9', '#c8e6c9', '#4caf50', '#2e7d32'],
                        [Infinity, 'Common', '#f5f5f5', '#eeeeee', '#9e9e9e', '#616161'],
                    ];
                    const tier = tiers.find(t => (isNaN(pr) ? Infinity : pr) <= t[0]) || tiers[tiers.length - 1];
                    const [, tierLabel, gradStart, gradEnd, borderColor, textColor] = tier;

                    const sourceText = pri.source || '';
                    const confLabel = pri.confidence === 'confirmed' ? 'Confirmed' : pri.confidence === 'checklist' ? 'Checklist data' : 'Estimated';

                    return `
                    <div class="indicator-card" style="background: linear-gradient(135deg, ${gradStart} 0%, ${gradEnd} 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid ${borderColor}; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
                        <div style="margin-bottom: 0.5rem;">
                            <span style="font-size: 0.85rem; color: ${textColor}; font-weight: 500;">Print Run</span>
                        </div>
                        <div style="font-size: 2rem; font-weight: 700; color: ${textColor}; margin-bottom: 0.5rem; line-height: 1;">
                            ${displayValue}
                        </div>
                        <div style="font-size: 0.75rem; font-weight: 600; color: ${textColor}; line-height: 1.4; margin-bottom: 0.5rem;">
                            ${tierLabel}
                        </div>
                        <div style="font-size: 0.7rem; color: #999; line-height: 1.3; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1);">
                            ${confLabel}${sourceText ? ' · ' + sourceText : ''}
                        </div>
                    </div>`;
                })()}
            </div>
            <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
                <h4 style="margin: 0 0 1.25rem 0; color: var(--text-color);">Sales vs. Listed Now</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 1.25rem;">
                    <!-- Recent Sales side -->
                    <div style="background: rgba(0, 122, 255, 0.05); padding: 1.25rem; border-radius: 10px; border: 1px solid rgba(0, 122, 255, 0.2);">
                        <div style="font-size: 0.75rem; font-weight: 600; color: #007aff; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">Recent Sales — What cards have sold for</div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #666; margin-bottom: 0.4rem;">
                            <span>Discount</span><span style="font-weight: 500; color: var(--text-color);">${formatMoney(quickSale)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 1rem; color: #007aff; font-weight: 700; margin-bottom: 0.4rem;">
                            <span>Market Value</span><span>${formatMoney(marketValue)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #666;">
                            <span>Premium</span><span style="font-weight: 500; color: var(--text-color);">${formatMoney(patientSale)}</span>
                        </div>
                        <div style="font-size: 0.7rem; color: #999; margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.08);">
                            Based on ${soldCount} sold comp${soldCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                    <!-- Listed Now side -->
                    <div style="background: rgba(255, 59, 48, 0.05); padding: 1.25rem; border-radius: 10px; border: 1px solid rgba(255, 59, 48, 0.2);">
                        <div style="font-size: 0.75rem; font-weight: 600; color: #ff3b30; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">Listed Now — What sellers are asking</div>
                        ${activeCount > 0 ? `
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #666; margin-bottom: 0.4rem;">
                            <span>Low</span><span style="font-weight: 500; color: var(--text-color);">${askP10 != null ? formatMoney(askP10) : '—'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 1rem; color: #ff3b30; font-weight: 700; margin-bottom: 0.4rem;">
                            <span>Median</span><span>${askMedian != null ? formatMoney(askMedian) : '—'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #666;">
                            <span>High</span><span style="font-weight: 500; color: var(--text-color);">${askP90 != null ? formatMoney(askP90) : '—'}</span>
                        </div>
                        <div style="font-size: 0.7rem; color: #999; margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.08);">
                            Based on ${activeCount} active listing${activeCount !== 1 ? 's' : ''}
                        </div>
                        ` : `
                        <div style="font-size: 0.9rem; color: #999; padding-top: 0.5rem;">No active listings data</div>
                        `}
                    </div>
                </div>
                <!-- Price gap indicator -->
                ${spreadPct !== null ? `
                <div style="display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1.25rem; background: rgba(0,0,0,0.03); border-radius: 8px; border: 1px solid rgba(0,0,0,0.07);">
                    <div style="font-size: 0.85rem; color: #666; font-weight: 500; white-space: nowrap;">Price Gap</div>
                    <div style="font-size: 1rem; font-weight: 700; color: ${spreadColor}; white-space: nowrap;">
                        ${spreadAmount >= 0 ? '+' : ''}${formatMoney(spreadAmount)} (${spreadPct >= 0 ? '+' : ''}${spreadPct.toFixed(1)}%)
                    </div>
                    <div style="font-size: 0.8rem; color: ${spreadColor}; flex: 1;">${spreadSignal}</div>
                </div>
                ` : `
                <div style="font-size: 0.85rem; color: #999; padding: 0.85rem 1.25rem; background: rgba(0,0,0,0.03); border-radius: 8px;">
                    Price gap unavailable — run an active listings search to compare
                </div>
                `}
            </div>

            <!-- Price Distribution Analysis -->
            <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h4 style="margin: 0; color: var(--text-color);">Volume Profile</h4>
                    
                    <!-- Bin Count Controls -->
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="font-size: 0.85rem; color: var(--subtle-text-color);">Bars:</span>
                        <button onclick="adjustVolumeBins(-5)" style="background: var(--border-color); border: none; border-radius: 6px; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; font-weight: bold; color: var(--text-color); transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center;" onmouseover="this.style.background='#d1d1d6'" onmouseout="this.style.background='var(--border-color)'">−</button>
                        <span id="volumeBinCount" style="font-weight: 600; color: var(--text-color); min-width: 30px; text-align: center; font-size: 0.95rem;">${volumeProfileBins || (isMobileDevice ? 10 : 25)}</span>
                        <button onclick="adjustVolumeBins(5)" style="background: var(--border-color); border: none; border-radius: 6px; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; font-weight: bold; color: var(--text-color); transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center;" onmouseover="this.style.background='#d1d1d6'" onmouseout="this.style.background='var(--border-color)'">+</button>
                        <button onclick="resetVolumeBins()" style="background: var(--border-color); border: none; border-radius: 6px; padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.8rem; color: var(--text-color); transition: all 0.2s;" onmouseover="this.style.background='#d1d1d6'" onmouseout="this.style.background='var(--border-color)'" title="Reset to default">Reset</button>
                    </div>
                </div>
                
                <div style="width: 100%; position: relative; margin-bottom: 1rem;">
                    <canvas id="priceDistributionCanvas" style="width: 100%; height: 300px; display: block; cursor: crosshair;"></canvas>
                </div>
                
                <!-- Legend -->
                <div style="display: flex; justify-content: center; gap: 2rem; margin-top: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="width: 20px; height: 20px; background: rgba(0, 122, 255, 0.6); border: 2px solid rgba(0, 122, 255, 0.9); border-radius: 4px;"></div>
                        <span style="font-size: 0.9rem; color: var(--text-color);">Sold Listings</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="width: 20px; height: 20px; background: rgba(255, 59, 48, 0.6); border: 2px solid rgba(255, 59, 48, 0.9); border-radius: 4px;"></div>
                        <span style="font-size: 0.9rem; color: var(--text-color);">Active Listings</span>
                    </div>
                </div>
            </div>
            
            <!-- Pricing Recommendations -->
            ${activeData && activeData.items && activeData.items.length > 0 && liquidityRisk && liquidityRisk.score !== null ? (() => {
                const bands = {
                    belowFMV: { count: belowFMV, absorption: absorptionBelow, sales: salesBelow },
                    atFMV: { count: atFMV, absorption: absorptionAt, sales: salesAt },
                    aboveFMV: { count: aboveFMV, absorption: absorptionAbove, sales: salesAbove }
                };
                return getPricingRecommendations(bands, marketValue, marketPressure, liquidityRisk?.score || 0);
            })() : ''}
        </div>
    `;
    
    analysisContainer.innerHTML = dashboardHtml;
    
    // Store data for potential redraws
    lastChartData.soldData = data;
    lastChartData.activeData = activeData;
    
    // Clear any pending chart draw to prevent race condition
    if (priceDistributionChartTimeout) {
        clearTimeout(priceDistributionChartTimeout);
        priceDistributionChartTimeout = null;
    }
    
    // Draw price distribution chart after DOM is updated
    // Wrap in try-catch to prevent chart errors from breaking the page
    // Use requestAnimationFrame for better timing with DOM updates
    priceDistributionChartTimeout = setTimeout(() => {
        priceDistributionChartTimeout = null;
        try {
            const canvas = document.getElementById("priceDistributionCanvas");
            if (canvas) {
                if (window.DEBUG_MODE.CHART) {
                    console.log('[CHART] Drawing price distribution chart with data:', {
                        hasSoldData: !!data,
                        hasActiveData: !!activeData,
                        soldItems: data?.items?.length || 0,
                        activeItems: activeData?.items?.length || 0
                    });
                }
                drawPriceDistributionChart(data, activeData);
            } else {
                console.error('[CHART] Price distribution canvas element not found');
            }
        } catch (error) {
            console.error('[ERROR] Failed to draw price distribution chart:', error);
            // Don't throw - chart failure shouldn't break the page
        }
    }, 100);
}

// Add event listener for redrawing the price distribution chart
window.addEventListener('redrawPriceDistribution', () => {
    if (window.DEBUG_MODE.CHART) {
        console.log('[CHART] Redraw event triggered');
    }
    if (lastChartData.soldData) {
        setTimeout(() => {
            try {
                const canvas = document.getElementById("priceDistributionCanvas");
                if (canvas && canvas.offsetParent !== null) {
                    if (window.DEBUG_MODE.CHART) {
                        console.log('[CHART] Redrawing price distribution chart');
                    }
                    drawPriceDistributionChart(lastChartData.soldData, lastChartData.activeData);
                }
            } catch (error) {
                console.error('[ERROR] Failed to redraw chart:', error);
            }
        }, 50);
    }
});

// ============================================================================
// PHASE 1: ENHANCED MARKET ANALYSIS HELPER FUNCTIONS
// ============================================================================

/**
 * Phase 1.1: Generate sample size warning banner
 * Shows warning when data quality is limited
 */
function getSampleSizeWarning(soldCount, activeCount, pressureSampleSize) {
    // Determine if we should show a warning
    const lowSoldData = soldCount < 10;
    const lowActiveData = activeCount < 5;
    const lowPressureData = pressureSampleSize < 5;
    
    if (lowSoldData || lowActiveData || lowPressureData) {
        const issues = [];
        if (lowSoldData) issues.push(`${soldCount} recent sales`);
        if (lowActiveData) issues.push(`${activeCount} active listings`);
        if (lowPressureData && pressureSampleSize > 0) issues.push(`${pressureSampleSize} sellers sampled`);
        
        return `
            <div style="background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #ff9500; box-shadow: 0 2px 8px rgba(255, 149, 0, 0.15);">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-size: 1.5rem;">⚠️</span>
                    <div style="flex: 1;">
                        <strong style="color: #ff9500; font-size: 0.95rem;">Limited Data Available</strong>
                        <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: #666; line-height: 1.4;">
                            ${issues.join(' • ')} — Results may vary. Consider refining your search terms or checking back later for more data.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
    
    return ''; // No warning needed
}

/**
 * Phase 1.3: Generate absorption ratio interpretation
 * Provides context for what absorption ratios mean
 */
function getAbsorptionRatioInterpretation(absorptionRatio, band) {
    if (absorptionRatio === 'N/A' || absorptionRatio === null) {
        return '📭 No active listings in this price band';
    }
    
    const ratio = parseFloat(absorptionRatio);
    
    if (band === 'below') {
        if (ratio >= 1.5) {
            return '🔥 Extremely hot zone! Sales happening 50%+ faster than new listings appear. Deals vanish quickly at these prices.';
        } else if (ratio >= 1.0) {
            return '🔥 Hot zone! More sales than listings means deals sell faster than they\'re posted. Act fast on good prices.';
        } else if (ratio >= 0.5) {
            return '⚡ Moderate demand. Cards at these prices get steady interest, though not instant sales.';
        } else {
            return '📊 Lower activity. Some bargains available but demand is modest at these price points.';
        }
    } else if (band === 'at') {
        if (ratio >= 1.0) {
            return '🔥 Strong demand at fair value! Cards priced near FMV are selling faster than they\'re listed.';
        } else if (ratio >= 0.5) {
            return '✅ Healthy activity! Balanced supply and demand. Cards move at a steady, predictable pace.';
        } else {
            return '⏳ Slower activity. More listings than recent sales. Sellers may need patience or slight price adjustments.';
        }
    } else { // above
        if (ratio >= 0.5) {
            return '📊 Moderate demand even at premium pricing. Some buyers willing to pay above FMV.';
        } else if (ratio >= 0.3) {
            return '⏳ Lower demand. Premium-priced cards face longer wait times. Most sales happen closer to FMV.';
        } else {
            return '⚠️ Very low demand at these prices. Significant oversupply vs sales. Overpriced for current market conditions.';
        }
    }
}

/**
 * Phase 2.2: Generate pricing recommendations based on liquidity profile
 * Provides actionable pricing advice based on where activity is concentrated
 */
function getPricingRecommendations(bands, fmv, marketPressure, liquidityScore) {
    if (!bands || !fmv) return '';
    
    const recommendations = [];
    
    // Extract band data
    const belowFMV = bands.belowFMV || { count: 0, absorption: 'N/A', sales: 0 };
    const atFMV = bands.atFMV || { count: 0, absorption: 'N/A', sales: 0 };
    const aboveFMV = bands.aboveFMV || { count: 0, absorption: 'N/A', sales: 0 };
    
    const belowAbsorption = belowFMV.absorption !== 'N/A' ? parseFloat(belowFMV.absorption) : 0;
    const atAbsorption = atFMV.absorption !== 'N/A' ? parseFloat(atFMV.absorption) : 0;
    const aboveAbsorption = aboveFMV.absorption !== 'N/A' ? parseFloat(aboveFMV.absorption) : 0;
    
    // Recommendation 1: Discount Strategy
    if (belowAbsorption >= 1.0 && belowFMV.count > 0) {
        const quickPrice = fmv * 0.85;
        recommendations.push({
            icon: '⚡',
            title: 'Discount Strategy',
            price: quickPrice,
            range: `${formatMoney(fmv * 0.80)} - ${formatMoney(fmv * 0.90)}`,
            reason: `High demand below FMV (${belowAbsorption}:1 absorption ratio). Cards priced 10-20% below FMV are selling faster than they're listed.`,
            color: '#34c759',
            bg: 'linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%)',
            border: '#99ff99'
        });
    }
    
    // Recommendation 2: Balanced Market Strategy
    if (atAbsorption >= 0.5 && atFMV.count > 0) {
        recommendations.push({
            icon: '⚖️',
            title: 'Fair Market Strategy',
            price: fmv,
            range: `${formatMoney(fmv * 0.95)} - ${formatMoney(fmv * 1.05)}`,
            reason: `Steady activity at FMV (${atAbsorption} absorption ratio). Price competitively near ${formatMoney(fmv)} for reliable sales.`,
            color: '#007aff',
            bg: 'linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%)',
            border: '#99daff'
        });
    }
    
    // Recommendation 3: Premium/Patient Strategy
    if (marketPressure < 15 && liquidityScore >= 60) {
        const patientPrice = fmv * 1.10;
        recommendations.push({
            icon: '🕰️',
            title: 'Premium Strategy',
            price: patientPrice,
            range: `${formatMoney(fmv * 1.05)} - ${formatMoney(fmv * 1.15)}`,
            reason: `Low market pressure and good liquidity suggest room for premium pricing if you're patient.`,
            color: '#5856d6',
            bg: 'linear-gradient(135deg, #f0e6ff 0%, #f5f0ff 100%)',
            border: '#d6b3ff'
        });
    } else if (aboveAbsorption >= 0.3 && aboveFMV.count > 0) {
        const patientPrice = fmv * 1.12;
        recommendations.push({
            icon: '🎯',
            title: 'Premium Strategy',
            price: patientPrice,
            range: `${formatMoney(fmv * 1.10)} - ${formatMoney(fmv * 1.20)}`,
            reason: `Some cards selling above FMV (${aboveAbsorption} absorption). Premium pricing possible with patience.`,
            color: '#ff9500',
            bg: 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)',
            border: '#ffd699'
        });
    }
    
    // If no strong recommendations, provide default guidance
    if (recommendations.length === 0) {
        recommendations.push({
            icon: '📊',
            title: 'Standard Market Strategy',
            price: fmv,
            range: `${formatMoney(fmv * 0.90)} - ${formatMoney(fmv * 1.10)}`,
            reason: `With current market data, price within 10% of FMV (${formatMoney(fmv)}) for best results.`,
            color: '#6e6e73',
            bg: 'linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%)',
            border: '#d1d1d6'
        });
    }
    
    // Generate HTML
    let html = `
        <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
            <h4 style="margin-top: 0; margin-bottom: 1.5rem; color: var(--text-color);">💰 Pricing Recommendations</h4>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
    `;
    
    recommendations.forEach(rec => {
        html += `
            <div style="background: ${rec.bg}; padding: 1.25rem; border-radius: 12px; border: 2px solid ${rec.border};">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <span style="font-size: 1.5rem;">${rec.icon}</span>
                    <strong style="color: ${rec.color}; font-size: 1rem;">${rec.title}</strong>
                </div>
                <div style="font-size: 1.5rem; font-weight: 700; color: ${rec.color}; margin-bottom: 0.5rem;">
                    ${formatMoney(rec.price)}
                </div>
                <div style="font-size: 0.8rem; color: #666; margin-bottom: 0.75rem;">
                    <strong>Target Range:</strong> ${rec.range}
                </div>
                <div style="font-size: 0.75rem; color: #333; line-height: 1.4; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.1);">
                    ${rec.reason}
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            
            <div style="margin-top: 1.5rem; padding: 1rem; background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); border-radius: 8px;">
                <p style="margin: 0; font-size: 0.85rem; color: #666; line-height: 1.5;">
                    <strong>💡 Note:</strong> These recommendations are based on recent market activity and absorption ratios. Adjust based on your selling timeline and risk tolerance. Always factor in fees, shipping costs, and current market trends.
                </p>
            </div>
        </div>
    `;
    
    return html;
}

/**
 * Phase 2.3: Calculate overall data quality score
 * Returns 0-100 score based on sample sizes and consistency
 */
function calculateDataQuality(soldCount, activeCount, confidence) {
    // Sample size component (60% weight)
    let sampleScore = 0;
    if (soldCount >= 20 && activeCount >= 10) {
        sampleScore = 100;
    } else if (soldCount >= 10 && activeCount >= 5) {
        sampleScore = 70;
    } else if (soldCount >= 5 && activeCount >= 3) {
        sampleScore = 40;
    } else {
        sampleScore = 20;
    }
    
    // Confidence component (40% weight)
    const confidenceScore = confidence || 0;
    
    // Weighted average
    return Math.round(sampleScore * 0.6 + confidenceScore * 0.4);
}

/**
 * Phase 2.3: Generate data quality badge HTML
 * Shows color-coded confidence level
 */
function getDataQualityBadge(soldCount, activeCount, confidence, pressureSampleSize) {
    const score = calculateDataQuality(soldCount, activeCount, confidence);
    
    let badgeColor, badgeText, badgeBg, badgeBorder;
    
    if (score >= 70) {
        badgeColor = '#34c759';
        badgeText = 'HIGH CONFIDENCE';
        badgeBg = 'linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%)';
        badgeBorder = '#99ff99';
    } else if (score >= 40) {
        badgeColor = '#ff9500';
        badgeText = 'MODERATE CONFIDENCE';
        badgeBg = 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)';
        badgeBorder = '#ffd699';
    } else {
        badgeColor = '#ff3b30';
        badgeText = 'LOW CONFIDENCE - Use Caution';
        badgeBg = 'linear-gradient(135deg, #ffebee 0%, #fff5f5 100%)';
        badgeBorder = '#ff9999';
    }
    
    return `
        <div style="background: ${badgeBg}; padding: 0.75rem 1.25rem; border-radius: 8px; border: 2px solid ${badgeBorder}; display: inline-block; margin-bottom: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div>
                    <div style="font-weight: 700; color: ${badgeColor}; font-size: 0.9rem; letter-spacing: 0.5px;">
                        ${badgeText}
                    </div>
                    <div style="font-size: 0.75rem; color: #666; margin-top: 0.25rem;">
                        Data Quality Score: ${score}/100
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Calculate standard deviation
function calculateStdDev(values) {
    if (values.length === 0) return 0;
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
}

// Generate market insights based on analytics
function generateMarketInsights(data, fmvData, priceSpread, marketConfidence, liquidityRisk, fmvVsAvg, marketPressure, marketPressureLabel) {
    const insights = [];
    
    // Extract score from liquidityRisk object (handle both old number format and new object format)
    const liquidityScore = (liquidityRisk && typeof liquidityRisk === 'object') ? (liquidityRisk.score || 0) : (liquidityRisk || 0);
    
    // Asking vs. Sold insights
    if (marketPressure !== null && sampleSize >= 5) {
        if (marketPressure >= 0 && marketPressure <= 15) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #f5f5f7 0%, #ebebf0 100%); border-left: 4px solid #8e8e93; border-radius: 6px;">
                    <strong style="color: #3a3a3c;">Asking vs. Sold (+${marketPressure.toFixed(1)}%):</strong> ${marketPressureLabel}
                </li>
            `);
        } else if (marketPressure > 15 && marketPressure <= 30) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #f5f5f7 0%, #ebebf0 100%); border-left: 4px solid #8e8e93; border-radius: 6px;">
                    <strong style="color: #3a3a3c;">Asking vs. Sold (+${marketPressure.toFixed(1)}%):</strong> ${marketPressureLabel}
                </li>
            `);
        } else if (marketPressure > 30 && marketPressure <= 50) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #f5f5f7 0%, #ebebf0 100%); border-left: 4px solid #8e8e93; border-radius: 6px;">
                    <strong style="color: #3a3a3c;">Asking vs. Sold (+${marketPressure.toFixed(1)}%):</strong> ${marketPressureLabel}
                </li>
            `);
        } else if (marketPressure > 50) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #f5f5f7 0%, #ebebf0 100%); border-left: 4px solid #8e8e93; border-radius: 6px;">
                    <strong style="color: #3a3a3c;">Asking vs. Sold (+${marketPressure.toFixed(1)}%):</strong> ${marketPressureLabel}
                </li>
            `);
        } else if (marketPressure < 0) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #f5f5f7 0%, #ebebf0 100%); border-left: 4px solid #8e8e93; border-radius: 6px;">
                    <strong style="color: #3a3a3c;">Asking vs. Sold (${marketPressure.toFixed(1)}%):</strong> ${marketPressureLabel}
                </li>
            `);
        }
    }
    
    // Confidence insights
    if (marketConfidence >= 85) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%); border-left: 4px solid #34c759; border-radius: 6px;">
                <strong style="color: #34c759;">✓ Excellent Consensus:</strong> Exceptional price consistency with tight clustering (${marketConfidence.toFixed(0)}/100 confidence score).
            </li>
        `);
    } else if (marketConfidence >= 70) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%); border-left: 4px solid #007aff; border-radius: 6px;">
                <strong style="color: #007aff;">✓ Good Consensus:</strong> Solid price consistency in the market (${marketConfidence.toFixed(0)}/100 confidence score).
            </li>
        `);
    } else if (marketConfidence >= 55) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); border-left: 4px solid #ff9500; border-radius: 6px;">
                <strong style="color: #ff9500;">📊 Moderate Variation:</strong> Noticeable price spread (${marketConfidence.toFixed(0)}/100). Watch for price trends and patterns.
            </li>
        `);
    } else if (marketConfidence >= 40) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); border-left: 4px solid #ff9500; border-radius: 6px;">
                <strong style="color: #ff9500;">⚠ High Variation:</strong> Significant price scatter (${marketConfidence.toFixed(0)}/100). Consider gathering more data or refining search terms.
            </li>
        `);
    } else if (marketConfidence >= 25) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #ffebee 0%, #fff5f5 100%); border-left: 4px solid #ff3b30; border-radius: 6px;">
                <strong style="color: #ff3b30;">⚠ Very High Variation:</strong> Extreme price scatter (${marketConfidence.toFixed(0)}/100). Refine search or check for data quality issues.
            </li>
        `);
    } else {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #f5f5f7 0%, #e5e5ea 100%); border-left: 4px solid #1d1d1f; border-radius: 6px;">
                <strong style="color: #1d1d1f;">⚠ Market Chaos:</strong> No price consensus (${marketConfidence.toFixed(0)}/100). Data may be unreliable or miscategorized.
            </li>
        `);
    }
    
    // Liquidity insights
    if (liquidityScore >= 70) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%); border-left: 4px solid #34c759; border-radius: 6px;">
                <strong style="color: #34c759;">✓ High Liquidity:</strong> ${data.items.length} recent sales indicate an active market with good price discovery.
            </li>
        `);
    } else if (liquidityScore < 40) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #ffebee 0%, #fff5f5 100%); border-left: 4px solid #ff3b30; border-radius: 6px;">
                <strong style="color: #ff3b30;">⚠ Limited Data:</strong> Only ${data.items.length} recent sales found. Consider broadening search or checking back later for more data.
            </li>
        `);
    }
    
    // FMV vs Average insights
    if (Math.abs(fmvVsAvg) < 5) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%); border-left: 4px solid #007aff; border-radius: 6px;">
                <strong style="color: #007aff;">✓ Fair Pricing:</strong> FMV closely aligned with average price (${fmvVsAvg >= 0 ? '+' : ''}${fmvVsAvg.toFixed(1)}%), suggesting balanced market.
            </li>
        `);
    } else if (fmvVsAvg > 10) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #ffe6f7 0%, #fff0fa 100%); border-left: 4px solid #ff3b30; border-radius: 6px;">
                <strong style="color: #ff3b30;">📈 Premium Market:</strong> FMV is ${fmvVsAvg.toFixed(1)}% higher than average, indicating recent price appreciation or strong demand.
            </li>
        `);
    }
    
    // Data quality insight
    const dataQuality = (marketConfidence * 0.4) + (liquidityScore * 0.6);
    insights.push(`
        <li style="padding: 1rem; margin-bottom: 0; background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); border-left: 4px solid #6e6e73; border-radius: 6px;">
            <strong style="color: #6e6e73;">📊 Data Quality:</strong> Overall reliability score: ${dataQuality.toFixed(0)}/100 based on sample size and consistency.
        </li>
    `);
    
    return insights.join('');
}


async function updateFmv(data, activeData = null) {
  const statsContainer = document.getElementById("stats-container");
  const fmvContainer = document.getElementById("fmv-container");

  if (!data || !data.items || data.items.length === 0) {
    if (statsContainer) statsContainer.innerHTML = "";
    if (fmvContainer) fmvContainer.innerHTML = "";
    return null;
  }

  try {
    const activeItems = activeData?.items || [];
    const resp = await fetch('/fmv/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sold_items: data.items, active_items: activeItems, query: data.query || null }),
    });
    const fmvData = await resp.json();

    if (fmvData.detail) {
      if (fmvContainer) {
        fmvContainer.innerHTML = "Error calculating FMV: " + escapeHtml(fmvData.detail);
      }
      return null;
    }

    // store for beeswarm chart
    expectLowGlobal = fmvData.expected_low;
    expectHighGlobal = fmvData.expected_high;
    marketValueGlobal = fmvData.market_value || fmvData.expected_high;

    // Store backend analytics scores for analysis dashboard
    window.backendAnalyticsScores = fmvData.analytics_scores || null;

    // Merge AI relevance scores back into items for filtering
    aiFilteringRan = false;
    if (fmvData.sold_relevance_scores && data.items) {
      aiFilteringRan = true;
      fmvData.sold_relevance_scores.forEach((score, i) => {
        if (i < data.items.length) data.items[i].ai_relevance_score = score;
      });
    }
    if (fmvData.active_relevance_scores && activeData?.items) {
      fmvData.active_relevance_scores.forEach((score, i) => {
        if (i < activeData.items.length) activeData.items[i].ai_relevance_score = score;
      });
    }

    // Expose to window object for export functionality
    window.expectLowGlobal = fmvData.expected_low;
    window.expectHighGlobal = fmvData.expected_high;
    window.marketValueGlobal = fmvData.market_value || fmvData.expected_high;

    const listPrice = toNinetyNine(fmvData.expected_high);

    // Use new volume-weighted values with fallbacks
    const marketValue = marketValueGlobal;
    const quickSale = fmvData.quick_sale || fmvData.expected_low;
    const patientSale = fmvData.patient_sale || fmvData.expected_high;

    // Use backend market confidence if available, otherwise calculate client-side
    let marketConfidence;
    let coefficientOfVariation;
    const backendScores = window.backendAnalyticsScores;
    if (backendScores && backendScores.confidence && backendScores.confidence.score != null) {
      marketConfidence = backendScores.confidence.score;
      coefficientOfVariation = backendScores.confidence.cov || 0;
    } else {
      const prices = data.items.map(item => item.total_price).filter(p => p > 0);
      const stdDev = calculateStdDev(prices);
      const avgPrice = data.avg_price;
      coefficientOfVariation = (stdDev / avgPrice) * 100;
      marketConfidence = Math.round(100 / (1 + coefficientOfVariation / 100));
    }

    // Check if user is authenticated for Save button
    const isUserAuthenticated = window.AuthModule && window.AuthModule.isAuthenticated();
    
    const fmvHtml = `
      <div id="fmv">
        <h3>📈 Fair Market Value</h3>
        <p style="font-size: 0.75rem; text-align: center; color: var(--subtle-text-color); margin-top: 0.5rem; margin-bottom: 1.5rem; font-style: italic;">
          FMV estimates work best when there are plenty of recent sales to sample and your search terms are tight and accurate.
        </p>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-label">💰 Discount</div>
            <div class="stat-value">${formatMoney(quickSale)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">⚖️ Market Value</div>
            <div class="stat-value">${formatMoney(marketValue)}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">⭐ Premium</div>
            <div class="stat-value">${formatMoney(patientSale)}</div>
          </div>
        </div>
        <p style="font-size: 0.8rem; text-align: center; color: var(--subtle-text-color); margin-top: 1.5rem;">
          Based on ${fmvData.count} recent sales
        </p>
        ${isUserAuthenticated ? `
          <div style="text-align: center; margin-top: 1.5rem;">
            <button onclick="saveCurrentSearchToPortfolio()" style="
              background: linear-gradient(135deg, #34c759, #30d158);
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 10px;
              font-size: 0.95rem;
              font-weight: 600;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(52, 199, 89, 0.3);
              transition: all 0.3s ease;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(52, 199, 89, 0.4)';" onmouseout="this.style.transform=''; this.style.boxShadow='0 4px 12px rgba(52, 199, 89, 0.3)';">
              ⭐ Save to Collection
            </button>
          </div>
        ` : ''}
      </div>
    `;
    // Technical details hidden from UI: Auction sales weighted higher than Buy-It-Now • More bids = higher weight
    if (fmvContainer) {
      fmvContainer.innerHTML = fmvHtml;
    }

    // --- AI Market Summary ---
    const summary = fmvData?.market_summary;
    if (summary && fmvContainer) {
      const summaryEl = document.createElement('div');
      summaryEl.className = 'market-summary-panel';
      summaryEl.innerHTML = `
        <div class="market-summary-header">
          <span class="market-summary-icon">&#10022;</span>
          <span class="market-summary-label">Market Summary</span>
        </div>
        <p class="market-summary-text">${escapeHtml(summary)}</p>
      `;
      fmvContainer.appendChild(summaryEl);
    }
    
    // Return FMV data for use in analytics dashboard
    return fmvData;

  } catch (err) {
    if (fmvContainer) {
      fmvContainer.innerHTML = "Error calculating FMV: " + escapeHtml(String(err));
    }
    return null;
  }
}

// Outlier filter cache for performance optimization
const outlierCache = new Map();

function filterOutliers(prices) {
  if (!prices || prices.length === 0) return [];

  if (prices.length < 4) {
    // Need at least 4 data points for meaningful outlier detection
    return prices;
  }

  // Create cache key from price array (using length and samples to avoid expensive serialization)
  const key = `${prices.length}-${prices[0]}-${prices[prices.length-1]}-${prices[Math.floor(prices.length/2)]}`;

  if (outlierCache.has(key)) {
    if (window.DEBUG_MODE.OUTLIER_FILTER) {
      console.log('[OUTLIER FILTER] Using cached result');
    }
    return outlierCache.get(key);
  }

  // Sort prices to find quartiles
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;

  // Interpolated percentile — avoids landing on an outlier value as Q3
  const interpolate = (arr, pct) => {
    const pos = pct * (arr.length - 1);
    const lo  = Math.floor(pos);
    const hi  = Math.min(lo + 1, arr.length - 1);
    return arr[lo] + (pos - lo) * (arr[hi] - arr[lo]);
  };

  const q1 = interpolate(sorted, 0.25);
  const q3 = interpolate(sorted, 0.75);
  const iqr = q3 - q1;

  // Define outlier bounds (1.5 * IQR is the standard threshold)
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  // Filter out outliers
  const filtered = prices.filter(price => price >= lowerBound && price <= upperBound);
  
  if (window.DEBUG_MODE.OUTLIER_FILTER) {
    console.log(`[OUTLIER FILTER] Original: ${prices.length} items, Filtered: ${filtered.length} items (${prices.length - filtered.length} outliers removed)`);
    console.log(`[OUTLIER FILTER] Bounds: $${lowerBound.toFixed(2)} - $${upperBound.toFixed(2)}`);
  }
  
  // Cache the result
  outlierCache.set(key, filtered);
  
  // Limit cache size to prevent memory bloat (keep last 100 results)
  if (outlierCache.size > 100) {
    const firstKey = outlierCache.keys().next().value;
    outlierCache.delete(firstKey);
  }
  
  return filtered;
}

// Calculate weighted median based on price clustering
function calculateWeightedMedian(prices) {
    if (prices.length === 0) return null;
    if (prices.length === 1) return prices[0];
    
    // Group prices by value and count occurrences
    const priceCounts = {};
    prices.forEach(price => {
        // Round to nearest cent to group similar prices
        const roundedPrice = Math.round(price * 100) / 100;
        priceCounts[roundedPrice] = (priceCounts[roundedPrice] || 0) + 1;
    });
    
    // Sort unique prices
    const uniquePrices = Object.keys(priceCounts).map(p => parseFloat(p)).sort((a, b) => a - b);
    
    // Calculate total count
    const totalCount = prices.length;
    const targetCount = totalCount / 2;
    
    // Find weighted median
    let cumulativeCount = 0;
    for (const price of uniquePrices) {
        cumulativeCount += priceCounts[price];
        if (cumulativeCount >= targetCount) {
            console.log(`[WEIGHTED MEDIAN] Price: $${price.toFixed(2)}, Count: ${priceCounts[price]}, Weight: ${(priceCounts[price] / totalCount * 100).toFixed(1)}%`);
            return price;
        }
    }
    
    // Fallback to last price (shouldn't reach here)
    return uniquePrices[uniquePrices.length - 1];
}

/**
 * Internal drawing function - does the actual rendering without guards
 */
function drawBeeswarmInternal(prices, activePrices = []) {
  const canvas = document.getElementById("beeswarmCanvas");
  if (!canvas || !prices || prices.length === 0) return;

  // Ensure canvas is properly sized to its container
  resizeCanvas();
  
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const margin = { top: 60, right: 40, bottom: 70, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  ctx.clearRect(0, 0, width, height);
  
  // Draw chart title
  ctx.fillStyle = "#1d1d1f";
  ctx.font = "bold 16px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";
  ctx.fillText("Price Density", width / 2, 25);

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

  // Show all sold prices — these are actual transactions and users need to see
  // every comp that influenced the FMV range. Only filter active outliers.
  const filteredPrices = validPrices;

  if (filteredPrices.length === 0) {
    ctx.fillStyle = "#6e6e73";
    ctx.font = "16px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.fillText("No data after outlier filtering", width / 2, height / 2);
    return;
  }

  // Pre-filter active prices so they can inform the axis range
  const validActivePrices = (activePrices || []).filter(p => p != null && !isNaN(p) && p > 0).map(p => parseFloat(p));
  const filteredActivePrices = filterOutliers(validActivePrices);

  const minPrice = Math.min(...filteredPrices);
  const maxPrice = Math.max(...filteredPrices);
  const outliersRemoved = validPrices.length - filteredPrices.length;

  // Expand axis to include FMV markers — active prices do NOT expand the axis
  // (active outliers/dreamers would distort the scale; they're clipped instead)
  const fmvValues = [expectLowGlobal, expectHighGlobal, marketValueGlobal].filter(v => v != null && !isNaN(v));
  const dataMin = Math.min(minPrice, ...fmvValues);
  const dataMax = Math.max(maxPrice, ...fmvValues);

  // Center the axis on the midpoint of the displayed data range so the
  // dot cluster appears visually centered rather than left-heavy
  const dataMid = (dataMin + dataMax) / 2;
  const halfSpan = (dataMax - dataMin) / 2;
  const dataPad = halfSpan * 0.15 || dataMin * 0.10 || 0.10;
  const axisMin = dataMid - halfSpan - dataPad;
  const axisMax = dataMid + halfSpan + dataPad;

  // Handle case where all prices are the same
  const priceRange = axisMax - axisMin;

  const xScale = (price) => {
    if (priceRange === 0) {
      return width / 2; // Center all points if all prices are the same
    }
    return margin.left + ((price - axisMin) / priceRange) * innerWidth;
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
    
    // Add FMV dollar value labels (above the bars) with solid text
    ctx.fillStyle = "#34c759";
    ctx.font = "bold 11px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    
    // FMV Low dollar value label (above bar)
    ctx.fillText(formatMoney(expectLowGlobal), x1, margin.top - 8);
    
    // FMV High dollar value label (above bar)
    ctx.fillText(formatMoney(expectHighGlobal), x2, margin.top - 8);
  }

  // --- Build all dots (sold + active) and place with unified collision detection ---
  const centerY = height / 2;
  const maxYOffset = innerHeight / 2 - 10; // use full available vertical space
  const dotRadius = 4;
  const minDist = dotRadius * 2 + 1; // minimum center-to-center distance

  // Combine sold and active into one array so collision detection is global
  const allDots = [];
  filteredPrices.forEach(price => {
    allDots.push({ x: xScale(price), r: dotRadius, type: 'sold' });
  });
  if (filteredActivePrices && filteredActivePrices.length > 0) {
    filteredActivePrices
      .filter(p => p >= axisMin && p <= axisMax)
      .forEach(price => {
        allDots.push({ x: xScale(price), r: dotRadius, type: 'active' });
      });
  }

  // Place all dots with a single collision pass
  const placedPoints = [];
  for (const dot of allDots) {
    let y = centerY;
    let placed = false;

    for (let offset = 0; offset <= maxYOffset; offset += 1) {
      const dirs = offset === 0 ? [0] : [1, -1];
      for (const dir of dirs) {
        const testY = centerY + dir * offset;
        if (testY < margin.top + dot.r || testY > height - margin.bottom - dot.r) continue;

        const collision = placedPoints.some(p => {
          const dx = p.x - dot.x;
          const dy = p.y - testY;
          return Math.sqrt(dx * dx + dy * dy) < minDist;
        });

        if (!collision) {
          y = testY;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    dot.y = y;
    placedPoints.push(dot);
  }

  // Draw all dots
  for (const dot of placedPoints) {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, 2 * Math.PI);
    if (dot.type === 'sold') {
      ctx.fillStyle = "rgba(0, 122, 255, 0.7)";
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 122, 255, 0.9)";
    } else {
      ctx.fillStyle = "rgba(255, 59, 48, 0.6)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 59, 48, 0.85)";
    }
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

  // --- Draw X-Axis Labels ---
  ctx.fillStyle = "#6e6e73";
  ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";

  if (priceRange > 0) {
    // FMV marker with label
    if (marketValueGlobal !== null && priceRange > 0) {
      const fmvX = xScale(marketValueGlobal);
      
      // Draw vertical line for FMV
      ctx.beginPath();
      ctx.moveTo(fmvX, height - margin.bottom);
      ctx.lineTo(fmvX, height - margin.bottom + 5);
      ctx.strokeStyle = "#ff9500";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // FMV label
      ctx.fillStyle = "#6e6e73";
      ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = "center";
      ctx.fillText("FMV", fmvX, height - margin.bottom + 15);
      ctx.fillStyle = "#ff9500";
      ctx.font = "bold 12px " + getComputedStyle(document.body).fontFamily;
      ctx.fillText(formatMoney(marketValueGlobal), fmvX, height - margin.bottom + 30);
    }
  } else {
    // All prices are the same
    ctx.fillText(formatMoney(minPrice), width / 2, height - margin.bottom + 20);
    ctx.fillText("(All prices identical)", width / 2, height - margin.bottom + 35);
  }
  
  // Draw legend at bottom (centered) — Sold | Active | FMV Range
  const legendY = height - 15;
  ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
  const dotR = 6;
  const spacing = 6;
  const itemGap = 24;

  const items = [
    { label: "Sold Listings",   color: "rgba(0, 122, 255, 0.7)",  stroke: "rgba(0, 122, 255, 0.9)",  type: "dot" },
    { label: "Active Listings", color: "rgba(255, 59, 48, 0.6)",  stroke: "rgba(255, 59, 48, 0.85)", type: "dot" },
    { label: "FMV Range",       color: "rgba(52, 199, 89, 0.35)", stroke: "rgba(52, 199, 89, 0.8)",  type: "rect" },
  ];

  // Measure total width
  const itemWidths = items.map(item => {
    const iconW = item.type === "dot" ? dotR * 2 : 20;
    return iconW + spacing + ctx.measureText(item.label).width;
  });
  const totalW = itemWidths.reduce((a, b) => a + b, 0) + itemGap * (items.length - 1);
  let lx = (width - totalW) / 2;

  items.forEach((item, i) => {
    const iconW = item.type === "dot" ? dotR * 2 : 20;
    if (item.type === "dot") {
      ctx.beginPath();
      ctx.arc(lx + dotR, legendY - 4, dotR, 0, 2 * Math.PI);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = item.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, legendY - 12, iconW, 12);
      ctx.strokeStyle = item.stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(lx, legendY - 12, iconW, 12);
    }
    ctx.fillStyle = "#1d1d1f";
    ctx.textAlign = "left";
    ctx.fillText(item.label, lx + iconW + spacing, legendY - 3);
    lx += itemWidths[i] + itemGap;
  });
  
  // Store chart metadata for interactive crosshair
  canvas.dataset.minPrice = minPrice;
  canvas.dataset.maxPrice = maxPrice;
  canvas.dataset.marginLeft = margin.left;
  canvas.dataset.marginRight = margin.right;
  canvas.dataset.marginTop = margin.top;
  canvas.dataset.marginBottom = margin.bottom;
  canvas.dataset.innerWidth = innerWidth;
  
  // Make canvas interactive
  canvas.style.cursor = 'crosshair';
  
  // PERFORMANCE FIX: Only attach event listeners once to prevent accumulation
  if (!beeswarmListenersAttached) {
    canvas.addEventListener('mousemove', handleBeeswarmHover);
    canvas.addEventListener('click', handleBeeswarmClick);
    canvas.addEventListener('touchmove', handleBeeswarmTouch, { passive: false });
    canvas.addEventListener('touchend', handleBeeswarmTouchEnd);
    beeswarmListenersAttached = true;
    if (window.DEBUG_MODE.BEESWARM) {
        console.log('[BEESWARM] Event listeners attached (one-time setup)');
    }
  }
  
  // Draw persisted crosshair if it exists (without recursive redraw)
  if (beeswarmCrosshairX !== null && !isRedrawingBeeswarm) {
      drawBeeswarmCrosshairDirect(canvas, beeswarmCrosshairX);
  }
}

// ============================================================================
// SHARED CROSSHAIR — works on any chart canvas with axis metadata
// ============================================================================

function drawChartCrosshair(canvas, x) {
  const axMin = parseFloat(canvas.dataset.axisMin);
  const axMax = parseFloat(canvas.dataset.axisMax);
  const mLeft = parseFloat(canvas.dataset.marginLeft);
  const mRight = parseFloat(canvas.dataset.marginRight);
  const mTop = parseFloat(canvas.dataset.marginTop);
  const mBottom = parseFloat(canvas.dataset.marginBottom);
  const iWidth = parseFloat(canvas.dataset.innerWidth);

  if (x < mLeft || x > canvas.width - mRight) return;

  const price = axMin + ((x - mLeft) / iWidth) * (axMax - axMin);
  const ctx = canvas.getContext('2d');
  const h = canvas.height;

  // Vertical line
  ctx.strokeStyle = 'rgba(255, 149, 0, 1.0)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, mTop);
  ctx.lineTo(x, h - mBottom);
  ctx.stroke();

  // Tooltip
  const priceText = formatMoney(price);
  ctx.font = 'bold 14px sans-serif';
  const tw = ctx.measureText(priceText).width;
  const pad = 8;
  const tipW = tw + pad * 2;
  const tipH = 28;
  const radius = 4;

  let tipX = x - tipW / 2;
  tipX = Math.max(mLeft, Math.min(tipX, canvas.width - mRight - tipW));
  const tipY = mTop - 10;

  // Rounded rect background
  ctx.fillStyle = 'rgba(255, 149, 0, 1.0)';
  ctx.beginPath();
  ctx.moveTo(tipX + radius, tipY - tipH);
  ctx.lineTo(tipX + tipW - radius, tipY - tipH);
  ctx.quadraticCurveTo(tipX + tipW, tipY - tipH, tipX + tipW, tipY - tipH + radius);
  ctx.lineTo(tipX + tipW, tipY - radius);
  ctx.quadraticCurveTo(tipX + tipW, tipY, tipX + tipW - radius, tipY);
  ctx.lineTo(tipX + radius, tipY);
  ctx.quadraticCurveTo(tipX, tipY, tipX, tipY - radius);
  ctx.lineTo(tipX, tipY - tipH + radius);
  ctx.quadraticCurveTo(tipX, tipY - tipH, tipX + radius, tipY - tipH);
  ctx.closePath();
  ctx.fill();

  // Price text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(priceText, tipX + tipW / 2, tipY - tipH / 2 + 5);
}

// ============================================================================
// MIRRORED STRIP PLOT — Sold above axis, Active below axis
// ============================================================================

function drawMirroredStrip(prices, activePrices) {
  const canvas = document.getElementById("mirroredStripCanvas");
  if (!canvas || !prices || prices.length === 0) return;

  resizeCanvasToContainer(canvas, 400);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const margin = { top: 60, right: 40, bottom: 70, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  ctx.clearRect(0, 0, width, height);

  // Title
  ctx.fillStyle = "#1d1d1f";
  ctx.font = "bold 16px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";
  ctx.fillText("Price Density", width / 2, 15);

  const validPrices = prices.filter(p => p != null && !isNaN(p) && p > 0).map(Number);
  const filteredPrices = filterOutliers(validPrices);
  if (filteredPrices.length === 0) return;

  const validActive = (activePrices || []).filter(p => p != null && !isNaN(p) && p > 0).map(Number);
  const filteredActive = filterOutliers(validActive);

  // Axis range — use shared range if available
  const axisMin = sharedChartAxisMin != null ? sharedChartAxisMin : (() => {
    const fmvValues = [expectLowGlobal, expectHighGlobal, marketValueGlobal].filter(v => v != null && !isNaN(v));
    const dMin = Math.min(Math.min(...filteredPrices), ...fmvValues);
    const dMax = Math.max(Math.max(...filteredPrices), ...fmvValues);
    const dMid = (dMin + dMax) / 2; const hSpan = (dMax - dMin) / 2;
    const dPad = hSpan * 0.15 || dMin * 0.10 || 0.10;
    return dMid - hSpan - dPad;
  })();
  const axisMax = sharedChartAxisMax != null ? sharedChartAxisMax : (() => {
    const fmvValues = [expectLowGlobal, expectHighGlobal, marketValueGlobal].filter(v => v != null && !isNaN(v));
    const dMin = Math.min(Math.min(...filteredPrices), ...fmvValues);
    const dMax = Math.max(Math.max(...filteredPrices), ...fmvValues);
    const dMid = (dMin + dMax) / 2; const hSpan = (dMax - dMin) / 2;
    const dPad = hSpan * 0.15 || dMin * 0.10 || 0.10;
    return dMid + hSpan + dPad;
  })();
  const priceRange = axisMax - axisMin;

  const xScale = (price) => priceRange === 0 ? width / 2 : margin.left + ((price - axisMin) / priceRange) * innerWidth;
  const centerY = margin.top + innerHeight / 2;

  // Center axis line
  ctx.strokeStyle = "#d2d2d7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin.left, centerY);
  ctx.lineTo(width - margin.right, centerY);
  ctx.stroke();

  // FMV band
  if (expectLowGlobal !== null && expectHighGlobal !== null && priceRange > 0) {
    const x1 = xScale(expectLowGlobal);
    const x2 = xScale(expectHighGlobal);
    const gradient = ctx.createLinearGradient(x1, margin.top, x2, height - margin.bottom);
    gradient.addColorStop(0, 'rgba(52, 199, 89, 0.15)');
    gradient.addColorStop(1, 'rgba(52, 199, 89, 0.08)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x1, margin.top, x2 - x1, innerHeight);
    ctx.strokeStyle = 'rgba(52, 199, 89, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(x1, margin.top); ctx.lineTo(x1, height - margin.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, margin.top); ctx.lineTo(x2, height - margin.bottom); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#34c759";
    ctx.font = "bold 11px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.fillText(formatMoney(expectLowGlobal), x1, margin.top - 8);
    ctx.fillText(formatMoney(expectHighGlobal), x2, margin.top - 8);
  }

  const dotR = 4;
  const minDist = dotR * 2 + 1;
  const halfHeight = innerHeight / 2 - 5;

  // Place sold dots ABOVE center axis
  const placeSold = [];
  for (const price of filteredPrices) {
    const x = xScale(price);
    let y = centerY - dotR - 1;
    for (let offset = 0; offset <= halfHeight; offset += 1) {
      const testY = centerY - dotR - 1 - offset;
      if (testY < margin.top + dotR) break;
      if (!placeSold.some(p => Math.sqrt((p.x - x) ** 2 + (p.y - testY) ** 2) < minDist)) {
        y = testY; break;
      }
    }
    placeSold.push({ x, y });
    ctx.beginPath(); ctx.arc(x, y, dotR, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(0, 122, 255, 0.7)"; ctx.fill();
    ctx.strokeStyle = "rgba(0, 122, 255, 0.9)"; ctx.lineWidth = 1; ctx.stroke();
  }

  // Place active dots BELOW center axis
  const clippedActive = filteredActive.filter(p => p >= axisMin && p <= axisMax);
  const placeActive = [];
  for (const price of clippedActive) {
    const x = xScale(price);
    let y = centerY + dotR + 1;
    for (let offset = 0; offset <= halfHeight; offset += 1) {
      const testY = centerY + dotR + 1 + offset;
      if (testY > height - margin.bottom - dotR) break;
      if (!placeActive.some(p => Math.sqrt((p.x - x) ** 2 + (p.y - testY) ** 2) < minDist)) {
        y = testY; break;
      }
    }
    placeActive.push({ x, y });
    ctx.beginPath(); ctx.arc(x, y, dotR, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255, 59, 48, 0.6)"; ctx.fill();
    ctx.strokeStyle = "rgba(255, 59, 48, 0.85)"; ctx.lineWidth = 1; ctx.stroke();
  }

  // Bottom axis
  ctx.beginPath(); ctx.moveTo(margin.left, height - margin.bottom); ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.strokeStyle = "#d2d2d7"; ctx.lineWidth = 1; ctx.stroke();

  // FMV marker
  if (marketValueGlobal !== null && priceRange > 0) {
    const fmvX = xScale(marketValueGlobal);
    ctx.beginPath(); ctx.moveTo(fmvX, height - margin.bottom); ctx.lineTo(fmvX, height - margin.bottom + 5);
    ctx.strokeStyle = "#ff9500"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#6e6e73"; ctx.font = "11px " + getComputedStyle(document.body).fontFamily; ctx.textAlign = "center";
    ctx.fillText("FMV", fmvX, height - margin.bottom + 15);
    ctx.fillStyle = "#ff9500"; ctx.font = "bold 12px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(formatMoney(marketValueGlobal), fmvX, height - margin.bottom + 30);
  }


  // Legend
  const legendY = height - 15;
  ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
  const items = [
    { label: "Sold Listings", color: "rgba(0, 122, 255, 0.7)", stroke: "rgba(0, 122, 255, 0.9)" },
    { label: "Active Listings", color: "rgba(255, 59, 48, 0.6)", stroke: "rgba(255, 59, 48, 0.85)" },
    { label: "FMV Range", color: "rgba(52, 199, 89, 0.35)", stroke: "rgba(52, 199, 89, 0.8)", type: "rect" },
  ];
  const dotLR = 6; const spacing = 6; const itemGap = 24;
  const itemWidths = items.map(item => { const iconW = item.type === "rect" ? 20 : dotLR * 2; return iconW + spacing + ctx.measureText(item.label).width; });
  const totalW = itemWidths.reduce((a, b) => a + b, 0) + itemGap * (items.length - 1);
  let lx = (width - totalW) / 2;
  items.forEach((item, i) => {
    const iconW = item.type === "rect" ? 20 : dotLR * 2;
    if (item.type === "rect") {
      ctx.fillStyle = item.color; ctx.fillRect(lx, legendY - 12, iconW, 12);
      ctx.strokeStyle = item.stroke; ctx.lineWidth = 1; ctx.strokeRect(lx, legendY - 12, iconW, 12);
    } else {
      ctx.beginPath(); ctx.arc(lx + dotLR, legendY - 4, dotLR, 0, 2 * Math.PI);
      ctx.fillStyle = item.color; ctx.fill(); ctx.strokeStyle = item.stroke; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.fillStyle = "#1d1d1f"; ctx.textAlign = "left";
    ctx.fillText(item.label, lx + iconW + spacing, legendY - 3);
    lx += itemWidths[i] + itemGap;
  });

  // Store axis metadata for crosshair
  canvas.dataset.axisMin = axisMin;
  canvas.dataset.axisMax = axisMax;
  canvas.dataset.marginLeft = margin.left;
  canvas.dataset.marginRight = margin.right;
  canvas.dataset.marginTop = margin.top;
  canvas.dataset.marginBottom = margin.bottom;
  canvas.dataset.innerWidth = innerWidth;
  canvas.style.cursor = 'crosshair';

  if (!canvas._crosshairAttached) {
    canvas.addEventListener('click', function(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      drawMirroredStrip(currentBeeswarmPrices, currentBeeswarmActivePrices);
      drawChartCrosshair(canvas, x);
    });
    canvas._crosshairAttached = true;
  }
}

// ============================================================================
// KDE DENSITY CHART — Smooth density curves with rug plot
// ============================================================================

function gaussianKDE(data, bandwidth, xMin, xMax, nPoints) {
  const xs = [];
  const ys = [];
  const step = (xMax - xMin) / nPoints;
  const n = data.length;
  const coeff = 1 / (n * bandwidth * Math.sqrt(2 * Math.PI));
  for (let i = 0; i <= nPoints; i++) {
    const x = xMin + i * step;
    let sum = 0;
    for (const d of data) { const z = (x - d) / bandwidth; sum += Math.exp(-0.5 * z * z); }
    xs.push(x);
    ys.push(sum * coeff);
  }
  return { xs, ys };
}

function drawKDEChart(prices, activePrices) {
  const canvas = document.getElementById("kdeCanvas");
  if (!canvas || !prices || prices.length === 0) return;

  resizeCanvasToContainer(canvas, 350);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const margin = { top: 50, right: 40, bottom: 100, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  ctx.clearRect(0, 0, width, height);

  // No title — shares "Price Density" title from mirrored strip above

  const validPrices = prices.filter(p => p != null && !isNaN(p) && p > 0).map(Number);
  const filteredPrices = filterOutliers(validPrices);
  if (filteredPrices.length === 0) return;

  const validActive = (activePrices || []).filter(p => p != null && !isNaN(p) && p > 0).map(Number);
  const filteredActive = filterOutliers(validActive);

  // Axis range — use shared range from mirrored strip
  const axisMin = sharedChartAxisMin != null ? sharedChartAxisMin : (() => {
    const fmvValues = [expectLowGlobal, expectHighGlobal, marketValueGlobal].filter(v => v != null && !isNaN(v));
    const dMin = Math.min(Math.min(...filteredPrices), ...fmvValues);
    const dMax = Math.max(Math.max(...filteredPrices), ...fmvValues);
    const dMid = (dMin + dMax) / 2; const hSpan = (dMax - dMin) / 2;
    const dPad = hSpan * 0.15 || dMin * 0.10 || 0.10;
    return dMid - hSpan - dPad;
  })();
  const axisMax = sharedChartAxisMax != null ? sharedChartAxisMax : (() => {
    const fmvValues = [expectLowGlobal, expectHighGlobal, marketValueGlobal].filter(v => v != null && !isNaN(v));
    const dMin = Math.min(Math.min(...filteredPrices), ...fmvValues);
    const dMax = Math.max(Math.max(...filteredPrices), ...fmvValues);
    const dMid = (dMin + dMax) / 2; const hSpan = (dMax - dMin) / 2;
    const dPad = hSpan * 0.15 || dMin * 0.10 || 0.10;
    return dMid + hSpan + dPad;
  })();

  const xScale = (v) => margin.left + ((v - axisMin) / (axisMax - axisMin)) * innerWidth;

  const silverman = (data) => {
    const n = data.length;
    const sorted = [...data].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    return 0.9 * Math.min(std, iqr / 1.34) * Math.pow(n, -0.2);
  };

  const nPts = 200;
  const soldKDE = gaussianKDE(filteredPrices, silverman(filteredPrices), axisMin, axisMax, nPts);
  let activeKDE = null;
  if (filteredActive.length > 0) {
    activeKDE = gaussianKDE(filteredActive, silverman(filteredActive), axisMin, axisMax, nPts);
  }

  // Scale KDE by sample count so curve areas are proportional to listing counts
  const totalItems = filteredPrices.length + filteredActive.length;
  const soldScale = totalItems > 0 ? filteredPrices.length / totalItems : 1;
  const activeScale = totalItems > 0 ? filteredActive.length / totalItems : 0;
  const scaledSoldYs = soldKDE.ys.map(y => y * soldScale);
  let scaledActiveYs = [];
  if (activeKDE) scaledActiveYs = activeKDE.ys.map(y => y * activeScale);

  let maxDensity = Math.max(...scaledSoldYs);
  if (scaledActiveYs.length > 0) maxDensity = Math.max(maxDensity, ...scaledActiveYs);
  // Cap curves to 60% of plot height so neither dominates
  const yScale = (v) => height - margin.bottom - (v / maxDensity) * innerHeight * 0.6;

  // FMV band
  if (expectLowGlobal !== null && expectHighGlobal !== null) {
    const x1 = xScale(expectLowGlobal);
    const x2 = xScale(expectHighGlobal);
    ctx.fillStyle = 'rgba(52, 199, 89, 0.1)';
    ctx.fillRect(x1, margin.top, x2 - x1, innerHeight);
    ctx.strokeStyle = 'rgba(52, 199, 89, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(x1, margin.top); ctx.lineTo(x1, height - margin.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, margin.top); ctx.lineTo(x2, height - margin.bottom); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Sold density curve
  ctx.beginPath();
  ctx.moveTo(xScale(soldKDE.xs[0]), yScale(scaledSoldYs[0]));
  for (let i = 1; i < soldKDE.xs.length; i++) ctx.lineTo(xScale(soldKDE.xs[i]), yScale(scaledSoldYs[i]));
  ctx.lineTo(xScale(soldKDE.xs[soldKDE.xs.length - 1]), height - margin.bottom);
  ctx.lineTo(xScale(soldKDE.xs[0]), height - margin.bottom);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 122, 255, 0.25)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 122, 255, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xScale(soldKDE.xs[0]), yScale(scaledSoldYs[0]));
  for (let i = 1; i < soldKDE.xs.length; i++) ctx.lineTo(xScale(soldKDE.xs[i]), yScale(scaledSoldYs[i]));
  ctx.stroke();

  // Active density curve
  if (activeKDE) {
    ctx.beginPath();
    ctx.moveTo(xScale(activeKDE.xs[0]), yScale(scaledActiveYs[0]));
    for (let i = 1; i < activeKDE.xs.length; i++) ctx.lineTo(xScale(activeKDE.xs[i]), yScale(scaledActiveYs[i]));
    ctx.lineTo(xScale(activeKDE.xs[activeKDE.xs.length - 1]), height - margin.bottom);
    ctx.lineTo(xScale(activeKDE.xs[0]), height - margin.bottom);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 59, 48, 0.2)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 59, 48, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xScale(activeKDE.xs[0]), yScale(scaledActiveYs[0]));
    for (let i = 1; i < activeKDE.xs.length; i++) ctx.lineTo(xScale(activeKDE.xs[i]), yScale(scaledActiveYs[i]));
    ctx.stroke();
  }

  // Rug plot
  const rugY = height - margin.bottom;
  filteredPrices.forEach(p => {
    ctx.strokeStyle = "rgba(0, 122, 255, 0.5)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xScale(p), rugY); ctx.lineTo(xScale(p), rugY + 6); ctx.stroke();
  });
  filteredActive.forEach(p => {
    if (p >= axisMin && p <= axisMax) {
      ctx.strokeStyle = "rgba(255, 59, 48, 0.4)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xScale(p), rugY + 6); ctx.lineTo(xScale(p), rugY + 12); ctx.stroke();
    }
  });

  // X-axis
  ctx.beginPath(); ctx.moveTo(margin.left, height - margin.bottom); ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.strokeStyle = "#d2d2d7"; ctx.lineWidth = 1; ctx.stroke();

  // X-axis labels — just min and max at edges
  ctx.fillStyle = "#6e6e73"; ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "left";
  ctx.fillText(formatMoney(axisMin), margin.left, height - margin.bottom + 18);
  ctx.textAlign = "right";
  ctx.fillText(formatMoney(axisMax), width - margin.right, height - margin.bottom + 18);

  // FMV marker — centered below rug plot
  if (marketValueGlobal !== null) {
    const fmvX = xScale(marketValueGlobal);
    ctx.fillStyle = "#6e6e73"; ctx.font = "11px " + getComputedStyle(document.body).fontFamily; ctx.textAlign = "center";
    ctx.fillText("FMV", fmvX, height - margin.bottom + 36);
    ctx.fillStyle = "#ff9500"; ctx.font = "bold 12px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(formatMoney(marketValueGlobal), fmvX, height - margin.bottom + 52);
  }

  // Legend — positioned at very bottom
  const legendY = height - 8;
  ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
  const lgItems = [
    { label: "Sold", color: "rgba(0, 122, 255, 0.25)", stroke: "rgba(0, 122, 255, 0.8)" },
    { label: "Active", color: "rgba(255, 59, 48, 0.2)", stroke: "rgba(255, 59, 48, 0.8)" },
    { label: "FMV Range", color: "rgba(52, 199, 89, 0.35)", stroke: "rgba(52, 199, 89, 0.8)" },
  ];
  const lgWidths = lgItems.map(item => 20 + 6 + ctx.measureText(item.label).width);
  const lgTotal = lgWidths.reduce((a, b) => a + b, 0) + 24;
  let lgx = (width - lgTotal) / 2;
  lgItems.forEach((item, i) => {
    ctx.fillStyle = item.color; ctx.fillRect(lgx, legendY - 10, 20, 10);
    ctx.strokeStyle = item.stroke; ctx.lineWidth = 1.5; ctx.strokeRect(lgx, legendY - 10, 20, 10);
    ctx.fillStyle = "#1d1d1f"; ctx.textAlign = "left";
    ctx.fillText(item.label, lgx + 26, legendY - 1);
    lgx += lgWidths[i] + 24;
  });

  // Store axis metadata for crosshair
  canvas.dataset.axisMin = axisMin;
  canvas.dataset.axisMax = axisMax;
  canvas.dataset.marginLeft = margin.left;
  canvas.dataset.marginRight = margin.right;
  canvas.dataset.marginTop = margin.top;
  canvas.dataset.marginBottom = margin.bottom;
  canvas.dataset.innerWidth = innerWidth;
  canvas.style.cursor = 'crosshair';

  if (!canvas._crosshairAttached) {
    canvas.addEventListener('click', function(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      drawKDEChart(currentBeeswarmPrices, currentBeeswarmActivePrices);
      drawChartCrosshair(canvas, x);
    });
    canvas._crosshairAttached = true;
  }
}

/**
function drawBeeswarm(prices, activePrices = []) {
  // PERFORMANCE FIX: Add diagnostic logging to track call source
  if (window.DEBUG_MODE.BEESWARM) {
    const stack = new Error().stack;
    const callerLine = stack.split('\n')[2]?.trim() || 'unknown';
    console.log('[BEESWARM] drawBeeswarm called from:', callerLine);
  }

  // PERFORMANCE FIX: Don't redraw if we're in the middle of a crosshair update
  if (isRedrawingBeeswarm) {
    if (window.DEBUG_MODE.BEESWARM) {
      console.warn('[BEESWARM] Blocked recursive redraw during crosshair update');
    }
    return;
  }

  // Call internal drawing function
  drawBeeswarmInternal(prices, activePrices);
}

// Draw Price Distribution Bar Chart
function drawPriceDistributionChart(soldData, activeData) {
    if (window.DEBUG_MODE.CHART) {
        console.log('[CHART] drawPriceDistributionChart called with:', {
            hasSoldData: !!soldData,
            hasActiveData: !!activeData,
            soldItems: soldData?.items?.length || 0,
            activeItems: activeData?.items?.length || 0
        });
    }

    // PERFORMANCE FIX: Guard to prevent recursive redraws
    if (isRedrawingVolumeProfile) {
        if (window.DEBUG_MODE.CHART) {
            console.warn('[VOLUME PROFILE] Blocked recursive redraw attempt');
        }
        return;
    }

    isRedrawingVolumeProfile = true;
    
    try {
        const canvas = document.getElementById("priceDistributionCanvas");
        if (!canvas) {
            console.error('[CHART ERROR] Price distribution canvas element not found in DOM');
            // List all canvas elements for debugging
            const allCanvases = document.querySelectorAll('canvas');
            console.log('[CHART DEBUG] Found canvas elements:', Array.from(allCanvases).map(c => c.id));
            return;
        }
        
        // PERFORMANCE FIX: Use IntersectionObserver for lazy chart rendering
        // Check if canvas is currently visible
        const isVisible = canvas.offsetParent !== null;
        
        if (!isVisible) {
            // Set up IntersectionObserver to draw when canvas becomes visible
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && soldData) {
                        if (window.DEBUG_MODE.CHART) {
                            console.log('[CHART] Canvas became visible, drawing chart');
                        }
                        observer.disconnect(); // Stop observing after first render
                        drawPriceDistributionChart(soldData, activeData);
                    }
                });
            }, { threshold: 0.1 });
            
            observer.observe(canvas);
            
            if (window.DEBUG_MODE.CHART) {
                console.log('[CHART] Canvas not visible, IntersectionObserver attached');
            }
            return;
        }
        
        if (window.DEBUG_MODE.CHART) {
            console.log('[CHART] Canvas is visible, proceeding with drawing');
        }
        
        // Set canvas size
        const container = canvas.parentElement;
        if (!container) {
            console.error('[CHART] Canvas container not found');
            return;
        }
        
        const containerWidth = container.offsetWidth;
        
        canvas.width = containerWidth;
        canvas.height = 300;
        canvas.style.width = containerWidth + 'px';
        canvas.style.height = '300px';
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            console.error('[CHART] Could not get canvas context');
            return;
        }
        
        const width = canvas.width;
        const height = canvas.height;
        const margin = { top: 40, right: 40, bottom: 60, left: 60 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        
        ctx.clearRect(0, 0, width, height);
        
        // Draw a test background to verify canvas is rendering
        if (window.DEBUG_MODE.CHART) {
            console.log('[CHART] Drawing test background...');
        }
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);
        
    // Prepare sold data
    let soldPrices = soldData?.items?.map(item => item.total_price).filter(p => p > 0) || [];
    
    // Prepare active data (Buy It Now only)
    let activePrices = activeData?.items?.filter(item => {
        const buyingFormat = (item.buying_format || '').toLowerCase();
        return buyingFormat.includes('buy it now');
    }).map(item => {
        return item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
    }).filter(p => p > 0) || [];
    
    if (window.DEBUG_MODE.CHART) {
        console.log('[CHART] Prepared price data (before outlier filtering):', {
            soldCount: soldPrices.length,
            activeCount: activePrices.length,
            soldSample: soldPrices.slice(0, 3),
            activeSample: activePrices.slice(0, 3)
        });
    }
    
    // Filter outliers from both datasets using IQR method
    const soldOriginalCount = soldPrices.length;
    const activeOriginalCount = activePrices.length;
    
    if (soldPrices.length >= 4) {
        soldPrices = filterOutliers(soldPrices);
        if (window.DEBUG_MODE.CHART) {
            console.log('[CHART] Filtered sold outliers:', soldOriginalCount - soldPrices.length, 'removed');
        }
    }
    
    if (activePrices.length >= 4) {
        activePrices = filterOutliers(activePrices);
        if (window.DEBUG_MODE.CHART) {
            console.log('[CHART] Filtered active outliers:', activeOriginalCount - activePrices.length, 'removed');
        }
    }
    
    if (window.DEBUG_MODE.CHART) {
        console.log('[CHART] After outlier filtering:', {
            soldCount: soldPrices.length,
            activeCount: activePrices.length,
            soldMin: soldPrices.length > 0 ? Math.min(...soldPrices) : 'N/A',
            soldMax: soldPrices.length > 0 ? Math.max(...soldPrices) : 'N/A',
            activeMin: activePrices.length > 0 ? Math.min(...activePrices) : 'N/A',
            activeMax: activePrices.length > 0 ? Math.max(...activePrices) : 'N/A'
        });
    }
  
  // Show message if no data, but continue to test rendering
  if (soldPrices.length === 0 && activePrices.length === 0) {
      if (window.DEBUG_MODE.CHART) {
          console.warn('[CHART] No price data available for distribution chart - showing message');
      }
      ctx.fillStyle = "#1d1d1f";
      ctx.font = "bold 16px " + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = "center";
      ctx.fillText("No data available for price distribution", width / 2, height / 2);
      
      ctx.font = "14px " + getComputedStyle(document.body).fontFamily;
      ctx.fillStyle = "#6e6e73";
      ctx.fillText("(Sold and active listing data required)", width / 2, height / 2 + 30);
      if (window.DEBUG_MODE.CHART) {
          console.log('[CHART] Message drawn on canvas');
      }
      return;
  }
  
  if (window.DEBUG_MODE.CHART) {
      console.log('[CHART] Sufficient data, proceeding with chart drawing...');
  }
  
  // Find global min and max across both datasets
  const allPrices = [...soldPrices, ...activePrices];
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice;
  
  // Create price bins - use user setting or default based on device
  const defaultBins = isMobileDevice ? 10 : 25;
  const numBins = volumeProfileBins || defaultBins;
  const binWidth = priceRange / numBins;
  
  // Initialize bins
  const soldBins = new Array(numBins).fill(0);
  const activeBins = new Array(numBins).fill(0);
  
  // Fill sold bins
  soldPrices.forEach(price => {
      let binIndex = Math.floor((price - minPrice) / binWidth);
      if (binIndex >= numBins) binIndex = numBins - 1;
      if (binIndex < 0) binIndex = 0;
      soldBins[binIndex]++;
  });
  
  // Fill active bins
  activePrices.forEach(price => {
      let binIndex = Math.floor((price - minPrice) / binWidth);
      if (binIndex >= numBins) binIndex = numBins - 1;
      if (binIndex < 0) binIndex = 0;
      activeBins[binIndex]++;
  });
  
  // Find max count for scaling
  const maxCount = Math.max(...soldBins, ...activeBins, 1);
  
  // Draw axes
  ctx.strokeStyle = "#d2d2d7";
  ctx.lineWidth = 2;
  
  // Y-axis
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, height - margin.bottom);
  ctx.stroke();
  
  // X-axis
  ctx.beginPath();
  ctx.moveTo(margin.left, height - margin.bottom);
  ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.stroke();
  
  // Draw Y-axis label
  ctx.save();
  ctx.translate(20, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#1d1d1f";
  ctx.font = "bold 14px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";
  ctx.fillText("Number of Sales/Listings", 0, 0);
  ctx.restore();
  
  // Draw X-axis label
  ctx.fillStyle = "#1d1d1f";
  ctx.font = "bold 14px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";
  ctx.fillText("Price", width / 2, height - 10);
  
  // Draw Y-axis ticks and labels
  const yTicks = 5;
  ctx.fillStyle = "#6e6e73";
  ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "right";
  
  for (let i = 0; i <= yTicks; i++) {
      const y = height - margin.bottom - (i / yTicks) * innerHeight;
      const value = Math.round((i / yTicks) * maxCount);
      
      // Tick line
      ctx.strokeStyle = "#e5e5ea";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
      
      // Label
      ctx.fillText(value.toString(), margin.left - 10, y + 4);
  }
  
  // Calculate bar dimensions
  const barAreaWidth = innerWidth / numBins;
  const barWidth = barAreaWidth * 0.8; // 80% of available space
  const barOffset = barAreaWidth * 0.1; // Center the bars
  
  // Draw bars (overlapping)
  for (let i = 0; i < numBins; i++) {
      const x = margin.left + (i * barAreaWidth) + barOffset;
      
      // Draw sold bars (blue) - behind
      if (soldBins[i] > 0) {
          const barHeight = (soldBins[i] / maxCount) * innerHeight;
          const y = height - margin.bottom - barHeight;
          
          ctx.fillStyle = 'rgba(0, 122, 255, 0.6)';
          ctx.fillRect(x, y, barWidth, barHeight);
          
          ctx.strokeStyle = 'rgba(0, 122, 255, 0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, barWidth, barHeight);
      }
      
      // Draw active bars (red) - front (slightly offset for overlap visibility)
      if (activeBins[i] > 0) {
          const barHeight = (activeBins[i] / maxCount) * innerHeight;
          const y = height - margin.bottom - barHeight;
          const offsetX = barWidth * 0.15; // 15% offset to show overlap
          
          ctx.fillStyle = 'rgba(255, 59, 48, 0.6)';
          ctx.fillRect(x + offsetX, y, barWidth, barHeight);
          
          ctx.strokeStyle = 'rgba(255, 59, 48, 0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + offsetX, y, barWidth, barHeight);
      }
  }
  
  // X-axis labels removed - will be shown on hover/touch interaction
  // Store chart metadata for interactive crosshair
  canvas.dataset.minPrice = minPrice;
  canvas.dataset.maxPrice = maxPrice;
  canvas.dataset.marginLeft = margin.left;
  canvas.dataset.marginRight = margin.right;
  canvas.dataset.marginTop = margin.top;
  canvas.dataset.marginBottom = margin.bottom;
  canvas.dataset.innerWidth = innerWidth;
  canvas.dataset.innerHeight = innerHeight;
  
  // PERFORMANCE FIX: Only attach event listeners once to prevent accumulation
  if (!volumeProfileListenersAttached) {
    canvas.addEventListener('mousemove', handleVolumeProfileHover);
    canvas.addEventListener('click', handleVolumeProfileClick);
    canvas.addEventListener('touchmove', handleVolumeProfileTouch, { passive: false });
    canvas.addEventListener('touchend', handleVolumeProfileTouchEnd);
    volumeProfileListenersAttached = true;
    if (window.DEBUG_MODE.CHART) {
        console.log('[VOLUME PROFILE] Event listeners attached (one-time setup)');
    }
  }
  
  // Draw persisted crosshair if it exists (without recursive redraw)
  if (volumeProfileCrosshairX !== null) {
      drawVolumeProfileCrosshairDirect(canvas, volumeProfileCrosshairX);
  }
  
  if (window.DEBUG_MODE.CHART) {
      console.log('[CHART] Price distribution chart drawing completed successfully!');
      console.log('[CHART] Final canvas state:', {
          width: canvas.width,
          height: canvas.height,
          displayWidth: canvas.style.width,
          displayHeight: canvas.style.height
      });
  }
  
  } catch (error) {
      console.error('[CHART ERROR] Failed to draw price distribution chart (non-blocking):', error);
      console.error('[CHART ERROR] Stack trace:', error.stack);
      // Chart failure is graceful - won't block other functionality
  } finally {
      // PERFORMANCE FIX: Always reset guard flag
      isRedrawingVolumeProfile = false;
  }
}

// ============================================================================
// INTERACTIVE VOLUME PROFILE HANDLERS
// ============================================================================

/**
 * Handle mouse movement over Volume Profile chart
 * PERFORMANCE FIX: Disabled hover crosshairs to prevent infinite loop
 * Crosshairs now only work on click/touch
 */
const handleVolumeProfileHover = function(e) {
    // DISABLED: Hover crosshairs cause infinite redraw loops
    // Use click or touch to place persistent crosshair instead
    return;
};

/**
 * Handle touch movement over Volume Profile chart
 * Shows interactive crosshair with price label
 */
function handleVolumeProfileTouch(e) {
    e.preventDefault();
    const canvas = e.target;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    
    const marginLeft = parseFloat(canvas.dataset.marginLeft);
    const marginRight = parseFloat(canvas.dataset.marginRight);
    
    if (x >= marginLeft && x <= canvas.width - marginRight) {
        drawVolumeProfileCrosshair(canvas, x);
    }
}

/**
 * Handle mouse/touch leave - redraw chart without crosshair
 */
function handleVolumeProfileLeave() {
    // Redraw chart without crosshair
    if (lastChartData.soldData) {
        drawPriceDistributionChart(lastChartData.soldData, lastChartData.activeData);
    }
}

/**
 * Draw interactive crosshair on Volume Profile chart
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} x - X coordinate of mouse/touch position
 */
function drawVolumeProfileCrosshair(canvas, x) {
    // Recalculate price from x position
    const minPrice = parseFloat(canvas.dataset.minPrice);
    const maxPrice = parseFloat(canvas.dataset.maxPrice);
    const marginLeft = parseFloat(canvas.dataset.marginLeft);
    const marginTop = parseFloat(canvas.dataset.marginTop);
    const marginBottom = parseFloat(canvas.dataset.marginBottom);
    const innerWidth = parseFloat(canvas.dataset.innerWidth);
    
    const relativeX = x - marginLeft;
    const price = minPrice + (relativeX / innerWidth) * (maxPrice - minPrice);
    
    // Redraw chart first
    drawPriceDistributionChart(lastChartData.soldData, lastChartData.activeData);
    
    const ctx = canvas.getContext('2d');
    const height = canvas.height;
    
    // Draw crosshair line
    ctx.strokeStyle = 'rgba(255, 149, 0, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, height - marginBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw price tooltip
    const priceText = formatMoney(price);
    ctx.font = 'bold 14px sans-serif';
    const textWidth = ctx.measureText(priceText).width;
    const tooltipPadding = 8;
    const tooltipWidth = textWidth + (tooltipPadding * 2);
    const tooltipHeight = 28;
    
    // Position tooltip - keep it within canvas bounds
    let tooltipX = x - (tooltipWidth / 2);
    const minTooltipX = marginLeft;
    const maxTooltipX = canvas.width - marginLeft - tooltipWidth;
    tooltipX = Math.max(minTooltipX, Math.min(tooltipX, maxTooltipX));
    
    const tooltipY = marginTop - 10;
    
    // Draw tooltip background with rounded corners
    ctx.fillStyle = 'rgba(255, 149, 0, 0.95)';
    ctx.beginPath();
    const radius = 4;
    ctx.moveTo(tooltipX + radius, tooltipY - tooltipHeight);
    ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY - tooltipHeight);
    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY - tooltipHeight, tooltipX + tooltipWidth, tooltipY - tooltipHeight + radius);
    ctx.lineTo(tooltipX + tooltipWidth, tooltipY - radius);
    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth - radius, tooltipY);
    ctx.lineTo(tooltipX + radius, tooltipY);
    ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX, tooltipY - radius);
    ctx.lineTo(tooltipX, tooltipY - tooltipHeight + radius);
    ctx.quadraticCurveTo(tooltipX, tooltipY - tooltipHeight, tooltipX + radius, tooltipY - tooltipHeight);
    ctx.closePath();
    ctx.fill();
    
    // Draw tooltip text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(priceText, tooltipX + tooltipWidth / 2, tooltipY - 8);
}

/**
 * Adjust the number of bins in the Volume Profile chart
 * @param {number} delta - Amount to change (positive or negative)
 */
function adjustVolumeBins(delta) {
    const defaultBins = isMobileDevice ? 10 : 25;
    const currentBins = volumeProfileBins || defaultBins;
    const newBins = currentBins + delta;
    
    // Enforce limits: minimum 5 bins, maximum 50 bins
    if (newBins >= 5 && newBins <= 50) {
        volumeProfileBins = newBins;
        
        // Update display
        const binCountDisplay = document.getElementById('volumeBinCount');
        if (binCountDisplay) {
            binCountDisplay.textContent = newBins;
        }
        
        // Redraw chart with new bin count
        if (lastChartData.soldData) {
            drawPriceDistributionChart(lastChartData.soldData, lastChartData.activeData);
        }
        
        if (window.DEBUG_MODE.CHART) {
            console.log('[VOLUME PROFILE] Adjusted bins to:', newBins);
        }
    } else {
        if (window.DEBUG_MODE.CHART) {
            console.log('[VOLUME PROFILE] Bin adjustment blocked - would exceed limits (5-50)');
        }
    }
}

/**
 * Reset Volume Profile bins to default based on device
 */
function resetVolumeBins() {
    const defaultBins = isMobileDevice ? 10 : 25;
    volumeProfileBins = null; // Reset to auto
    
    // Update display
    const binCountDisplay = document.getElementById('volumeBinCount');
    if (binCountDisplay) {
        binCountDisplay.textContent = defaultBins;
    }
    
    // Redraw chart with default bin count
    if (lastChartData.soldData) {
        drawPriceDistributionChart(lastChartData.soldData, lastChartData.activeData);
    }
    
    if (window.DEBUG_MODE.CHART) {
        console.log('[VOLUME PROFILE] Reset bins to default:', defaultBins);
    }
}

// ============================================================================
// INTERACTIVE FMV BEESWARM HANDLERS
// ============================================================================

/**
 * Handle mouse movement over FMV beeswarm chart
 * PERFORMANCE FIX: Disabled hover crosshairs to prevent infinite loop
 * Crosshairs now only work on click/touch
 */
const handleBeeswarmHover = function(e) {
    // DISABLED: Hover crosshairs cause infinite redraw loops
    // Use click or touch to place persistent crosshair instead
    return;
};

/**
 * Handle click on FMV beeswarm chart - persist crosshair
 */
function handleBeeswarmClick(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    const marginLeft = parseFloat(canvas.dataset.marginLeft);
    const marginRight = parseFloat(canvas.dataset.marginRight);
    
    if (x >= marginLeft && x <= canvas.width - marginRight) {
        beeswarmCrosshairX = x;
        drawBeeswarmCrosshair(canvas, x, true);
        if (window.DEBUG_MODE.BEESWARM) {
            console.log('[BEESWARM] Crosshair locked at x:', x);
        }
    }
}

/**
 * Handle touch movement over FMV beeswarm chart
 */
function handleBeeswarmTouch(e) {
    e.preventDefault();
    const canvas = e.target;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    
    const marginLeft = parseFloat(canvas.dataset.marginLeft);
    const marginRight = parseFloat(canvas.dataset.marginRight);
    
    if (x >= marginLeft && x <= canvas.width - marginRight) {
        drawBeeswarmCrosshair(canvas, x, false);
    }
}

/**
 * Handle touch end on FMV beeswarm chart - persist crosshair
 */
function handleBeeswarmTouchEnd(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    
    if (e.changedTouches && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const x = touch.clientX - rect.left;
        
        const marginLeft = parseFloat(canvas.dataset.marginLeft);
        const marginRight = parseFloat(canvas.dataset.marginRight);
        
        if (x >= marginLeft && x <= canvas.width - marginRight) {
            beeswarmCrosshairX = x;
            drawBeeswarmCrosshair(canvas, x, true);
            if (window.DEBUG_MODE.BEESWARM) {
                console.log('[BEESWARM] Crosshair locked at x:', x);
            }
        }
    }
}

/**
 * Draw interactive crosshair on FMV beeswarm chart
 * PERFORMANCE FIX: Only redraws chart for persistent (clicked) crosshairs
 */
function drawBeeswarmCrosshair(canvas, x, isPersisted) {
    // Only redraw for persistent crosshairs (clicks), not hover
    if (!isPersisted) {
        return; // Skip hover crosshairs to prevent infinite loops
    }
    
    // For persistent crosshairs (clicks), do a full redraw
    const savedCrosshair = beeswarmCrosshairX;
    beeswarmCrosshairX = null;
    
    // Redraw chart without crosshair
    const prices = currentBeeswarmPrices;
    if (prices && prices.length > 0) {
        drawBeeswarmInternal(prices, currentBeeswarmActivePrices);    }
    
    // Restore and draw persistent crosshair
    beeswarmCrosshairX = savedCrosshair;
    drawBeeswarmCrosshairDirect(canvas, x, isPersisted);
}

/**
 * Draw crosshair directly on canvas without redrawing the chart
 */
function drawBeeswarmCrosshairDirect(canvas, x, isPersisted = true) {
    const minPrice = parseFloat(canvas.dataset.minPrice);
    const maxPrice = parseFloat(canvas.dataset.maxPrice);
    const marginLeft = parseFloat(canvas.dataset.marginLeft);
    const marginTop = parseFloat(canvas.dataset.marginTop);
    const marginBottom = parseFloat(canvas.dataset.marginBottom);
    const innerWidth = parseFloat(canvas.dataset.innerWidth);
    
    const relativeX = x - marginLeft;
    const price = minPrice + (relativeX / innerWidth) * (maxPrice - minPrice);
    
    const ctx = canvas.getContext('2d');
    const height = canvas.height;
    
    // Draw crosshair line (solid if persisted, dashed if temporary)
    ctx.strokeStyle = isPersisted ? 'rgba(255, 149, 0, 1.0)' : 'rgba(255, 149, 0, 0.8)';
    ctx.lineWidth = isPersisted ? 2.5 : 2;
    ctx.setLineDash(isPersisted ? [] : [5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, height - marginBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw price tooltip
    const priceText = formatMoney(price);
    ctx.font = 'bold 14px sans-serif';
    const textWidth = ctx.measureText(priceText).width;
    const tooltipPadding = 8;
    const tooltipWidth = textWidth + (tooltipPadding * 2);
    const tooltipHeight = 28;
    
    let tooltipX = x - (tooltipWidth / 2);
    const minTooltipX = marginLeft;
    const maxTooltipX = canvas.width - marginLeft - tooltipWidth;
    tooltipX = Math.max(minTooltipX, Math.min(tooltipX, maxTooltipX));
    
    const tooltipY = marginTop - 10;
    
    // Draw tooltip background (more opaque if persisted)
    ctx.fillStyle = isPersisted ? 'rgba(255, 149, 0, 1.0)' : 'rgba(255, 149, 0, 0.95)';
    ctx.beginPath();
    const radius = 4;
    ctx.moveTo(tooltipX + radius, tooltipY - tooltipHeight);
    ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY - tooltipHeight);
    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY - tooltipHeight, tooltipX + tooltipWidth, tooltipY - tooltipHeight + radius);
    ctx.lineTo(tooltipX + tooltipWidth, tooltipY - radius);
    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth - radius, tooltipY);
    ctx.lineTo(tooltipX + radius, tooltipY);
    ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX, tooltipY - radius);
    ctx.lineTo(tooltipX, tooltipY - tooltipHeight + radius);
    ctx.quadraticCurveTo(tooltipX, tooltipY - tooltipHeight, tooltipX + radius, tooltipY - tooltipHeight);
    ctx.closePath();
    ctx.fill();
    
    // Draw tooltip text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(priceText, tooltipX + tooltipWidth / 2, tooltipY - 8);
}

/**
 * Handle click on Volume Profile chart - persist crosshair
 */
function handleVolumeProfileClick(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    const marginLeft = parseFloat(canvas.dataset.marginLeft);
    const marginRight = parseFloat(canvas.dataset.marginRight);
    
    if (x >= marginLeft && x <= canvas.width - marginRight) {
        volumeProfileCrosshairX = x;
        drawVolumeProfileCrosshair(canvas, x, true);
        if (window.DEBUG_MODE.CHART) {
            console.log('[VOLUME PROFILE] Crosshair locked at x:', x);
        }
    }
}

/**
 * Handle touch end on Volume Profile chart - persist crosshair
 */
function handleVolumeProfileTouchEnd(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    
    if (e.changedTouches && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const x = touch.clientX - rect.left;
        
        const marginLeft = parseFloat(canvas.dataset.marginLeft);
        const marginRight = parseFloat(canvas.dataset.marginRight);
        
        if (x >= marginLeft && x <= canvas.width - marginRight) {
            volumeProfileCrosshairX = x;
            drawVolumeProfileCrosshair(canvas, x, true);
            if (window.DEBUG_MODE.CHART) {
                console.log('[VOLUME PROFILE] Crosshair locked at x:', x);
            }
        }
    }
}

/**
 * Draw interactive crosshair on Volume Profile chart with persistence
 * PERFORMANCE FIX: Only redraws chart for persistent (clicked) crosshairs
 */
function drawVolumeProfileCrosshair(canvas, x, isPersisted) {
    // Only redraw for persistent crosshairs (clicks), not hover
    if (!isPersisted) {
        return; // Skip hover crosshairs to prevent infinite loops
    }
    
    // For persistent crosshairs (clicks), do a full redraw
    const savedCrosshair = volumeProfileCrosshairX;
    volumeProfileCrosshairX = null;
    
    // Redraw chart without crosshair
    if (lastChartData.soldData) {
        // Call public function which has guard
        drawPriceDistributionChart(lastChartData.soldData, lastChartData.activeData);
    }
    
    // Restore and draw persistent crosshair
    volumeProfileCrosshairX = savedCrosshair;
    drawVolumeProfileCrosshairDirect(canvas, x, isPersisted);
}

/**
 * Draw crosshair directly on canvas without redrawing the chart
 */
function drawVolumeProfileCrosshairDirect(canvas, x, isPersisted = true) {
    const minPrice = parseFloat(canvas.dataset.minPrice);
    const maxPrice = parseFloat(canvas.dataset.maxPrice);
    const marginLeft = parseFloat(canvas.dataset.marginLeft);
    const marginTop = parseFloat(canvas.dataset.marginTop);
    const marginBottom = parseFloat(canvas.dataset.marginBottom);
    const innerWidth = parseFloat(canvas.dataset.innerWidth);
    
    const relativeX = x - marginLeft;
    const price = minPrice + (relativeX / innerWidth) * (maxPrice - minPrice);
    
    const ctx = canvas.getContext('2d');
    const height = canvas.height;
    
    // Draw crosshair line (solid if persisted, dashed if temporary)
    ctx.strokeStyle = isPersisted ? 'rgba(255, 149, 0, 1.0)' : 'rgba(255, 149, 0, 0.8)';
    ctx.lineWidth = isPersisted ? 2.5 : 2;
    ctx.setLineDash(isPersisted ? [] : [5, 5]);
    ctx.beginPath();
    ctx.moveTo(x, marginTop);
    ctx.lineTo(x, height - marginBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw price tooltip
    const priceText = formatMoney(price);
    ctx.font = 'bold 14px sans-serif';
    const textWidth = ctx.measureText(priceText).width;
    const tooltipPadding = 8;
    const tooltipWidth = textWidth + (tooltipPadding * 2);
    const tooltipHeight = 28;
    
    let tooltipX = x - (tooltipWidth / 2);
    const minTooltipX = marginLeft;
    const maxTooltipX = canvas.width - marginLeft - tooltipWidth;
    tooltipX = Math.max(minTooltipX, Math.min(tooltipX, maxTooltipX));
    
    const tooltipY = marginTop - 10;
    
    // Draw tooltip background (more opaque if persisted)
    ctx.fillStyle = isPersisted ? 'rgba(255, 149, 0, 1.0)' : 'rgba(255, 149, 0, 0.95)';
    ctx.beginPath();
    const radius = 4;
    ctx.moveTo(tooltipX + radius, tooltipY - tooltipHeight);
    ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY - tooltipHeight);
    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY - tooltipHeight, tooltipX + tooltipWidth, tooltipY - tooltipHeight + radius);
    ctx.lineTo(tooltipX + tooltipWidth, tooltipY - radius);
    ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth - radius, tooltipY);
    ctx.lineTo(tooltipX + radius, tooltipY);
    ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX, tooltipY - radius);
    ctx.lineTo(tooltipX, tooltipY - tooltipHeight + radius);
    ctx.quadraticCurveTo(tooltipX, tooltipY - tooltipHeight, tooltipX + radius, tooltipY - tooltipHeight);
    ctx.closePath();
    ctx.fill();
    
    // Draw tooltip text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(priceText, tooltipX + tooltipWidth / 2, tooltipY - 8);
}

// ============================================================================
// SAVE TO PORTFOLIO FUNCTIONALITY
// ============================================================================

/**
 * Save current search results to user's collection
 * Opens the Add to Collection modal with smart parsing
 */
async function saveCurrentSearchToPortfolio() {
    console.log('[SAVE] Opening Add to Collection modal');
    
    // Check if user is authenticated
    if (!window.AuthModule || !window.AuthModule.isAuthenticated()) {
        console.error('[SAVE] User not authenticated');
        if (typeof showError === 'function') {
            showError('Please log in to add cards to your collection');
        } else {
            alert('Please log in to add cards to your collection');
        }
        // Show auth modal
        if (window.AuthModule && window.AuthModule.showAuthModal) {
            window.AuthModule.showAuthModal();
        }
        return;
    }
    
    // Get the current search query
    const searchQuery = document.getElementById('query')?.value || '';
    
    if (!searchQuery) {
        if (typeof showError === 'function') {
            showError('Please run a search first to add a card to your collection');
        } else {
            alert('Please run a search first to add a card to your collection');
        }
        return;
    }
    
    // Get the current FMV from the global variable and round to nearest cent
    const currentFMV = window.marketValueGlobal ? Math.round(window.marketValueGlobal * 100) / 100 : null;
    console.log('[SAVE] Passing FMV to modal:', currentFMV);
    
    // Open the Add to Collection modal with the search query, rounded FMV, and active filters
    if (window.CollectionModule && window.CollectionModule.showAddToCollectionModal) {
        const filters = {
            excludeLots: document.getElementById('exclude_lots')?.checked || false,
            rawOnly: document.getElementById('ungraded_only')?.checked || false,
            baseOnly: document.getElementById('base_only')?.checked || false,
        };
        window.CollectionModule.showAddToCollectionModal(searchQuery, currentFMV, filters);
    } else {
        console.error('[SAVE] CollectionModule not available');
        alert('Collection feature is not available. Please refresh the page.');
    }
}

// Expose function globally for onclick handler
window.saveCurrentSearchToPortfolio = saveCurrentSearchToPortfolio;

// ============================================================================
// PORTFOLIO MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Load a saved search and execute it
 * @param {string} query - The search query to execute
 */
async function loadSavedSearch(query) {
    console.log('[PORTFOLIO] Loading saved search:', query);
    
    // Switch to comps tab
    switchTab('comps');
    
    // Set the query in the search box
    const queryInput = document.getElementById('query');
    if (queryInput) {
        queryInput.value = query;
    }
    
    // Wait a moment for tab switch to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Execute the search
    await runSearch();
}

/**
 * Delete a saved search from the portfolio
 * @param {number} searchId - The ID of the search to delete
 */
async function deleteSavedSearch(searchId) {
    console.log('[PORTFOLIO] Deleting search:', searchId);
    
    if (!confirm('Are you sure you want to delete this saved search?')) {
        return;
    }
    
    // Check if user is authenticated
    if (!window.AuthModule || !window.AuthModule.isAuthenticated()) {
        console.error('[PORTFOLIO] User not authenticated');
        alert('Please log in to delete searches');
        return;
    }
    
    try {
        const supabase = window.AuthModule.getClient();
        if (!supabase) {
            throw new Error('Supabase client not available');
        }
        
        const { error } = await supabase
            .from('saved_searches')
            .delete()
            .eq('id', searchId);
        
        if (error) {
            console.error('[PORTFOLIO] Error deleting search:', error);
            alert('Failed to delete search: ' + (error.message || 'Unknown error'));
            return;
        }
        
        console.log('[PORTFOLIO] Search deleted successfully');
        
        // Refresh the portfolio display
        if (window.AuthModule.displayPortfolio) {
            await window.AuthModule.displayPortfolio();
        }
        
    } catch (error) {
        console.error('[PORTFOLIO] Exception deleting search:', error);
        alert('An error occurred while deleting: ' + error.message);
    }
}

// Expose portfolio functions globally for onclick handlers
window.loadSavedSearch = loadSavedSearch;
window.deleteSavedSearch = deleteSavedSearch;

