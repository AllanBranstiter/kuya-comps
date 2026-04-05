/**
 * Charts Module
 * Handles all chart rendering functionality including beeswarm and distribution charts
 */

// ============================================================================
// CANVAS UTILITIES
// ============================================================================

/**
 * Resize canvas to match container dimensions
 * @param {HTMLCanvasElement} canvas - Canvas element to resize
 * @param {number} height - Desired height in pixels
 */
function resizeCanvasToContainer(canvas, height = 250) {
    if (!canvas) return;
    
    const container = canvas.parentElement;
    const containerWidth = container.offsetWidth;
    
    canvas.width = containerWidth;
    canvas.height = height;
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = height + 'px';
}

// ============================================================================
// BEESWARM CHART
// ============================================================================

/**
 * Draw beeswarm chart showing price distribution
 * @param {number[]} prices - Array of prices to plot
 */
function drawBeeswarm(prices) {
    const canvas = document.getElementById("beeswarmCanvas");
    if (!canvas || !prices || prices.length === 0) return;

    // Ensure canvas is properly sized to its container
    resizeCanvasToContainer(canvas, 250);
    
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
        ctx.fillStyle = "#6e6e73";
        ctx.font = "16px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center";
        ctx.fillText("No valid price data to display", width / 2, height / 2);
        return;
    }

    // Filter outliers using IQR method
    const filteredPrices = filterOutliers(validPrices);
    
    if (filteredPrices.length === 0) {
        ctx.fillStyle = "#6e6e73";
        ctx.font = "16px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center";
        ctx.fillText("No data after outlier filtering", width / 2, height / 2);
        return;
    }

    const minPrice = Math.min(...filteredPrices);
    const maxPrice = Math.max(...filteredPrices);
    const priceRange = maxPrice - minPrice;
    
    const xScale = (price) => {
        if (priceRange === 0) {
            return width / 2;
        }
        return margin.left + ((price - minPrice) / priceRange) * innerWidth;
    };

    // Draw FMV Band if globals are set
    if (expectLowGlobal !== null && expectHighGlobal !== null && priceRange > 0) {
        const x1 = xScale(expectLowGlobal);
        const x2 = xScale(expectHighGlobal);
        
        // Create gradient for FMV band
        const gradient = ctx.createLinearGradient(x1, margin.top, x2, height - margin.bottom);
        gradient.addColorStop(0, 'rgba(52, 199, 89, 0.2)');
        gradient.addColorStop(0.5, 'rgba(48, 209, 88, 0.15)');
        gradient.addColorStop(1, 'rgba(52, 199, 89, 0.1)');
        
        // Draw gradient background band
        ctx.shadowColor = 'rgba(52, 199, 89, 0.3)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = gradient;
        ctx.fillRect(x1, margin.top, x2 - x1, innerHeight);
        
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw FMV range border lines
        const lineGradient = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom);
        lineGradient.addColorStop(0, 'rgba(0, 122, 255, 0.8)');
        lineGradient.addColorStop(0.5, 'rgba(52, 199, 89, 0.9)');
        lineGradient.addColorStop(1, 'rgba(0, 122, 255, 0.6)');
        
        ctx.strokeStyle = lineGradient;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        
        ctx.shadowColor = 'rgba(0, 122, 255, 0.5)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(x1, margin.top);
        ctx.lineTo(x1, height - margin.bottom);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(x2, margin.top);
        ctx.lineTo(x2, height - margin.bottom);
        ctx.stroke();
        
        ctx.setLineDash([]);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        // Add FMV dollar value labels
        ctx.fillStyle = "#34c759";
        ctx.font = "bold 11px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center";
        ctx.fillText(formatMoney(expectLowGlobal), x1, margin.top - 8);
        ctx.fillText(formatMoney(expectHighGlobal), x2, margin.top - 8);
    }

    // Draw points with collision detection
    const points = filteredPrices.map(price => ({
        x: xScale(price),
        y: height / 2,
        r: 4,
        originalY: height / 2
    }));
    
    const placedPoints = [];
    const centerY = height / 2;
    const maxYOffset = Math.min(innerHeight / 2 - 10, 60);

    for (const point of points) {
        let y = point.originalY;
        let collided = true;
        let attempts = 0;
        let yOffset = 0;

        while (collided && attempts < 200) {
            collided = false;
            
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
                yOffset = Math.ceil(attempts / 2) * (point.r * 2 + 1);
                const direction = attempts % 2 === 1 ? 1 : -1;
                y = centerY + (direction * yOffset);
                
                if (y < margin.top + point.r) {
                    y = margin.top + point.r;
                } else if (y > height - margin.bottom - point.r) {
                    y = height - margin.bottom - point.r;
                }
                
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

    // Draw Axis
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.strokeStyle = "#d2d2d7";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw X-Axis Labels
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
        
        // FMV marker
        if (marketValueGlobal !== null && marketValueGlobal >= minPrice && marketValueGlobal <= maxPrice) {
            const fmvX = xScale(marketValueGlobal);
            
            ctx.beginPath();
            ctx.moveTo(fmvX, height - margin.bottom);
            ctx.lineTo(fmvX, height - margin.bottom + 5);
            ctx.strokeStyle = "#ff9500";
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = "#6e6e73";
            ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
            ctx.textAlign = "center";
            ctx.fillText("FMV", fmvX, height - margin.bottom + 15);
            ctx.fillStyle = "#ff9500";
            ctx.font = "bold 12px " + getComputedStyle(document.body).fontFamily;
            ctx.fillText(formatMoney(marketValueGlobal), fmvX, height - margin.bottom + 30);
        }
    } else {
        ctx.fillText(formatMoney(minPrice), width / 2, height - margin.bottom + 20);
        ctx.fillText("(All prices identical)", width / 2, height - margin.bottom + 35);
    }
    
    // Draw legend
    const legendY = height - 15;
    const legendText = "FMV Range";
    
    ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
    const textWidth = ctx.measureText(legendText).width;
    const rectWidth = 30;
    const spacing = 5;
    const totalLegendWidth = rectWidth + spacing + textWidth;
    const legendX = (width - totalLegendWidth) / 2;
    
    const gradient = ctx.createLinearGradient(legendX, legendY - 8, legendX + rectWidth, legendY - 8);
    gradient.addColorStop(0, 'rgba(52, 199, 89, 0.3)');
    gradient.addColorStop(1, 'rgba(52, 199, 89, 0.5)');
    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, legendY - 12, rectWidth, 12);
    
    ctx.strokeStyle = 'rgba(52, 199, 89, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY - 12, rectWidth, 12);
    
    ctx.fillStyle = "#1d1d1f";
    ctx.textAlign = "left";
    ctx.fillText(legendText, legendX + rectWidth + spacing, legendY - 3);
}

