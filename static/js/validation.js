/**
 * Client-Side Validation Module
 * Validates query length, pages, and provides real-time feedback
 */

/**
 * Validate search query
 * @param {string} query - Search query to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validateSearchQuery(query) {
    if (!query || typeof query !== 'string') {
        return false;
    }
    
    const trimmed = query.trim();
    
    if (trimmed.length < UI_CONSTANTS.MIN_QUERY_LENGTH) {
        return false;
    }
    
    if (trimmed.length > UI_CONSTANTS.MAX_QUERY_LENGTH) {
        showValidationError(`Search query is too long. Maximum ${UI_CONSTANTS.MAX_QUERY_LENGTH} characters allowed.`);
        return false;
    }
    
    return true;
}

/**
 * Validate page number
 * @param {number} pages - Number of pages to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validatePages(pages) {
    const pageNum = parseInt(pages, 10);
    
    if (isNaN(pageNum)) {
        showValidationError('Pages must be a number');
        return false;
    }
    
    if (pageNum < UI_CONSTANTS.MIN_PAGES) {
        showValidationError(`Pages must be at least ${UI_CONSTANTS.MIN_PAGES}`);
        return false;
    }
    
    if (pageNum > UI_CONSTANTS.MAX_PAGES) {
        showValidationError(`Pages cannot exceed ${UI_CONSTANTS.MAX_PAGES}`);
        return false;
    }
    
    return true;
}

/**
 * Validate intelligence search inputs
 * @param {string} query - Base search query
 * @param {Array} cardSelections - Array of card selections
 * @returns {Object} - {valid: boolean, error: string}
 */
function validateIntelligenceSearch(query, cardSelections) {
    // Validate query
    if (!validateSearchQuery(query)) {
        return {
            valid: false,
            error: 'Please enter a valid search query'
        };
    }
    
    // Validate card selections
    if (!cardSelections || cardSelections.length === 0) {
        return {
            valid: false,
            error: 'Please enter at least one complete card (both Grader and Grade)'
        };
    }
    
    // Validate each card selection
    for (const card of cardSelections) {
        if (!card.grader || !card.grade) {
            return {
                valid: false,
                error: `Card ${card.cardNumber}: Please enter both Grader and Grade, or leave both empty`
            };
        }
        
        // Validate grader length (reasonable limit)
        if (card.grader.length > 10) {
            return {
                valid: false,
                error: `Card ${card.cardNumber}: Grader name is too long`
            };
        }
        
        // Validate grade length (reasonable limit)
        if (card.grade.length > 10) {
            return {
                valid: false,
                error: `Card ${card.cardNumber}: Grade is too long`
            };
        }
    }
    
    return { valid: true, error: null };
}

/**
 * Setup real-time validation for an input element
 * @param {string} inputId - ID of input element
 * @param {Function} validator - Validation function
 * @param {Function} onValid - Callback when input is valid
 * @param {Function} onInvalid - Callback when input is invalid
 */
function setupRealTimeValidation(inputId, validator, onValid, onInvalid) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const validateInput = () => {
        const value = input.value;
        const isValid = validator(value);
        
        if (isValid) {
            input.style.borderColor = '';
            input.style.boxShadow = '';
            if (onValid) onValid();
        } else {
            input.style.borderColor = '#ff3b30';
            input.style.boxShadow = '0 0 0 3px rgba(255, 59, 48, 0.2)';
            if (onInvalid) onInvalid();
        }
        
        return isValid;
    };
    
    // Validate on input
    input.addEventListener('input', validateInput);
    
    // Validate on blur
    input.addEventListener('blur', validateInput);
    
    return validateInput;
}

/**
 * Validate and enable/disable submit button based on form validity
 * @param {string} buttonId - ID of submit button
 * @param {Function} validationCheck - Function that returns true if form is valid
 */
function setupSubmitButtonValidation(buttonId, validationCheck) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    const updateButton = () => {
        const isValid = validationCheck();
        button.disabled = !isValid;
        
        if (isValid) {
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        } else {
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
        }
    };
    
    return updateButton;
}

/**
 * Validate card comparison inputs
 * @param {number} cardNumber - Card number (1, 2, or 3)
 * @returns {Object} - {valid: boolean, grader: string, grade: string, error: string}
 */
function validateCardInput(cardNumber) {
    const graderInput = document.getElementById(`card${cardNumber}-grader`);
    const gradeInput = document.getElementById(`card${cardNumber}-grade`);
    
    if (!graderInput || !gradeInput) {
        return { valid: false, error: 'Input fields not found' };
    }
    
    const grader = graderInput.value.trim();
    const grade = gradeInput.value.trim();
    
    // Both empty is valid (optional card)
    if (!grader && !grade) {
        return { valid: true, grader: '', grade: '', error: null };
    }
    
    // One filled but not the other is invalid
    if (!grader || !grade) {
        return {
            valid: false,
            error: `Card ${cardNumber}: Please enter both Grader and Grade, or leave both empty`
        };
    }
    
    // Both filled is valid
    return { valid: true, grader, grade, error: null };
}

/**
 * Show validation feedback on an input
 * @param {string} inputId - ID of input element
 * @param {boolean} isValid - Whether input is valid
 * @param {string} message - Message to display (optional)
 */
function showInputValidation(inputId, isValid, message = '') {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    if (isValid) {
        input.style.borderColor = '#34c759';
        input.style.boxShadow = '0 0 0 3px rgba(52, 199, 89, 0.2)';
    } else {
        input.style.borderColor = '#ff3b30';
        input.style.boxShadow = '0 0 0 3px rgba(255, 59, 48, 0.2)';
    }
    
    // Remove previous validation message
    const existingMessage = input.nextElementSibling;
    if (existingMessage && existingMessage.classList.contains('validation-message')) {
        existingMessage.remove();
    }
    
    // Add new validation message if provided
    if (message) {
        const messageEl = document.createElement('div');
        messageEl.className = 'validation-message';
        messageEl.style.cssText = `
            font-size: 0.8rem;
            margin-top: 0.25rem;
            color: ${isValid ? '#34c759' : '#ff3b30'};
        `;
        messageEl.textContent = message;
        input.parentNode.insertBefore(messageEl, input.nextSibling);
    }
}

/**
 * Clear validation feedback on an input
 * @param {string} inputId - ID of input element
 */
function clearInputValidation(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    input.style.borderColor = '';
    input.style.boxShadow = '';
    
    // Remove validation message
    const existingMessage = input.nextElementSibling;
    if (existingMessage && existingMessage.classList.contains('validation-message')) {
        existingMessage.remove();
    }
}
