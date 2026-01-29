/**
 * Grading Intelligence Module
 * Intelligent PSA Grading Decision Support Tool
 *
 * Helps users determine if a card is worth submitting to PSA for grading
 * by analyzing potential ROI across different grade scenarios.
 *
 * Created: January 27, 2026
 * Part of Kuya Comps - Baseball Card Market Analysis Platform
 */

const GradingAdvisor = (function() {
    'use strict';

    // =========================================================================
    // PRIVATE STATE
    // =========================================================================
    
    /** @type {Object|null} Current analysis results from API */
    let currentResults = null;
    
    /** @type {boolean} Flag indicating if analysis is in progress */
    let isLoading = false;
    
    /** @type {string} API endpoint for grading analysis */
    const API_ENDPOINT = '/api/grading-advisor';
    
    /** @type {number} Default grading fee in USD */
    const DEFAULT_GRADING_FEE = 21.00;
    
    // =========================================================================
    // EDUCATIONAL TOOLTIP CONTENT
    // =========================================================================
    
    const TOOLTIP_CONTENT = {
        psaGrading: `
            <strong>What is PSA Grading?</strong><br>
            PSA (Professional Sports Authenticator) grades cards on a 1-10 scale. 
            Higher grades typically command premium prices, but grading costs $21-150+ per card. 
            A PSA 10 (Gem Mint) is the highest grade and often worth significantly more than lower grades.
        `,
        populationData: `
            <strong>Understanding Population Data</strong><br>
            Population (pop) counts show how many cards exist at each grade level. 
            Lower population = higher scarcity = potentially higher value. 
            Cards with low PSA 10 pop counts relative to total graded are more desirable.
        `,
        expectedGrade: `
            <strong>Estimating Your Grade</strong><br>
            Consider centering, corners, edges, and surface condition. 
            Be conservative – most cards grade lower than expected. 
            A PSA 8 average is realistic for well-preserved modern cards.
        `,
        breakEvenGrade: `
            <strong>What is Break-Even Grade?</strong><br>
            The minimum PSA grade needed for the graded card's value to cover 
            your raw purchase price plus grading fees. 
            Below this grade, you'll lose money on the grading investment.
        `,
        roiCalculation: `
            <strong>ROI Calculation</strong><br>
            Return on Investment = ((Graded Value - Total Cost) / Total Cost) × 100%<br>
            Total Cost includes raw card price + grading fee.
        `,
        scenarioAnalysis: `
            <strong>Scenario Analysis</strong><br>
            <strong>Optimistic:</strong> Assuming you receive a PSA 10<br>
            <strong>Realistic:</strong> Based on typical grade distribution<br>
            <strong>Pessimistic:</strong> Assuming a PSA 8 or below
        `
    };

    // =========================================================================
    // UTILITY FUNCTIONS
    // =========================================================================
    
    /**
     * Format a number as USD currency
     * @param {number} amount - The amount to format
     * @returns {string} Formatted currency string (e.g., "$125.50")
     */
    function formatCurrency(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) {
            return '$0.00';
        }
        const absAmount = Math.abs(amount);
        const formatted = absAmount.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return amount < 0 ? `-${formatted}` : formatted;
    }
    
    /**
     * Format a number as a percentage
     * @param {number} value - The value to format (e.g., 0.25 for 25%)
     * @param {boolean} includeSign - Whether to include +/- sign
     * @returns {string} Formatted percentage string (e.g., "+25.5%")
     */
    function formatPercentage(value, includeSign = true) {
        if (value === null || value === undefined || isNaN(value)) {
            return '0.0%';
        }
        const formatted = Math.abs(value).toFixed(1) + '%';
        if (includeSign) {
            return value >= 0 ? `+${formatted}` : `-${formatted}`;
        }
        return formatted;
    }
    
    /**
     * Escape HTML to prevent XSS attacks
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML string
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Parse simple markdown to HTML for display
     * Supports: **bold**, *italic*, \n (newlines), and bullet points (• or -)
     * @param {string} text - Text with markdown formatting
     * @returns {string} HTML string with formatting applied
     */
    function parseSimpleMarkdown(text) {
        if (!text) return '';
        
        // First escape HTML to prevent XSS
        let html = escapeHtml(text);
        
        // Convert **text** to <strong>text</strong> (bold)
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Convert *text* to <em>text</em> (italic) - but not inside already converted strong tags
        // Use negative lookbehind/lookahead to avoid matching already converted **
        html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        
        // Convert newlines to <br>
        html = html.replace(/\n/g, '<br>');
        
        // Handle bullet points at start of lines (after <br> or at start)
        // Convert "• " or "- " at line starts to proper list formatting
        html = html.replace(/(?:^|<br>)\s*[•\-]\s+/g, function(match) {
            const prefix = match.startsWith('<br>') ? '<br>' : '';
            return prefix + '<span class="advice-bullet">•</span> ';
        });
        
        return html;
    }
    
    /**
     * Show loading indicator and disable submit button
     */
    function showLoading() {
        isLoading = true;
        
        const analyzeBtn = document.getElementById('analyze-btn');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = `
                <span class="loading-spinner"></span>
                Analyzing...
            `;
            analyzeBtn.style.opacity = '0.7';
        }
        
        const resultsContainer = document.getElementById('grading-results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="loading-container" style="text-align: center; padding: 3rem 2rem;">
                    <div class="loading-spinner-large"></div>
                    <p style="margin-top: 1rem; color: var(--subtle-text-color);">
                        Analyzing grading scenarios...
                    </p>
                </div>
            `;
        }
    }
    
    /**
     * Hide loading indicator and enable submit button
     */
    function hideLoading() {
        isLoading = false;
        
        const analyzeBtn = document.getElementById('analyze-btn');
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<span class="btn-icon">📊</span>Analyze Grading Decision';
            analyzeBtn.style.opacity = '1';
        }
    }
    
    /**
     * Display an error message to the user
     * @param {string} message - Error message to display
     */
    function showError(message) {
        const resultsContainer = document.getElementById('grading-results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="warning-list">
                    <div class="warning-item error">
                        <span class="warning-icon">⚠️</span>
                        <span>${escapeHtml(message)}</span>
                    </div>
                </div>
            `;
        }
        console.error('[GRADING ADVISOR] Error:', message);
    }
    
    /**
     * Copy text to clipboard using the Clipboard API
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} Whether copy was successful
     */
    async function copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-999999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
            }
        } catch (error) {
            console.error('[GRADING ADVISOR] Copy to clipboard failed:', error);
            return false;
        }
    }

    // =========================================================================
    // FORM HANDLING
    // =========================================================================
    
    /**
     * Collect all form data and structure it for the API
     * @returns {Object} Request body for the API
     */
    function collectFormData() {
        const priceData = {};
        const populationData = {};
        
        // Collect price and population data for grades 1-10
        for (let grade = 1; grade <= 10; grade++) {
            const priceInput = document.getElementById(`grade-price-${grade}`);
            const popInput = document.getElementById(`grade-pop-${grade}`);
            
            if (priceInput && priceInput.value) {
                const price = parseFloat(priceInput.value);
                if (!isNaN(price) && price > 0) {
                    priceData[grade.toString()] = price;
                }
            }
            
            if (popInput && popInput.value) {
                const pop = parseInt(popInput.value, 10);
                if (!isNaN(pop) && pop >= 0) {
                    populationData[grade.toString()] = pop;
                }
            }
        }
        
        // Get purchase inputs
        const rawPurchasePrice = parseFloat(
            document.getElementById('raw-purchase-price')?.value || '0'
        );
        const gradingFee = parseFloat(
            document.getElementById('grading-fee')?.value || DEFAULT_GRADING_FEE.toString()
        );
        
        // Get optional expected grade
        const expectedGradeSelect = document.getElementById('expected-grade');
        let expectedGrade = null;
        if (expectedGradeSelect && expectedGradeSelect.value) {
            expectedGrade = parseInt(expectedGradeSelect.value, 10);
            if (isNaN(expectedGrade)) {
                expectedGrade = null;
            }
        }
        
        return {
            price_data: priceData,
            population_data: populationData,
            raw_purchase_price: rawPurchasePrice,
            grading_fee: gradingFee,
            expected_grade: expectedGrade
        };
    }
    
    /**
     * Validate form inputs before submission
     * @returns {Object} Validation result { valid: boolean, errors: string[] }
     */
    function validateInputs() {
        const errors = [];
        const data = collectFormData();
        
        // Check if raw purchase price is provided
        if (!data.raw_purchase_price || data.raw_purchase_price <= 0) {
            errors.push('Please enter the raw card purchase price');
        }
        
        // Check if grading fee is provided
        if (!data.grading_fee || data.grading_fee < 0) {
            errors.push('Please enter a valid grading fee');
        }
        
        // Check if at least some price data is provided
        const priceCount = Object.keys(data.price_data).length;
        if (priceCount < 2) {
            errors.push('Please enter prices for at least 2 grade levels to enable analysis');
        }
        
        // Validate price data makes sense (higher grades should generally cost more)
        const prices = Object.entries(data.price_data)
            .map(([grade, price]) => ({ grade: parseInt(grade), price }))
            .sort((a, b) => a.grade - b.grade);
        
        if (prices.length >= 2) {
            const lowest = prices[0];
            const highest = prices[prices.length - 1];
            if (highest.price < lowest.price) {
                // This is a warning, not an error - some cards have inverse value curves
                console.warn('[GRADING ADVISOR] Warning: Higher grades priced lower than lower grades');
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * Reset the form to its initial state
     */
    function resetForm() {
        console.log('[GRADING ADVISOR] Resetting form');
        
        // Clear all grade inputs
        for (let grade = 1; grade <= 10; grade++) {
            const priceInput = document.getElementById(`grade-price-${grade}`);
            const popInput = document.getElementById(`grade-pop-${grade}`);
            
            if (priceInput) priceInput.value = '';
            if (popInput) popInput.value = '';
        }
        
        // Reset purchase inputs
        const rawPriceInput = document.getElementById('raw-purchase-price');
        const gradingFeeInput = document.getElementById('grading-fee');
        const expectedGradeSelect = document.getElementById('expected-grade');
        
        if (rawPriceInput) rawPriceInput.value = '';
        if (gradingFeeInput) gradingFeeInput.value = DEFAULT_GRADING_FEE.toFixed(2);
        if (expectedGradeSelect) expectedGradeSelect.value = '';
        
        // Clear results
        const resultsContainer = document.getElementById('grading-results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = '';
        }
        
        // Clear stored results
        currentResults = null;
        
        // Focus on first input
        const firstInput = document.getElementById('grade-price-1');
        if (firstInput) {
            firstInput.focus();
        }
    }
    
    /**
     * Handle form submission
     * @param {Event} event - Submit event
     */
    async function handleFormSubmit(event) {
        event.preventDefault();
        
        if (isLoading) {
            console.log('[GRADING ADVISOR] Already processing, ignoring submit');
            return;
        }
        
        console.log('[GRADING ADVISOR] Form submitted');
        
        // Validate inputs
        const validation = validateInputs();
        if (!validation.valid) {
            const errorMessage = validation.errors.join('. ');
            showError(errorMessage);
            return;
        }
        
        // Collect form data
        const data = collectFormData();
        console.log('[GRADING ADVISOR] Request data:', data);
        
        // Submit analysis
        await submitAnalysis(data);
    }

    // =========================================================================
    // API COMMUNICATION
    // =========================================================================
    
    /**
     * Submit data to the grading advisor API
     * @param {Object} data - Request body
     */
    async function submitAnalysis(data) {
        showLoading();
        
        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                let errorMessage = 'Analysis failed';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorData.message || errorMessage;
                } catch {
                    errorMessage = `Server error (${response.status})`;
                }
                throw new Error(errorMessage);
            }
            
            const result = await response.json();
            console.log('[GRADING ADVISOR] API response:', result);
            
            // Store results
            currentResults = result;
            
            // Render results
            renderResults(result);
            
        } catch (error) {
            console.error('[GRADING ADVISOR] API error:', error);
            showError(error.message || 'Failed to analyze grading value. Please try again.');
        } finally {
            hideLoading();
        }
    }

    // =========================================================================
    // RESULTS RENDERING
    // =========================================================================
    
    /**
     * Main render function for analysis results
     * @param {Object} response - API response data
     */
    function renderResults(response) {
        const container = document.getElementById('grading-results-container');
        if (!container) {
            console.error('[GRADING ADVISOR] Results container not found');
            return;
        }
        
        let html = '';
        
        // Start results grid - single column for full-width cards
        html += '<div class="grading-results" style="display: flex; flex-direction: column; gap: 1.5rem;">';
        
        // Render Decision Summary Hero Card FIRST - provides clear recommendation
        html += createDecisionSummaryCard(response);
        
        // Render financial matrix (Profit/Loss by Grade) - FULL WIDTH
        if (response.matrix) {
            html += renderFinancialMatrix(
                response.matrix,
                response.profitable_grades || []
            );
        }
        
        // Render population chart (Population Distribution) - FULL WIDTH
        if (response.distribution) {
            html += renderPopulationChart(response.distribution);
        }
        
        // Render warnings (Important Considerations) - FULL WIDTH
        if (response.warnings && response.warnings.length > 0) {
            html += renderWarnings(response.warnings);
        }
        
        html += '</div>';
        
        container.innerHTML = html;
    }
    
    /**
     * Render the verdict banner
     * @param {string} verdict - The verdict text
     * @param {string} status - Status: 'green', 'yellow', or 'red'
     * @returns {string} HTML string
     */
    function renderVerdictBanner(verdict, status) {
        const statusClass = status.toLowerCase();
        
        let icon = '📊';
        if (statusClass === 'green') icon = '✅';
        else if (statusClass === 'yellow') icon = '⚠️';
        else if (statusClass === 'red') icon = '❌';
        
        const subtexts = {
            green: 'Strong profit potential - Consider grading this card',
            yellow: 'Moderate risk - Proceed with caution',
            red: 'Low profit potential - Grading may not be worthwhile'
        };
        
        return `
            <div class="verdict-banner ${statusClass}">
                <div class="verdict-text">
                    <span>${icon}</span>
                    <span>${escapeHtml(verdict)}</span>
                </div>
                <div class="verdict-subtext">${subtexts[statusClass] || ''}</div>
            </div>
        `;
    }
    
    /**
     * Render the scenario analysis table
     * @param {Object} scenarios - Scenario data { optimistic, realistic, pessimistic }
     * @returns {string} HTML string
     */
    function renderScenarioAnalysis(scenarios) {
        const renderScenarioRow = (label, icon, data, className) => {
            if (!data) return '';
            
            // Backend sends profit_loss, not profit
            const profit = data.profit_loss !== undefined ? data.profit_loss : (data.profit || 0);
            const profitClass = profit >= 0 ? 'profit' : 'loss';
            const profitPrefix = profit >= 0 ? '+' : '';
            
            // Calculate ROI from probability if not provided
            const probability = data.probability || 0;
            const probabilityPercent = (probability * 100).toFixed(1);
            
            return `
                <div class="scenario-row ${className}">
                    <div class="scenario-label">
                        <span>${icon}</span>
                        <span>${label} (Grade ${data.grade})</span>
                    </div>
                    <div class="scenario-value ${profitClass}">
                        ${profitPrefix}${formatCurrency(profit)}
                        <span style="font-size: 0.8em; opacity: 0.8;"> (${probabilityPercent}% likely)</span>
                    </div>
                </div>
            `;
        };
        
        return `
            <div class="result-module">
                <div class="module-header">
                    <span class="icon">📈</span>
                    <h4>Scenario Analysis</h4>
                    <span class="info-tooltip" tabindex="0">?
                        <span class="tooltip-content">${TOOLTIP_CONTENT.scenarioAnalysis}</span>
                    </span>
                </div>
                <div class="scenario-table">
                    ${renderScenarioRow('Optimistic', '🌟', scenarios.optimistic, 'optimistic')}
                    ${renderScenarioRow('Realistic', '📊', scenarios.realistic, 'realistic')}
                    ${renderScenarioRow('Pessimistic', '⚡', scenarios.pessimistic, 'pessimistic')}
                </div>
            </div>
        `;
    }
    
    /**
     * Render financial summary module
     * @param {Object} summary - Financial summary data
     * @returns {string} HTML string
     */
    function renderFinancialSummary(summary) {
        // Show "PSA 10" (not "PSA 10+") since 10 is the highest grade
        const breakEvenBadge = summary.break_even_grade
            ? `<span style="background: var(--gradient-primary); color: white; padding: 0.25rem 0.75rem; border-radius: 12px; font-weight: 600;">PSA ${summary.break_even_grade}${summary.break_even_grade < 10 ? '+' : ''}</span>`
            : '<span style="color: var(--subtle-text-color);">N/A</span>';
        
        return `
            <div class="result-module">
                <div class="module-header">
                    <span class="icon">💰</span>
                    <h4>Financial Summary</h4>
                </div>
                <div style="display: grid; gap: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 10px;">
                        <span style="font-weight: 500; color: var(--text-color);">Total Investment</span>
                        <span style="font-weight: 700; font-size: 1.1rem; color: var(--text-color);">
                            ${formatCurrency(summary.total_investment)}
                        </span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 10px;">
                        <span style="font-weight: 500; color: var(--text-color); display: flex; align-items: center; gap: 0.5rem;">
                            Break-Even Grade
                            <span class="info-tooltip tooltip-right" tabindex="0">?
                                <span class="tooltip-content">${TOOLTIP_CONTENT.breakEvenGrade}</span>
                            </span>
                        </span>
                        ${breakEvenBadge}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 10px;">
                        <span style="font-weight: 500; color: var(--text-color);">Profitable Grades</span>
                        <span style="font-weight: 600; color: var(--profitable-green);">
                            ${summary.profitable_grade_count || 0} of 10
                        </span>
                    </div>
                    ${summary.expected_value ? `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: var(--profitable-bg); border-radius: 10px; border: 1px solid var(--profitable-green);">
                        <span style="font-weight: 500; color: var(--text-color);">Expected Value</span>
                        <span style="font-weight: 700; font-size: 1.1rem; color: var(--profitable-green);">
                            ${formatCurrency(summary.expected_value)}
                        </span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * Create Decision Summary Hero Card
     * Provides clear, actionable guidance on whether to grade a card
     * @param {Object} data - API response data with analysis results
     * @returns {string} HTML string
     */
    function createDecisionSummaryCard(data) {
        // Check for matrix data (actual API response structure)
        if (!data || !data.matrix) {
            console.log('[GRADING ADVISOR] Decision card: No matrix data found');
            return '';
        }
        
        // Get distribution data for probability calculations
        const distribution = data.distribution || {};
        const gradePercentages = distribution.grade_percentages || {};
        
        // Convert matrix object to array format for calculations
        const grades = Object.keys(data.matrix)
            .filter(g => !isNaN(parseInt(g, 10)))
            .map(gradeStr => {
                const gradeNum = parseInt(gradeStr, 10);
                const gradeData = data.matrix[gradeStr];
                return {
                    grade: gradeNum,
                    profit_loss: gradeData.profit_loss !== undefined ? gradeData.profit_loss : 0,
                    probability: gradePercentages[gradeStr] || 0,
                    is_profitable: gradeData.is_profitable || false
                };
            });
        
        if (grades.length === 0) {
            console.log('[GRADING ADVISOR] Decision card: No grades in matrix');
            return '';
        }
        
        // 1. Calculate expected value (weighted average profit)
        let expectedValue = 0;
        grades.forEach(g => {
            const profit = g.profit_loss;
            const probability = g.probability;
            expectedValue += (profit * probability / 100);
        });
        
        // 2. Calculate success probability (sum of probabilities for profitable grades)
        let successProb = 0;
        grades.forEach(g => {
            if (g.is_profitable || g.profit_loss > 0) {
                successProb += g.probability;
            }
        });
        
        // 3. Find break-even grade (lowest grade with profit >= 0)
        const sortedGrades = [...grades].sort((a, b) => a.grade - b.grade);
        let breakEvenGrade = null;
        for (const g of sortedGrades) {
            if (g.profit_loss >= 0) {
                breakEvenGrade = g.grade;
                break;
            }
        }
        
        // 4. Generate recommendation based on expected value
        let recommendation, recommendationIcon, recommendationClass, cardClass;
        if (expectedValue > 10) {
            recommendation = 'Recommended';
            recommendationIcon = '✅';
            recommendationClass = 'positive';
            cardClass = 'positive';
        } else if (expectedValue >= 0) {
            recommendation = 'Marginal';
            recommendationIcon = '⚠️';
            recommendationClass = 'warning';
            cardClass = 'warning';
        } else {
            recommendation = 'Not Recommended';
            recommendationIcon = '❌';
            recommendationClass = 'negative';
            cardClass = 'negative';
        }
        
        // 5. Format break-even display with "or Higher" format
        let breakEvenDisplay = 'N/A';
        if (breakEvenGrade) {
            if (breakEvenGrade === 10) {
                breakEvenDisplay = 'PSA 10';
            } else {
                breakEvenDisplay = `PSA ${breakEvenGrade} or Higher`;
            }
        } else {
            breakEvenDisplay = 'None (all unprofitable)';
        }
        
        // 6. Determine expected value class for styling
        const expectedValueClass = expectedValue >= 0 ? 'positive' : 'negative';
        const expectedValuePrefix = expectedValue >= 0 ? '+' : '';
        
        // 7. Build the HTML
        return `
            <div class="decision-summary-card ${cardClass}">
                <div class="summary-header">
                    <span class="recommendation ${recommendationClass}">
                        <span>${recommendationIcon}</span>
                        <span>${recommendation}</span>
                    </span>
                </div>
                <div class="summary-content">
                    <div class="expected-value ${expectedValueClass}">
                        <span class="label">Expected Value</span>
                        <span class="value">${expectedValuePrefix}${formatCurrency(expectedValue)}</span>
                    </div>
                    <div class="summary-stats">
                        <div class="stat break-even">
                            <span class="stat-label">Break-Even Grade</span>
                            <span class="stat-value">${breakEvenDisplay}</span>
                        </div>
                        <div class="stat pop-above">
                            <span class="stat-label">Population Above Break-Even Grade</span>
                            <span class="stat-value">${successProb.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render the financial matrix showing profit/loss for each grade
     * @param {Object} matrix - Grade matrix data { grade: { price, profit, roi } }
     * @param {number[]} profitableGrades - Array of profitable grade numbers
     * @returns {string} HTML string
     */
    function renderFinancialMatrix(matrix, profitableGrades) {
        const grades = Object.keys(matrix)
            .map(g => parseInt(g, 10))
            .sort((a, b) => b - a); // Sort descending (10 to 1)
        
        let cardsHtml = '';
        
        for (const grade of grades) {
            const data = matrix[grade.toString()];
            if (!data) continue;
            
            // Backend sends profit_loss and is_profitable, not profit
            const profit = data.profit_loss !== undefined ? data.profit_loss : (data.profit || 0);
            const roi = data.roi || 0;
            const isProfitable = data.is_profitable || profitableGrades.includes(grade.toString());
            const cardClass = isProfitable ? 'profitable' : 'unprofitable';
            const profitPrefix = profit >= 0 ? '+' : '';
            
            cardsHtml += `
                <div class="grade-card ${cardClass}">
                    <div class="grade-number">${grade}</div>
                    <div class="grade-profit">${profitPrefix}${formatCurrency(profit)}</div>
                    <div class="grade-roi">${formatPercentage(roi)}</div>
                </div>
            `;
        }
        
        return `
            <div class="result-module financial-matrix-module" style="width: 100%;">
                <div class="module-header">
                    <span class="icon">📋</span>
                    <h4>Profit/Loss by Grade</h4>
                    <span class="info-tooltip" tabindex="0">?
                        <span class="tooltip-content">${TOOLTIP_CONTENT.roiCalculation}</span>
                    </span>
                </div>
                <div class="financial-matrix-wrapper">
                    <div class="financial-matrix">
                        ${cardsHtml}
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Render the population distribution chart
     * @param {Object} distribution - Population data { grade: count }
     * @returns {string} HTML string
     */
    function renderPopulationChart(distribution) {
        // Backend sends PopulationDistribution object with grade_percentages
        const gradePercentages = distribution.grade_percentages || distribution;
        const totalPop = distribution.total_population || 0;
        const rarityTier = distribution.rarity_tier || 'Unknown';
        
        const grades = Object.keys(gradePercentages)
            .filter(g => !isNaN(parseInt(g, 10)))
            .map(g => parseInt(g, 10))
            .sort((a, b) => b - a); // Sort descending (10 to 1)
        
        const maxPct = Math.max(...Object.values(gradePercentages).filter(v => typeof v === 'number'), 1);
        
        let barsHtml = '';
        
        for (const grade of grades) {
            const pct = gradePercentages[grade.toString()] || 0;
            // Use absolute percentage for bar width (not normalized to max)
            // This shows the true distribution - if PSA 10 is 33.7%, bar is 33.7% filled
            const barWidth = pct;
            const isHighlight = grade >= 9; // Highlight PSA 9 and 10
            
            barsHtml += `
                <div class="pop-bar">
                    <span class="pop-label">${grade}</span>
                    <div class="pop-bar-container">
                        <div class="pop-bar-fill ${isHighlight ? 'highlight' : ''}"
                             style="width: ${barWidth}%;"
                             title="PSA ${grade}: ${pct.toFixed(1)}% of population">
                        </div>
                    </div>
                    <span class="pop-count">${pct.toFixed(1)}%</span>
                </div>
            `;
        }
        
        return `
            <div class="result-module" style="width: 100%;">
                <div class="module-header">
                    <span class="icon">📊</span>
                    <h4>Population Distribution</h4>
                    <span class="info-tooltip tooltip-right" tabindex="0">?
                        <span class="tooltip-content">${TOOLTIP_CONTENT.populationData}</span>
                    </span>
                </div>
                <div style="margin-bottom: 0.75rem; text-align: center;">
                    <span style="font-weight: 600; color: var(--text-color);">${totalPop.toLocaleString()}</span>
                    <span style="color: var(--subtle-text-color);"> total graded</span>
                    <span style="margin-left: 1rem; padding: 0.25rem 0.5rem; background: var(--card-background); border-radius: 8px; font-size: 0.85rem;">${rarityTier}</span>
                </div>
                <div class="population-chart" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    ${barsHtml}
                </div>
            </div>
        `;
    }
    
    /**
     * Render collector profile cards (flipper vs. collector perspectives)
     * @param {Object} profiles - Profile data { flipper, collector }
     * @returns {string} HTML string
     */
    function renderCollectorProfiles(profiles) {
        let html = '<div class="collector-profiles">';
        
        // Backend sends flipper_advice and long_term_advice
        const flipperAdvice = profiles.flipper_advice || profiles.flipper;
        const collectorAdvice = profiles.long_term_advice || profiles.collector;
        const recommendedStrategy = profiles.recommended_strategy || '';
        
        if (flipperAdvice) {
            html += `
                <div class="profile-card flipper">
                    <div class="profile-header">
                        <span class="profile-icon">🔄</span>
                        <h4 class="profile-title">For Flippers</h4>
                        ${recommendedStrategy === 'flip' ? '<span style="margin-left: auto; background: var(--profitable-bg); color: var(--profitable-green); padding: 0.2rem 0.5rem; border-radius: 8px; font-size: 0.75rem; font-weight: 600;">RECOMMENDED</span>' : ''}
                    </div>
                    <p class="profile-advice">${escapeHtml(flipperAdvice)}</p>
                </div>
            `;
        }
        
        if (collectorAdvice) {
            html += `
                <div class="profile-card collector">
                    <div class="profile-header">
                        <span class="profile-icon">💎</span>
                        <h4 class="profile-title">For Collectors</h4>
                        ${recommendedStrategy === 'hold' ? '<span style="margin-left: auto; background: var(--profitable-bg); color: var(--profitable-green); padding: 0.2rem 0.5rem; border-radius: 8px; font-size: 0.75rem; font-weight: 600;">RECOMMENDED</span>' : ''}
                    </div>
                    <p class="profile-advice">${escapeHtml(collectorAdvice)}</p>
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }
    
    /**
     * Render Kuya's personalized advice section
     * @param {string} adviceText - The advice text (may contain markdown)
     * @returns {string} HTML string
     */
    function renderKuyasAdvice(adviceText) {
        // Parse markdown formatting in the advice text
        const formattedAdvice = parseSimpleMarkdown(adviceText);
        
        return `
            <div class="kuyas-advice">
                <div class="advice-avatar">🧠</div>
                <div class="advice-content">
                    <h4>Kuya's Take</h4>
                    <p class="advice-text">${formattedAdvice}</p>
                </div>
            </div>
        `;
    }
    
    /**
     * Render warning messages
     * @param {string[]} warnings - Array of warning messages
     * @returns {string} HTML string
     */
    function renderWarnings(warnings) {
        if (!warnings || warnings.length === 0) return '';
        
        const items = warnings.map(warning => `
            <div class="warning-item">
                <span class="warning-icon">⚠️</span>
                <span>${escapeHtml(warning)}</span>
            </div>
        `).join('');
        
        return `
            <div class="result-module" style="width: 100%;">
                <div class="module-header">
                    <span class="icon">⚠️</span>
                    <h4>Important Considerations</h4>
                </div>
                <ul class="warning-list">
                    ${items}
                </ul>
            </div>
        `;
    }
    
    /**
     * Render the copy to clipboard button
     * @param {string} copyText - Text to copy when clicked
     * @returns {string} HTML string
     */
    function renderCopyButton(copyText) {
        return `
            <div style="margin-top: 1.5rem; display: flex; justify-content: center;">
                <button type="button" 
                        id="copy-results-btn" 
                        class="copy-results-btn"
                        data-copy-text="${escapeHtml(copyText)}">
                    <span class="copy-icon">📋</span>
                    <span class="copy-label">Copy Analysis Summary</span>
                </button>
            </div>
        `;
    }
    
    /**
     * Set up event listener for the copy button
     */
    function setupCopyButtonListener() {
        const copyBtn = document.getElementById('copy-results-btn');
        if (!copyBtn) return;
        
        copyBtn.addEventListener('click', async function() {
            const text = this.dataset.copyText;
            if (!text) return;
            
            const success = await copyToClipboard(text);
            
            if (success) {
                this.classList.add('copied');
                this.querySelector('.copy-label').textContent = 'Copied!';
                this.querySelector('.copy-icon').textContent = '✅';
                
                setTimeout(() => {
                    this.classList.remove('copied');
                    this.querySelector('.copy-label').textContent = 'Copy Analysis Summary';
                    this.querySelector('.copy-icon').textContent = '📋';
                }, 2000);
            }
        });
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    
    /**
     * Initialize the Grading Advisor module
     * Sets up event listeners and prepares the form
     */
    function init() {
        console.log('[GRADING ADVISOR] Initializing module');
        
        // Set up form submit handler
        const form = document.getElementById('grading-advisor-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
            console.log('[GRADING ADVISOR] Form submit handler attached');
        }
        
        // Set up reset button handler
        const resetBtn = document.getElementById('reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function(e) {
                e.preventDefault();
                resetForm();
            });
            console.log('[GRADING ADVISOR] Reset button handler attached');
        }
        
        // Set default grading fee
        const gradingFeeInput = document.getElementById('grading-fee');
        if (gradingFeeInput && !gradingFeeInput.value) {
            gradingFeeInput.value = DEFAULT_GRADING_FEE.toFixed(2);
        }
        
        // Set up info tooltip accessibility
        const tooltips = document.querySelectorAll('.info-tooltip');
        tooltips.forEach(tooltip => {
            tooltip.setAttribute('role', 'button');
            tooltip.setAttribute('aria-label', 'Show more information');
        });
        
        // Set up input validation on blur
        const numericInputs = document.querySelectorAll(
            '.grading-advisor-form input[type="number"], ' +
            '.grading-advisor-form input[type="text"][data-numeric="true"]'
        );
        
        numericInputs.forEach(input => {
            input.addEventListener('blur', function() {
                const value = parseFloat(this.value);
                if (this.value && (isNaN(value) || value < 0)) {
                    this.value = '';
                    this.style.borderColor = 'var(--unprofitable-red)';
                    setTimeout(() => {
                        this.style.borderColor = '';
                    }, 2000);
                }
            });
        });
        
        console.log('[GRADING ADVISOR] Module initialized successfully');
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    return {
        // Initialization
        init: init,
        
        // Form handling
        collectFormData: collectFormData,
        validateInputs: validateInputs,
        resetForm: resetForm,
        handleFormSubmit: handleFormSubmit,
        
        // API communication
        submitAnalysis: submitAnalysis,
        
        // Results rendering
        renderResults: renderResults,
        createDecisionSummaryCard: createDecisionSummaryCard,
        renderVerdictBanner: renderVerdictBanner,
        renderScenarioAnalysis: renderScenarioAnalysis,
        renderFinancialMatrix: renderFinancialMatrix,
        renderPopulationChart: renderPopulationChart,
        renderCollectorProfiles: renderCollectorProfiles,
        renderKuyasAdvice: renderKuyasAdvice,
        renderWarnings: renderWarnings,
        renderCopyButton: renderCopyButton,
        
        // Utilities
        formatCurrency: formatCurrency,
        formatPercentage: formatPercentage,
        showLoading: showLoading,
        hideLoading: hideLoading,
        showError: showError,
        copyToClipboard: copyToClipboard,
        
        // Access to current results
        getResults: function() { return currentResults; },
        isAnalyzing: function() { return isLoading; },
        
        // Educational content
        tooltips: TOOLTIP_CONTENT
    };
})();

// Expose GradingAdvisor globally
window.GradingAdvisor = GradingAdvisor;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if we're on a page with the grading advisor form
    if (document.getElementById('grading-advisor-form')) {
        GradingAdvisor.init();
    }
});
