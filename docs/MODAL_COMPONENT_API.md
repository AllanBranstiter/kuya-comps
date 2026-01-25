# Modal Component API Documentation

> **Version:** 1.0.0  
> **Created:** January 24, 2026  
> **Location:** [`static/js/modal.js`](../static/js/modal.js)

## Overview

The Modal component provides a unified, reusable modal system for the Kuya Comps application. It replaces the previously scattered modal implementations in `auth.js` and `subscription.js` with a consistent, accessible, and feature-rich solution.

## Features

- **Overlay management** with semi-transparent backdrop
- **CSS animations** for open/close transitions
- **Focus trapping** using `focusTrap.js` for accessibility
- **Keyboard support** (Escape key to close)
- **Click-outside-to-close** functionality
- **Full ARIA attributes** for screen reader support
- **Callback hooks** for open/close events
- **Multiple size options** (small, medium, large)
- **Static registry** for managing multiple modal instances

---

## Installation

The modal component is loaded via a script tag in `index.html`:

```html
<script src="js/focusTrap.js"></script>
<script src="js/modal.js"></script>
```

**Note:** `focusTrap.js` must be loaded before `modal.js` for focus trapping to work.

---

## Basic Usage

### Creating a Simple Modal

```javascript
const myModal = new Modal({
    id: 'my-modal',
    title: 'Hello World',
    content: '<p>This is my modal content!</p>',
    size: 'medium'
});

// Open the modal
myModal.open();

// Close the modal
myModal.close();
```

### Using Factory Function

```javascript
const myModal = createModal({
    id: 'quick-modal',
    title: 'Quick Modal',
    content: 'Hello!'
});

myModal.open();
```

---

## Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | `string` | **required** | Unique identifier for the modal |
| `title` | `string` | `'Modal'` | Modal title displayed in header |
| `content` | `string\|HTMLElement` | `''` | Modal body content (HTML string or DOM element) |
| `size` | `string` | `'medium'` | Modal size: `'small'`, `'medium'`, or `'large'` |
| `closeOnOverlayClick` | `boolean` | `true` | Close modal when clicking the overlay |
| `closeOnEscape` | `boolean` | `true` | Close modal when pressing Escape key |
| `showCloseButton` | `boolean` | `true` | Show the X close button in header |
| `customClass` | `string` | `''` | Additional CSS class for the modal container |
| `onOpen` | `Function` | `null` | Callback fired when modal opens |
| `onClose` | `Function` | `null` | Callback fired when modal closes |
| `onBeforeClose` | `Function` | `null` | Callback before close; return `false` to prevent |

### Size Reference

| Size | Max Width |
|------|-----------|
| `small` | 400px |
| `medium` | 500px |
| `large` | 700px |

---

## Instance Methods

### `open()`

Opens the modal with animations.

```javascript
modal.open();
```

**Returns:** `Modal` instance for chaining

### `close()`

Closes the modal with animations.

```javascript
modal.close();
```

**Returns:** `Modal` instance for chaining

### `toggle()`

Toggles the modal open/closed state.

```javascript
modal.toggle();
```

**Returns:** `Modal` instance for chaining

### `setContent(content)`

Updates the modal body content.

```javascript
modal.setContent('<p>New content!</p>');
// or
modal.setContent(document.createElement('div'));
```

**Parameters:**
- `content` (`string|HTMLElement`) - New content to display

**Returns:** `Modal` instance for chaining

### `setTitle(title)`

Updates the modal title.

```javascript
modal.setTitle('New Title');
```

**Parameters:**
- `title` (`string`) - New title text

**Returns:** `Modal` instance for chaining

### `getContentElement()`

Returns the modal content wrapper element.

```javascript
const content = modal.getContentElement();
content.querySelector('#my-form').reset();
```

**Returns:** `HTMLElement|null`

### `getContainerElement()`

Returns the modal container element.

```javascript
const container = modal.getContainerElement();
```

**Returns:** `HTMLElement`

### `getOverlayElement()`

Returns the modal overlay element.

```javascript
const overlay = modal.getOverlayElement();
```

**Returns:** `HTMLElement`

### `destroy()`

Removes the modal from DOM and registry.

```javascript
modal.destroy();
```

---

## Static Methods

### `Modal.getInstance(id)`

Retrieves a modal instance by ID.

