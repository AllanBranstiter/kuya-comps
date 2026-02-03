# Kuya Comps - React Frontend

## Overview

React-based frontend for sports card valuation and collection management. This application helps baseball card collectors find fair market values, identify underpriced listings, and manage their personal collections.

## Tech Stack

- **React 18** with Vite for fast development and optimized builds
- **React Router v6** for client-side routing
- **Zustand** for lightweight state management
- **Supabase** for authentication and user data
- **Canvas-based charting** for price visualizations

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- FastAPI backend running on port 8000

### Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Visit http://localhost:5173/static/react/

The development server proxies API calls to the FastAPI backend automatically.

### Production Build

```bash
npm run build
```

Outputs to `../static/react/` for FastAPI serving.

### Testing

```bash
npm test        # Watch mode
npm run test:run  # Single run
```

Tests use Vitest with React Testing Library.

### Linting

```bash
npm run lint
```

## Project Structure

```
src/
├── components/
│   ├── ui/          # Reusable UI components (Button, Input, Modal, etc.)
│   ├── search/      # Search-related components
│   ├── collection/  # Collection management (binders, cards)
│   ├── charts/      # Canvas-based charts (beeswarm, volume profile)
│   ├── analysis/    # Market analysis dashboard
│   ├── auth/        # Authentication (AuthModal)
│   └── layout/      # Layout components (Header)
├── contexts/        # React contexts (AuthContext)
├── hooks/           # Custom hooks
├── pages/           # Page components (HomePage, CollectionPage, SettingsPage)
├── stores/          # Zustand stores (collectionStore)
├── styles/          # CSS files (index.css, components.css)
├── utils/           # Utility functions (searchUtils, chartUtils, supabase)
└── test/            # Test setup and utilities
```

## Features

- 🔍 **Card Search** - Search sold comps and active listings from eBay
- 📊 **Market Analysis** - Pressure indicators, confidence scores, liquidity profiles
- 📈 **Interactive Charts** - Beeswarm price distribution, volume profile visualization
- 📁 **Collection Management** - Organize cards in binders with full CRUD operations
- 🔐 **Authentication** - Supabase-powered auth with email/password and social logins
- 💰 **FMV Calculations** - Fair Market Value with quick sale/patient sale ranges
- 🎯 **Deal Finding** - Active listings filtered to show items below FMV

## Environment Variables

The following environment variables are required in the parent project's `.env`:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Supabase configuration is loaded in `src/utils/supabase.js`.

## API Integration

The frontend proxies to FastAPI backend on port 8000:

| Endpoint | Purpose |
|----------|---------|
| `/comps` | Sold listings search |
| `/active` | Active listings search |
| `/fmv` | Fair market value calculation |
| `/api/market-message` | Market assessment and recommendations |
| `/api/billing/usage` | User usage statistics |
| `/api/profile` | User profile management |

## Component Library

### Button

```jsx
import { Button } from '@components/ui';

<Button variant="primary" size="md" loading={false}>
  Click Me
</Button>
```

**Props:**
- `variant`: 'primary' | 'secondary' | 'danger' | 'ghost'
- `size`: 'sm' | 'md' | 'lg'
- `loading`: boolean - shows spinner when true
- `disabled`: boolean

### Input

```jsx
import { Input } from '@components/ui';

<Input
  type="email"
  label="Email"
  error="Invalid email"
  iconLeft={<SearchIcon />}
/>
```

### Modal

```jsx
import { Modal } from '@components/ui';

<Modal isOpen={isOpen} onClose={handleClose} title="Title" size="md">
  Content here
</Modal>
```

### LoadingSpinner

```jsx
import { LoadingSpinner } from '@components/ui';

<LoadingSpinner size="lg" text="Loading..." />
```

### ErrorBoundary

```jsx
import { ErrorBoundary } from '@components/ui';

<ErrorBoundary fallback={ErrorFallback}>
  <ComponentThatMightError />
</ErrorBoundary>
```

### Skeleton

```jsx
import { Skeleton, CardSkeleton, TableSkeleton } from '@components/ui';

<CardSkeleton count={3} />
<TableSkeleton rows={5} columns={4} />
```

## State Management

### Auth Context

```jsx
import { useAuth } from '@contexts/AuthContext';

function MyComponent() {
  const { isAuthenticated, user, signIn, signUp, signOut } = useAuth();
}
```

### Collection Store (Zustand)

```jsx
import { useCollectionStore } from '@stores/collectionStore';

function MyComponent() {
  const { binders, cards, fetchBinders, createBinder, addCard } = useCollectionStore();
}
```

## Bundle Optimization

The build uses code splitting for optimal loading:

- **react-vendor**: React, React DOM, React Router
- **supabase**: Supabase client
- **zustand**: State management

Route-level lazy loading ensures pages are loaded on demand:

```jsx
const HomePage = lazy(() => import('./pages/HomePage'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
```

## Testing

Tests are written with Vitest and React Testing Library:

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run
```

Example test:

```jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Button from '../Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
});
```

## Development Notes

### Path Aliases

The project uses path aliases for cleaner imports:

```js
import { Button } from '@components/ui';
import { useAuth } from '@contexts/AuthContext';
import { formatMoney } from '@utils/searchUtils';
```

Aliases configured in `vite.config.js`:
- `@` → `./src`
- `@components` → `./src/components`
- `@pages` → `./src/pages`
- `@contexts` → `./src/contexts`
- `@hooks` → `./src/hooks`
- `@utils` → `./src/utils`
- `@styles` → `./src/styles`

### CSS Variables

Design tokens are defined in `src/styles/index.css`:

```css
--primary-blue: #0066cc;
--accent-green: #1d8348;
--accent-purple: #5856d6;
--background-color: #f8fafd;
--text-color: #1d1d1f;
```

## Troubleshooting

### API calls failing

Ensure FastAPI backend is running on port 8000:

```bash
uvicorn main:app --reload
```

### Authentication not working

Verify Supabase credentials in `src/utils/supabase.js` match the parent project's `.env`.

### Build output missing

Run build from the `frontend` directory:

```bash
cd frontend && npm run build
```

Output goes to `../static/react/`.

### Tests failing with DOM errors

Ensure `@testing-library/jest-dom` is imported in `src/test/setup.js`.

## License

MIT
