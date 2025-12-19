let lastData = null;
let lastActiveData = null; // Store active listings data
let lastMarketValue = null; // Store market value for filtering
let priceDistributionChartTimeout = null; // Track pending chart draw
let lastChartData = { soldData: null, activeData: null }; // Store data for chart redraws

// Mobile detection for deep link functionality
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// iOS-specific detection for link handling
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

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

// Show Market Pressure info popup
function showMarketPressureInfo() {
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
    
    popup.innerHTML = `
        <button id="close-popup" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-color); padding: 0.25rem 0.5rem; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='var(--border-color)'" onmouseout="this.style.background='transparent'">×</button>
        
        <h2 style="margin-top: 0; margin-bottom: 1rem; color: var(--text-color);">📊 Understanding Market Pressure</h2>
        
        <p style="font-size: 0.95rem; color: var(--text-color); line-height: 1.6; margin-bottom: 1.5rem;">
            Market Pressure compares what sellers are <strong>asking today</strong> to what buyers <strong>recently paid</strong>. It does not affect Fair Market Value.
        </p>
        
        <div style="background: linear-gradient(135deg, #f0f0f0 0%, #f8f8f8 100%); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
            <strong style="color: var(--text-color);">Formula:</strong><br>
            <code style="background: white; padding: 0.5rem; border-radius: 4px; display: inline-block; margin-top: 0.5rem; font-size: 0.9rem;">
                (Median Asking Price - FMV) / FMV × 100
            </code>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #666; line-height: 1.4;">
                <em>Note: Outlier prices are filtered using IQR method for accuracy.</em>
            </p>
        </div>
        
        <h3 style="font-size: 1.1rem; margin-bottom: 1rem; color: var(--text-color);">📈 Interpretation Bands</h3>
        
        <div style="display: flex; flex-direction: column; gap: 1rem;">
            <!-- Healthy Band -->
            <div style="background: linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #34c759;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🟢</span>
                    <strong style="color: #34c759;">0% to 15% (HEALTHY)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Normal pricing friction. Sellers price slightly above recent sales to leave room for negotiation.<br>
                    <strong>What to do:</strong> Fair pricing - safe to buy at asking prices or make small offers.
                </p>
            </div>
            
            <!-- Optimistic Band -->
            <div style="background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #007aff;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🔵</span>
                    <strong style="color: #007aff;">15% to 30% (OPTIMISTIC)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Seller optimism. Prices drifting above recent buyer behavior.<br>
                    <strong>What to do:</strong> Make offers 10-20% below asking - sellers are likely open to negotiation.
                </p>
            </div>
            
            <!-- Resistance Band -->
            <div style="background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #ff9500;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🟠</span>
                    <strong style="color: #ff9500;">30% to 50% (RESISTANCE)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Overpriced market. Clear resistance between buyers and sellers.<br>
                    <strong>What to do:</strong> Be patient. Sellers will likely need to lower prices or accept significantly lower offers (20-30% below ask).
                </p>
            </div>
            
            <!-- Unrealistic Band -->
            <div style="background: linear-gradient(135deg, #ffebee 0%, #fff5f5 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #ff3b30;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🔴</span>
                    <strong style="color: #ff3b30;">50%+ (UNREALISTIC)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Unrealistic asking prices. Listings unlikely to transact near current levels.<br>
                    <strong>What to do:</strong> Wait for price corrections or look for better-priced alternatives. These sellers are detached from market reality.
                </p>
            </div>
            
            <!-- Below FMV Band -->
            <div style="background: linear-gradient(135deg, #f0e6ff 0%, #f5f0ff 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #5856d6;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🟣</span>
                    <strong style="color: #5856d6;">Negative % (BELOW FMV)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Opportunity! Sellers are asking less than recent sale prices.<br>
                    <strong>What to do:</strong> Act fast - these may be undervalued or motivated sellers.
                </p>
            </div>
        </div>
        
        <div style="background: linear-gradient(135deg, #fff9e6 0%, #fffcf0 100%); padding: 1rem; border-radius: 8px; margin-top: 1.5rem; border-left: 4px solid #ff9500;">
            <strong style="color: var(--text-color);">💡 Quick Tip:</strong><br>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                Market Pressure above 30% suggests waiting for price corrections or making significantly lower offers. Below 0% indicates potential buying opportunities.
            </p>
        </div>
        
        <div style="background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
            <strong style="color: var(--text-color);">📝 Example:</strong><br>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                If cards recently sold for <strong>$100</strong> (FMV), but current listings ask <strong>$140</strong>, that's <strong>+40% Market Pressure</strong> (Resistance) = sellers are asking too much.
            </p>
        </div>
        
        <div style="background: linear-gradient(135deg, #e6f2ff 0%, #f0f7ff 100%); padding: 1rem; border-radius: 8px; margin-top: 1rem; border-left: 4px solid #007aff;">
            <strong style="color: var(--text-color);">📊 Data Confidence:</strong><br>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #333; line-height: 1.4;">
                • <strong>High:</strong> 10+ active listings<br>
                • <strong>Medium:</strong> 5-9 active listings<br>
                • <strong>Low:</strong> Less than 5 active listings (use with caution)
            </p>
        </div>
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
function showMarketConfidenceInfo() {
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
    
    popup.innerHTML = `
        <button id="close-popup" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-color); padding: 0.25rem 0.5rem; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='var(--border-color)'" onmouseout="this.style.background='transparent'">×</button>
        
        <h2 style="margin-top: 0; margin-bottom: 1rem; color: var(--text-color);">🎯 Understanding Market Confidence</h2>
        
        <p style="font-size: 0.95rem; color: var(--text-color); line-height: 1.6; margin-bottom: 1.5rem;">
            Market Confidence measures how <strong>consistent</strong> prices are in the market. Higher consistency = more reliable data and clearer pricing signals.
        </p>
        
        <div style="background: linear-gradient(135deg, #f0f0f0 0%, #f8f8f8 100%); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
            <strong style="color: var(--text-color);">Formula:</strong><br>
            <code style="background: white; padding: 0.5rem; border-radius: 4px; display: inline-block; margin-top: 0.5rem; font-size: 0.9rem;">
                100 / (1 + Coefficient of Variation / 100)
            </code>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #666; line-height: 1.4;">
                <em>Coefficient of Variation = (Standard Deviation ÷ Average Price) × 100</em>
            </p>
        </div>
        
        <h3 style="font-size: 1.1rem; margin-bottom: 1rem; color: var(--text-color);">📊 Confidence Bands</h3>
        
        <div style="display: flex; flex-direction: column; gap: 1rem;">
            <!-- High Confidence Band -->
            <div style="background: linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #34c759;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🟢</span>
                    <strong style="color: #34c759;">70-100 (HIGH CONFIDENCE)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Prices are very consistent - strong market consensus on value.<br>
                    <strong>What to do:</strong> FMV estimates are highly reliable. Safe to use for pricing decisions.
                </p>
            </div>
            
            <!-- Moderate Confidence Band -->
            <div style="background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #007aff;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🔵</span>
                    <strong style="color: #007aff;">40-69 (MODERATE CONFIDENCE)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Some price variation but overall market is functional.<br>
                    <strong>What to do:</strong> FMV estimates are reasonably reliable. Consider using price ranges.
                </p>
            </div>
            
            <!-- Low Confidence Band -->
            <div style="background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #ff9500;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🟠</span>
                    <strong style="color: #ff9500;">20-39 (LOW CONFIDENCE)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> High price variation - market is less certain.<br>
                    <strong>What to do:</strong> Use caution with FMV estimates. Consider refining search terms or gathering more data.
                </p>
            </div>
            
            <!-- Very Low Confidence Band -->
            <div style="background: linear-gradient(135deg, #ffebee 0%, #fff5f5 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #ff3b30;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🔴</span>
                    <strong style="color: #ff3b30;">0-19 (VERY LOW CONFIDENCE)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Extreme price variation - unreliable market signals.<br>
                    <strong>What to do:</strong> FMV estimates may not be accurate. Refine search or check for data quality issues.
                </p>
            </div>
        </div>
        
        <div style="background: linear-gradient(135deg, #fff9e6 0%, #fffcf0 100%); padding: 1rem; border-radius: 8px; margin-top: 1.5rem; border-left: 4px solid #ff9500;">
            <strong style="color: var(--text-color);">💡 Key Principle:</strong><br>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                Market Confidence tells you how <strong>reliable</strong> the data is, not what the value is. High confidence means prices are clustered together. Low confidence means prices are scattered and unpredictable.
            </p>
        </div>
        
        <div style="background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
            <strong style="color: var(--text-color);">📝 Example:</strong><br>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                If 20 cards sold between $95-$105 (tight range), confidence is <strong>HIGH (80+)</strong>. If they sold between $50-$200 (wide range), confidence is <strong>LOW (30 or less)</strong>.
            </p>
        </div>
        
        <div style="background: linear-gradient(135deg, #e6f2ff 0%, #f0f7ff 100%); padding: 1rem; border-radius: 8px; margin-top: 1rem; border-left: 4px solid #007aff;">
            <strong style="color: var(--text-color);">🔧 Improve Confidence:</strong><br>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #333; line-height: 1.4;">
                • Make search terms more specific (exact card number, parallel type)<br>
                • Filter out unrelated variations (use "Base Only" or exclude parallels)<br>
                • Exclude lots and multi-card listings<br>
                • Check for grading consistency (don't mix raw with graded)
            </p>
        </div>
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
function showLiquidityRiskInfo() {
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
    
    popup.innerHTML = `
        <button id="close-popup" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-color); padding: 0.25rem 0.5rem; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='var(--border-color)'" onmouseout="this.style.background='transparent'">×</button>
        
        <h2 style="margin-top: 0; margin-bottom: 1rem; color: var(--text-color);">💧 Understanding Liquidity Risk</h2>
        
        <p style="font-size: 0.95rem; color: var(--text-color); line-height: 1.6; margin-bottom: 1.5rem;">
            Liquidity Risk measures how easy or difficult it may be to <strong>SELL</strong> a card at or near Fair Market Value. It focuses on <strong>exit risk</strong>, not value.
        </p>
        
        <div style="background: linear-gradient(135deg, #f0f0f0 0%, #f8f8f8 100%); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
            <strong style="color: var(--text-color);">Absorption Ratio:</strong><br>
            <code style="background: white; padding: 0.5rem; border-radius: 4px; display: inline-block; margin-top: 0.5rem; font-size: 0.9rem;">
                Completed Sales / Active Listings
            </code>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #666; line-height: 1.4;">
                <em>Measures demand vs supply based on 90-day sales and current Buy It Now listings.</em>
            </p>
        </div>
        
        <h3 style="font-size: 1.1rem; margin-bottom: 1rem; color: var(--text-color);">📊 Liquidity Bands</h3>
        
        <div style="display: flex; flex-direction: column; gap: 1rem;">
            <!-- High Liquidity Band -->
            <div style="background: linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #34c759;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🟢</span>
                    <strong style="color: #34c759;">Ratio ≥ 1.0 (HIGH LIQUIDITY)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Demand exceeds supply - cards sell quickly.<br>
                    <strong>What to do:</strong> Price competitively to capture demand. Quick exits are likely.
                </p>
            </div>
            
            <!-- Moderate Liquidity Band -->
            <div style="background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #007aff;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🔵</span>
                    <strong style="color: #007aff;">Ratio 0.5-1.0 (MODERATE)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Balanced market with healthy liquidity.<br>
                    <strong>What to do:</strong> Normal market conditions - expect reasonable sell time.
                </p>
            </div>
            
            <!-- Low Liquidity Band -->
            <div style="background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #ff9500;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🟠</span>
                    <strong style="color: #ff9500;">Ratio 0.2-0.5 (LOW LIQUIDITY)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Slow absorption - elevated exit risk.<br>
                    <strong>What to do:</strong> May need patience or competitive pricing to attract buyers.
                </p>
            </div>
            
            <!-- Very Low Liquidity Band -->
            <div style="background: linear-gradient(135deg, #ffebee 0%, #fff5f5 100%); padding: 1rem; border-radius: 8px; border-left: 4px solid #ff3b30;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🔴</span>
                    <strong style="color: #ff3b30;">Ratio < 0.2 (VERY LOW)</strong>
                </div>
                <p style="margin: 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                    <strong>What it means:</strong> Illiquid market - high exit risk.<br>
                    <strong>What to do:</strong> Consider pricing at or below FMV to attract buyers.
                </p>
            </div>
        </div>
        
        <div style="background: linear-gradient(135deg, #fff9e6 0%, #fffcf0 100%); padding: 1rem; border-radius: 8px; margin-top: 1.5rem; border-left: 4px solid #ff9500;">
            <strong style="color: var(--text-color);">💡 Key Principle:</strong><br>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #333; line-height: 1.5;">
                Liquidity Risk does NOT modify FMV. It tells you how easy it will be to sell at that price. High FMV with low liquidity means the card is valuable but may take time to sell.
            </p>
        </div>
        
        <div style="background: linear-gradient(135deg, #e6f2ff 0%, #f0f7ff 100%); padding: 1rem; border-radius: 8px; margin-top: 1rem; border-left: 4px solid #007aff;">
            <strong style="color: var(--text-color);">📊 Data Confidence:</strong><br>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #333; line-height: 1.4;">
                • <strong>High:</strong> 10+ sales AND 10+ active listings<br>
                • <strong>Medium:</strong> 5+ sales AND 5+ active listings<br>
                • <strong>Low:</strong> Below medium thresholds (use with caution)
            </p>
        </div>
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
        message = 'Demand exceeds supply - cards likely sell quickly';
    } else if (absorptionRatio >= 0.5) {
        // Moderate Liquidity: 50-79 range
        score = 50 + (absorptionRatio - 0.5) * 60;
        label = 'Moderate Liquidity';
        statusColor = '#007aff';
        gradient = 'linear-gradient(135deg, #e6f7ff 0%, #ccedff 100%)';
        border = '#99daff';
        message = 'Balanced market - expect reasonable sell time';
    } else if (absorptionRatio >= 0.2) {
        // Low Liquidity: 25-49 range
        score = 25 + (absorptionRatio - 0.2) * 83;
        label = 'Low Liquidity';
        statusColor = '#ff9500';
        gradient = 'linear-gradient(135deg, #fff5e6 0%, #ffe8cc 100%)';
        border = '#ffd699';
        message = 'Slow absorption - may need patience or competitive pricing';
    } else {
        // Very Low Liquidity: 10-24 range
        score = Math.max(10, absorptionRatio * 125);
        label = 'Very Low Liquidity';
        statusColor = '#ff3b30';
        gradient = 'linear-gradient(135deg, #ffebee 0%, #ffcccc 100%)';
        border = '#ff9999';
        message = 'High exit risk - consider pricing at or below FMV';
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

// API key is now handled securely on the backend
const DEFAULT_API_KEY = 'backend-handled';

// Initialize the application on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
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

// Sub-tab management
function switchSubTab(subTabName) {
    // Update sub-tab buttons
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Activate clicked button
    const clickedButton = window.event && window.event.target;
    if (clickedButton) {
        clickedButton.classList.add('active');
    } else {
        // Fallback: find and activate the correct sub-tab button
        document.querySelector(`button[onclick="switchSubTab('${subTabName}')"]`)?.classList.add('active');
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
            drawBeeswarm(currentBeeswarmPrices);
        }, 100);
    }
    
    // Redraw price distribution chart if switching to analysis sub-tab
    if (subTabName === 'analysis') {
        setTimeout(() => {
            const canvas = document.getElementById("priceDistributionCanvas");
            if (canvas && canvas.offsetParent !== null) {
                console.log('[CHART] Analysis tab activated, redrawing price distribution chart');
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

// Intelligence Search Function
async function runIntelligenceSearch() {
    try {
        const query = document.getElementById("intelligence-query").value.trim();
        
        // Validation
        if (!query) {
            throw new Error("Please enter a card search query");
        }

        // Validate query is not empty
        if (!validateSearchQuery(query)) {
            throw new Error("Please enter a card search query");
        }
        
        // Collect card selections and validate
        const cardSelections = [];
        for (let i = 1; i <= 3; i++) {
            const grader = document.getElementById(`card${i}-grader`)?.value.trim();
            const grade = document.getElementById(`card${i}-grade`)?.value.trim();
            
            // Check for incomplete selection (one field filled but not the other)
            if ((grader && !grade) || (!grader && grade)) {
                throw new Error(`Card ${i}: Please enter both Grader and Grade, or leave both empty`);
            }
            
            // If both fields are filled, add to selections
            if (grader && grade) {
                cardSelections.push({
                    cardNumber: i,
                    grader: grader,
                    grade: grade,
                    searchQuery: `${query} "${grader} ${grade}"`
                });
            }
        }
        
        // Validation - at least one card must be completely filled
        if (cardSelections.length === 0) {
            throw new Error("Please enter at least one complete card (both Grader and Grade)");
        }
    
        // API key is handled on backend
        const apiKey = "backend-handled";
        
        // Show loading state
        const insightsContainer = document.getElementById("insights-container");
        insightsContainer.innerHTML = '<div class="loading">Searching across selected cards...</div>';
        
        // Add loading state to button
        const findCardButton = document.querySelector('button[onclick="runIntelligenceSearch()"]');
        const originalFindCardText = findCardButton.innerHTML;
        findCardButton.innerHTML = '⏳ Searching...';
        findCardButton.style.background = 'linear-gradient(135deg, #6c757d, #858a91)';
        findCardButton.disabled = true;
        
        const cardResults = [];
        
        try {
            // Perform search for each selected card
            for (const card of cardSelections) {
                console.log(`[INTELLIGENCE] Searching for Card ${card.cardNumber}: ${card.searchQuery}`);
                
                const params = new URLSearchParams({
                    query: card.searchQuery,
                    pages: 1,
                    delay: 2,
                    ungraded_only: false,
                    api_key: apiKey
                });
                
                const url = `/comps?${params.toString()}`;
                const resp = await fetch(url);
                const data = await resp.json();
                
                if (data.detail) {
                    console.error(`[INTELLIGENCE] Error for Card ${card.cardNumber}:`, data.detail);
                    continue;
                }
                
                console.log(`[INTELLIGENCE] Card ${card.cardNumber} (${card.grader} ${card.grade}): Found ${data.items.length} items`);
                
                // Calculate FMV for this card
                let marketValue = null;
                let fmvLow = null;
                let fmvHigh = null;
                if (data.items && data.items.length > 0) {
                    const fmvResp = await fetch('/fmv', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data.items)
                    });
                    const fmvData = await fmvResp.json();
                    marketValue = fmvData.market_value;
                    fmvLow = fmvData.quick_sale || fmvData.expected_low;
                    fmvHigh = fmvData.patient_sale || fmvData.expected_high;
                }
                
                cardResults.push({
                    cardNumber: card.cardNumber,
                    grader: card.grader,
                    grade: card.grade,
                    data: data,
                    marketValue: marketValue,
                    fmvLow: fmvLow,
                    fmvHigh: fmvHigh
                });
                
                console.log(`[INTELLIGENCE] Card ${card.cardNumber}: Market Value = ${marketValue ? '$' + marketValue.toFixed(2) : 'N/A'}`);
            }
            
            // Display results
            renderCardComparison(cardResults);
            
        } catch (error) {
            console.error('[INTELLIGENCE] Search error:', error);
            insightsContainer.innerHTML = `<div style="color: #ff3b30; text-align: center; padding: 2rem;">
                <strong>Error:</strong> ${escapeHtml(error)}
            </div>`;
        } finally {
            // Restore button state
            findCardButton.innerHTML = originalFindCardText;
            findCardButton.style.background = 'linear-gradient(135deg, #ff9500, #ff6b35)';
            findCardButton.disabled = false;
        }
    } catch (error) {
        console.error('[INTELLIGENCE] Outer error:', error);
        const insightsContainer = document.getElementById("insights-container");
        insightsContainer.innerHTML = `<div style="color: #ff3b30; text-align: center; padding: 2rem;">
            <strong>Error:</strong> ${escapeHtml(error.message)}
        </div>`;
    }
}

function clearIntelligenceSearch() {
    // Clear the search query input
    const queryInput = document.getElementById("intelligence-query");
    if (queryInput) {
        queryInput.value = "";
    }
    
    // Reset all card text inputs
    for (let i = 1; i <= 3; i++) {
        const graderInput = document.getElementById(`card${i}-grader`);
        const gradeInput = document.getElementById(`card${i}-grade`);
        
        if (graderInput) {
            graderInput.value = "";
        }
        
        if (gradeInput) {
            gradeInput.value = "";
        }
    }
    
    // Clear the insights container and show default message
    const insightsContainer = document.getElementById("insights-container");
    if (insightsContainer) {
        insightsContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--subtle-text-color);">
                <h3>🧠 Grading Intelligence</h3>
                <p>Enter a specific card search above to see advanced analytics and insights</p>
            </div>
        `;
    }
    
    console.log('[INTELLIGENCE] Form cleared');
}

