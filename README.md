# eBay Baseball Card Comps Tool v0.5.1 (Production Beta)

A web application for scraping and analyzing eBay baseball card sold/active listings with FMV calculations and intelligent deal-finding.

## Features

*   **Dual Search Display**: Automatically shows both sold listings and active listings below FMV
*   **Advanced Filtering**: Raw Only, Base Only, Exclude Autographs, and Buy It Now Only filters
*   **Smart Deal Finding**: Active listings filtered to show only items priced at or below Fair Market Value
*   **Discount Indicators**: Red percentage showing how much below FMV each active listing is priced
*   **Market Analysis**: Fair Market Value calculations with Quick Sale/Patient Sale ranges
*   **Interactive Visualization**: Beeswarm chart showing price distribution
*   **PSA Grade Intelligence**: Compare prices across different PSA grades
*   **Password Protection**: Secure access with session management
*   **Clean UI**: Modern interface with responsive design
*   **Accessibility**: WCAG 2.1 Level A & AA compliant (skip-to-content, color contrast)
*   **Reusable Components**: Modal system with focus trapping and ARIA support
*   **Production Ready**: Environment-based configuration and deployment support

## Tech Stack

### Backend
*   **Framework**: Python with [FastAPI](https://fastapi.tiangolo.com/)
*   **Server**: uvicorn (development) / gunicorn (production)
*   **Data Source**: [SearchAPI.io](https://www.searchapi.io/) for eBay listings scraping
*   **Caching**: Redis with aioredis for aggressive API cost optimization
*   **Rate Limiting**: slowapi (10 requests/minute per IP)
*   **Monitoring**: Sentry (production), custom `/metrics` endpoint
*   **ML/Analytics**: scikit-learn, numpy, pandas for price analysis and FMV calculations

### Frontend
*   **UI**: Vanilla HTML, CSS, and JavaScript (static files)
*   **Styling**: External CSS with WCAG 2.1 AA compliant colors
*   **Visualization**: Interactive beeswarm charts for price distribution
*   **Security**: Password-protected with session management
*   **Accessibility**: Skip-to-content link, proper color contrast ratios
*   **Components**: Reusable Modal class with focus trapping, escape key handling, ARIA attributes

### Architecture
*   **Modular Backend**: Organized in [`/backend/`](backend/) directory with routes, services, models, middleware, config, and cache modules
*   **API Endpoints**:
    - `/comps` - Sold listings for market analysis
    - `/active` - Current active listings
    - `/fmv` - Fair market value calculations with quick/patient sale ranges
*   **Middleware Chain**: RequestID → Metrics → SecurityHeaders (execution in reverse order of definition)
*   **Static File Serving**: Frontend served from root path (must be mounted last in FastAPI)
*   **Caching Strategy**: Redis layer minimizes SearchAPI.io costs and improves response times

## Directory Structure

```
kuya-comps/
├── backend/           # All server-side logic
│   ├── routes/        # API endpoint handlers
│   ├── services/      # Business logic and external API integration
│   ├── models/        # Data models and schemas
│   ├── middleware/    # Request processing chain
│   ├── config/        # Configuration management
│   └── cache/         # Redis caching layer
├── static/            # Frontend UI files (served at root)
│   ├── index.html     # Main application (~545 lines)
│   ├── style.css      # Main stylesheet (extracted from index.html)
│   ├── css/           # Component stylesheets
│   │   └── shared-styles.css  # Shared styles (WCAG AA colors)
│   └── js/            # JavaScript modules
│       ├── modal.js   # Reusable modal component
│       ├── auth.js    # Authentication (uses Modal)
│       └── ...        # Other modules
├── docs/              # Documentation
│   ├── SECURITY.md
│   └── MODAL_COMPONENT_API.md  # Modal component documentation
├── tests/             # Test suite
├── main.py            # FastAPI application entry point
├── requirements.txt   # Python dependencies
├── Procfile           # Production deployment configuration
└── .gitleaks.toml     # Secret scanning configuration
```

## Setup and Running

### Local Development

1.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Set up Environment Variables:**
    ```bash
    cp .env.example .env
    # Edit .env and add your SearchAPI.io API key
    ```

3.  **Run the application:**
    ```bash
    uvicorn main:app --reload
    ```

4.  **Open your browser:**
    Navigate to [http://127.0.0.1:8000](http://127.0.0.1:8000) to use the application.

### Production Deployment (Railway)

1.  **Push to GitHub:**
    - Ensure `.env` is in `.gitignore` (already configured)
    - Push your code to a GitHub repository

2.  **Deploy on Railway:**
    - Connect your GitHub repository to Railway
    - Set environment variable: `SEARCH_API_KEY=your_searchapi_io_key`
    - Railway will automatically detect the Python app and deploy using the Procfile

3.  **Environment Variables Required:**
    - `SEARCH_API_KEY`: Your SearchAPI.io API key (required)
    - `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID`: eBay API credentials (recommended)
    - `ENVIRONMENT`: Set to `production`
    - `SENTRY_DSN`: Error monitoring (optional but recommended)
    - `REDIS_URL`: Automatically provided by Railway/Render for caching
    - `PORT`: Automatically set by hosting provider
    
    See `.env.example` for a complete list of configuration options.

## API

The application exposes three main API endpoints:

*   **`GET /comps`** - Search sold listings for market analysis
    - Returns historical sold data with price statistics
    - Supports filtering: raw only, base only, exclude autographs
    - Cached via Redis to minimize API costs

*   **`GET /active`** - Search active listings (current market)
    - Returns listings currently available on eBay
    - Filtered to show only items at or below Fair Market Value
    - Supports Buy It Now only filter
    - Includes discount percentage calculations

*   **`GET /fmv`** - Fair Market Value calculations
    - Advanced price analysis using ML models
    - Quick Sale vs Patient Sale ranges
    - Volume-weighted price calculations
    - PSA grade-specific analysis

*   **`GET /metrics`** - Monitoring endpoint
    - Custom metrics for observability
    - Request counts and performance data

All endpoints support comprehensive filtering and include rate limiting (10 requests/minute per IP).

## Security

🔒 **Important**: This project includes multiple layers of protection to prevent secrets from being committed to Git.

- **Automated Secret Scanning**: Pre-commit hook using [gitleaks](https://github.com/gitleaks/gitleaks) scans for API keys before every commit
- **Comprehensive `.gitignore`**: Excludes `.env` files, credentials, private keys, and other sensitive data
- **Custom Detection Rules**: Project-specific patterns in `.gitleaks.toml` detect eBay API, SearchAPI, and other keys
- **Environment Variables**: API keys are handled securely on the backend via environment variables
- **Password Protection**: Prevents unauthorized access to the application
- **Secure API Routing**: All API calls are routed through the backend, never exposing keys to the frontend

**📚 For detailed security guidelines**, see [`docs/SECURITY.md`](docs/SECURITY.md) for:
- Setting up your environment securely
- What to do if you accidentally commit a secret
- Testing the security setup
- Best practices for production deployments

## Performance & Cost Optimization

The application implements several strategies to manage API costs and maintain performance:

*   **Aggressive Caching**: Redis caching layer reduces SearchAPI.io requests (pay-per-request model)
*   **Rate Limiting**: 10 requests/minute per IP prevents abuse and manages API costs
*   **Smart FMV Calculations**: ML-powered analytics reduce need for redundant searches
*   **Auction Detection**: Intelligent parsing using "bid", "bids", or "auction" in buying format field
*   **Middleware Optimization**: Execution order matters—reverse of [`add_middleware()`](main.py) calls

## Important Technical Notes

*   **API Keys**: Always server-side only; frontend never touches credentials
*   **Scraping Method**: SearchAPI.io is the canonical source; eBay API only for FMV cross-validation
*   **Middleware Order**: Execution is reverse of definition order in code
*   **Redis Requirement**: Required for production efficiency and cost management
*   **Security Scanning**: gitleaks pre-commit hook scans for leaked secrets; `.env` never committed

## Version History

### Version 0.5.1 (UX Improvements) - Current

Version 0.5.1 focuses on accessibility compliance and frontend architecture improvements. This release brings WCAG 2.1 Level A & AA compliance through skip-to-content navigation and color contrast fixes, extracts CSS from inline styles to external stylesheets, and introduces a reusable Modal component for consistent modal behavior across the application.

**Accessibility & UX Improvements:**
- **WCAG 2.1 Level A Compliance**: Skip-to-content link as first focusable element (Success Criterion 2.4.1)
- **WCAG 2.1 Level AA Compliance**: All color contrast ratios meet 4.5:1 minimum
  - Primary blue: `#007aff` → `#0066cc` (4.02:1 → 5.58:1)
  - Accent green: `#34c759` → `#1d8348` (2.22:1 → 5.26:1)
  - Accent orange: `#ff9500` → `#b35900` (2.21:1 → 4.76:1)
  - Accent red: `#ff3b30` → `#c9302c` (3.55:1 → 5.01:1)
- **CSS Extraction**: ~1,856 lines of inline CSS extracted from `index.html` to `style.css`
  - Reduced index.html from ~2,400 lines to 545 lines
  - Improved maintainability and caching
- **Reusable Modal Component**: New [`static/js/modal.js`](static/js/modal.js) with Modal class
  - Focus trapping for keyboard navigation
  - Escape key to close
  - Click outside to close
  - ARIA attributes for screen readers
  - CSS animations support
  - Refactored auth.js and subscription.js to use Modal
  - API documentation: [`docs/MODAL_COMPONENT_API.md`](docs/MODAL_COMPONENT_API.md)

### Version 0.5.0 (Production Beta)

Version 0.5.0 marks the transition to production beta with significant improvements to code organization and maintainability. This release focuses on cleaning up the project structure by removing extraneous standalone scripts and consolidating all testing into a formal test suite. The streamlined codebase now contains only essential runtime files in the root directory, making the project easier to navigate, maintain, and deploy.

**Project Structure & Code Quality:**
- **Test Suite Consolidation**: All tests moved to formal test suite under [`tests/`](tests/) directory
  - Removed 5 standalone test scripts from root (test_feedback_endpoint.py, test_phase2_screenshot_optimization.py, test_phase3_admin_dashboard.py, test_phase4_simple.py, test_phase4_valuation_engine.py)
  - Professional test organization with clear separation from runtime code
- **Migration Cleanup**: Removed completed migration scripts from root directory
  - migrate_existing_card_values.py and migrate_supabase_price_history.py no longer needed
  - Cleaner root directory with only essential runtime files
- **Improved Maintainability**: Streamlined project structure makes onboarding and navigation easier
  - Clear separation between application code, tests, and documentation
  - Enhanced developer experience with organized file hierarchy

### Version 0.4.0

Version 0.4.0 represents a major evolution of the application with professional infrastructure and enhanced user experience. Behind the scenes, the backend has been completely restructured into organized modules, making it easier to maintain and add new features. We've added intelligent caching to dramatically speed up searches and reduce costs, implemented smart rate limiting to prevent abuse, and integrated machine learning tools for more accurate price predictions. The app now includes professional monitoring and error tracking for reliability. On the user-facing side, the interface has been redesigned with mobile devices in mind, featuring a powerful new "Analytics Dashboard" that provides market pressure analysis, liquidity profiles, absorption ratios, and personalized pricing recommendations tailored to your selling strategy. There's also an upgraded "Grading Intelligence" tool that lets you compare different grading companies and grades side-by-side, better organized tabs for different analysis types, and improved search tips to help you find exactly what you're looking for. The entire frontend code has been reorganized into specialized modules for better performance and future enhancements. Whether you're accessing the site from your phone, tablet, or computer, you'll notice faster load times, smoother interactions, and a more polished experience overall.

**Backend Infrastructure:**
- **Architecture Overhaul**: Complete modular restructure with organized [`/backend/`](backend/) directory
  - Separated concerns: routes, services, models, middleware, config, cache modules
  - Enhanced maintainability and scalability with clear separation of responsibilities
- **Redis Caching Layer**: Aggressive caching implementation to minimize SearchAPI.io costs
  - aioredis integration for async operations
  - Significantly improved response times and reduced API expenses
  - Required for production efficiency
- **Advanced Rate Limiting**: slowapi implementation (10 requests/minute per IP)
  - Prevents abuse and manages API costs
  - Per-IP tracking for fair usage across all endpoints
- **ML/Analytics Integration**: Professional-grade price analysis
  - scikit-learn, numpy, pandas integration for statistical modeling
  - Sophisticated FMV calculations with Quick Sale/Patient Sale ranges
  - Volume-weighted price analysis for accurate market valuation
- **Production Monitoring**: Sentry error tracking and custom metrics
  - [`/metrics`](main.py) endpoint for observability
  - Request counts and performance monitoring
  - Production-ready error reporting and alerting
- **Middleware Chain**: Professional request processing pipeline
  - RequestID → Metrics → SecurityHeaders (reverse execution order)
  - Comprehensive request tracking and security headers
  - Proper middleware ordering for optimal performance
- **FMV Endpoint**: Dedicated Fair Market Value calculations
  - PSA grade-specific analysis and comparison
  - Advanced statistical modeling for price predictions
  - Quick Sale vs Patient Sale market segmentation

**Frontend Enhancements:**
- **Modular JavaScript Architecture**: Organized code into specialized modules
  - [`config.js`](static/js/config.js) - Centralized configuration constants
  - [`errorHandler.js`](static/js/errorHandler.js) - Error handling and user feedback
  - [`validation.js`](static/js/validation.js) - Input validation logic
  - [`loadingStates.js`](static/js/loadingStates.js) - Loading state management
  - [`rendering.js`](static/js/rendering.js) - UI rendering functions
  - [`charts.js`](static/js/charts.js) - Beeswarm chart visualization
  - [`analysis.js`](static/js/analysis.js) - Market analysis features
- **Grading Intelligence Tab**: New dedicated interface for comparing graded cards
  - Compare up to 3 cards simultaneously with different graders (PSA, BGS, SGC) and grades
  - Card-specific search with grading parameter inputs
  - Side-by-side price comparison across different grades
- **Advanced Analytics Dashboard**: Comprehensive market analysis system
  - **Market Pressure Analysis**: Calculates median asking price vs FMV with confidence scoring
  - **Liquidity Profile**: Three-tier price band analysis (below/at/above FMV) with absorption ratios
  - **Absorption Ratios**: Shows how fast cards sell at different price points (sales vs listings)
  - **Pricing Recommendations**: AI-generated strategies for quick sale, fair market, and premium pricing
  - **Market Assessment**: Intelligent scenario detection with persona-based advice
  - **Persona-Based Guidance**: Tailored recommendations for sellers, flippers, and collectors
  - **Data Quality Scoring**: 0-100 confidence score with sample size warnings
  - **Velocity Statements**: Estimated sell times based on current market absorption
- **Sub-Tab Navigation**: Improved organization of analysis features
  - Comps sub-tab for sold listings and statistics
  - Analysis sub-tab for advanced market intelligence and analytics dashboard
- **Enhanced Search Tips**: Expandable collapsible search guidance
  - Beginner-friendly examples with visual formatting
  - Advanced eBay search operators (quotes, exclusions, card numbers)
  - Context-specific tips for both Comps and Intelligence tabs
- **Mobile-First Responsive Design**: Comprehensive responsive layouts
  - Optimized for phones (< 768px), tablets (769-1024px), and desktops (> 1024px)
  - Touch-friendly button sizes (48px minimum) and spacing
  - Landscape phone optimization
  - Customized grid layouts for different screen sizes
- **SEO Enhancements**: Professional search engine optimization
  - Structured data markup (Schema.org WebApplication)
  - Open Graph and Twitter Card meta tags
  - Semantic HTML with proper headings and alt text
  - FAQ section with rich content for search indexing
- **UI/UX Polish**: Modern interface refinements
  - Gradient backgrounds and smooth animations
  - Hover effects and transitions throughout
  - Consistent color system with CSS custom properties
  - Accessibility improvements (reduced motion support)
  - High DPI display optimizations

### Version 0.3.0
- **Major UI Redesign**: Replaced single "Find Deals" button with automatic dual-search display
- **New Active Listings Table**:
  - Automatically searches and displays active listings below Fair Market Value
  - Shows discount percentage in red (e.g., -25%, -50%)
  - Displays listing type (Auction or Buy It Now)
  - Sorted by price (lowest to highest)
  - Sticky table headers for easy navigation
- **Buy It Now Only Filter**: Checkbox to filter out auctions from active listings
- **Improved Auction Detection**: Enhanced logic to detect auctions using "bid", "bids", or "auction" in buying format
- **Expanded Year Support**: Validation now accepts years from 1800-2099 (vintage to modern cards)
- **Better Search Validation**: Improved handling of quoted search terms
- **Cleaner Labels**: Simplified table headers for better user experience
- **Backend Enhancement**: New [`/active`](backend/routes/) endpoint for active listing searches
- **Code Cleanup**: Removed ~320 lines of deprecated Find Deals code

### Version 0.2.1
- **Bug Fix**: Ensured "Find Deals" functionality correctly applies exclusion filters (Raw Only, Base Only, Exclude Autographs) to search queries.

### Version 0.2.0 (Previous)
- **Find Deals Functionality**: Added ability to search for current active listings below market value
- **New /deals API Endpoint**: Backend support for active listing searches vs. sold listings
- **Advanced Filtering System**:
  - "Base Only" filter excludes parallels, refractors, and special variants
  - "Exclude Autographs" filter removes auto/signed cards
  - Combined filtering support when multiple filters selected
- **Combined Search Workflow**: New "Find Deals" button that runs both comps + deals searches automatically
- **UI/UX Improvements**:
  - Larger, more prominent filter checkboxes
  - Separate deals results section preserving sold listings visibility
  - Deals sorted by largest discount percentage first
  - Removed technical "Volume-Weighted" references for better user understanding
- **Code Cleanup**:
  - Removed Test Mode functionality (always production)
  - Removed CSV export feature
  - Simplified Smart Market Insights in Grading Intelligence tab
  - Clean API parameter handling without test mode complexity

### Version 0.1.0 (Initial Release)
- Basic eBay sold listings scraping functionality
- Simple web UI for search queries
- Basic price statistics (min, max, average)
- CSV export capability
- Basic API endpoint for comps retrieval
- Support for SearchAPI.io integration

