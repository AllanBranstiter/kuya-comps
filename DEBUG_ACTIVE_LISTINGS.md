# Active Listings CSV Debug Tool

## Purpose
This debug endpoint exports all Active Listings search results to a CSV file for inspection, helping diagnose why certain items (especially auctions) may not be appearing in search results.

## Endpoint
```
GET /debug/export-active-listings-csv
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search term (e.g., "2024 topps chrome paul skenes") |
| `pages` | integer | No | 1 | Number of pages to scrape (1-10) |
| `sort_by` | string | No | "best_match" | Sort order: best_match, price, -price, newlyListed, endingSoonest |
| `buying_format` | string | No | None | Filter: "auction", "buy_it_now", or "best_offer" |
| `filename` | string | No | "debug_active_listings.csv" | Output CSV filename |

## Usage Examples

### Basic Search
Export first page of results for a card:
```
http://localhost:8000/debug/export-active-listings-csv?query=2024%20topps%20chrome%20paul%20skenes
```

### Auctions Only
Export only auction listings:
```
http://localhost:8000/debug/export-active-listings-csv?query=2024%20topps%20chrome%20paul%20skenes&buying_format=auction
```

### Multiple Pages
Export 3 pages of results (up to 600 items):
```
http://localhost:8000/debug/export-active-listings-csv?query=2024%20topps%20chrome%20paul%20skenes&pages=3
```

### Custom Filename
Export to a specific filename:
```
http://localhost:8000/debug/export-active-listings-csv?query=paul%20skenes&filename=skenes_debug.csv
```

### Price Sorted
Export results sorted by price:
```
http://localhost:8000/debug/export-active-listings-csv?query=paul%20skenes&sort_by=price
```

## Response Format

The endpoint returns JSON with:

```json
{
  "status": "success",
  "message": "Exported 200 active listings to CSV",
  "filepath": "/path/to/debug_active_listings.csv",
  "query": "2024 topps chrome paul skenes",
  "pages_scraped": 1,
  "statistics": {
    "total_items": 200,
    "auction_count": 45,
    "buy_it_now_count": 155,
    "best_offer_count": 78,
    "zero_price_count": 0,
    "no_item_id_count": 0
  },
  "sample_items": [
    {
      "title": "2024 Topps Chrome Paul Skenes...",
      "item_id": "v1|123456789|0",
      "price": 149.99,
      "buying_format": "Auction",
      "is_auction": true,
      "is_buy_it_now": false,
      "bids": 5
    }
  ]
}
```

## CSV Output

The CSV file is saved to the server's results directory (same location as `results_library_complete.csv`) and contains all fields from the CompItem model, including:

### Key Fields for Debugging
- `item_id` - eBay item ID
- `title` - Item title
- `buying_format` - Original format string from API
- `is_auction` - Boolean flag (computed)
- `is_buy_it_now` - Boolean flag (computed)
- `is_best_offer` - Boolean flag (computed)
- `extracted_price` - Numeric price value
- `extracted_shipping` - Numeric shipping cost
- `total_price` - Price + shipping
- `bids` - Number of bids (for auctions)
- `time_left` - Time remaining on listing
- `link` - eBay item URL
- `deep_link` - Mobile app deep link with tracking

### All Available Fields
See the full CompItem model in `main.py` for the complete list of 50+ fields exported to CSV.

## Debugging Workflow

1. **Run the export** with your search query
2. **Check statistics** in the JSON response for auction counts
3. **Open the CSV** in Excel, Google Sheets, or a text editor
4. **Filter/sort** by `is_auction`, `buying_format`, `extracted_price`, etc.
5. **Identify patterns** - Are auctions present but filtered? Are prices zero? Are item_ids missing?

## Common Issues to Check

1. **Zero prices** - Items with `extracted_price` = 0 are filtered from normal results
2. **Missing item_ids** - Items without `item_id` cannot be displayed
3. **Buying format flags** - Check if `is_auction` matches your expectations
4. **Bid counts** - Auctions should have `bids` > 0 if active
5. **Price range** - Are auction prices outside expected ranges?

## File Location

CSV files are saved to: `{project_root}/debug_active_listings.csv` (or custom filename)

On Railway/production: Check the `CSV_STORAGE_PATH` environment variable.

## Notes

- This endpoint exports **all items** without deduplication (unlike the normal `/active` endpoint)
- Use for debugging only - not intended for production use
- The CSV will overwrite any existing file with the same name
- eBay Browse API limit: 200 items per page, max 10 pages = 2000 items