```javascript
const authModal = Modal.getInstance('auth-modal');
if (authModal) {
    authModal.open();
}
```

**Parameters:**
- `id` (`string`) - Modal ID

**Returns:** `Modal|undefined`

### `Modal.closeAll()`

Closes all open modals.

```javascript
Modal.closeAll();
```

---

## Helper Functions

### `showAlertModal(title, message, options)`

Shows a simple alert-style modal with one button.

```javascript
showAlertModal('Success!', 'Your changes have been saved.', {
    icon: '✅',
    buttonText: 'OK',
    size: 'small',
    onClose: () => console.log('Alert closed')
});
```

**Parameters:**
- `title` (`string`) - Modal title
- `message` (`string`) - Message to display
- `options` (`Object`) - Additional options
  - `id` (`string`) - Modal ID (auto-generated if not provided)
  - `icon` (`string`) - Emoji icon to display
  - `buttonText` (`string`) - Button text (default: 'OK')
  - `size` (`string`) - Modal size
  - `onClose` (`Function`) - Close callback

**Returns:** `Modal` instance (already opened)

### `showConfirmModal(title, message, options)`

Shows a confirmation modal with confirm/cancel buttons.

```javascript
const confirmed = await showConfirmModal(
    'Delete Card?',
    'This action cannot be undone.',
    {
        icon: '⚠️',
        confirmText: 'Delete',
        cancelText: 'Keep',
        size: 'small'
    }
);

if (confirmed) {
    // User clicked confirm
}
```

**Parameters:**
- `title` (`string`) - Modal title
- `message` (`string`) - Message to display
- `options` (`Object`) - Additional options
  - `id` (`string`) - Modal ID (auto-generated if not provided)
  - `icon` (`string`) - Emoji icon to display
  - `confirmText` (`string`) - Confirm button text (default: 'Confirm')
  - `cancelText` (`string`) - Cancel button text (default: 'Cancel')
  - `size` (`string`) - Modal size
  - `closeOnEscape` (`boolean`) - Allow Escape to cancel
  - `closeOnOverlayClick` (`boolean`) - Allow overlay click to cancel
  - `onClose` (`Function`) - Close callback

**Returns:** `Promise<boolean>` - Resolves to `true` if confirmed, `false` if cancelled

---

## CSS Classes

The modal component uses these CSS classes (defined in `style.css`):

### Container Classes

| Class | Description |
|-------|-------------|
| `.modal-overlay` | Backdrop overlay |
| `.modal-overlay.active` | Visible state with animation |
| `.modal-container` | Modal box |
| `.modal-container.active` | Visible state with animation |
| `.modal-size-small` | Small size variant |
| `.modal-size-medium` | Medium size variant |
| `.modal-size-large` | Large size variant |

### Element Classes

| Class | Description |
|-------|-------------|
| `.modal-header` | Header container |
| `.modal-title` | Title text |
| `.modal-close-btn` | Close button |
| `.modal-content` | Body content wrapper |

### Button Classes

| Class | Description |
|-------|-------------|
| `.modal-btn` | Base button style |
| `.modal-btn-primary` | Primary action button (blue) |
| `.modal-btn-secondary` | Secondary action button (outline) |
| `.modal-btn-danger` | Danger action button (red) |
| `.modal-btn-success` | Success action button (green) |

### Form Classes

| Class | Description |
|-------|-------------|
| `.modal-form-group` | Form field wrapper |
| `.modal-tabs` | Tab navigation container |
| `.modal-tab` | Individual tab button |
| `.modal-tab.active` | Active tab state |

### Message Classes

| Class | Description |
|-------|-------------|
| `.modal-message` | Base message style |
| `.modal-message-error` | Error message (red) |
| `.modal-message-success` | Success message (green) |
| `.modal-message-warning` | Warning message (orange) |
| `.modal-message-info` | Info message (blue) |

### Pricing Classes (for subscription modals)

| Class | Description |
|-------|-------------|
| `.modal-pricing-grid` | Grid container for pricing cards |
| `.modal-pricing-card` | Individual pricing card |
| `.modal-pricing-card.featured` | Featured tier (blue border) |
| `.modal-pricing-card.founder` | Founder tier (purple border) |
| `.modal-pricing-title` | Pricing tier title |
| `.modal-pricing-price` | Price display |
| `.modal-pricing-features` | Features list |

---

## Accessibility Features

The Modal component implements these accessibility features:

1. **ARIA Attributes**
   - `role="dialog"` on container
   - `aria-modal="true"` for modal behavior
   - `aria-labelledby` pointing to title
   - `aria-hidden` on overlay when closed

2. **Focus Management**
   - Saves previously focused element
   - Traps focus within modal when open
   - Restores focus on close

3. **Keyboard Navigation**
   - Escape key closes modal
   - Tab key cycles through focusable elements
   - Shift+Tab cycles backwards

4. **Screen Reader Support**
   - Live region announcements for open/close
   - Proper heading structure

---

## Examples

### Auth Modal (as used in auth.js)

```javascript
const authModal = new Modal({
    id: 'auth-modal',
    title: 'Welcome Back',
    content: document.querySelector('.auth-modal-body').cloneNode(true),
    size: 'medium',
    closeOnOverlayClick: true,
    closeOnEscape: true,
    onOpen: (modal) => {
        // Reset to login tab
        switchAuthTab('login');
    },
    onClose: (modal) => {
        // Clear forms
        clearAuthForms();
    }
});
```

### Subscription Upgrade Modal (as used in subscription.js)

```javascript
const upgradeModal = new Modal({
    id: 'subscription-limit-modal',
    title: 'Daily Search Limit Reached',
    content: pricingContent,
    size: 'medium',
    showCloseButton: true,
    closeOnOverlayClick: true
});

upgradeModal.open();
```

### Confirmation Before Delete

```javascript
async function deleteCard(cardId) {
    const confirmed = await showConfirmModal(
        'Delete Card?',
        'This will permanently remove the card from your collection.',
        {
            icon: '🗑️',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        }
    );
    
    if (confirmed) {
        await api.deleteCard(cardId);
        refreshCardList();
    }
}
```

### Custom Styled Modal

```javascript
const customModal = new Modal({
    id: 'custom-modal',
    title: 'Custom Style',
    content: '<p>Custom content here</p>',
    customClass: 'my-special-modal',
    size: 'large',
    onBeforeClose: (modal) => {
        // Prevent close if form has unsaved changes
        if (hasUnsavedChanges()) {
            return false;
        }
        return true;
    }
});
```

---

## Migration Guide

### From Inline Modal (subscription.js style)

**Before:**
```javascript
const overlay = document.createElement('div');
overlay.id = 'my-modal';
overlay.style.cssText = `position: fixed; ...`;
overlay.innerHTML = `<div>...</div>`;
document.body.appendChild(overlay);

overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
});
```

**After:**
```javascript
const modal = new Modal({
    id: 'my-modal',
    title: 'My Modal',
    content: '...',
    closeOnOverlayClick: true
});
modal.open();
```

### From Auth Modal Style

**Before:**
```javascript
function showAuthModal() {
    const overlay = document.getElementById('auth-modal-overlay');
    overlay.style.display = 'flex';
    FocusTrap.activate(document.querySelector('.auth-modal'));
}

function hideAuthModal() {
    FocusTrap.deactivate();
    overlay.style.display = 'none';
}
```

**After:**
```javascript
const authModal = new Modal({
    id: 'auth-modal',
    title: 'Sign In',
    content: existingContent
});

function showAuthModal() {
    authModal.open(); // Focus trap handled automatically
}

function hideAuthModal() {
    authModal.close(); // Focus restored automatically
}
```

---

## Troubleshooting

### Modal doesn't appear

1. Check console for errors
2. Verify `modal.js` is loaded after `focusTrap.js`
3. Ensure modal ID is unique

### Focus trap not working

1. Verify `focusTrap.js` is loaded
2. Check that modal content has focusable elements

### Animations not smooth

1. Check for CSS conflicts
2. Verify `.modal-overlay.active` and `.modal-container.active` classes exist in CSS

### Modal content not updating

1. Use `modal.setContent()` method
2. Or get element via `modal.getContentElement()` and modify directly

---

## Related Files

- [`static/js/modal.js`](../static/js/modal.js) - Modal component implementation
- [`static/js/focusTrap.js`](../static/js/focusTrap.js) - Focus trap utility
- [`static/style.css`](../static/style.css) - Modal CSS styles (search for "REUSABLE MODAL")
- [`static/js/auth.js`](../static/js/auth.js) - Auth modal integration
- [`static/js/subscription.js`](../static/js/subscription.js) - Subscription modal integration