// ============================================================================
// PRICE DISTRIBUTION CHART
// ============================================================================

/**
 * Draw price distribution bar chart
 * @param {Object} soldData - Sold listings data
 * @param {Object} activeData - Active listings data
 */
function drawPriceDistributionChart(soldData, activeData, canvasId, numBinsOverride) {
    console.log('[CHART] drawPriceDistributionChart called');

    try {
        const canvas = document.getElementById(canvasId || "priceDistributionCanvas");
        if (!canvas) {
            console.error('[CHART ERROR] Price distribution canvas not found');
            return;
        }
        
        const isVisible = canvas.offsetParent !== null;
        if (!isVisible) {
            console.warn('[CHART] Canvas not visible yet');
            return;
        }
        
        resizeCanvasToContainer(canvas, 300);
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            console.error('[CHART] Could not get canvas context');
            return;
        }
        
        const width = canvas.width;
        const height = canvas.height;
        const margin = { top: 55, right: 40, bottom: 80, left: 40 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        ctx.clearRect(0, 0, width, height);

        // Prepare data (filter out low-relevance listings)
        const RELEVANCE_THRESHOLD = 0.5;
        let soldPrices = (soldData?.items || [])
            .filter(item => (item.ai_relevance_score ?? 1.0) >= RELEVANCE_THRESHOLD)
            .map(item => item.total_price).filter(p => p > 0);
        let activePrices = (activeData?.items || [])
            .filter(item => {
                const buyingFormat = (item.buying_format || '').toLowerCase();
                return buyingFormat.includes('buy it now') && (item.ai_relevance_score ?? 1.0) >= RELEVANCE_THRESHOLD;
            }).map(item => {
                return item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
            }).filter(p => p > 0);

        // Filter outliers
        if (soldPrices.length >= 4) soldPrices = filterOutliers(soldPrices);
        if (activePrices.length >= 4) activePrices = filterOutliers(activePrices);

        if (soldPrices.length === 0 && activePrices.length === 0) {
            ctx.fillStyle = "#1d1d1f";
            ctx.font = "bold 16px " + getComputedStyle(document.body).fontFamily;
            ctx.textAlign = "center";
            ctx.fillText("No data available for price distribution", width / 2, height / 2);
            return;
        }

        // Use shared axis range if available, otherwise compute from data
        const useShared = typeof sharedChartAxisMin !== 'undefined' && sharedChartAxisMin !== null;
        const axisMin = useShared ? sharedChartAxisMin : Math.min(...soldPrices, ...activePrices);
        const axisMax = useShared ? sharedChartAxisMax : Math.max(...soldPrices, ...activePrices);
        const priceRange = axisMax - axisMin;

        // Clip prices to axis range so outliers don't stack in edge bins
        soldPrices = soldPrices.filter(p => p >= axisMin && p <= axisMax);
        activePrices = activePrices.filter(p => p >= axisMin && p <= axisMax);

        const numBins = numBinsOverride || 35;
        const binWidth = priceRange / numBins;

        const soldBins = new Array(numBins).fill(0);
        const activeBins = new Array(numBins).fill(0);

        soldPrices.forEach(price => {
            let binIndex = Math.floor((price - axisMin) / binWidth);
            if (binIndex >= numBins) binIndex = numBins - 1;
            if (binIndex < 0) binIndex = 0;
            soldBins[binIndex]++;
        });

        activePrices.forEach(price => {
            let binIndex = Math.floor((price - axisMin) / binWidth);
            if (binIndex >= numBins) binIndex = numBins - 1;
            if (binIndex < 0) binIndex = 0;
            activeBins[binIndex]++;
        });

        const maxCount = Math.max(...soldBins, ...activeBins, 1);

        // Draw FMV band (behind bars)
        const xScale = (price) => margin.left + ((price - axisMin) / priceRange) * innerWidth;
        const eLow = typeof expectLowGlobal !== 'undefined' ? expectLowGlobal : null;
        const eHigh = typeof expectHighGlobal !== 'undefined' ? expectHighGlobal : null;
        if (eLow !== null && eHigh !== null && priceRange > 0) {
            const x1 = xScale(eLow);
            const x2 = xScale(eHigh);
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
            ctx.fillText(formatMoney(eLow), x1, margin.top - 5);
            ctx.fillText(formatMoney(eHigh), x2, margin.top - 5);
        }

        // Draw bottom axis only
        ctx.strokeStyle = "#d2d2d7";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin.left, height - margin.bottom);
        ctx.lineTo(width - margin.right, height - margin.bottom);
        ctx.stroke();

        // Draw light grid lines
        const yTicks = 4;
        for (let i = 1; i <= yTicks; i++) {
            const y = height - margin.bottom - (i / yTicks) * innerHeight;
            ctx.strokeStyle = "#e5e5ea";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(width - margin.right, y);
            ctx.stroke();
        }

        // Draw bars
        const barAreaWidth = innerWidth / numBins;
        const barWidth = barAreaWidth * 0.85;
        const barOffset = barAreaWidth * 0.075;

        for (let i = 0; i < numBins; i++) {
            const x = margin.left + (i * barAreaWidth) + barOffset;

            // Sold bars (blue)
            if (soldBins[i] > 0) {
                const barHeight = (soldBins[i] / maxCount) * innerHeight;
                const y = height - margin.bottom - barHeight;
                ctx.fillStyle = 'rgba(0, 122, 255, 0.6)';
                ctx.fillRect(x, y, barWidth, barHeight);
                ctx.strokeStyle = 'rgba(0, 122, 255, 0.9)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, barWidth, barHeight);
            }

            // Active bars (red, offset slightly)
            if (activeBins[i] > 0) {
                const barHeight = (activeBins[i] / maxCount) * innerHeight;
                const y = height - margin.bottom - barHeight;
                const offsetX = barWidth * 0.1;
                ctx.fillStyle = 'rgba(255, 59, 48, 0.5)';
                ctx.fillRect(x + offsetX, y, barWidth, barHeight);
                ctx.strokeStyle = 'rgba(255, 59, 48, 0.85)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x + offsetX, y, barWidth, barHeight);
            }
        }

        // FMV marker on x-axis
        const mVal = typeof marketValueGlobal !== 'undefined' ? marketValueGlobal : null;
        if (mVal !== null && priceRange > 0) {
            const fmvX = xScale(mVal);
            ctx.beginPath(); ctx.moveTo(fmvX, height - margin.bottom); ctx.lineTo(fmvX, height - margin.bottom + 5);
            ctx.strokeStyle = "#ff9500"; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = "#6e6e73"; ctx.font = "11px " + getComputedStyle(document.body).fontFamily; ctx.textAlign = "center";
            ctx.fillText("FMV", fmvX, height - margin.bottom + 16);
            ctx.fillStyle = "#ff9500"; ctx.font = "bold 12px " + getComputedStyle(document.body).fontFamily;
            ctx.fillText(formatMoney(mVal), fmvX, height - margin.bottom + 30);
        }
        
        // Draw X-axis labels — min and max aligned with mirrored strip
        ctx.fillStyle = "#6e6e73";
        ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "left";
        ctx.fillText(formatMoney(axisMin), margin.left, height - margin.bottom + 18);
        ctx.textAlign = "right";
        ctx.fillText(formatMoney(axisMax), width - margin.right, height - margin.bottom + 18);

        // Legend
        ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
        const lgItems = [
            { label: "Sold Listings", color: "rgba(0, 122, 255, 0.6)", stroke: "rgba(0, 122, 255, 0.9)", type: "dot" },
            { label: "Active Listings", color: "rgba(255, 59, 48, 0.5)", stroke: "rgba(255, 59, 48, 0.85)", type: "dot" },
            { label: "FMV Range", color: "rgba(52, 199, 89, 0.35)", stroke: "rgba(52, 199, 89, 0.8)", type: "rect" },
        ];
        const lgDotR = 6; const lgSpacing = 6; const lgGap = 24;
        const lgWidths = lgItems.map(item => {
            const iconW = item.type === "rect" ? 20 : lgDotR * 2;
            return iconW + lgSpacing + ctx.measureText(item.label).width;
        });
        const lgTotal = lgWidths.reduce((a, b) => a + b, 0) + lgGap * (lgItems.length - 1);
        let lgx = (width - lgTotal) / 2;
        const lgY = height - 8;
        lgItems.forEach((item, i) => {
            const iconW = item.type === "rect" ? 20 : lgDotR * 2;
            if (item.type === "rect") {
                ctx.fillStyle = item.color; ctx.fillRect(lgx, lgY - 12, iconW, 12);
                ctx.strokeStyle = item.stroke; ctx.lineWidth = 1; ctx.strokeRect(lgx, lgY - 12, iconW, 12);
            } else {
                ctx.beginPath(); ctx.arc(lgx + lgDotR, lgY - 4, lgDotR, 0, 2 * Math.PI);
                ctx.fillStyle = item.color; ctx.fill(); ctx.strokeStyle = item.stroke; ctx.lineWidth = 1; ctx.stroke();
            }
            ctx.fillStyle = "#1d1d1f"; ctx.textAlign = "left";
            ctx.fillText(item.label, lgx + iconW + lgSpacing, lgY - 1);
            lgx += lgWidths[i] + lgGap;
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
            const cid = canvasId || "priceDistributionCanvas";
            canvas.addEventListener('click', function(e) {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                // Use globals for latest data
                const sd = typeof currentSoldData !== 'undefined' ? currentSoldData : soldData;
                const ad = typeof currentActiveData !== 'undefined' ? currentActiveData : activeData;
                const bins = parseInt(document.getElementById('binSlider')?.value || 35);
                drawPriceDistributionChart(sd, ad, cid, bins);
                if (typeof drawChartCrosshair === 'function') {
                    drawChartCrosshair(canvas, x);
                }
            });
            canvas._crosshairAttached = true;
        }

        console.log('[CHART] Price distribution chart completed successfully');
        
    } catch (error) {
        console.error('[CHART ERROR] Failed to draw price distribution chart:', error);
    }
}
