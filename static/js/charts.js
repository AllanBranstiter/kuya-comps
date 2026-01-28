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
function drawPriceDistributionChart(soldData, activeData) {
    console.log('[CHART] drawPriceDistributionChart called');
    
    try {
        const canvas = document.getElementById("priceDistributionCanvas");
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
        const margin = { top: 40, right: 40, bottom: 60, left: 60 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, width, height);
        
        // Prepare data
        let soldPrices = soldData?.items?.map(item => item.total_price).filter(p => p > 0) || [];
        let activePrices = activeData?.items?.filter(item => {
            const buyingFormat = (item.buying_format || '').toLowerCase();
            return buyingFormat.includes('buy it now');
        }).map(item => {
            return item.total_price ?? ((item.extracted_price || 0) + (item.extracted_shipping || 0));
        }).filter(p => p > 0) || [];
        
        // Filter outliers
        if (soldPrices.length >= 4) soldPrices = filterOutliers(soldPrices);
        if (activePrices.length >= 4) activePrices = filterOutliers(activePrices);
        
        if (soldPrices.length === 0 && activePrices.length === 0) {
            ctx.fillStyle = "#1d1d1f";
            ctx.font = "bold 16px " + getComputedStyle(document.body).fontFamily;
            ctx.textAlign = "center";
            ctx.fillText("No data available for price distribution", width / 2, height / 2);
            ctx.font = "14px " + getComputedStyle(document.body).fontFamily;
            ctx.fillStyle = "#6e6e73";
            ctx.fillText("(Sold and active listing data required)", width / 2, height / 2 + 30);
            return;
        }
        
        // Find price range and create bins
        const allPrices = [...soldPrices, ...activePrices];
        const minPrice = Math.min(...allPrices);
        const maxPrice = Math.max(...allPrices);
        const priceRange = maxPrice - minPrice;
        
        const numBins = 10;
        const binWidth = priceRange / numBins;
        
        const soldBins = new Array(numBins).fill(0);
        const activeBins = new Array(numBins).fill(0);
        
        soldPrices.forEach(price => {
            let binIndex = Math.floor((price - minPrice) / binWidth);
            if (binIndex >= numBins) binIndex = numBins - 1;
            if (binIndex < 0) binIndex = 0;
            soldBins[binIndex]++;
        });
        
        activePrices.forEach(price => {
            let binIndex = Math.floor((price - minPrice) / binWidth);
            if (binIndex >= numBins) binIndex = numBins - 1;
            if (binIndex < 0) binIndex = 0;
            activeBins[binIndex]++;
        });
        
        const maxCount = Math.max(...soldBins, ...activeBins, 1);
        
        // Draw axes
        ctx.strokeStyle = "#d2d2d7";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, height - margin.bottom);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(margin.left, height - margin.bottom);
        ctx.lineTo(width - margin.right, height - margin.bottom);
        ctx.stroke();
        
        // Draw axis labels
        ctx.save();
        ctx.translate(20, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = "#1d1d1f";
        ctx.font = "bold 14px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center";
        ctx.fillText("Number of Sales/Listings", 0, 0);
        ctx.restore();
        
        ctx.fillStyle = "#1d1d1f";
        ctx.font = "bold 14px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center";
        ctx.fillText("Price", width / 2, height - 10);
        
        // Draw Y-axis ticks
        const yTicks = 5;
        ctx.fillStyle = "#6e6e73";
        ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "right";
        
        for (let i = 0; i <= yTicks; i++) {
            const y = height - margin.bottom - (i / yTicks) * innerHeight;
            const value = Math.round((i / yTicks) * maxCount);
            
            ctx.strokeStyle = "#e5e5ea";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(width - margin.right, y);
            ctx.stroke();
            
            ctx.fillText(value.toString(), margin.left - 10, y + 4);
        }
        
        // Draw bars
        const barAreaWidth = innerWidth / numBins;
        const barWidth = barAreaWidth * 0.8;
        const barOffset = barAreaWidth * 0.1;
        
        for (let i = 0; i < numBins; i++) {
            const x = margin.left + (i * barAreaWidth) + barOffset;
            
            // Sold bars (blue)
            if (soldBins[i] > 0) {
                const barHeight = (soldBins[i] / maxCount) * innerHeight;
                const y = height - margin.bottom - barHeight;
                
                ctx.fillStyle = 'rgba(0, 122, 255, 0.6)';
                ctx.fillRect(x, y, barWidth, barHeight);
                ctx.strokeStyle = 'rgba(0, 122, 255, 0.9)';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, barWidth, barHeight);
            }
            
            // Active bars (red)
            if (activeBins[i] > 0) {
                const barHeight = (activeBins[i] / maxCount) * innerHeight;
                const y = height - margin.bottom - barHeight;
                const offsetX = barWidth * 0.15;
                
                ctx.fillStyle = 'rgba(255, 59, 48, 0.6)';
                ctx.fillRect(x + offsetX, y, barWidth, barHeight);
                ctx.strokeStyle = 'rgba(255, 59, 48, 0.9)';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + offsetX, y, barWidth, barHeight);
            }
        }
        
        // Draw X-axis labels
        ctx.fillStyle = "#6e6e73";
        ctx.font = "10px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = "center";
        
        const tickIndices = [0, Math.floor(numBins / 2), numBins - 1];
        tickIndices.forEach(i => {
            const binStart = minPrice + (i * binWidth);
            const x = margin.left + (i * barAreaWidth) + (barAreaWidth / 2);
            ctx.fillText(formatMoney(binStart), x, height - margin.bottom + 20);
        });
        
        const finalX = margin.left + (numBins * barAreaWidth);
        ctx.fillText(formatMoney(maxPrice), finalX, height - margin.bottom + 20);
        
        console.log('[CHART] Price distribution chart completed successfully');
        
    } catch (error) {
        console.error('[CHART ERROR] Failed to draw price distribution chart:', error);
    }
}
