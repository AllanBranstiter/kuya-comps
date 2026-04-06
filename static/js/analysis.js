/**
 * Analysis Dashboard Module
 * Handles rendering and calculation of market analysis metrics
 */

// ============================================================================
// CALCULATION HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate standard deviation of price values
 * @param {number[]} values - Array of numeric values
 * @returns {number} Standard deviation
 */
function calculateStdDev(values) {
    if (values.length === 0) return 0;
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate weighted median based on price clustering
 * @param {number[]} prices - Array of prices
 * @returns {number|null} Weighted median price
 */
function calculateWeightedMedian(prices) {
    if (prices.length === 0) return null;
    if (prices.length === 1) return prices[0];
    
    const priceCounts = {};
    prices.forEach(price => {
        const roundedPrice = Math.round(price * 100) / 100;
        priceCounts[roundedPrice] = (priceCounts[roundedPrice] || 0) + 1;
    });
    
    const uniquePrices = Object.keys(priceCounts).map(p => parseFloat(p)).sort((a, b) => a - b);
    const totalCount = prices.length;
    const targetCount = totalCount / 2;
    
    let cumulativeCount = 0;
    for (const price of uniquePrices) {
        cumulativeCount += priceCounts[price];
        if (cumulativeCount >= targetCount) {
            return price;
        }
    }
    
    return uniquePrices[uniquePrices.length - 1];
}

/**
 * Filter outliers using IQR method
 * @param {number[]} prices - Array of prices
 * @returns {number[]} Filtered array without outliers
 */
function filterOutliers(prices) {
    if (prices.length < 4) return prices;
    
    const sorted = [...prices].sort((a, b) => a - b);
    const n = sorted.length;
    
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    return prices.filter(price => price >= lowerBound && price <= upperBound);
}

/**
 * Convert absorption ratio to market activity indicator
 * @param {string|number} absorption - Absorption ratio
 * @returns {Object} Activity indicator with emoji, label, color, bg
 */
function getSpeedFromAbsorption(absorption) {
    if (absorption === 'N/A' || absorption === null) {
        return {
            emoji: '📭',
            label: 'NO DATA',
            timeline: '',
            color: '#8e8e93',
            bg: '#fafafa'
        };
    }

    const ratio = parseFloat(absorption);

    if (ratio >= 1.5) {
        return {
            emoji: '🔥',
            label: 'HIGH',
            timeline: '',
            color: '#34c759',
            bg: '#f0fff0'
        };
    } else if (ratio >= 0.5) {
        return {
            emoji: '✅',
            label: 'MODERATE',
            timeline: '',
            color: '#007aff',
            bg: '#f0f9ff'
        };
    } else {
        return {
            emoji: '🐌',
            label: 'LOW',
            timeline: '',
            color: '#ff9500',
            bg: '#fffaf0'
        };
    }
}

/**
 * Generate seller quick tip based on activity zones
 */
function getSellerQuickTip(belowSpeed, belowRange, atRange) {
    if (belowSpeed.label === 'HIGH') {
        return `${belowRange} for competitive pricing OR ${atRange} for fair value`;
    } else if (belowSpeed.label === 'MODERATE' || belowSpeed.label === 'NO DATA') {
        return `${atRange} aligns with current market activity`;
    } else {
        return `Price competitively — buyer activity is currently low`;
    }
}

/**
 * Generate flipper quick tip
 */
function getFlipperQuickTip(belowSpeed, belowRange, fmvFormatted) {
    if (belowSpeed.label === 'HIGH') {
        return `Buy ${belowRange}, target ${fmvFormatted} — below-FMV zone has strong activity`;
    } else {
        return `Look for deals 20%+ below ${fmvFormatted}`;
    }
}

/**
 * Generate collector quick tip
 */
function getCollectorQuickTip(atSpeed, atRange) {
    if (atSpeed.label === 'HIGH' || atSpeed.label === 'MODERATE') {
        return `${atRange} offers fair value in an active market`;
    } else {
        return `Buyer activity is low — negotiate below asking`;
    }
}

/**
 * Calculate number of price clusters in the data
 * @param {Array} prices - Array of prices
 * @returns {number} Number of distinct price clusters
 */
function calculatePriceClusters(prices) {
    if (!prices || prices.length === 0) return 0;
    
    // Count unique price points (rounded to nearest dollar to identify clusters)
    const priceCounts = {};
    prices.forEach(price => {
        const roundedPrice = Math.round(price);
        priceCounts[roundedPrice] = (priceCounts[roundedPrice] || 0) + 1;
    });
    
    return Object.keys(priceCounts).length;
}

// ============================================================================
// MARKET PRESSURE CALCULATION
// ============================================================================

/**
 * Calculate market pressure metrics from active listing data
 * @param {Object} activeData - Active listings data
 * @param {number} marketValue - Fair market value
 * @returns {Object} Market pressure metrics
 */
function calculateMarketPressure(activeData, marketValue) {
    const result = {
        marketPressure: null,
        medianAskingPrice: null,
        marketPressureStatus: null,
        marketPressureLabel: null,
        marketPressureColor: null,
        marketPressureGradient: null,
        marketPressureBorder: null,
        sampleSize: 0,
        dataConfidence: 'N/A'
    };
    
    if (!activeData || !activeData.items || activeData.items.length === 0) {
        return result;
    }
    
    // Deduplicate by seller
    const sellerPrices = {};
    activeData.items.forEach(item => {
        const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
        const sellerName = item.seller?.name || `unknown_${item.item_id}`;
        
        if (price > 0) {
            if (!sellerPrices[sellerName]) sellerPrices[sellerName] = [];
            sellerPrices[sellerName].push(price);
        }
    });
    
    // Get median price per seller
    let askingPrices = Object.values(sellerPrices).map(prices => {
        const sorted = prices.sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    });
    
    // Apply IQR filtering
    if (askingPrices.length >= 4) {
        askingPrices = filterOutliers(askingPrices);
    }
    
    result.sampleSize = askingPrices.length;
    
    // Determine confidence
    if (result.sampleSize >= 10) result.dataConfidence = 'High';
    else if (result.sampleSize >= 5) result.dataConfidence = 'Medium';
    else if (result.sampleSize > 0) result.dataConfidence = 'Low';
    
    if (askingPrices.length > 0) {
        result.medianAskingPrice = calculateWeightedMedian(askingPrices);
        result.marketPressure = ((result.medianAskingPrice - marketValue) / marketValue) * 100;
        
        // Determine status bands
        assignMarketPressureStatus(result);
    }
    
    return result;
}

/**
 * Assign market pressure status and styling based on percentage
 * @param {Object} result - Market pressure result object to modify
 */
function assignMarketPressureStatus(result) {
    const mp = result.marketPressure;
    
    if (mp >= 0 && mp <= 15) {
        result.marketPressureStatus = 'HEALTHY';
        result.marketPressureLabel = 'Healthy pricing friction';
        result.marketPressureColor = '#34c759';
        result.marketPressureGradient = 'linear-gradient(135deg, #e6ffe6 0%, #ccffcc 100%)';
        result.marketPressureBorder = '#99ff99';
    } else if (mp > 15 && mp <= 30) {
        result.marketPressureStatus = 'OPTIMISTIC';
        result.marketPressureLabel = 'Seller optimism';
        result.marketPressureColor = '#007aff';
        result.marketPressureGradient = 'linear-gradient(135deg, #e6f7ff 0%, #ccedff 100%)';
        result.marketPressureBorder = '#99daff';
    } else if (mp > 30 && mp <= 50) {
        result.marketPressureStatus = 'RESISTANCE';
        result.marketPressureLabel = 'Market resistance';
        result.marketPressureColor = '#ff9500';
        result.marketPressureGradient = 'linear-gradient(135deg, #fff5e6 0%, #ffe8cc 100%)';
        result.marketPressureBorder = '#ffd699';
    } else if (mp > 50) {
        result.marketPressureStatus = 'UNREALISTIC';
        result.marketPressureLabel = 'Unrealistic asking prices';
        result.marketPressureColor = '#ff3b30';
        result.marketPressureGradient = 'linear-gradient(135deg, #ffebee 0%, #ffcccc 100%)';
        result.marketPressureBorder = '#ff9999';
    } else {
        result.marketPressureStatus = 'BELOW FMV';
        result.marketPressureLabel = 'Asking below FMV';
        result.marketPressureColor = '#5856d6';
        result.marketPressureGradient = 'linear-gradient(135deg, #f0e6ff 0%, #e6ccff 100%)';
        result.marketPressureBorder = '#d6b3ff';
    }
}

// ============================================================================
// PRICE BAND CALCULATIONS
// ============================================================================

/**
 * Calculate price band distribution and absorption ratios
 * @param {Object} activeData - Active listings data
 * @param {Object} soldData - Sold listings data
 * @param {number} marketValue - Fair market value
 * @returns {Object} Price band metrics
 */
function calculatePriceBands(activeData, soldData, marketValue) {
    const result = {
        belowFMV: 0,
        atFMV: 0,
        aboveFMV: 0,
        salesBelow: 0,
        salesAt: 0,
        salesAbove: 0,
        absorptionBelow: 'N/A',
        absorptionAt: 'N/A',
        absorptionAbove: 'N/A'
    };
    
    if (!activeData || !activeData.items || activeData.items.length === 0) {
        return result;
    }
    
    // Count active listings by price band
    activeData.items.forEach(item => {
        const price = item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
        const buyingFormat = (item.buying_format || '').toLowerCase();
        
        if (price > 0 && buyingFormat.includes('buy it now')) {
            if (price < marketValue * 0.9) result.belowFMV++;
            else if (price <= marketValue * 1.1) result.atFMV++;
            else result.aboveFMV++;
        }
    });
    
    // Count sales by price band
    if (soldData && soldData.items) {
        soldData.items.forEach(item => {
            if (item.total_price < marketValue * 0.9) result.salesBelow++;
            else if (item.total_price <= marketValue * 1.1) result.salesAt++;
            else result.salesAbove++;
        });
    }
    
    // Calculate absorption ratios
    if (result.belowFMV > 0) result.absorptionBelow = (result.salesBelow / result.belowFMV).toFixed(2);
    if (result.atFMV > 0) result.absorptionAt = (result.salesAt / result.atFMV).toFixed(2);
    if (result.aboveFMV > 0) result.absorptionAbove = (result.salesAbove / result.aboveFMV).toFixed(2);
    
    return result;
}

// ============================================================================
// DATA QUALITY FUNCTIONS
// ============================================================================

/**
 * Calculate overall data quality score (0-100)
 * @param {number} soldCount - Number of sold items
 * @param {number} activeCount - Number of active listings
 * @param {number} confidence - Market confidence score
 * @returns {number} Data quality score
 */
function calculateDataQuality(soldCount, activeCount, confidence) {
    let sampleScore = 0;
    if (soldCount >= 20 && activeCount >= 10) sampleScore = 100;
    else if (soldCount >= 10 && activeCount >= 5) sampleScore = 70;
    else if (soldCount >= 5 && activeCount >= 3) sampleScore = 40;
    else sampleScore = 20;
    
    const confidenceScore = confidence || 0;
    return Math.round(sampleScore * 0.6 + confidenceScore * 0.4);
}

/**
 * Generate sample size warning banner HTML
 * @param {number} soldCount - Number of sold items
 * @param {number} activeCount - Number of active listings
 * @param {number} pressureSampleSize - Sample size for pressure calculation
 * @returns {string} HTML string for warning banner
 */
function getSampleSizeWarning(soldCount, activeCount, pressureSampleSize) {
    const criticallyLow = soldCount < 5;
    const warningLow = soldCount >= 5 && soldCount < 10;
    const lowActiveData = activeCount < 5;
    const lowPressureData = pressureSampleSize < 5;
    
    if (!criticallyLow && !warningLow && !lowActiveData && !lowPressureData) {
        return '';
    }
    
    // Determine severity
    const severity = criticallyLow ? 'critical' : 'warning';
    const icon = criticallyLow ? '🚨' : '⚠️';
    const bgColor = criticallyLow ? '#ffebee' : '#fff5e6';
    const borderColor = criticallyLow ? '#ff3b30' : '#ff9500';
    const textColor = criticallyLow ? '#ff3b30' : '#ff9500';
    const title = criticallyLow ? 'Critically Limited Data' : 'Limited Data Available';
    
    const issues = [];
    if (criticallyLow) {
        issues.push(`Only ${soldCount} sales (need 10+ for reliability)`);
    } else if (warningLow) {
        issues.push(`${soldCount} recent sales (10+ recommended)`);
    }
    if (lowActiveData) issues.push(`${activeCount} active listings`);
    if (lowPressureData && pressureSampleSize > 0) issues.push(`${pressureSampleSize} sellers sampled`);
    
    const adviceText = criticallyLow
        ? 'Refine search or wait for more sales data.'
        : 'Consider refining your search terms or checking back later for more data.';
    
    return `
        <div style="background: ${bgColor}; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid ${borderColor}; box-shadow: 0 2px 8px rgba(255, 149, 0, 0.15);">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="font-size: 1.5rem;">${icon}</span>
                <div style="flex: 1;">
                    <strong style="color: ${textColor}; font-size: 0.95rem;">${title}</strong>
                    <p style="margin: 0.25rem 0 0 0; font-size: 0.85rem; color: #666; line-height: 1.4;">
                        ${issues.join(' • ')} — Results may vary significantly. ${adviceText}
                    </p>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// HELPER TEXT GENERATION FUNCTIONS
// ============================================================================

/**
 * Generate confidence statement based on market confidence score
 * @param {number} confidence - Market confidence score
 * @param {number} sampleSize - Number of items in sample
 * @returns {string} Confidence statement
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
 * @param {number} below - Listings below FMV
 * @param {number} at - Listings at FMV
 * @param {number} above - Listings above FMV
 * @param {string} absBelow - Absorption ratio below FMV
 * @param {string} absAt - Absorption ratio at FMV
 * @param {string} absAbove - Absorption ratio above FMV
 * @param {number} salesBelow - Sales below FMV
 * @param {number} salesAt - Sales at FMV
 * @param {number} salesAbove - Sales above FMV
 * @returns {string} Dominant band statement
 */
function getDominantBandStatement(below, at, above, absBelow, absAt, absAbove, salesBelow, salesAt, salesAbove) {
    const total = below + at + above;
    if (total === 0) return '';
    
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
        return `Most activity ${location} — ${sales} recent sales vs ${listings} current listings (high absorption)`;
    } else if (absorption >= 0.5) {
        return `Most activity ${location} — ${sales} recent sales vs ${listings} current listings (moderate absorption)`;
    } else if (absorption > 0) {
        return `Most activity ${location} — ${sales} recent sales vs ${listings} current listings (low absorption)`;
    } else {
        return `Most activity ${location} — ${listings} current listings, no recent sales data`;
    }
}

/**
 * Generate activity statement describing absorption ratio in plain language
 * @param {string|number} absorptionRatio - Absorption ratio
 * @param {string} scenario - Pricing scenario description
 * @returns {string} Activity statement
 */
function getVelocityStatement(absorptionRatio, scenario) {
    if (absorptionRatio === 'N/A' || absorptionRatio < 0) return '';

    const ratio = parseFloat(absorptionRatio);
    if (ratio >= 1.5) return `${scenario}: High sales activity relative to supply`;
    if (ratio >= 0.8) return `${scenario}: Moderate sales activity`;
    if (ratio >= 0.4) return `${scenario}: Low sales activity relative to supply`;
    return `${scenario}: Very low sales activity relative to supply`;
}

/**
 * Generate absorption ratio interpretation text
 * @param {string|number} absorptionRatio - Absorption ratio
 * @param {string} band - Price band ('below', 'at', or 'above')
 * @returns {string} Interpretation text
 */
function getAbsorptionRatioInterpretation(absorptionRatio, band) {
    if (absorptionRatio === 'N/A' || absorptionRatio === null) {
        return '📭 No active listings in this price band';
    }
    
    const ratio = parseFloat(absorptionRatio);

    if (band === 'below') {
        if (ratio >= 1.5) {
            return '🔥 High activity zone. Recent sales are well above current supply at these prices.';
        } else if (ratio >= 1.0) {
            return '🔥 Active zone. Recent sales outnumber current listings at these prices.';
        } else if (ratio >= 0.5) {
            return '⚡ Moderate activity. Cards at these prices see steady buyer engagement.';
        } else {
            return '📊 Lower activity. Some options available but sales are limited at these price points.';
        }
    } else if (band === 'at') {
        if (ratio >= 1.0) {
            return '🔥 Strong activity at fair value. Recent sales outnumber current listings near FMV.';
        } else if (ratio >= 0.5) {
            return '✅ Healthy activity. Balanced supply and sales at fair value prices.';
        } else {
            return '⏳ Slower activity. More listings than recent sales near FMV.';
        }
    } else {
        if (ratio >= 0.5) {
            return '📊 Moderate activity even at premium prices. Some buyers engaging above FMV.';
        } else if (ratio >= 0.3) {
            return '⏳ Lower activity at premium prices. Most sales are happening closer to FMV.';
        } else {
            return '⚠️ Very low activity at these prices. Significant oversupply vs recent sales.';
        }
    }
}

// ============================================================================
// PRICING RECOMMENDATIONS RENDERING
// ============================================================================

/**
 * Generate pricing recommendations based on liquidity profile
 * @param {Object} bands - Price band data with absorption ratios
 * @param {number} fmv - Fair market value
 * @param {number} marketPressure - Market pressure percentage
 * @param {number} liquidityScore - Liquidity score (0-100)
 * @returns {string} HTML string for pricing recommendations
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
    
    // Recommendation 1: Competitive Price Strategy
    if (belowAbsorption >= 1.0 && belowFMV.count > 0) {
        const quickPrice = fmv * 0.85;
        recommendations.push({
            icon: '⚡',
            title: 'Competitive Price Strategy',
            price: quickPrice,
            range: `${formatMoney(fmv * 0.80)} - ${formatMoney(fmv * 0.90)}`,
            reason: `High sales activity below FMV (${belowAbsorption}:1 absorption ratio). Cards priced 10-20% below FMV show strong buyer engagement.`,
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
            reason: `Steady activity at FMV (${atAbsorption} absorption ratio). Pricing near ${formatMoney(fmv)} is well-supported by current market data.`,
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
            reason: `Low market pressure and good market activity suggest room for premium pricing in this market.`,
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
                    <strong>💡 Note:</strong> These recommendations are based on recent market activity and absorption ratios. Adjust based on your card condition, fees, shipping costs, and risk tolerance. Absorption ratios reflect the balance of recent sales to current supply — not a prediction of how fast your listing will sell.
                </p>
            </div>
        </div>
    `;
    
    return html;
}

// ============================================================================
// MARKET ASSESSMENT WARNING RENDERING
// ============================================================================

/**
 * Render persona-based advice sections with one-liner format
 * @param {Object} personaAdvice - Object with seller, flipper, collector strings (not arrays)
 * @param {number} fmv - Fair market value for placeholder replacement
 * @param {number} quickSale - Quick sale price
 * @param {number} patientSale - Patient sale price
 * @returns {string} HTML string for persona sections
 */
function renderPersonaAdvice(personaAdvice, fmv, quickSale, patientSale) {
    if (!personaAdvice) return '';
    
    // Build one-liner advice with actual dollar amounts
    const sellerAdvice = (personaAdvice.seller || '')
        .replace(/{quick_sale}/g, formatMoney(quickSale))
        .replace(/{patient_sale}/g, formatMoney(patientSale))
        .replace(/{fmv}/g, formatMoney(fmv));
    
    const flipperAdvice = (personaAdvice.flipper || '')
        .replace(/{quick_sale}/g, formatMoney(quickSale))
        .replace(/{fmv}/g, formatMoney(fmv))
        .replace(/{patient_sale}/g, formatMoney(patientSale));
    
    const collectorAdvice = (personaAdvice.collector || '')
        .replace(/{fmv}/g, formatMoney(fmv))
        .replace(/{quick_sale}/g, formatMoney(quickSale))
        .replace(/{patient_sale}/g, formatMoney(patientSale));
    
    return `
        <div style="margin-top: 1.25rem; background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-color);">
            <div style="display: grid; gap: 0.75rem; font-size: 0.9rem;">
                <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
                    <span style="font-size: 1.2rem; flex-shrink: 0;">👤</span>
                    <div style="flex: 1;">
                        <strong style="color: #007aff; font-size: 0.95rem;">Selling?</strong>
                        <span style="color: #333; display: block; margin-top: 0.25rem; line-height: 1.5;">${sellerAdvice}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
                    <span style="font-size: 1.2rem; flex-shrink: 0;">💼</span>
                    <div style="flex: 1;">
                        <strong style="color: #ff9500; font-size: 0.95rem;">Flipping?</strong>
                        <span style="color: #333; display: block; margin-top: 0.25rem; line-height: 1.5;">${flipperAdvice}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
                    <span style="font-size: 1.2rem; flex-shrink: 0;">🏆</span>
                    <div style="flex: 1;">
                        <strong style="color: #5ac8fa; font-size: 0.95rem;">Holding?</strong>
                        <span style="color: #333; display: block; margin-top: 0.25rem; line-height: 1.5;">${collectorAdvice}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// FALLBACK MESSAGE CONTENT (USED IF JSON LOADING FAILS)
// ============================================================================

/**
 * Hardcoded fallback content for market assessment messages
 * Used when dynamic content loading from JSON fails
 */
const FALLBACK_MESSAGE_CONTENT = {
        dataQualityWarning: {
            message: `Prices scattered (confidence: {confidence}/100). Search likely mixing different card types.`,
            personaAdvice: {
                seller: "Refine search before pricing—buyers will question mixed comps",
                flipper: "Skip—too risky with unreliable value estimates",
                collector: "Wait for cleaner data to avoid overpaying"
            }
        },
        
        twoTierMarket: {
            message: `Higher activity below FMV ({absorptionBelow}:1 absorption) vs above FMV ({absorptionAbove}:1 absorption)`,
            personaAdvice: {
                seller: "Below {fmv} shows stronger buyer engagement | Above {fmv} shows low activity",
                flipper: "Buy below {quick_sale}, target {fmv} — better absorption in that zone",
                collector: "Buy at {fmv}±10%, avoid overpriced premium listings"
            }
        },

        highRiskConditions: {
            message: `Asking {marketPressure}% above FMV but market activity is low ({liquidityScore}/100). Listings priced well above recent sales.`,
            personaAdvice: {
                seller: "Price at or near {fmv} to stand out in a crowded, slow market",
                flipper: "Skip — high prices + low activity = no margin",
                collector: "Wait for prices to drop toward {fmv}"
            }
        },

        overpricedActiveMarket: {
            message: `Asking {marketPressure}% above FMV, with active sales relative to supply ({liquidityScore}/100).`,
            personaAdvice: {
                seller: "Current activity favors sellers — consider listing at {patient_sale}",
                flipper: "Buy and resell before market activity cools",
                collector: "Paying a premium now, or wait for activity to normalize"
            }
        },

        fairPricingLimitedDemand: {
            message: `Fair prices ({marketPressure}% vs FMV) but sales activity is low ({liquidityScore}/100) relative to available supply.`,
            personaAdvice: {
                seller: "Sales may be slow even at {fmv}. Pricing toward the lower end of the range may attract more attention.",
                flipper: "Low activity — only buy if expecting a future catalyst",
                collector: "Quiet buying opportunity — fair prices without hype"
            }
        },

        strongBuyOpportunity: {
            message: `Cards {absMarketPressure}% below FMV with strong recent sales activity ({liquidityScore}/100).`,
            personaAdvice: {
                seller: "Current asks are below recent sales — pricing at {fmv} is well-supported",
                flipper: "Buy at {quick_sale}, target {fmv} — sellers haven't adjusted to the gap yet",
                collector: "Strong entry at {quick_sale} ({absMarketPressure}% below recent sales)"
            }
        },

        healthyMarketConditions: {
            message: `Fair pricing ({marketPressure}% vs FMV) with good sales activity ({liquidityScore}/100). Balanced market.`,
            personaAdvice: {
                seller: "List at {fmv}±5% — current market activity supports fair pricing",
                flipper: "Find deals below {quick_sale}, target {fmv}",
                collector: "No rush — buy at {fmv} when you find the right condition"
            }
        },

        balancedMarket: {
            message: `Normal market conditions ({marketPressure}% vs FMV, market activity {liquidityScore}/100).`,
            personaAdvice: {
                seller: "List at {fmv} — no strong signal in either direction",
                flipper: "Standard margins — buy {quick_sale}, sell {fmv}",
                collector: "No market timing needed — buy when ready"
            }
    }
};

// Set fallback in content loader if available
if (typeof window !== 'undefined' && window.contentLoader) {
    window.contentLoader.setFallback({ messages: FALLBACK_MESSAGE_CONTENT });
}

// ============================================================================
// MARKET ASSESSMENT RENDERING
// ============================================================================

/**
 * Detect bimodal market pattern based on absorption ratios and confidence
 * @param {Object} priceBands - Price band data with absorption ratios
 * @param {number} marketConfidence - Market confidence score
 * @param {number} clusterCount - Number of price clusters in the market
 * @returns {boolean} True if bimodal pattern detected
 */
function detectBimodalPattern(priceBands, marketConfidence, clusterCount) {
    const { absorptionBelow, absorptionAbove, belowFMV, aboveFMV } = priceBands;
    
    return (
        marketConfidence >= 55 && marketConfidence < 70 &&
        absorptionBelow !== 'N/A' && absorptionAbove !== 'N/A' &&
        parseFloat(absorptionBelow) >= 1.8 &&  // TIGHTENED from 1.5
        parseFloat(absorptionAbove) <= 0.25 && // TIGHTENED from 0.3
        belowFMV > 0 && aboveFMV > 0 &&
        clusterCount >= 2  // NEW: Must have 2+ price clusters
    );
}

/**
 * Render market assessment warning section
 * @param {number} marketPressure - Market pressure percentage
 * @param {Object} liquidityRisk - Liquidity risk metrics
 * @param {Object} priceBands - Price band data
 * @param {number} marketConfidence - Market confidence score
 * @param {Object} data - Sold data
 * @param {Object} activeData - Active listings data
 * @param {number} marketValue - Fair market value for persona advice placeholders
 * @param {number} quickSale - Quick sale price for persona advice placeholders
 * @param {number} patientSale - Patient sale price for persona advice placeholders
 * @returns {Promise<string>} HTML for market assessment
 */
async function renderMarketAssessment(marketPressure, liquidityRisk, priceBands, marketConfidence, data, activeData, marketValue, quickSale, patientSale) {
    if (marketPressure === null || !liquidityRisk || liquidityRisk.score === null) {
        return '';
    }
    
    const { belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove, salesBelow, salesAt, salesAbove } = priceBands;
    
    // Calculate cluster count from sold data for bimodal detection
    const soldPrices = data && data.items ? data.items.map(item => item.total_price).filter(p => p > 0) : [];
    const clusterCount = calculatePriceClusters(soldPrices);
    
    // Load message content dynamically from JSON
    let messageContent;
    try {
        if (window.contentLoader) {
            const content = await window.contentLoader.load();
            messageContent = content.messages;
            console.log('[renderMarketAssessment] Loaded dynamic content from JSON');
        } else {
            console.warn('[renderMarketAssessment] contentLoader not available, using fallback');
            messageContent = FALLBACK_MESSAGE_CONTENT;
        }
    } catch (error) {
        console.error('[renderMarketAssessment] Failed to load content, using fallback:', error);
        messageContent = FALLBACK_MESSAGE_CONTENT;
    }
    
    // SELECT APPROPRIATE MESSAGE BASED ON CONDITIONS
    let selectedScenario = null;
    let warningLevel = 'info';
    let warningColor = '#007aff';
    let warningBg = 'linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%)';
    let warningBorder = '#99daff';
    let warningIcon = 'ℹ️';
    let warningTitle = 'Market Analysis';
    
    // Edge Case 1: Data Quality Warning
    if (marketConfidence < 30 && Math.abs(marketPressure) > 20) {
        selectedScenario = 'dataQualityWarning';
        warningLevel = 'warning';
        warningColor = '#ff9500';
        warningBg = 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)';
        warningBorder = '#ffd699';
        warningIcon = '⚠️';
        warningTitle = 'Data Quality Warning';
    }
    // Edge Case 2: Bimodal Market Warning
    else if (detectBimodalPattern(priceBands, marketConfidence, clusterCount)) {
        selectedScenario = 'bimodalMarketWarning';
        warningLevel = 'warning';
        warningColor = '#ff9500';
        warningBg = 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)';
        warningBorder = '#ffd699';
        warningIcon = '🔀';
        warningTitle = 'Fragmented Market - Multiple Price Points';
    }
    // Edge Case 3: Two-Tier Market
    else if (absorptionBelow !== 'N/A' && absorptionAbove !== 'N/A' &&
             parseFloat(absorptionBelow) >= 1.5 && parseFloat(absorptionAbove) < 0.3 &&
             belowFMV > 0 && aboveFMV > 0) {
        selectedScenario = 'twoTierMarket';
        warningLevel = 'info';
        warningColor = '#5856d6';
        warningBg = 'linear-gradient(135deg, #f0e6ff 0%, #f5f0ff 100%)';
        warningBorder = '#d6b3ff';
        warningIcon = '🔀';
        warningTitle = 'Two-Tier Market Detected';
    }
    // High Risk
    else if (marketPressure > 30 && liquidityRisk.score < 50) {
        selectedScenario = 'highRiskConditions';
        warningLevel = 'danger';
        warningColor = '#ff3b30';
        warningBg = 'linear-gradient(135deg, #ffebee 0%, #fff5f5 100%)';
        warningBorder = '#ff9999';
        warningIcon = '🚨';
        warningTitle = 'High Risk Market Conditions';
    }
    // Overpriced but Active
    else if (marketPressure > 30 && liquidityRisk.score >= 50) {
        selectedScenario = 'overpricedActiveMarket';
        warningLevel = 'warning';
        warningColor = '#ff9500';
        warningBg = 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)';
        warningBorder = '#ffd699';
        warningIcon = '🔥';
        warningTitle = 'Overpriced but Active Market';
    }
    // Fair Pricing, Limited Demand
    else if (marketPressure <= 15 && liquidityRisk.score < 50) {
        selectedScenario = 'fairPricingLimitedDemand';
        warningLevel = 'warning';
        warningColor = '#ff9500';
        warningBg = 'linear-gradient(135deg, #fff5e6 0%, #fffaf0 100%)';
        warningBorder = '#ffd699';
        warningIcon = '⚡';
        warningTitle = 'Fair Pricing, Limited Demand';
    }
    // Strong Buy Opportunity
    else if (marketPressure < 0 && liquidityRisk.score >= 70) {
        selectedScenario = 'strongBuyOpportunity';
        warningLevel = 'success';
        warningColor = '#34c759';
        warningBg = 'linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%)';
        warningBorder = '#99ff99';
        warningIcon = '💎';
        warningTitle = 'Strong Buy Opportunity';
    }
    // Healthy Market
    else if (marketPressure >= 0 && marketPressure <= 15 && liquidityRisk.score >= 70) {
        selectedScenario = 'healthyMarketConditions';
        warningLevel = 'success';
        warningColor = '#34c759';
        warningBg = 'linear-gradient(135deg, #e6ffe6 0%, #f0fff0 100%)';
        warningBorder = '#99ff99';
        warningIcon = '✅';
        warningTitle = 'Healthy Market Conditions';
    }
    // Balanced Market (default)
    else {
        selectedScenario = 'balancedMarket';
        warningLevel = 'info';
        warningColor = '#007aff';
        warningBg = 'linear-gradient(135deg, #e6f7ff 0%, #f0f9ff 100%)';
        warningBorder = '#99daff';
        warningIcon = '📊';
        warningTitle = 'Balanced Market';
    }
    
    // Get the selected message content
    const content = messageContent[selectedScenario];
    const dataQualityScore = calculateDataQuality(data.items.length, activeData?.items?.length || 0, marketConfidence);
    
    // Replace placeholders in the message with actual values
    let processedMessage = content.message
        .replace(/{confidence}/g, marketConfidence)
        .replace(/{marketPressure}/g, marketPressure >= 0 ? '+' + marketPressure.toFixed(1) : marketPressure.toFixed(1))
        .replace(/{absMarketPressure}/g, Math.abs(marketPressure).toFixed(1))
        .replace(/{liquidityScore}/g, liquidityRisk.score)
        .replace(/{absorptionBelow}/g, absorptionBelow)
        .replace(/{absorptionAt}/g, absorptionAt)
        .replace(/{absorptionAbove}/g, absorptionAbove)
        .replace(/{salesBelow}/g, salesBelow)
        .replace(/{salesAt}/g, salesAt)
        .replace(/{salesAbove}/g, salesAbove)
        .replace(/{belowFMV}/g, belowFMV)
        .replace(/{atFMV}/g, atFMV)
        .replace(/{aboveFMV}/g, aboveFMV);
    
    // BUILD HTML WITH PERSONA ADVICE
    return `
        <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
            <h4 style="margin-top: 0; margin-bottom: 1.5rem; color: var(--text-color);">Market Assessment</h4>
            
            <div style="background: ${warningBg}; padding: 1.5rem; border-radius: 12px; border-left: 4px solid ${warningBorder};">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <span style="font-size: 2rem;">${warningIcon}</span>
                    <strong style="font-size: 1.1rem; color: ${warningColor};">${warningTitle}</strong>
                </div>
                <p style="margin: 0; font-size: 0.95rem; color: #333; line-height: 1.6;">
                    ${processedMessage}
                </p>
                ${renderPersonaAdvice(content.personaAdvice, marketValue, quickSale, patientSale)}
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.8rem; color: #666;">
                    <strong>Data Quality Score:</strong> ${dataQualityScore}/100<br>
                    <strong>Activity:</strong> ${getDominantBandStatement(belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove, salesBelow, salesAt, salesAbove)}
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// INDICATOR CARDS RENDERING
// ============================================================================

/**
 * Render liquidity profile grid section with scannable table format
 * @param {Object} priceBands - Price band data
 * @param {number} marketConfidence - Market confidence score for bimodal detection
 * @param {number} marketValue - Fair market value
 * @param {number} quickSale - Quick sale price
 * @param {number} patientSale - Patient sale price
 * @returns {string} HTML for liquidity profile
 */
function renderLiquidityProfile(priceBands, marketConfidence, marketValue, quickSale, patientSale) {
    const { belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove,
            salesBelow, salesAt, salesAbove } = priceBands;
    
    // Calculate actual dollar ranges (±10% of FMV)
    const belowRange = `Under ${formatMoney(marketValue * 0.9)}`;
    const atRange = `${formatMoney(marketValue * 0.9)}-${formatMoney(marketValue * 1.1)}`;
    const aboveRange = `Over ${formatMoney(marketValue * 1.1)}`;
    
    // Convert absorption ratios to user-friendly speed indicators
    const belowSpeed = getSpeedFromAbsorption(absorptionBelow);
    const atSpeed = getSpeedFromAbsorption(absorptionAt);
    const aboveSpeed = getSpeedFromAbsorption(absorptionAbove);
    
    return `
        <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
            <h4 style="margin-top: 0; margin-bottom: 1.5rem; color: var(--text-color);">📊 Sales Speed by Price</h4>
            
            <!-- Scannable Table -->
            <div style="overflow-x: auto; margin-bottom: 1.5rem;">
                <table style="width: 100%; border-collapse: collapse; min-width: 500px;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color);">
                            <th style="text-align: left; padding: 0.75rem; font-size: 0.9rem; color: #666; font-weight: 600;">Price Range</th>
                            <th style="text-align: center; padding: 0.75rem; font-size: 0.9rem; color: #666; font-weight: 600;">Listings</th>
                            <th style="text-align: center; padding: 0.75rem; font-size: 0.9rem; color: #666; font-weight: 600;">Recent Sales</th>
                            <th style="text-align: left; padding: 0.75rem; font-size: 0.9rem; color: #666; font-weight: 600;">Speed</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Below FMV Row -->
                        <tr style="border-bottom: 1px solid var(--border-color); background: ${belowSpeed.bg};">
                            <td style="padding: 1rem; font-weight: 600; color: #333;">${belowRange}</td>
                            <td style="text-align: center; padding: 1rem; color: #666;">${belowFMV}</td>
                            <td style="text-align: center; padding: 1rem; color: #666;">${salesBelow}</td>
                            <td style="padding: 1rem;">
                                <span style="font-size: 1.2rem; margin-right: 0.5rem;">${belowSpeed.emoji}</span>
                                <strong style="color: ${belowSpeed.color}; font-size: 0.95rem;">${belowSpeed.label}</strong>
                                <span style="font-size: 0.85rem; color: #666; margin-left: 0.5rem;">(${belowSpeed.timeline})</span>
                            </td>
                        </tr>
                        
                        <!-- At FMV Row -->
                        <tr style="border-bottom: 1px solid var(--border-color); background: ${atSpeed.bg};">
                            <td style="padding: 1rem; font-weight: 600; color: #333;">${atRange}</td>
                            <td style="text-align: center; padding: 1rem; color: #666;">${atFMV}</td>
                            <td style="text-align: center; padding: 1rem; color: #666;">${salesAt}</td>
                            <td style="padding: 1rem;">
                                <span style="font-size: 1.2rem; margin-right: 0.5rem;">${atSpeed.emoji}</span>
                                <strong style="color: ${atSpeed.color}; font-size: 0.95rem;">${atSpeed.label}</strong>
                                <span style="font-size: 0.85rem; color: #666; margin-left: 0.5rem;">(${atSpeed.timeline})</span>
                            </td>
                        </tr>
                        
                        <!-- Above FMV Row -->
                        <tr style="background: ${aboveSpeed.bg};">
                            <td style="padding: 1rem; font-weight: 600; color: #333;">${aboveRange}</td>
                            <td style="text-align: center; padding: 1rem; color: #666;">${aboveFMV}</td>
                            <td style="text-align: center; padding: 1rem; color: #666;">${salesAbove}</td>
                            <td style="padding: 1rem;">
                                <span style="font-size: 1.2rem; margin-right: 0.5rem;">${aboveSpeed.emoji}</span>
                                <strong style="color: ${aboveSpeed.color}; font-size: 0.95rem;">${aboveSpeed.label}</strong>
                                <span style="font-size: 0.85rem; color: #666; margin-left: 0.5rem;">(${aboveSpeed.timeline})</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <!-- Persona Quick Guide -->
            <div style="background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-color);">
                <div style="font-weight: 600; margin-bottom: 1rem; color: var(--text-color); font-size: 0.95rem;">
                    💡 Quick Guide:
                </div>
                <div style="display: grid; gap: 0.65rem; font-size: 0.9rem;">
                    <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
                        <span style="font-size: 1.1rem; flex-shrink: 0;">👤</span>
                        <div style="flex: 1;">
                            <strong style="color: #007aff;">Selling?</strong>
                            <span style="color: #333; margin-left: 0.5rem;">
                                ${getSellerQuickTip(belowSpeed, belowRange, atRange)}
                            </span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
                        <span style="font-size: 1.1rem; flex-shrink: 0;">💼</span>
                        <div style="flex: 1;">
                            <strong style="color: #ff9500;">Flipping?</strong>
                            <span style="color: #333; margin-left: 0.5rem;">
                                ${getFlipperQuickTip(belowSpeed, belowRange, formatMoney(marketValue))}
                            </span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
                        <span style="font-size: 1.1rem; flex-shrink: 0;">🏆</span>
                        <div style="flex: 1;">
                            <strong style="color: #5ac8fa;">Holding?</strong>
                            <span style="color: #333; margin-left: 0.5rem;">
                                ${getCollectorQuickTip(atSpeed, atRange)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Note: The main renderAnalysisDashboard function remains in script.js and calls
// these modular functions. This completes the extraction of core calculation and
// rendering logic into the analysis module as specified in Task 5.5.