function renderCardComparison(cardResults) {
    const container = document.getElementById("insights-container");
    
    if (!cardResults || cardResults.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--subtle-text-color);">
                <h3>🔍 No Results Found</h3>
                <p>No data found for the selected cards. Try different search terms or card selections.</p>
            </div>
        `;
        return;
    }
    
    let comparisonHtml = `
        <div id="card-comparison">
            <h3>💎 Card Comparison Results</h3>
            
            <!-- Beeswarm Chart -->
            <div style="margin-bottom: 2rem; padding: 1.5rem; background: var(--card-background); border-radius: 12px; border: 1px solid var(--border-color);">
                <h4 style="margin-top: 0; margin-bottom: 1rem; text-align: center;">Fair Market Value Ranges</h4>
                <div id="comparison-chart-container" style="width: 100%; position: relative;">
                    <canvas id="comparisonBeeswarmCanvas" style="width: 100%; height: 250px; display: block;"></canvas>
                </div>
            </div>
            
            <div class="psa-results-grid">
    `;
    
    // Create a card for each search result
    cardResults.forEach(result => {
        const data = result.data;
        const cardLabel = `Card ${result.cardNumber}: ${escapeHtml(result.grader)} ${escapeHtml(result.grade)}`;
        const marketValue = result.marketValue;
        
        if (data.items.length === 0) {
            comparisonHtml += `
                <div class="psa-result-card">
                    <h4>${cardLabel}</h4>
                    <div style="text-align: center; padding: 2rem; color: var(--subtle-text-color);">
                        <p>No results found</p>
                    </div>
                </div>
            `;
        } else {
            comparisonHtml += `
                <div class="psa-result-card">
                    <h4>${cardLabel} <span class="item-count">(${data.items.length} items)</span></h4>
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
                            <span class="psa-stat-label">Fair Market Value:</span>
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
    
    // Draw the comparison beeswarm chart after DOM is updated
    setTimeout(() => {
        const canvas = document.getElementById("comparisonBeeswarmCanvas");
        if (canvas) {
            console.log('[CHART] Drawing comparison beeswarm chart with', cardResults.length, 'cards');
            drawComparisonBeeswarm(cardResults);
        } else {
            console.error('[CHART] Canvas element not found');
        }
    }, 200);
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
    canvas.height = 250;
    
    // Update CSS size to match
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = '250px';
}

