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
    const lowSoldData = soldCount < 10;
    const lowActiveData = activeCount < 5;
    const lowPressureData = pressureSampleSize < 5;
    
    if (!lowSoldData && !lowActiveData && !lowPressureData) {
        return '';
    }
    
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
 * @param {number} below - Listings below FMV
 * @param {number} at - Listings at FMV
 * @param {number} above - Listings above FMV
 * @param {string} absBelow - Absorption ratio below FMV
 * @param {string} absAt - Absorption ratio at FMV
 * @param {string} absAbove - Absorption ratio above FMV
 * @returns {string} Dominant band statement
 */
function getDominantBandStatement(below, at, above, absBelow, absAt, absAbove) {
    const total = below + at + above;
    if (total === 0) return '';
    
    const maxListings = Math.max(below, at, above);
    let location = '';
    if (below === maxListings) location = 'below FMV';
    else if (at === maxListings) location = 'at FMV';
    else location = 'above FMV';
    
    let absorption = absBelow;
    if (at === maxListings) absorption = absAt;
    if (above === maxListings) absorption = absAbove;
    
    return `Most listings concentrated ${location} with ${absorption} absorption ratio`;
}

/**
 * Generate velocity statement for sell time estimates
 * @param {string|number} absorptionRatio - Absorption ratio
 * @param {string} scenario - Pricing scenario description
 * @returns {string} Velocity statement
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
    } else {
        if (ratio >= 0.5) {
            return '📊 Moderate demand even at premium pricing. Some buyers willing to pay above FMV.';
        } else if (ratio >= 0.3) {
            return '⏳ Lower demand. Premium-priced cards face longer wait times. Most sales happen closer to FMV.';
        } else {
            return '⚠️ Very low demand at these prices. Significant oversupply vs sales. Overpriced for current market conditions.';
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

// ============================================================================
// MARKET ASSESSMENT WARNING RENDERING
// ============================================================================

/**
 * Render persona-based advice sections
 * @param {Object} personaAdvice - Object with seller, flipper, collector arrays
 * @returns {string} HTML string for persona sections
 */
function renderPersonaAdvice(personaAdvice) {
    if (!personaAdvice) return '';
    
    const sections = [
        {
            key: 'seller',
            label: "If you're a seller",
            color: '#007aff',
            bg: 'rgba(0, 122, 255, 0.05)'
        },
        {
            key: 'flipper',
            label: "If you're flipping",
            color: '#ff9500',
            bg: 'rgba(255, 149, 0, 0.05)'
        },
        {
            key: 'collector',
            label: "If you're collecting long-term",
            color: '#5ac8fa',
            bg: 'rgba(90, 200, 250, 0.05)'
        }
    ];
    
    let html = '<div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">';
    
    sections.forEach(section => {
        const advice = personaAdvice[section.key];
        if (advice && advice.length > 0) {
            html += `
                <div style="background: ${section.bg}; padding: 0.75rem 1rem; border-radius: 8px; border-left: 3px solid ${section.color};">
                    <strong style="color: ${section.color}; font-size: 0.85rem; display: block; margin-bottom: 0.5rem;">${section.label}</strong>
                    <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.85rem; line-height: 1.6; color: #333;">
                        ${advice.map(point => `<li style="margin-bottom: 0.25rem;">${point}</li>`).join('')}
                    </ul>
                </div>
            `;
        }
    });
    
    html += '</div>';
    return html;
}

/**
 * Render market assessment warning section
 * @param {number} marketPressure - Market pressure percentage
 * @param {Object} liquidityRisk - Liquidity risk metrics
 * @param {Object} priceBands - Price band data
 * @param {number} marketConfidence - Market confidence score
 * @param {Object} data - Sold data
 * @param {Object} activeData - Active listings data
 * @returns {string} HTML for market assessment
 */
