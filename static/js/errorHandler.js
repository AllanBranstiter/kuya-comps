/**
 * Frontend Error Handler Module
 * Centralized error display with user-friendly messages and different styles
 */

import { UI_CONSTANTS } from './config.js';

/**
 * Error types for different styling
 */
export const ErrorType = {
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
    SUCCESS: 'success'
};

/**
 * Get style configuration for error type
 */
function getErrorStyles(type) {
    const styles = {
        error: {
            background: '#ffebee',
            color: '#c62828',
            border: '#ef9a9a',
            icon: '❌'
        },
        warning: {
            background: '#fff5e6',
            color: '#e65100',
            border: '#ffd699',
            icon: '⚠️'
        },
        info: {
            background: '#e6f7ff',
            color: '#0056b3',
            border: '#99daff',
            icon: 'ℹ️'
        },
        success: {
            background: '#e6ffe6',
            color: '#2e7d32',
            border: '#99ff99',
            icon: '✅'
        }
    };
    
    return styles[type] || styles.error;
}

/**
 * Show error message to user
 * @param {string} message - Error message to display
 * @param {string} type - Error type (error, warning, info, success)
 * @param {number} duration - How long to show message (ms), 0 = permanent
 */
export function showError(message, type = ErrorType.ERROR, duration = UI_CONSTANTS.ERROR_MESSAGE_DURATION) {
    const styles = getErrorStyles(type);
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        background: ${styles.background};
        color: ${styles.color};
        padding: 1rem;
        margin: 1rem 0;
        border-radius: 8px;
        border: 1px solid ${styles.border};
        font-size: 0.9rem;
        text-align: center;
        animation: fadeIn 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    `;
    
    errorDiv.innerHTML = `
        <span style="font-size: 1.2rem;">${styles.icon}</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    // Remove any existing error messages
    clearErrors();
    
    // Insert error message before the results container
    const resultsContainer = document.getElementById('results');
    if (resultsContainer) {
        resultsContainer.parentNode.insertBefore(errorDiv, resultsContainer);
    } else {
        // Fallback: append to body
        document.body.appendChild(errorDiv);
    }
    
    // Auto-remove after duration if not permanent
    if (duration > 0) {
        setTimeout(() => {
            errorDiv.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => errorDiv.remove(), 300);
        }, duration);
    }
}

/**
 * Clear all error messages
 */
export function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.remove());
}

/**
 * Show loading error in a container
 * @param {string} containerId - ID of container to show error in
 * @param {string} message - Error message
 */
export function showContainerError(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const errorHtml = `
        <div class="error-container" style="
            text-align: center;
            padding: 2rem;
            background: linear-gradient(135deg, #ffebee 0%, #fff5f5 100%);
            border-radius: 12px;
            border: 1px solid #ff9999;
        ">
            <div class="error-icon" style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
            <div class="error-content">
                <h4 style="margin: 0 0 0.5rem 0; color: #c62828;">Error</h4>
                <p style="margin: 0; color: #666;">${escapeHtml(message)}</p>
            </div>
        </div>
    `;
    container.innerHTML = errorHtml;
}

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * User-friendly error messages
 * Maps technical errors to user-friendly messages
 */
export function getUserFriendlyMessage(error) {
    const errorString = String(error).toLowerCase();
    
    if (errorString.includes('network') || errorString.includes('fetch')) {
        return 'Network error. Please check your internet connection and try again.';
    }
    
    if (errorString.includes('timeout')) {
        return 'Request timed out. The server took too long to respond. Please try again.';
    }
    
    if (errorString.includes('404')) {
        return 'Resource not found. Please try a different search.';
    }
    
    if (errorString.includes('500') || errorString.includes('502') || errorString.includes('503')) {
        return 'Server error. Please try again in a few moments.';
    }
    
    if (errorString.includes('401') || errorString.includes('403')) {
        return 'Authentication error. Please refresh the page and try again.';
    }
    
    if (errorString.includes('429')) {
        return 'Too many requests. Please wait a moment before trying again.';
    }
    
    // Return original message if no specific mapping
    return String(error);
}

/**
 * Handle API errors consistently
 * @param {Error|string} error - Error object or message
 * @param {string} context - Context where error occurred (for logging)
 */
export function handleApiError(error, context = '') {
    console.error(`[API ERROR${context ? ' - ' + context : ''}]:`, error);
    
    const friendlyMessage = getUserFriendlyMessage(error);
    showError(friendlyMessage, ErrorType.ERROR);
}

/**
 * Show validation error
 * @param {string} message - Validation error message
 */
export function showValidationError(message) {
    showError(message, ErrorType.WARNING, UI_CONSTANTS.ERROR_MESSAGE_DURATION);
}

/**
 * Show success message
 * @param {string} message - Success message
 * @param {number} duration - How long to show message
 */
export function showSuccess(message, duration = 3000) {
    showError(message, ErrorType.SUCCESS, duration);
}

/**
 * Show info message
 * @param {string} message - Info message
 * @param {number} duration - How long to show message
 */
export function showInfo(message, duration = 5000) {
    showError(message, ErrorType.INFO, duration);
}