async function renderData(data, secondData = null, marketValue = null) {
    const resultsDiv = document.getElementById("results");
    
    // Store active data and market value globally for checkbox toggle
    lastActiveData = secondData;
    lastMarketValue = marketValue;
    
    // Create first table
    let html = `
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
          <tbody>
          ${data.items && data.items.length > 0 ? data.items.map(item => {
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
            <tr>
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
        
        // Get checkbox state (default to unchecked on first render)
        const seeAllCheckbox = document.getElementById('see-all-active-listings');
        const showAllListings = seeAllCheckbox ? seeAllCheckbox.checked : false;
        
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
        const headerText = hasMarketValue
            ? (showAllListings ? 'Active Listings' : 'Active Listings Below Fair Market Value')
            : 'Active Listings';
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
              <tbody>
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
                console.log('[ACTIVE LISTING PRICE]', {
                  item_id: item.item_id,
                  title: item.title?.substring(0, 40),
                  total_price: item.total_price,
                  extracted_price: item.extracted_price,
                  extracted_shipping: item.extracted_shipping,
                  calculated_price: itemPrice,
                  displaying: itemPrice
                });
                
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
                  <tr>
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
          <p style="font-size: 0.75rem; color: #666; margin-top: 0.75rem; margin-bottom: 0.5rem; line-height: 1.5;">
            ⚠️ These listings are shown for research purposes only. This is not a recommendation to buy. Always do your own due diligence before purchasing.
          </p>
          <p style="font-size: 0.75rem; color: #999; margin-top: 0.5rem; margin-bottom: 0.75rem;">
            This website is supported by affiliate links. Purchases may earn us a commission at no extra cost to you.
          </p>
        `;
    }
    
    resultsDiv.innerHTML = html;

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
    const fmvData = await updateFmv(data);
    
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
            renderAnalysisDashboard(data, fmvData, secondData);
        } catch (error) {
            console.error('[ERROR] Failed to render Analysis Dashboard, but Comps data is still available:', error);
            // Don't throw - let the Comps data display normally
        }
    }
    const prices = data.items.map(item => item.total_price);
    currentBeeswarmPrices = prices; // Store for resize
    drawBeeswarm(prices);
    
    // Trigger chart animation
    const chartContainer = document.getElementById("chart-container");
    chartContainer.style.opacity = '0';
    await new Promise(resolve => setTimeout(resolve, 100));
    chartContainer.style.opacity = '1';
}

function toggleActiveListingsView() {
    console.log('[DEBUG] Toggle active listings view called');
    
    // Re-render the active listings table with the new checkbox state
    if (lastData && lastActiveData) {
        console.log('[DEBUG] Re-rendering active listings with stored data');
        
        // Get checkbox state
        const seeAllCheckbox = document.getElementById('see-all-active-listings');
        const showAllListings = seeAllCheckbox ? seeAllCheckbox.checked : false;
        
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
            const headerText = hasMarketValue
                ? (showAllListings ? 'Active Listings' : 'Active Listings Below Fair Market Value')
                : 'Active Listings';
            headingContainer.querySelector('h3').textContent = headerText;
        }
        
        console.log('[DEBUG] Active listings table updated');
    } else {
        console.warn('[DEBUG] Cannot toggle - missing stored data');
    }
}

