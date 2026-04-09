#!/usr/bin/env python3
"""
Import a checklist CSV into a compact JSON lookup file for the print run service.

Reads a checklist CSV (schema: set, insert-base, card-number, player-name, team,
variation, rookie, estimated-print-run) and aggregates it into variant-level print
run entries. The output JSON is written to backend/data/print_runs_detailed/.

Usage:
    python -m backend.scripts.import_checklist /path/to/checklist.csv
    python -m backend.scripts.import_checklist /path/to/checklist.csv --output custom_name.json
"""
import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "print_runs_detailed"

# Insert-base values that are part of the base card set (get base parallels)
BASE_INSERT_BASES = {
    "Base", "League Leaders", "Record Breakers", "AL Champions",
    "NL Champions", "World Series Highlights", "Turn Back the Clock",
    "Quad Rookies",
}

# Numbered parallels (print run IS the serial number)
NUMBERED_KEYWORDS = {"superfractor", "patch", "1/1"}


def _normalize(name: str) -> str:
    """Normalize a variation name to a lookup key."""
    return re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')


def _is_numbered(variation: str, print_run: int) -> bool:
    """Determine if a variation is serial-numbered."""
    v = variation.lower()
    if any(kw in v for kw in NUMBERED_KEYWORDS):
        return True
    if print_run <= 150 and ("refractor" in v or "gold" in v or "orange" in v or "red" in v):
        return True
    return False


def import_checklist(csv_path: str, output_name: str | None = None) -> Path:
    """Read a checklist CSV and produce a compact JSON lookup file."""
    rows = []
    with open(csv_path, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            pr = row.get("estimated-print-run", "").strip()
            if not pr or not pr.isdigit():
                continue
            rows.append(row)

    if not rows:
        print("No valid rows found in CSV.", file=sys.stderr)
        sys.exit(1)

    # Extract set name and year from the first row
    set_name = rows[0]["set"].strip()
    year_match = re.search(r'(19\d{2}|20\d{2})', set_name)
    year = int(year_match.group(1)) if year_match else None

    if not year:
        print(f"Could not extract year from set name: {set_name}", file=sys.stderr)
        sys.exit(1)

    # Aggregate: collect unique (insert-base, variation) → print_run combos
    # For base parallels (insert-base in BASE_INSERT_BASES), group by variation only
    # For inserts, group by (insert-base, variation)
    base_variants = {}  # normalized_variation → {variation, print_run, count}
    insert_entries = {}  # (insert_base, normalized_variation) → {insert_base, variation, print_run, count}

    for row in rows:
        ib = row["insert-base"].strip()
        var = row["variation"].strip()
        pr = int(row["estimated-print-run"].strip())
        norm_var = _normalize(var) if var else ""

        if ib in BASE_INSERT_BASES or "Chrome Variation" in ib:
            key = norm_var
            if key not in base_variants:
                base_variants[key] = {
                    "variation": norm_var,
                    "display_name": var,
                    "print_run": pr,
                    "numbered": _is_numbered(var, pr),
                    "count": 0,
                }
            base_variants[key]["count"] += 1
        else:
            key = (_normalize(ib), norm_var)
            if key not in insert_entries:
                insert_entries[key] = {
                    "insert_base": ib,
                    "variation": norm_var,
                    "display_name": var,
                    "print_run": pr,
                    "count": 0,
                }
            insert_entries[key]["count"] += 1

    # Build output
    variants_list = []
    for v in sorted(base_variants.values(), key=lambda x: -x["print_run"]):
        variants_list.append({
            "variation": v["variation"],
            "display_name": v["display_name"],
            "print_run": v["print_run"],
            "numbered": v["numbered"],
        })

    inserts_list = []
    for e in sorted(insert_entries.values(), key=lambda x: (-x["print_run"], x["insert_base"])):
        inserts_list.append({
            "insert_base": e["insert_base"],
            "variation": e["variation"],
            "display_name": e["display_name"],
            "print_run": e["print_run"],
        })

    output = {
        "set": re.sub(r'\d{4}\s*', '', set_name).strip(),  # Remove year from set name
        "year": year,
        "source": "checklist data",
        "variants": variants_list,
        "inserts": inserts_list,
    }

    # Determine output filename
    if not output_name:
        slug = re.sub(r'[^a-z0-9]+', '_', output["set"].lower()).strip('_')
        output_name = f"{slug}_{year}.json"

    output_path = OUTPUT_DIR / output_name
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2) + "\n")

    print(f"Wrote {len(variants_list)} variants + {len(inserts_list)} inserts to {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Import a checklist CSV into print run JSON")
    parser.add_argument("csv_path", help="Path to the checklist CSV file")
    parser.add_argument("--output", "-o", help="Output filename (default: auto-generated)")
    args = parser.parse_args()
    import_checklist(args.csv_path, args.output)


if __name__ == "__main__":
    main()
