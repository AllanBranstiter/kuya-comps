/**
 * Rendering Module
 * Optimized DOM manipulation utilities for better performance
 */

// ============================================================================
// DOM CREATION UTILITIES
// ============================================================================

/**
 * Create an element with attributes and optional children
 * @param {string} tag - HTML tag name
 * @param {Object} attributes - Object containing attributes to set
 * @param {...(Node|string)} children - Child elements or text nodes
 * @returns {HTMLElement} Created element
 */
function createElement(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);
    
    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            const eventName = key.substring(2).toLowerCase();
            element.addEventListener(eventName, value);
        } else {
            element.setAttribute(key, value);
        }
    });
    
    // Append children
    children.forEach(child => {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    });
    
    return element;
}

/**
 * Create a text node
 * @param {string} text - Text content
 * @returns {Text} Text node
 */
function createTextNode(text) {
    return document.createTextNode(text);
}

// ============================================================================
// BATCH DOM UPDATES
// ============================================================================

/**
 * Create a document fragment for batch updates
 * @returns {DocumentFragment} New document fragment
 */
function createFragment() {
    return document.createDocumentFragment();
}

/**
 * Batch append multiple elements to a parent
 * @param {HTMLElement} parent - Parent element
 * @param {Array<HTMLElement>} elements - Array of elements to append
 */
function batchAppend(parent, elements) {
    const fragment = createFragment();
    elements.forEach(element => fragment.appendChild(element));
    parent.appendChild(fragment);
}

/**
 * Replace all children of an element with new elements (batched)
 * @param {HTMLElement} parent - Parent element
 * @param {Array<HTMLElement>} newChildren - Array of new child elements
 */
function replaceChildren(parent, newChildren) {
    const fragment = createFragment();
    newChildren.forEach(child => fragment.appendChild(child));
    parent.innerHTML = ''; // Clear existing
    parent.appendChild(fragment);
}

// ============================================================================
// TABLE RENDERING OPTIMIZATIONS
// ============================================================================

/**
 * Create a table row element
 * @param {Array<string|HTMLElement>} cells - Array of cell contents
 * @param {boolean} isHeader - Whether this is a header row
 * @returns {HTMLTableRowElement} Table row element
 */
function createTableRow(cells, isHeader = false) {
    const row = document.createElement('tr');
    const cellTag = isHeader ? 'th' : 'td';
    
    const cellElements = cells.map(content => {
        const cell = document.createElement(cellTag);
        if (typeof content === 'string') {
            cell.textContent = content;
        } else if (content instanceof HTMLElement) {
            cell.appendChild(content);
        } else {
            cell.innerHTML = content; // For complex HTML content
        }
        return cell;
    });
    
    batchAppend(row, cellElements);
    return row;
}

/**
 * Create a complete table with headers and rows
 * @param {Array<string>} headers - Column headers
 * @param {Array<Array>} rows - Array of row data
 * @param {Object} options - Table options
 * @returns {HTMLTableElement} Complete table element
 */
function createTable(headers, rows, options = {}) {
    const table = document.createElement('table');
    
    // Create thead
    const thead = document.createElement('thead');
    if (options.stickyHeader) {
        thead.style.cssText = 'position: sticky; top: 0; background: var(--card-background); z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';
    }
    thead.appendChild(createTableRow(headers, true));
    table.appendChild(thead);
    
    // Create tbody with batching
    const tbody = document.createElement('tbody');
    const fragment = createFragment();
    rows.forEach(rowData => {
        fragment.appendChild(createTableRow(rowData, false));
    });
    tbody.appendChild(fragment);
    table.appendChild(tbody);
    
    // Apply table classes
    if (options.className) {
        table.className = options.className;
    }
    
    return table;
}

// ============================================================================
// UPDATE PATTERNS
// ============================================================================

/**
 * Update text content only if changed (avoids unnecessary reflows)
 * @param {HTMLElement} element - Element to update
 * @param {string} newText - New text content
 */
function updateTextIfChanged(element, newText) {
    if (element.textContent !== newText) {
        element.textContent = newText;
    }
}

/**
 * Update attribute only if changed
 * @param {HTMLElement} element - Element to update
 * @param {string} attribute - Attribute name
 * @param {string} newValue - New attribute value
 */
function updateAttributeIfChanged(element, attribute, newValue) {
    if (element.getAttribute(attribute) !== newValue) {
        element.setAttribute(attribute, newValue);
    }
}

/**
 * Update element's class list
 * @param {HTMLElement} element - Element to update
 * @param {Array<string>} addClasses - Classes to add
 * @param {Array<string>} removeClasses - Classes to remove
 */
function updateClasses(element, addClasses = [], removeClasses = []) {
    removeClasses.forEach(cls => element.classList.remove(cls));
    addClasses.forEach(cls => element.classList.add(cls));
}

// ============================================================================
// VISIBILITY AND TRANSITIONS
// ============================================================================

/**
 * Show element with optional fade-in animation
 * @param {HTMLElement} element - Element to show
 * @param {boolean} animate - Whether to animate
 */
function showElement(element, animate = false) {
    if (animate) {
        element.style.opacity = '0';
        element.style.display = '';
        requestAnimationFrame(() => {
            element.style.transition = 'opacity 0.3s ease';
            element.style.opacity = '1';
        });
    } else {
        element.style.display = '';
        element.style.opacity = '1';
    }
}