function clearSearch() {
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
    
    // Reset stored data
    lastData = null;
    lastActiveData = null;
    lastMarketValue = null;
    expectLowGlobal = null;
    expectHighGlobal = null;
    marketValueGlobal = null;
    currentBeeswarmPrices = [];
    
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
    const excludeLots = document.getElementById("exclude_lots").checked;
    const ungradedOnly = document.getElementById("ungraded_only").checked;
    const baseOnly = document.getElementById("base_only").checked;
    const excludeAutos = document.getElementById("exclude_autos").checked;
    const noDigital = document.getElementById("no_digital").checked;

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

    if (excludeAutos) {
        const autoExclusions = [
            // Basic auto terms
            '-auto', '-autos', '-"auto."', '-"auto/"', '-"auto rc"',
            '-autograph', '-autographs', '-"autographed"', '-autographes', '-"autograph rc"',
            '-au', '-"au."', '-ato', '-otg',
            
            // Signature terms
            '-signature', '-"signed"', '-"sig"',
            '-"hand signed"', '-"hand-signed"',
            
            // Sticker autos
            '-"sticker auto"', '-"sticker autograph"', '-"sticker sig"',
            
            // Cut signatures
            '-"cut signature"', '-"cut sig"',
            
            // Multi-auto cards
            '-"dual auto"', '-"triple auto"', '-"quad auto"',
            
            // Relic autos
            '-"relic auto"', '-"patch auto"', '-"jersey auto"', '-"bat auto"',
            
            // Rookie autos
            '-"rc auto"', '-"rookie auto"',
            
            // Ink variations
            '-"ink"', '-"blue ink"', '-"red ink"',
            
            // Other autograph terms
            '-"graph"', '-"in person"',
            
            // Certified autos
            '-certified', '-"certified auto"', '-"cert auto"',
            '-"certified autograph issue"',
            
            // Brand-specific autos
            '-"topps autograph"', '-"bowman autograph"',
            '-"leaf auto"', '-"panini auto"',
            
            // Signature series
            '-"signature series"',
            '-"topps archives signature"',
            
            // On-card autos
            '-"on card"', '-"on-card"'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(autoExclusions);
    }

    if (noDigital) {
        const digitalExclusions = [
            '-nft',
            '-"digital"',
            '-"top shot"',
            '-"blockchain"',
            '-"Topps Bunt"',
            '-Bunt'
        ];
        allExcludedPhrases = allExcludedPhrases.concat(digitalExclusions);
    }

    let finalQuery = baseQuery;
    if (allExcludedPhrases.length > 0) {
        finalQuery = `${baseQuery} ${allExcludedPhrases.join(' ')}`;
    }
    console.log('[DEBUG] Constructed query with exclusions:', finalQuery);
    return finalQuery;
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

    let query = getSearchQueryWithExclusions(baseQuery);

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
    
    resultsDiv.innerHTML = `
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

    statsContainer.innerHTML = '<div class="loading">Preparing analytics...</div>';
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

    // Add CSS for loading stages if not already present
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
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

  // reset globals
  expectLowGlobal = null;
  expectHighGlobal = null;

    try {
      // Set up timeout and abort controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errorText = await resp.text();
        
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

      // Update loading stage
      document.getElementById('search-stage').classList.remove('active');
      document.getElementById('analysis-stage').classList.add('active');

      const data = await resp.json();
      if (data.detail) {
        throw new Error(data.detail);
      }

      // Update progress info
      const elapsedTime = Math.round((Date.now() - startTime) / 1000);
      const progressInfo = document.querySelector('.progress-info p');
      if (progressInfo) {
        progressInfo.textContent = `Processing time: ${elapsedTime} seconds`;
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

    // Calculate Fair Market Value first
    console.log('[DEBUG] Calculating Fair Market Value...');
    const fmvResp = await fetch('/fmv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.items)
    });
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
    
    try {
        console.log('[DEBUG] Fetching active listings from:', activeUrl);
        const secondResp = await fetch(activeUrl, { signal: activeController.signal });
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

        await renderData(data, secondData, marketValue);
    } catch (error) {
        console.error('[DEBUG] Active listings fetch failed:', error);
        // Still render the sold data even if active listings fail
        await renderData(data, null, marketValue);
    }
    // Store prices for resize handling (using first search results)
    currentBeeswarmPrices = data.items.map(item => item.total_price);

    } catch (err) {
      const errorHtml = `
        <div class="error-container">
          <div class="error-icon">⚠️</div>
          <div class="error-content">
            <h4>Search Failed</h4>
            <p>${err.message}</p>
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
      console.error('[ERROR] Search failed:', err);
    } finally {
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
    if (confidence >= 70) {
        return `High price consistency (${confidence}/100) based on ${sampleSize} listings`;
    } else if (confidence >= 40) {
        return `Moderate price variation (${confidence}/100) based on ${sampleSize} listings`;
    } else {
        return `⚠️ High price scatter (${confidence}/100) - consider refining search`;
    }
}

/**
 * Generate dominant band statement showing where most activity occurs
 */
function getDominantBandStatement(below, at, above, absBelow, absAt, absAbove) {
    const total = below + at + above;
    if (total === 0) return '';
    
    // Find where most volume is
    const maxListings = Math.max(below, at, above);
    let location = '';
    if (below === maxListings) location = 'below FMV';
    else if (at === maxListings) location = 'at FMV';
    else location = 'above FMV';
    
    // Get absorption for that band
    let absorption = absBelow;
    if (at === maxListings) absorption = absAt;
    if (above === maxListings) absorption = absAbove;
    
    return `Most listings concentrated ${location} with ${absorption} absorption ratio`;
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

// Render Analytics Dashboard for the Analysis sub-tab
function renderAnalysisDashboard(data, fmvData, activeData) {
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
    
    // Market confidence (based on consistency of prices)
    const stdDev = calculateStdDev(prices);
    const coefficientOfVariation = (stdDev / data.avg_price) * 100;
    // Use a scaled formula that handles high variability better
    // CoV=0% → confidence=100, CoV=100% → confidence=50, CoV=200% → confidence=33
    const marketConfidence = Math.round(100 / (1 + coefficientOfVariation / 100));
    
    // FMV vs Average comparison
    const marketValue = fmvData?.market_value || data.avg_price;
    const fmvVsAvg = ((marketValue - data.avg_price) / data.avg_price * 100);
    
    // Calculate Market Pressure % using active listings
    let marketPressure = null;
    let medianAskingPrice = null;
    let marketPressureStatus = null;
    let marketPressureLabel = null;
    let marketPressureColor = null;
    let marketPressureGradient = null;
    let marketPressureBorder = null;
    
    console.log('[MARKET PRESSURE DEBUG] Checking activeData:', {
        hasActiveData: !!activeData,
        hasItems: activeData?.items ? true : false,
        itemsLength: activeData?.items?.length || 0,
        activeDataKeys: activeData ? Object.keys(activeData) : [],
        sampleItem: activeData?.items?.[0] ? {
            item_id: activeData.items[0].item_id,
            title: activeData.items[0].title?.substring(0, 50),
            total_price: activeData.items[0].total_price,
            extracted_price: activeData.items[0].extracted_price,
            extracted_shipping: activeData.items[0].extracted_shipping
        } : null
    });
    
    // Track variables for sample size and confidence
    let sampleSize = 0;
    let dataConfidence = 'N/A';
    
    if (activeData && activeData.items && activeData.items.length > 0) {
        // Step 1: Deduplicate by seller - group listings by seller, get median of each seller's prices
        const sellerPrices = {};
        activeData.items.forEach(item => {
            const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
            const sellerName = item.seller?.name || `unknown_${item.item_id}`;
            
            if (price > 0) {
                if (!sellerPrices[sellerName]) sellerPrices[sellerName] = [];
                sellerPrices[sellerName].push(price);
            }
        });
        
        // Get one price per seller (their median if they have multiple listings)
        let askingPrices = Object.values(sellerPrices).map(prices => {
            const sorted = prices.sort((a, b) => a - b);
            return sorted[Math.floor(sorted.length / 2)];
        });
        
        console.log('[MARKET PRESSURE DEBUG] After seller deduplication:', {
            totalItems: activeData.items.length,
            uniqueSellers: Object.keys(sellerPrices).length,
            deduplicatedPrices: askingPrices.length,
            priceRange: askingPrices.length > 0 ? `${formatMoney(Math.min(...askingPrices))} - ${formatMoney(Math.max(...askingPrices))}` : 'N/A'
        });
        
        // Step 2: Apply IQR outlier filtering to deduplicated asking prices
        if (askingPrices.length >= 4) {
            const originalCount = askingPrices.length;
            askingPrices = filterOutliers(askingPrices);
            console.log('[MARKET PRESSURE DEBUG] IQR filtering removed', (originalCount - askingPrices.length), 'outlier asking prices');
        }
        
        sampleSize = askingPrices.length;
        
        // Determine confidence level based on sample size
        if (sampleSize >= 10) {
            dataConfidence = 'High';
        } else if (sampleSize >= 5) {
            dataConfidence = 'Medium';
        } else if (sampleSize > 0) {
            dataConfidence = 'Low';
        }
        
        console.log('[MARKET PRESSURE DEBUG] After filtering:', {
            filteredPrices: askingPrices.length,
            sampleSize: sampleSize,
            confidence: dataConfidence
        });
        
        if (askingPrices.length > 0) {
            // Step 3: Calculate weighted median asking price (based on price clustering)
            medianAskingPrice = calculateWeightedMedian(askingPrices);
            
            console.log('[MARKET PRESSURE DEBUG] Weighted median calculation:', {
                weightedMedian: formatMoney(medianAskingPrice),
                simpleMedian: formatMoney(askingPrices[Math.floor(askingPrices.length / 2)])
            });
            
            // Calculate Market Pressure %: (Weighted Median Asking Price - FMV) / FMV
            marketPressure = ((medianAskingPrice - marketValue) / marketValue) * 100;
            
            // Determine status based on interpretation bands
            if (marketPressure >= 0 && marketPressure <= 15) {
                marketPressureStatus = 'HEALTHY';
                marketPressureLabel = 'Healthy pricing friction';
                marketPressureColor = '#34c759';
                marketPressureGradient = 'linear-gradient(135deg, #e6ffe6 0%, #ccffcc 100%)';
                marketPressureBorder = '#99ff99';
            } else if (marketPressure > 15 && marketPressure <= 30) {
                marketPressureStatus = 'OPTIMISTIC';
                marketPressureLabel = 'Seller optimism';
                marketPressureColor = '#007aff';
                marketPressureGradient = 'linear-gradient(135deg, #e6f7ff 0%, #ccedff 100%)';
                marketPressureBorder = '#99daff';
            } else if (marketPressure > 30 && marketPressure <= 50) {
                marketPressureStatus = 'RESISTANCE';
                marketPressureLabel = 'Market resistance';
                marketPressureColor = '#ff9500';
                marketPressureGradient = 'linear-gradient(135deg, #fff5e6 0%, #ffe8cc 100%)';
                marketPressureBorder = '#ffd699';
            } else if (marketPressure > 50) {
                marketPressureStatus = 'UNREALISTIC';
                marketPressureLabel = 'Unrealistic asking prices';
                marketPressureColor = '#ff3b30';
                marketPressureGradient = 'linear-gradient(135deg, #ffebee 0%, #ffcccc 100%)';
                marketPressureBorder = '#ff9999';
            } else {
                // Negative pressure (asking prices below FMV)
                marketPressureStatus = 'BELOW FMV';
                marketPressureLabel = 'Asking below FMV';
                marketPressureColor = '#5856d6';
                marketPressureGradient = 'linear-gradient(135deg, #f0e6ff 0%, #e6ccff 100%)';
                marketPressureBorder = '#d6b3ff';
            }
        }
    }
    
    // Price distribution quartiles
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const q1 = sortedPrices[Math.floor(sortedPrices.length * 0.25)];
    const median = sortedPrices[Math.floor(sortedPrices.length * 0.5)];
    const q3 = sortedPrices[Math.floor(sortedPrices.length * 0.75)];
    
    // Calculate Liquidity Risk Score using new absorption ratio method
    // Error handling to prevent calculation failures from blocking Analysis display
    let liquidityRisk = null;
    try {
        liquidityRisk = calculateLiquidityRisk(data, activeData);
        console.log('[LIQUIDITY RISK] Calculation result:', liquidityRisk);
    } catch (error) {
        console.error('[LIQUIDITY RISK] Error calculating (non-blocking):', error);
        liquidityRisk = {
            score: null,
            label: 'Calculation Error',
            absorptionRatio: null,
            salesCount: data?.items?.length || 0,
            listingsCount: 0,
            confidence: 'N/A',
            statusColor: '#6e6e73',
            gradient: 'linear-gradient(135deg, #f5f5f7 0%, #e5e5ea 100%)',
            border: '#d1d1d6',
            message: 'Unable to calculate liquidity risk'
        };
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
    
    const dashboardHtml = `
        <div id="analysis-dashboard">
            <h3 style="margin-bottom: 1.5rem; color: var(--text-color); text-align: center;">📊 Market Analysis Dashboard</h3>
            
            <!-- Disclaimer -->
            <p style="margin: 0 0 2rem 0; font-size: 0.75rem; color: #666; text-align: center; line-height: 1.5;">
                ⚠️ This analysis is for informational purposes only. It is not financial or investment advice. Always do your own research before making decisions.
            </p>
            
            <!-- Sample Size Warning (Phase 1.1) -->
            ${getSampleSizeWarning(data.items.length, activeData?.items?.length || 0, sampleSize)}
            
            <!-- Market Risk Assessment (moved to top) -->
            ${marketPressure !== null && liquidityRisk && liquidityRisk.score !== null ?
                renderMarketAssessment(
                    marketPressure,
                    liquidityRisk,
                    { belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove, salesBelow, salesAt, salesAbove },
                    marketConfidence,
                    data,
                    activeData
                )
            : ''}
            
            <!-- Key Indicators Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                
                <!-- Market Pressure % -->
                ${marketPressure !== null ? `
                <div class="indicator-card" style="background: ${marketPressureGradient}; padding: 1.5rem; border-radius: 12px; border: 1px solid ${marketPressureBorder}; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); position: relative;" title="Market Pressure compares what sellers are asking today to what buyers recently paid">
                    <button onclick="showMarketPressureInfo(); event.stopPropagation();" style="position: absolute; top: 0.75rem; right: 0.75rem; background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(0, 0, 0, 0.1); border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);" onmouseover="this.style.background='rgba(255, 255, 255, 1)'; this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.15)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.9)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.1)';" title="Learn about Market Pressure bands"><svg width="16" height="16" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" style="display: block;"><path fill="#666" fill-rule="evenodd" d="M10 3a7 7 0 100 14 7 7 0 000-14zm-9 7a9 9 0 1118 0 9 9 0 01-18 0zm8-4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm.01 8a1 1 0 102 0V9a1 1 0 10-2 0v5z"/></svg></button>
                    <div style="margin-bottom: 0.5rem;">
                        <span style="font-size: 0.85rem; color: #666; font-weight: 500;">Market Pressure</span>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: ${marketPressureColor}; margin-bottom: 0.5rem; line-height: 1;">
                        ${marketPressure >= 0 ? '+' : ''}${marketPressure.toFixed(1)}%
                    </div>
                    <div style="font-size: 0.75rem; color: #666; line-height: 1.4; margin-bottom: 0.5rem;">
                        ${marketPressureLabel}
                    </div>
                    <div style="font-size: 0.7rem; color: #999; line-height: 1.3; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1);">
                        <strong>Sample:</strong> ${sampleSize} listings (${dataConfidence} confidence)<br>
                        <strong>Median Ask:</strong> ${formatMoney(medianAskingPrice)}<br>
                        <strong>FMV:</strong> ${formatMoney(marketValue)}
                    </div>
                </div>
                ` : `
                <div class="indicator-card" style="background: linear-gradient(135deg, #f5f5f7 0%, #e5e5ea 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #d1d1d6; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); position: relative;">
                    <button onclick="showMarketPressureInfo(); event.stopPropagation();" style="position: absolute; top: 0.75rem; right: 0.75rem; background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(0, 0, 0, 0.1); border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);" onmouseover="this.style.background='rgba(255, 255, 255, 1)'; this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.15)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.9)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.1)';" title="Learn about Market Pressure bands"><svg width="16" height="16" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" style="display: block;"><path fill="#666" fill-rule="evenodd" d="M10 3a7 7 0 100 14 7 7 0 000-14zm-9 7a9 9 0 1118 0 9 9 0 01-18 0zm8-4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm.01 8a1 1 0 102 0V9a1 1 0 10-2 0v5z"/></svg></button>
                    <div style="margin-bottom: 0.5rem;">
                        <span style="font-size: 0.85rem; color: #666; font-weight: 500;">Market Pressure</span>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: #6e6e73; margin-bottom: 0.5rem; line-height: 1;">
                        --
                    </div>
                    <div style="font-size: 0.75rem; color: #666; line-height: 1.4;">
                        No active listings data
                    </div>
                </div>
                `}
                
                <!-- Market Confidence -->
                <div class="indicator-card" style="background: linear-gradient(135deg, #e6f7ff 0%, #ccedff 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #99daff; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.15); position: relative;" title="Market Confidence measures how consistent prices are">
                    <button onclick="showMarketConfidenceInfo(); event.stopPropagation();" style="position: absolute; top: 0.75rem; right: 0.75rem; background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(0, 0, 0, 0.1); border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);" onmouseover="this.style.background='rgba(255, 255, 255, 1)'; this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.15)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.9)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.1)';" title="Learn about Market Confidence"><svg width="16" height="16" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" style="display: block;"><path fill="#666" fill-rule="evenodd" d="M10 3a7 7 0 100 14 7 7 0 000-14zm-9 7a9 9 0 1118 0 9 9 0 01-18 0zm8-4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm.01 8a1 1 0 102 0V9a1 1 0 10-2 0v5z"/></svg></button>
                    <div style="margin-bottom: 0.5rem;">
                        <span style="font-size: 0.85rem; color: #666; font-weight: 500;">Market Confidence</span>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: #007aff; margin-bottom: 0.5rem; line-height: 1;">
                        ${marketConfidence.toFixed(0)}/100
                    </div>
                    <div style="font-size: 0.75rem; color: #666; line-height: 1.4; margin-bottom: 0.5rem;">
                        ${marketConfidence >= 70 ? 'Strong price consensus' : marketConfidence >= 40 ? 'Moderate price variation' : marketConfidence >= 20 ? 'High price variation' : 'Extreme price scatter'}
                    </div>
                    <div style="font-size: 0.7rem; color: #999; line-height: 1.3; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1);">
                        <strong>CoV:</strong> ${coefficientOfVariation.toFixed(1)}%<br>
                        <strong>Std Dev:</strong> ${formatMoney(stdDev)}<br>
                        <strong>Sample:</strong> ${data.items.length} sales
                    </div>
                </div>
                
                <!-- Liquidity Risk Score (NEW) -->
                ${liquidityRisk && liquidityRisk.score !== null ? `
                <div class="indicator-card" style="background: ${liquidityRisk.gradient}; padding: 1.5rem; border-radius: 12px; border: 1px solid ${liquidityRisk.border}; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); position: relative;" title="Liquidity Risk measures how easy it is to sell this card at or near FMV">
                    <button onclick="showLiquidityRiskInfo(); event.stopPropagation();" style="position: absolute; top: 0.75rem; right: 0.75rem; background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(0, 0, 0, 0.1); border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);" onmouseover="this.style.background='rgba(255, 255, 255, 1)'; this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.15)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.9)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.1)';" title="Learn about Liquidity Risk"><svg width="16" height="16" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" style="display: block;"><path fill="#666" fill-rule="evenodd" d="M10 3a7 7 0 100 14 7 7 0 000-14zm-9 7a9 9 0 1118 0 9 9 0 01-18 0zm8-4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm.01 8a1 1 0 102 0V9a1 1 0 10-2 0v5z"/></svg></button>
                    <div style="margin-bottom: 0.5rem;">
                        <span style="font-size: 0.85rem; color: #666; font-weight: 500;">Liquidity</span>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: ${liquidityRisk.statusColor}; margin-bottom: 0.5rem; line-height: 1;">
                        ${liquidityRisk.score}/100
                    </div>
                    <div style="font-size: 0.75rem; color: #666; line-height: 1.4; margin-bottom: 0.5rem;">
                        ${liquidityRisk.message}
                    </div>
                    <div style="font-size: 0.7rem; color: #999; line-height: 1.3; padding-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.1);">
                        <strong>Absorption Ratio:</strong> ${liquidityRisk.absorptionRatio || 'N/A'}<br>
                        <strong>Sales:</strong> ${liquidityRisk.salesCount || 0} | <strong>Listings:</strong> ${liquidityRisk.listingsCount || 0}<br>
                        <strong>Confidence:</strong> ${liquidityRisk.confidence || 'N/A'}
                    </div>
                </div>
                ` : `
                <div class="indicator-card" style="background: linear-gradient(135deg, #f5f5f7 0%, #e5e5ea 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #d1d1d6; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); position: relative;">
                    <button onclick="showLiquidityRiskInfo(); event.stopPropagation();" style="position: absolute; top: 0.75rem; right: 0.75rem; background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(0, 0, 0, 0.1); border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);" onmouseover="this.style.background='rgba(255, 255, 255, 1)'; this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.15)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.9)'; this.style.boxShadow='0 2px 4px rgba(0, 0, 0, 0.1)';" title="Learn about Liquidity Risk"><svg width="16" height="16" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" fill="none" style="display: block;"><path fill="#666" fill-rule="evenodd" d="M10 3a7 7 0 100 14 7 7 0 000-14zm-9 7a9 9 0 1118 0 9 9 0 01-18 0zm8-4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm.01 8a1 1 0 102 0V9a1 1 0 10-2 0v5z"/></svg></button>
                    <div style="margin-bottom: 0.5rem;">
                        <span style="font-size: 0.85rem; color: #666; font-weight: 500;">Liquidity</span>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: #6e6e73; margin-bottom: 0.5rem; line-height: 1;">
                        --
                    </div>
                    <div style="font-size: 0.75rem; color: #666; line-height: 1.4;">
                        ${liquidityRisk && liquidityRisk.message ? liquidityRisk.message : 'No active listings data'}
                    </div>
                </div>
                `}
            </div>
            
            <!-- Price Distribution Analysis -->
            <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
                <h4 style="margin-top: 0; margin-bottom: 1.5rem; color: var(--text-color);">Volume Profile</h4>
                
                <div style="width: 100%; position: relative; margin-bottom: 1rem;">
                    <canvas id="priceDistributionCanvas" style="width: 100%; height: 300px; display: block;"></canvas>
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
            
            
            <!-- Price Band Liquidity Analysis -->
            ${activeData && activeData.items && activeData.items.length > 0 && liquidityRisk && liquidityRisk.score !== null ? `
            <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
                <h4 style="margin-top: 0; margin-bottom: 1.5rem; color: var(--text-color);">Liquidity Profile</h4>
                
                ${(() => {
                    // Use already-calculated band data from above (no need to recalculate)
                    return `
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                            <!-- Below FMV Band -->
                            <div style="background: linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%); padding: 1.25rem; border-radius: 12px; border: 1px solid #99ff99;">
                                <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.5rem; font-weight: 500;">10% or More Below FMV</div>
                                <div style="font-size: 1.75rem; font-weight: 700; color: #34c759; margin-bottom: 0.5rem;">
                                    ${belowFMV}
                                </div>
                                <div style="font-size: 0.75rem; color: #666; line-height: 1.4;">
                                    Active listings<br>
                                    <strong>Absorption:</strong> ${absorptionBelow}<br>
                                    <strong>Sales:</strong> ${salesBelow} in 90 days
                                </div>
                                <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.7rem; color: #333; line-height: 1.3;">
                                    ${getAbsorptionRatioInterpretation(absorptionBelow, 'below')}
                                </div>
                            </div>
                            
                            <!-- At FMV Band -->
                            <div style="background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%); padding: 1.25rem; border-radius: 12px; border: 1px solid #99daff;">
                                <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.5rem; font-weight: 500;">±10% of FMV</div>
                                <div style="font-size: 1.75rem; font-weight: 700; color: #007aff; margin-bottom: 0.5rem;">
                                    ${atFMV}
                                </div>
                                <div style="font-size: 0.75rem; color: #666; line-height: 1.4;">
                                    Active listings<br>
                                    <strong>Absorption:</strong> ${absorptionAt}<br>
                                    <strong>Sales:</strong> ${salesAt} in 90 days
                                </div>
                                <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.7rem; color: #333; line-height: 1.3;">
                                    ${getAbsorptionRatioInterpretation(absorptionAt, 'at')}
                                </div>
                            </div>
                            
                            <!-- Above FMV Band -->
                            <div style="background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); padding: 1.25rem; border-radius: 12px; border: 1px solid #ffd699;">
                                <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.5rem; font-weight: 500;">10% or More Above FMV</div>
                                <div style="font-size: 1.75rem; font-weight: 700; color: #ff9500; margin-bottom: 0.5rem;">
                                    ${aboveFMV}
                                </div>
                                <div style="font-size: 0.75rem; color: #666; line-height: 1.4;">
                                    Active listings<br>
                                    <strong>Absorption:</strong> ${absorptionAbove}<br>
                                    <strong>Sales:</strong> ${salesAbove} in 90 days
                                </div>
                                <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.7rem; color: #333; line-height: 1.3;">
                                    ${getAbsorptionRatioInterpretation(absorptionAbove, 'above')}
                                </div>
                            </div>
                        </div>
                        
                        <div style="margin-top: 1.5rem; padding: 1rem; background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); border-radius: 8px;">
                            <p style="margin: 0; font-size: 0.85rem; color: #666; line-height: 1.5;">
                                <strong>💡 Insight:</strong> Absorption ratios show how fast cards sell at different prices. High ratios (1.0+) = fast sales with strong buyer demand. Moderate (0.5-1.0) = steady market activity. Low (below 0.5) = slow sales with fewer buyers than listings.
                            </p>
                        </div>
                    `;
                })()}
            </div>
            
            <!-- Pricing Recommendations (Phase 2.2) -->
            ${(() => {
                if (!activeData || !activeData.items || activeData.items.length === 0) {
                    return '';
                }
                
                // Use already-calculated band data from above (no need to recalculate)
                const bands = {
                    belowFMV: { count: belowFMV, absorption: absorptionBelow, sales: salesBelow },
                    atFMV: { count: atFMV, absorption: absorptionAt, sales: salesAt },
                    aboveFMV: { count: aboveFMV, absorption: absorptionAbove, sales: salesAbove }
                };
                
                return getPricingRecommendations(bands, marketValue, marketPressure, liquidityRisk?.score || 0);
            })()}
            ` : ''}
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
                console.log('[CHART] Drawing price distribution chart with data:', {
                    hasSoldData: !!data,
                    hasActiveData: !!activeData,
                    soldItems: data?.items?.length || 0,
                    activeItems: activeData?.items?.length || 0
                });
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
    console.log('[CHART] Redraw event triggered');
    if (lastChartData.soldData) {
        setTimeout(() => {
            try {
                const canvas = document.getElementById("priceDistributionCanvas");
                if (canvas && canvas.offsetParent !== null) {
                    console.log('[CHART] Redrawing price distribution chart');
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
    
    // Recommendation 1: Quick Sale Strategy
    if (belowAbsorption >= 1.0 && belowFMV.count > 0) {
        const quickPrice = fmv * 0.85;
        recommendations.push({
            icon: '⚡',
            title: 'Quick Sale Strategy',
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
            title: 'Patient Sale Strategy',
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
    
    // Market Pressure insights (replaces volatility)
    if (marketPressure !== null) {
        if (marketPressure >= 0 && marketPressure <= 15) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%); border-left: 4px solid #34c759; border-radius: 6px;">
                    <strong style="color: #34c759;">✓ ${marketPressureLabel}:</strong> Asking prices are ${marketPressure.toFixed(1)}% above FMV, indicating realistic seller expectations and healthy market conditions.
                </li>
            `);
        } else if (marketPressure > 15 && marketPressure <= 30) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%); border-left: 4px solid #007aff; border-radius: 6px;">
                    <strong style="color: #007aff;">📊 ${marketPressureLabel}:</strong> Asking prices are ${marketPressure.toFixed(1)}% above FMV. Sellers are optimistic but prices remain negotiable.
                </li>
            `);
        } else if (marketPressure > 30 && marketPressure <= 50) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); border-left: 4px solid #ff9500; border-radius: 6px;">
                    <strong style="color: #ff9500;">⚠ ${marketPressureLabel}:</strong> Asking prices are ${marketPressure.toFixed(1)}% above FMV. Current listings may be overpriced relative to recent sales.
                </li>
            `);
        } else if (marketPressure > 50) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #ffebee 0%, #fff5f5 100%); border-left: 4px solid #ff3b30; border-radius: 6px;">
                    <strong style="color: #ff3b30;">⚠ ${marketPressureLabel}:</strong> Asking prices are ${marketPressure.toFixed(1)}% above FMV. Significant gap suggests sellers may need to adjust expectations.
                </li>
            `);
        } else if (marketPressure < 0) {
            insights.push(`
                <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #f0e6ff 0%, #f5f0ff 100%); border-left: 4px solid #5856d6; border-radius: 6px;">
                    <strong style="color: #5856d6;">💎 Opportunity:</strong> Asking prices are ${Math.abs(marketPressure).toFixed(1)}% below FMV. Active listings may represent good value.
                </li>
            `);
        }
    }
    
    // Confidence insights
    if (marketConfidence >= 70) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%); border-left: 4px solid #007aff; border-radius: 6px;">
                <strong style="color: #007aff;">✓ High Confidence:</strong> Strong market consensus with consistent pricing (${marketConfidence.toFixed(0)}/100 confidence score).
            </li>
        `);
    } else if (marketConfidence < 40) {
        insights.push(`
            <li style="padding: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%); border-left: 4px solid #ff9500; border-radius: 6px;">
                <strong style="color: #ff9500;">⚠ Lower Confidence:</strong> Inconsistent pricing (${marketConfidence.toFixed(0)}/100). Consider gathering more data or refining search terms.
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
  const statsContainer = document.getElementById("stats-container");
  const fmvContainer = document.getElementById("fmv-container");
  
  if (!data || !data.items || data.items.length === 0) {
    if (statsContainer) statsContainer.innerHTML = "";
    if (fmvContainer) fmvContainer.innerHTML = "";
    return null;
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
      if (fmvContainer) {
        fmvContainer.innerHTML = "Error calculating FMV: " + escapeHtml(fmvData.detail);
      }
      return null;
    }

    // store for beeswarm chart
    expectLowGlobal = fmvData.expected_low;
    expectHighGlobal = fmvData.expected_high;
    marketValueGlobal = fmvData.market_value || fmvData.expected_high;

    const listPrice = toNinetyNine(fmvData.expected_high);

    // Use new volume-weighted values with fallbacks
    const marketValue = marketValueGlobal;
    const quickSale = fmvData.quick_sale || fmvData.expected_low;
    const patientSale = fmvData.patient_sale || fmvData.expected_high;

    const fmvHtml = `
      <div id="fmv">
        <h3>📈 Fair Market Value</h3>
        <p style="font-size: 0.75rem; text-align: center; color: var(--subtle-text-color); margin-top: 0.5rem; margin-bottom: 1.5rem; font-style: italic;">
          FMV estimates work best when there are plenty of recent sales to sample and your search terms are tight and accurate.
        </p>
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
    if (fmvContainer) {
      fmvContainer.innerHTML = fmvHtml;
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

function drawBeeswarm(prices) {
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
  ctx.fillText("Fair Market Value Ranges", width / 2, 25);

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
    
    // Add FMV dollar value labels (above the bars) with solid text
    ctx.fillStyle = "#34c759";
    ctx.font = "bold 11px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    
    // FMV Low dollar value label (above bar)
    ctx.fillText(formatMoney(expectLowGlobal), x1, margin.top - 8);
    
    // FMV High dollar value label (above bar)
    ctx.fillText(formatMoney(expectHighGlobal), x2, margin.top - 8);
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

  // --- Draw X-Axis Labels ---
  ctx.fillStyle = "#6e6e73";
  ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";

  if (priceRange > 0) {
    // Min price label
    ctx.fillText("Min", margin.left, height - margin.bottom + 15);
    ctx.fillStyle = "#1d1d1f";
    ctx.font = "bold 12px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(formatMoney(minPrice), margin.left, height - margin.bottom + 30);
    
    // Max price label
    ctx.fillStyle = "#6e6e73";
    ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText("Max", width - margin.right, height - margin.bottom + 15);
    ctx.fillStyle = "#1d1d1f";
    ctx.font = "bold 12px " + getComputedStyle(document.body).fontFamily;
    ctx.fillText(formatMoney(maxPrice), width - margin.right, height - margin.bottom + 30);
    
    // FMV marker with label
    if (marketValueGlobal !== null && marketValueGlobal >= minPrice && marketValueGlobal <= maxPrice) {
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
  
  // Draw legend at bottom (centered)
  const legendY = height - 15;
  const legendText = "FMV Range";
  
  // Measure text to calculate total width
  ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
  const textWidth = ctx.measureText(legendText).width;
  const rectWidth = 30;
  const spacing = 5;
  const totalLegendWidth = rectWidth + spacing + textWidth;
  
  // Center the legend
  const legendX = (width - totalLegendWidth) / 2;
  
  // Draw green rectangle
  const gradient = ctx.createLinearGradient(legendX, legendY - 8, legendX + rectWidth, legendY - 8);
  gradient.addColorStop(0, 'rgba(52, 199, 89, 0.3)');
  gradient.addColorStop(1, 'rgba(52, 199, 89, 0.5)');
  ctx.fillStyle = gradient;
  ctx.fillRect(legendX, legendY - 12, rectWidth, 12);
  
  // Draw border around rectangle
  ctx.strokeStyle = 'rgba(52, 199, 89, 0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY - 12, rectWidth, 12);
  
  // Draw legend text
  ctx.fillStyle = "#1d1d1f";
  ctx.textAlign = "left";
  ctx.fillText(legendText, legendX + rectWidth + spacing, legendY - 3);
}

function drawComparisonBeeswarm(cardResults) {
  const canvas = document.getElementById("comparisonBeeswarmCanvas");
  if (!canvas) {
    console.error('[CHART] Canvas not found');
    return;
  }
  
  if (!cardResults || cardResults.length === 0) {
    console.error('[CHART] No card results to display');
    return;
  }

  console.log('[CHART] Setting up canvas...');
  
  // Set canvas size
  const container = canvas.parentElement;
  const containerWidth = container.offsetWidth;
  
  console.log('[CHART] Container width:', containerWidth);
  
  canvas.width = containerWidth;
  canvas.height = 250;
  canvas.style.width = containerWidth + 'px';
  canvas.style.height = '250px';
  
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const margin = { top: 60, right: 40, bottom: 50, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  ctx.clearRect(0, 0, width, height);
  
  console.log('[CHART] Canvas cleared, drawing FMV ranges...');

  // Define colors for each card
  const cardColors = [
    { fill: 'rgba(0, 122, 255, 0.3)', stroke: 'rgba(0, 122, 255, 0.9)', solid: 'rgb(0, 122, 255)' },      // Blue
    { fill: 'rgba(255, 59, 48, 0.3)', stroke: 'rgba(255, 59, 48, 0.9)', solid: 'rgb(255, 59, 48)' },      // Red
    { fill: 'rgba(52, 199, 89, 0.3)', stroke: 'rgba(52, 199, 89, 0.9)', solid: 'rgb(52, 199, 89)' }       // Green
  ];

  // Find global min and max from all FMV ranges
  let globalMin = Infinity;
  let globalMax = -Infinity;
  
  cardResults.forEach(result => {
    if (result.fmvLow != null) {
      globalMin = Math.min(globalMin, result.fmvLow);
    }
    if (result.fmvHigh != null) {
      globalMax = Math.max(globalMax, result.fmvHigh);
    }
  });

  if (globalMin === Infinity || globalMax === -Infinity) {
    ctx.fillStyle = "#6e6e73";
    ctx.font = "16px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "center";
    ctx.fillText("No valid FMV data to display", width / 2, height / 2);
    return;
  }

  const priceRange = globalMax - globalMin;
  
  const xScale = (price) => {
    if (priceRange === 0) {
      return width / 2;
    }
    return margin.left + ((price - globalMin) / priceRange) * innerWidth;
  };

  // Draw legend
  let legendX = margin.left;
  cardResults.forEach((result, index) => {
    const color = cardColors[index % cardColors.length];
    const label = `Card ${result.cardNumber}: ${escapeHtml(result.grader)} ${escapeHtml(result.grade)}`;
    
    // Draw color box
    ctx.fillStyle = color.solid;
    ctx.fillRect(legendX, margin.top - 40, 12, 12);
    
    // Draw label
    ctx.fillStyle = "#1d1d1f";
    ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "left";
    ctx.fillText(label, legendX + 18, margin.top - 30);
    
    // Move x position for next legend item
    const labelWidth = ctx.measureText(label).width;
    legendX += labelWidth + 40;
  });

  // Calculate bar height and spacing
  const barHeight = 30;
  const spacing = 20;
  const totalHeight = (cardResults.length * barHeight) + ((cardResults.length - 1) * spacing);
  const startY = margin.top + (innerHeight - totalHeight) / 2;

  // Draw FMV ranges for each card
  cardResults.forEach((result, cardIndex) => {
    if (!result.fmvLow || !result.fmvHigh) return;
    
    const color = cardColors[cardIndex % cardColors.length];
    const y = startY + (cardIndex * (barHeight + spacing));
    
    // Use FMV range (Quick Sale to Patient Sale)
    const fmvLow = result.fmvLow;
    const fmvHigh = result.fmvHigh;
    const marketValue = result.marketValue;
    
    if (fmvLow != null && fmvHigh != null) {
      const x1 = xScale(fmvLow);
      const x2 = xScale(fmvHigh);
      
      // Draw range bar
      ctx.fillStyle = color.fill;
      ctx.fillRect(x1, y, x2 - x1, barHeight);
      
      // Draw border
      ctx.strokeStyle = color.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y, x2 - x1, barHeight);
      
      // Draw market value line
      if (marketValue != null && marketValue >= fmvLow && marketValue <= fmvHigh) {
        const mvX = xScale(marketValue);
        ctx.strokeStyle = color.solid;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(mvX, y - 5);
        ctx.lineTo(mvX, y + barHeight + 5);
        ctx.stroke();
        
        // Draw MV label
        ctx.fillStyle = color.solid;
        ctx.font = "bold 11px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center";
        ctx.fillText(formatMoney(marketValue), mvX, y + barHeight / 2 + 4);
      }
    }
  });

  // Draw Axis
  ctx.beginPath();
  ctx.moveTo(margin.left, height - margin.bottom);
  ctx.lineTo(width - margin.right, height - margin.bottom);
  ctx.strokeStyle = "#d2d2d7";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw price scale labels
  ctx.fillStyle = "#6e6e73";
  ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";

  if (priceRange > 0) {
    // Min
    ctx.fillText(formatMoney(globalMin), margin.left, height - margin.bottom + 20);
    // Max
    ctx.fillText(formatMoney(globalMax), width - margin.right, height - margin.bottom + 20);
} else {
    ctx.fillText(formatMoney(globalMin), width / 2, height - margin.bottom + 20);
}
}

// Draw Price Distribution Bar Chart
function drawPriceDistributionChart(soldData, activeData) {
    console.log('[CHART] drawPriceDistributionChart called with:', {
        hasSoldData: !!soldData,
        hasActiveData: !!activeData,
        soldItems: soldData?.items?.length || 0,
        activeItems: activeData?.items?.length || 0
    });
    
    try {
        const canvas = document.getElementById("priceDistributionCanvas");
        if (!canvas) {
            console.error('[CHART ERROR] Price distribution canvas element not found in DOM');
            // List all canvas elements for debugging
            const allCanvases = document.querySelectorAll('canvas');
            console.log('[CHART DEBUG] Found canvas elements:', Array.from(allCanvases).map(c => c.id));
            return;
        }
        
        // Check if canvas is visible
        const isVisible = canvas.offsetParent !== null;
        console.log('[CHART] Canvas found, visibility:', {
            isVisible,
            width: canvas.width,
            height: canvas.height,
            offsetWidth: canvas.offsetWidth,
            offsetHeight: canvas.offsetHeight
        });
        
        // If not visible, schedule a retry when it becomes visible
        if (!isVisible) {
            console.warn('[CHART] Canvas not visible yet, will retry when Analysis tab is active');
            return;
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
        console.log('[CHART] Drawing test background...');
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
    
    console.log('[CHART] Prepared price data (before outlier filtering):', {
        soldCount: soldPrices.length,
        activeCount: activePrices.length,
        soldSample: soldPrices.slice(0, 3),
        activeSample: activePrices.slice(0, 3)
    });
    
    // Filter outliers from both datasets using IQR method
    const soldOriginalCount = soldPrices.length;
    const activeOriginalCount = activePrices.length;
    
    if (soldPrices.length >= 4) {
        soldPrices = filterOutliers(soldPrices);
        console.log('[CHART] Filtered sold outliers:', soldOriginalCount - soldPrices.length, 'removed');
    }
    
    if (activePrices.length >= 4) {
        activePrices = filterOutliers(activePrices);
        console.log('[CHART] Filtered active outliers:', activeOriginalCount - activePrices.length, 'removed');
    }
    
    console.log('[CHART] After outlier filtering:', {
        soldCount: soldPrices.length,
        activeCount: activePrices.length,
        soldMin: soldPrices.length > 0 ? Math.min(...soldPrices) : 'N/A',
        soldMax: soldPrices.length > 0 ? Math.max(...soldPrices) : 'N/A',
        activeMin: activePrices.length > 0 ? Math.min(...activePrices) : 'N/A',
        activeMax: activePrices.length > 0 ? Math.max(...activePrices) : 'N/A'
    });
  
  // Show message if no data, but continue to test rendering
  if (soldPrices.length === 0 && activePrices.length === 0) {
      console.warn('[CHART] No price data available for distribution chart - showing message');
      ctx.fillStyle = "#1d1d1f";
      ctx.font = "bold 16px " + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = "center";
      ctx.fillText("No data available for price distribution", width / 2, height / 2);
      
      ctx.font = "14px " + getComputedStyle(document.body).fontFamily;
      ctx.fillStyle = "#6e6e73";
      ctx.fillText("(Sold and active listing data required)", width / 2, height / 2 + 30);
      console.log('[CHART] Message drawn on canvas');
      return;
  }
  
  console.log('[CHART] Sufficient data, proceeding with chart drawing...');
  
  // Find global min and max across both datasets
  const allPrices = [...soldPrices, ...activePrices];
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice;
  
  // Create price bins (10 bins)
  const numBins = 10;
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
  
  // Draw X-axis labels (price ranges)
  ctx.fillStyle = "#6e6e73";
  ctx.font = "10px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";
  
  // Show first, middle, and last tick
  const tickIndices = [0, Math.floor(numBins / 2), numBins - 1];
  tickIndices.forEach(i => {
      const binStart = minPrice + (i * binWidth);
      const binEnd = binStart + binWidth;
      const x = margin.left + (i * barAreaWidth) + (barAreaWidth / 2);
      
      ctx.fillText(formatMoney(binStart), x, height - margin.bottom + 20);
  });
  
  // Draw final price
  const finalX = margin.left + (numBins * barAreaWidth);
  ctx.fillText(formatMoney(maxPrice), finalX, height - margin.bottom + 20);
  
  console.log('[CHART] Price distribution chart drawing completed successfully!');
  console.log('[CHART] Final canvas state:', {
      width: canvas.width,
      height: canvas.height,
      displayWidth: canvas.style.width,
      displayHeight: canvas.style.height
  });
  
  } catch (error) {
      console.error('[CHART ERROR] Failed to draw price distribution chart (non-blocking):', error);
      console.error('[CHART ERROR] Stack trace:', error.stack);
      // Chart failure is graceful - won't block other functionality
  }
}

