# AI Context: kuya-comps

**Purpose**: eBay baseball card market analysis tool that scrapes sold/active listings and calculates Fair Market Value using volume-weighted statistics.

## Tech Stack
- Backend: FastAPI (Python)
- Frontend: Vanilla HTML/CSS/JavaScript in [`static/`](static)
- APIs: SearchAPI.io (sold listings), eBay Browse API (active listings)
- Data: NumPy, scikit-learn for statistical analysis

## Architecture

### Dual-API Strategy
- [`/comps`](main.py:484) endpoint → SearchAPI.io (eBay's official API doesn't support sold listings)
- [`/active`](main.py:711) endpoint → Official eBay Browse API
- [`scraper.py`](scraper.py) handles both sources

### Data Pipeline
1. Scrape → 2. Deduplicate by `item_id` → 3. Filter (price > 0, has item_id) → 4. Calculate FMV

### Volume-Weighted Pricing (Non-Obvious)
- Auction sales weighted higher than Buy-It-Now (more price discovery)
- 10+ bids: 2.5x weight multiplier
- 5-9 bids: 2.0x multiplier
- 2-4 bids: 1.75x multiplier
- Outliers removed via IQR method (requires 4+ items)

## Key Files
- [`main.py`](main.py:1) - FastAPI endpoints, FMV calculation, market intelligence
- [`scraper.py`](scraper.py) - API clients for both eBay sources
- [`ebay_browse_client.py`](ebay_browse_client.py) - Official eBay Browse API wrapper

## Critical Constraints
- `SEARCH_API_KEY` env var required (cost-sensitive)
- Rate limiting: `delay_secs` parameter (default 2.0s between requests)
- Max 10 pages per search (API quota management)
- Results cached to CSV ([`results_library_complete.csv`](results_library_complete.csv)) to avoid redundant API calls

## Non-Obvious Rules
- Items without `item_id` are always rejected
- Zero/negative prices filtered before FMV calculation
- Buying format detection: checks for "bid", "bids", "auction" in format string
- Filter application order matters: query modification happens before API call, post-processing filter happens after

## Security Rules
- **NEVER hardcode API keys** - All secrets (SEARCH_API_KEY, eBay credentials) must be stored in `.env` files
- `.env` files are gitignored - verify before commits to prevent credential leaks
- Use environment variables exclusively for sensitive data (see Critical Constraints section)