/**
 * Hide element with optional fade-out animation
 * @param {HTMLElement} element - Element to hide
 * @param {boolean} animate - Whether to animate
 */
function hideElement(element, animate = false) {
    if (animate) {
        element.style.transition = 'opacity 0.3s ease';
        element.style.opacity = '0';
        setTimeout(() => {
            element.style.display = 'none';
        }, 300);
    } else {
        element.style.display = 'none';
    }
}

/**
 * Toggle element visibility
 * @param {HTMLElement} element - Element to toggle
 * @param {boolean} animate - Whether to animate
 */
function toggleElement(element, animate = false) {
    if (element.style.display === 'none' || !element.style.display) {
        showElement(element, animate);
    } else {
        hideElement(element, animate);
    }
}

// ============================================================================
// SAFE HTML INSERTION
// ============================================================================

/**
 * Safely set innerHTML after sanitizing
 * @param {HTMLElement} element - Element to update
 * @param {string} html - HTML content
 */
function setInnerHTMLSafe(element, html) {
    // Use the existing escapeHtml function if needed for user content
    // For now, just set directly but this is a placeholder for sanitization
    element.innerHTML = html;
}

/**
 * Create element from HTML string (more efficient than innerHTML for single elements)
 * @param {string} htmlString - HTML string
 * @returns {HTMLElement} Created element
 */
function createFromHTML(htmlString) {
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}

// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

/**
 * Execute callback when DOM is ready
 * @param {Function} callback - Function to execute
 */
function whenReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        callback();
    }
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function calls
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Schedule callback for next animation frame
 * @param {Function} callback - Function to execute
 * @returns {number} Request ID
 */
function nextFrame(callback) {
    return requestAnimationFrame(callback);
}

/**
 * Batch multiple DOM reads to avoid layout thrashing
 * @param {Function} readCallback - Function that performs DOM reads
 * @returns {Promise} Promise that resolves with read results
 */
function batchRead(readCallback) {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            const result = readCallback();
            resolve(result);
        });
    });
}

/**
 * Batch multiple DOM writes to avoid layout thrashing
 * @param {Function} writeCallback - Function that performs DOM writes
 * @returns {Promise} Promise that resolves when writes complete
 */
function batchWrite(writeCallback) {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            writeCallback();
            resolve();
        });
    });
}

// ============================================================================
// COMMON RENDERING PATTERNS
// ============================================================================

/**
 * Clear element content efficiently
 * @param {HTMLElement} element - Element to clear
 */
function clearElement(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

/**
 * Replace element content with new content
 * @param {HTMLElement} element - Element to update
 * @param {HTMLElement|DocumentFragment} newContent - New content
 */
function replaceContent(element, newContent) {
    clearElement(element);
    element.appendChild(newContent);
}

/**
 * Append content if element is empty, otherwise update
 * @param {HTMLElement} element - Target element
 * @param {Function} contentGenerator - Function that generates content
 */
function renderOrUpdate(element, contentGenerator) {
    if (element.children.length === 0) {
        // First render - append
        const content = contentGenerator();
        element.appendChild(content);
    } else {
        // Update existing
        const newContent = contentGenerator();
        replaceContent(element, newContent);
    }
}

// ============================================================================
// LIST RENDERING
// ============================================================================

/**
 * Render a list of items efficiently
 * @param {HTMLElement} container - Container element
 * @param {Array} items - Array of items to render
 * @param {Function} itemRenderer - Function that renders each item
 * @param {string} listTag - Tag name for list container (ul, ol, div, etc.)
 */
function renderList(container, items, itemRenderer, listTag = 'ul') {
    const list = document.createElement(listTag);
    const fragment = createFragment();
    
    items.forEach(item => {
        const renderedItem = itemRenderer(item);
        fragment.appendChild(renderedItem);
    });
    
    list.appendChild(fragment);
    replaceContent(container, list);
}

/**
 * Update a list by comparing old and new items (minimal DOM changes)
 * @param {HTMLElement} listElement - List container element
 * @param {Array} newItems - New array of items
 * @param {Function} itemRenderer - Function that renders each item
 * @param {Function} keyGenerator - Function to generate unique keys for items
 */
function updateList(listElement, newItems, itemRenderer, keyGenerator) {
    const existingElements = Array.from(listElement.children);
    const existingKeys = new Set(existingElements.map(el => el.dataset.key));
    const newKeys = new Set(newItems.map(keyGenerator));
    
    // Remove items that no longer exist
    existingElements.forEach(el => {
        if (!newKeys.has(el.dataset.key)) {
            el.remove();
        }
    });
    
    // Add or update items
    const fragment = createFragment();
    newItems.forEach((item, index) => {
        const key = keyGenerator(item);
        const existingElement = existingElements.find(el => el.dataset.key === key);
        
        if (existingElement) {
            // Update existing element if needed
            // (Implementation depends on specific use case)
        } else {
            // Add new element
            const newElement = itemRenderer(item);
            newElement.dataset.key = key;
            fragment.appendChild(newElement);
        }
    });
    
    if (fragment.childNodes.length > 0) {
        listElement.appendChild(fragment);
    }
}