function renderMarketAssessment(marketPressure, liquidityRisk, priceBands, marketConfidence, data, activeData) {
    if (marketPressure === null || !liquidityRisk || liquidityRisk.score === null) {
        return '';
    }
    
    const { belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove, salesBelow, salesAt, salesAbove } = priceBands;
    
    // MESSAGE CONTENT DEFINITIONS WITH PERSONA ADVICE
    const messageContent = {
        dataQualityWarning: {
            message: `The prices are all over the place (confidence: ${marketConfidence}/100) and asking prices are ${marketPressure >= 0 ? '+' : ''}${marketPressure.toFixed(1)}% vs FMV. This usually means your search is mixing different card types, conditions, or variations together. Try making your search more specific to get better results.`,
            personaAdvice: {
                seller: [
                    "Be careful pricing your card based on outliers",
                    "Buyers will question your price and negotiate aggressively",
                    "Before listing, tighten your search to match your exact card"
                ],
                flipper: [
                    "This isn't a reliable market for consistent flips",
                    "Only buy if the deal is obviously mispriced and easy to verify",
                    "Otherwise, the risk outweighs the reward"
                ],
                collector: [
                    "This is a 'pause and research' moment",
                    "Waiting for clean data usually leads to better buying decisions",
                    "No need to rush unless the card is extremely scarce"
                ]
            }
        },
        
        twoTierMarket: {
            message: `This market has two different speeds: Cards priced below FMV are selling <strong>${absorptionBelow}x faster</strong> than new listings appear (${salesBelow} sales vs ${belowFMV} listings), while higher-priced cards aren't selling quickly (${absorptionAbove} absorption, ${salesAbove} sales vs ${aboveFMV} listings). Average asking price is ${marketPressure >= 0 ? '+' : ''}${marketPressure.toFixed(1)}% vs FMV.`,
            personaAdvice: {
                seller: [
                    "Cards priced near or below fair value sell much faster",
                    "Overpricing usually leads to long wait times",
                    "If you want a quick sale, price competitively"
                ],
                flipper: [
                    "This is a good flipping setup",
                    "Buy below fair value and sell close to it",
                    "Avoid premium pricing—those listings tend to stall"
                ],
                collector: [
                    "A solid time to buy if you stick to fair prices",
                    "Ignore overpriced listings; they don't reflect real demand",
                    "Patient buyers have the advantage here"
                ]
            }
        },
        
        highRiskConditions: {
            message: `Sellers are asking <strong>${marketPressure.toFixed(1)}% above FMV</strong>, but there aren't many buyers interested (liquidity: ${liquidityRisk.score}/100). This means listings are overpriced compared to what buyers are actually willing to pay. It may be better to wait for sellers to lower prices or look for better deals elsewhere.`,
            personaAdvice: {
                seller: [
                    "This is a tough environment to sell in",
                    "Expect slow sales or price drops",
                    "If you need to sell, pricing below the crowd helps"
                ],
                flipper: [
                    "This is usually a bad setup",
                    "High prices plus low demand leave little room for profit",
                    "Better opportunities exist elsewhere"
                ],
                collector: [
                    "Waiting often pays off here",
                    "Markets like this tend to cool down",
                    "Patience can lead to better entry prices later"
                ]
            }
        },
        
        overpricedActiveMarket: {
            message: `The market for this card is very hot. Asking prices are <strong>${marketPressure.toFixed(1)}% above FMV</strong>, and are supported by strong demand and good liquidity (${liquidityRisk.score}/100). Sellers currently have the upper hand because there are plenty of buyers and lots of sales happening, which helps support these high prices. Prices may still be rising, but they could start to drop if buyer interest or liquidity slows down.`,
            personaAdvice: {
                seller: [
                    "This is a strong selling window",
                    "Buyers are accepting higher prices right now",
                    "Consider selling while demand is hot"
                ],
                flipper: [
                    "Flips are possible, but timing matters",
                    "You need to buy and resell quickly",
                    "Miss the timing, and you risk holding overpriced inventory"
                ],
                collector: [
                    "You're paying extra to get a card immediately",
                    "If you don't need the card now, waiting is usually safer",
                    "Great cards often come back down once hype fades"
                ]
            }
        },
        
        fairPricingLimitedDemand: {
            message: `Prices are fairly reasonable (${marketPressure >= 0 ? '+' : ''}${marketPressure.toFixed(1)}% vs FMV), but not many buyers are interested (liquidity: ${liquidityRisk.score}/100). Even though prices are fair, cards aren't selling well. This could mean the card is losing popularity or buyer interest is fading. If this card is from a recent release, this could also mean the number of cards available for sale (supply) is starting to outstrip the number of interested buyers (demand).`,
            personaAdvice: {
                seller: [
                    "Slow sales are likely, even at fair prices",
                    "If you want quicker action, slight discounts can help",
                    "Otherwise, patience is required"
                ],
                flipper: [
                    "Not ideal for quick flips",
                    "Even good deals may take time to resell",
                    "Only buy if you expect a future catalyst"
                ],
                collector: [
                    "This can be a great quiet buying opportunity",
                    "Fair prices without hype often age well",
                    "Especially attractive for iconic or historically stable cards"
                ]
            }
        },
        
        strongBuyOpportunity: {
            message: `Available cards are priced <strong>${Math.abs(marketPressure).toFixed(1)}% below FMV</strong> and lots of buyers are active (liquidity: ${liquidityRisk.score}/100). This is a rare opportunity: cards are underpriced and selling fast. This could mean a player is breaking out or performing well.`,
            personaAdvice: {
                seller: [
                    "You could be leaving money on the table at current prices—consider your opinion of the player's potential",
                    "Expect fast sales, even if you raise your price slightly",
                    "If you're listing now, consider pricing closer to fair value—or just above it"
                ],
                flipper: [
                    "This is an excellent setup",
                    "Buy quickly at current prices and aim for fast resale",
                    "Delays matter here—once sellers adjust, margins shrink"
                ],
                collector: [
                    "This is one of the better times to buy if you're optimistic about the player's potential",
                    "You're entering below fair value in a market with real demand",
                    "Acting sooner usually beats waiting in conditions like this"
                ]
            }
        },
        
        healthyMarketConditions: {
            message: `Prices are fair (${marketPressure >= 0 ? '+' : ''}${marketPressure.toFixed(1)}% vs FMV) and there's plenty of buyer activity (liquidity: ${liquidityRisk.score}/100). This is a healthy, well-functioning market where both buyers and sellers are active. Prices accurately reflect current demand: good conditions for both buying and selling.`,
            personaAdvice: {
                seller: [
                    "Fair pricing is being rewarded with steady sales",
                    "No need to overthink timing—this is a good environment to list",
                    "Well-presented listings should move at reasonable prices"
                ],
                flipper: [
                    "Opportunities exist, but they're not automatic",
                    "Profits depend on buying well, not on market imbalance",
                    "Focus on small edges rather than big swings"
                ],
                collector: [
                    "A comfortable, low-stress time to buy",
                    "You're unlikely to overpay or miss out by waiting briefly",
                    "Buy based on preference, not fear of price movement"
                ]
            }
        },
        
        balancedMarket: {
            message: `Prices are in the middle range (${marketPressure >= 0 ? '+' : ''}${marketPressure.toFixed(1)}% vs FMV) with moderate buyer activity (liquidity: ${liquidityRisk.score}/100). This is a normal, stable market: nothing particularly remarkable happening. Use your normal judgment when buying or selling.`,
            personaAdvice: null  // No persona advice for balanced market
        }
    };
    
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
    // Edge Case 2: Two-Tier Market
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
                    ${content.message}
                </p>
                ${renderPersonaAdvice(content.personaAdvice)}
                <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.8rem; color: #666;">
                    <strong>Data Quality Score:</strong> ${dataQualityScore}/100<br>
                    <strong>Activity:</strong> ${getDominantBandStatement(belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove)}
                </div>
            </div>
        </div>
    `;
}

// ============================================================================
// INDICATOR CARDS RENDERING
// ============================================================================

/**
 * Render liquidity profile grid section
 * @param {Object} priceBands - Price band data
 * @returns {string} HTML for liquidity profile
 */
function renderLiquidityProfile(priceBands) {
    const { belowFMV, atFMV, aboveFMV, absorptionBelow, absorptionAt, absorptionAbove, salesBelow, salesAt, salesAbove } = priceBands;
    
    return `
        <div style="background: var(--card-background); padding: 2rem; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); margin-bottom: 2rem;">
            <h4 style="margin-top: 0; margin-bottom: 1.5rem; color: var(--text-color);">Liquidity Profile</h4>
            
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
        </div>
    `;
}

// Note: The main renderAnalysisDashboard function remains in script.js and calls
// these modular functions. This completes the extraction of core calculation and
// rendering logic into the analysis module as specified in Task 5.5.
