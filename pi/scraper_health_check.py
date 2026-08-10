import os
from datetime import date, timedelta
from pathlib import Path

from supabase import create_client


SELECT_COLUMNS = '"Listing ID","Make","Model","Year","Mileage","Listed Price","Dealer or Private","Listing Status","Last Seen Date"'


def load_local_env():
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and not os.environ.get(key):
            os.environ[key] = value


def apply_filters(query, filters):
    for method, column, value in filters or []:
        query = getattr(query, method)(column, value)
    return query


def fetch_rows(supabase, filters=None, limit=10):
    query = supabase.table("autotrader_listings").select(SELECT_COLUMNS).limit(limit)
    return apply_filters(query, filters).execute().data or []


def count_rows(supabase, filters=None, page_size=500, max_pages=50):
    total = 0
    for page in range(max_pages):
        start = page * page_size
        end = start + page_size - 1
        query = supabase.table("autotrader_listings").select('"Listing ID"').range(start, end)
        rows = apply_filters(query, filters).execute().data or []
        total += len(rows)
        if len(rows) < page_size:
            return total, False
    return total, True


def latest_seen_date(supabase, days_back=45):
    for offset in range(days_back + 1):
        checked_date = (date.today() - timedelta(days=offset)).isoformat()
        rows = fetch_rows(supabase, [("eq", "Last Seen Date", checked_date)], limit=1)
        if rows:
            return checked_date
    return "not found in last 45 days"


def count_for_date(supabase, checked_date):
    count, capped = count_rows(supabase, [("eq", "Last Seen Date", checked_date)])
    return f"{count}{'+' if capped else ''}"


def print_rows(title, rows):
    print()
    print(title)
    print("-" * len(title))
    if not rows:
        print("None found")
        return

    for row in rows:
        print(
            f"{row.get('Listing ID')} | {row.get('Make')} {row.get('Model')} | "
            f"{row.get('Year')} | {row.get('Mileage')} miles | "
            f"GBP {row.get('Listed Price')} | {row.get('Dealer or Private')} | "
            f"{row.get('Listing Status')} | last seen {row.get('Last Seen Date')}"
        )


def main():
    load_local_env()
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_KEY"]
    supabase = create_client(supabase_url, supabase_key)

    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    newest_date = latest_seen_date(supabase)
    newest_rows = [] if newest_date.startswith("not found") else fetch_rows(supabase, [("eq", "Last Seen Date", newest_date)], limit=10)
    active_count, active_capped = count_rows(supabase, [("eq", "Listing Status", "Active")])

    print("AutoTrader scraper health")
    print("=========================")
    print(f"Latest Last Seen Date: {newest_date}")
    print(f"Rows seen today ({today}): {count_for_date(supabase, today)}")
    print(f"Rows seen yesterday ({yesterday}): {count_for_date(supabase, yesterday)}")
    print(f"Rows seen on latest date: {count_for_date(supabase, newest_date) if newest_rows else 0}")
    print(f"Active rows checked: {active_count}{'+' if active_capped else ''}")

    print_rows("Sample rows from latest scrape date", newest_rows)

    bmw_filters = [
        ("ilike", "Make", "%BMW%"),
        ("ilike", "Model", "%850%"),
        ("eq", "Year", "2019"),
        ("eq", "Listing Status", "Active"),
    ]
    bmw_rows = fetch_rows(supabase, bmw_filters, limit=25)

    print_rows("Active BMW 850 2019 sample", bmw_rows)
    print()
    print(f"Active BMW 850 2019 rows returned: {len(bmw_rows)}")


if __name__ == "__main__":
    main()
