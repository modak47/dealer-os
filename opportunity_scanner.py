import requests
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from collections import defaultdict
from urllib.parse import urlparse
from supabase import create_client


# =====================================
# CONFIG
# =====================================

SUPABASE_URL = "https://ejtbbpiqwytcyvromalw.supabase.co"

SUPABASE_KEY = "sb_publishable_2HUSFaGa2KsxcGOzazvamg_-JW99eHG"

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY
)

SOURCE_COLUMNS = ",".join([
    '"Listing ID"',
    '"Dealer or Private"',
    '"Listing Status"',
    '"Listed Price"',
    '"Year"',
    '"Mileage"',
    '"Derivative ID"',
    '"Make"',
    '"Model"',
    '"Source URL"',
    '"Dealer Name"',
    '"Image URL"',
    '"First Seen Date"',
    '"Last Seen Date"',
    '"Days Live"',
    '"HPI Category"',
])

AUTOTRADER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0 Safari/537.36 YesMotoOpportunityScanner/1.0"
)


def normalize_listing_id(value):
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        cleaned = str(value).strip()
        return cleaned or None


def chunked(values, size=200):
    for index in range(0, len(values), size):
        yield values[index:index + size]


def fetch_listing_ids(table_name, column_name="Listing ID", batch_size=1000):
    listing_ids = []
    start = 0
    select_column = f'"{column_name}"'

    while True:
        response = (
            supabase
            .table(table_name)
            .select(select_column)
            .order(column_name)
            .range(start, start + batch_size - 1)
            .execute()
        )

        rows = response.data or []

        if not rows:
            break

        for row in rows:
            listing_id = normalize_listing_id(row.get(column_name))

            if listing_id is not None:
                listing_ids.append(listing_id)

        start += batch_size

    return listing_ids


def delete_stale_opportunities(active_private_listing_ids, all_source_listing_ids):
    if not all_source_listing_ids:
        print("Skipping stale opportunity cleanup - no source listing IDs loaded")
        return 0

    current_opportunity_ids = fetch_listing_ids("buying_opportunities")

    stale_listing_ids = [
        listing_id
        for listing_id in current_opportunity_ids
        if listing_id not in all_source_listing_ids
        or listing_id not in active_private_listing_ids
    ]

    if not stale_listing_ids:
        print("Removed 0 inactive opportunities")
        return 0

    removed = 0

    for batch in chunked(stale_listing_ids):
        supabase.table("opportunity_comparables").delete().in_(
            "opportunity_listing_id",
            batch
        ).execute()

        supabase.table("buying_opportunities").delete().in_(
            "Listing ID",
            batch
        ).execute()

        removed += len(batch)

    print(f"Removed {removed} inactive opportunities")
    return removed


def delete_opportunities_by_listing_id(listing_ids):
    removed = 0

    for batch in chunked(listing_ids):
        supabase.table("opportunity_comparables").delete().in_(
            "opportunity_listing_id",
            batch
        ).execute()

        supabase.table("buying_opportunities").delete().in_(
            "Listing ID",
            batch
        ).execute()

        removed += len(batch)

    return removed


def count_current_opportunities():
    return len(fetch_listing_ids("buying_opportunities"))


def fetch_current_opportunity_adverts(batch_size=1000):
    opportunities = []
    start = 0

    while True:
        response = (
            supabase
            .table("buying_opportunities")
            .select('"Listing ID","Advert URL"')
            .order("Listing ID")
            .range(start, start + batch_size - 1)
            .execute()
        )

        rows = response.data or []

        if not rows:
            break

        for row in rows:
            listing_id = normalize_listing_id(row.get("Listing ID"))
            advert_url = (row.get("Advert URL") or "").strip()

            if listing_id is not None and advert_url:
                opportunities.append({
                    "Listing ID": listing_id,
                    "Advert URL": advert_url,
                })

        start += batch_size

    return opportunities


def is_bike_search_redirect(url):
    parsed = urlparse(url)
    return (
        parsed.netloc.lower() in {
            "www.autotrader.co.uk",
            "autotrader.co.uk",
        }
        and parsed.path.rstrip("/") == "/bike-search"
    )


def looks_blocked(response):
    if response.status_code in {403, 429}:
        return True

    body = (response.text or "")[:5000].lower()
    return "captcha" in body or "bot protection" in body or "access denied" in body


def verify_opportunity_url(opportunity):
    listing_id = opportunity["Listing ID"]
    advert_url = opportunity["Advert URL"]

    for attempt in range(2):
        try:
            if attempt:
                time.sleep(1.0)
            else:
                time.sleep(0.2)

            response = requests.get(
                advert_url,
                headers={"User-Agent": AUTOTRADER_USER_AGENT},
                timeout=10,
                allow_redirects=True,
            )

            if is_bike_search_redirect(response.url):
                return {"listing_id": listing_id, "status": "removed"}

            if looks_blocked(response):
                return {"listing_id": listing_id, "status": "blocked"}

            if response.status_code >= 500:
                if attempt == 0:
                    continue
                return {"listing_id": listing_id, "status": "unverified"}

            if response.status_code >= 400:
                return {"listing_id": listing_id, "status": "unverified"}

            return {"listing_id": listing_id, "status": "live"}

        except requests.RequestException as e:
            if attempt == 0:
                continue
            return {"listing_id": listing_id, "status": "error", "error": str(e)}

    return {"listing_id": listing_id, "status": "unverified"}


def verify_live_opportunity_urls():
    opportunity_adverts = fetch_current_opportunity_adverts()
    print(f"Checking {len(opportunity_adverts)} opportunity URLs...")

    stats = {
        "live": 0,
        "removed": 0,
        "unverified": 0,
        "blocked": 0,
        "errors": 0,
    }
    removed_listing_ids = []

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [
            executor.submit(verify_opportunity_url, opportunity)
            for opportunity in opportunity_adverts
        ]

        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception as e:
                stats["errors"] += 1
                print(f"URL verification worker failed: {e}")
                continue

            status = result["status"]

            if status == "removed":
                stats["removed"] += 1
                removed_listing_ids.append(result["listing_id"])
            elif status == "blocked":
                stats["blocked"] += 1
            elif status == "error":
                stats["errors"] += 1
            elif status == "live":
                stats["live"] += 1
            else:
                stats["unverified"] += 1

    removed_from_opportunities = 0

    if removed_listing_ids:
        removed_from_opportunities = delete_opportunities_by_listing_id(
            removed_listing_ids
        )

    print(f"Verified live: {stats['live']}")
    print(f"Redirected to bike-search / removed: {stats['removed']}")
    print(f"Unverified: {stats['unverified']}")
    print(f"Blocked: {stats['blocked']}")
    print(f"Errors: {stats['errors']}")
    print(f"Removed from buying_opportunities: {removed_from_opportunities}")

    return set(removed_listing_ids)


def postgrest_error_code(error):
    code = getattr(error, "code", None)

    if code:
        return code

    if error.args and isinstance(error.args[0], dict):
        return error.args[0].get("code")

    return None


def fetch_source_page(start, batch_size, max_attempts=3):
    for attempt in range(1, max_attempts + 1):
        try:
            return (
                supabase
                .table("autotrader_listings")
                .select(SOURCE_COLUMNS)
                .order("Listing ID")
                .range(start, start + batch_size - 1)
                .execute()
            )
        except Exception as e:
            is_timeout = postgrest_error_code(e) == "57014" or "57014" in str(e)

            if not is_timeout or attempt == max_attempts:
                print(f"Failed loading source page offset {start} attempt {attempt}: {e}")
                raise

            print(f"Timeout loading source page offset {start}; retry {attempt + 1} of {max_attempts}")
            time.sleep(1.5 * attempt)


def get_expected_source_count():
    for attempt in range(1, 3):
        try:
            response = (
                supabase
                .rpc("get_autotrader_listing_count")
                .execute()
            )

            count_value = response.data

            if isinstance(count_value, list):
                count_value = count_value[0] if count_value else None

            if isinstance(count_value, dict):
                count_value = count_value.get("get_autotrader_listing_count")

            if count_value is None:
                raise RuntimeError("RPC returned no count")

            return int(count_value)
        except Exception as e:
            if attempt == 1:
                print(f"WARNING: Could not load autotrader listing count via RPC; retrying once: {e}")
                time.sleep(1.0)
                continue

            print(f"WARNING: Could not load autotrader listing count via RPC: {e}")
            return None


# =====================================
# LOAD ALL BIKES
# =====================================

print("Loading Bike Listings...")

all_bikes = []
expected_source_count = get_expected_source_count()

start = 0
batch_size = 250

while True:

    response = fetch_source_page(start, batch_size)

    rows = response.data

    if not rows:
        break

    for row in rows:

        all_bikes.append({
            "fields": row
        })

    start += batch_size

print(
    f"Loaded {len(all_bikes)} bikes"
)

if expected_source_count is None:
    print("WARNING: Could not confirm autotrader_listings source row count. Stale cleanup will be skipped.")
else:
    print(f"Expected source rows: {expected_source_count}")

if not all_bikes:
    raise RuntimeError("No autotrader_listings rows loaded; skipping scan and stale cleanup for safety.")

all_source_listing_ids = set()
active_private_listing_ids = set()

for record in all_bikes:
    fields = record.get("fields", {})
    listing_id = normalize_listing_id(fields.get("Listing ID"))

    if listing_id is None:
        continue

    all_source_listing_ids.add(listing_id)

    if (
        fields.get("Dealer or Private") == "Private"
        and fields.get("Listing Status") == "Active"
    ):
        active_private_listing_ids.add(listing_id)

print(f"Source listings indexed: {len(all_source_listing_ids)}")
print(f"Active private source listings indexed: {len(active_private_listing_ids)}")

# =====================================
# BUILD DEALER INDEXES
# =====================================

print("Building dealer indexes...")

dealer_by_derivative = defaultdict(list)
dealer_by_make_model = defaultdict(list)

for record in all_bikes:

    fields = record.get("fields", {})

    if fields.get("Dealer or Private") != "Dealer":
        continue

    if fields.get("Listing Status") != "Active":
        continue

    price = fields.get("Listed Price")
    year = fields.get("Year")
    mileage = fields.get("Mileage")

    if not price or not year:
        continue

    try:
        price = float(price)
        year = int(year)
        mileage = int(mileage or 0)
    except:
        continue

    if price < 500:
        continue

    dealer_data = {
        "listing_id": normalize_listing_id(fields.get("Listing ID")),
        "price": price,
        "year": year,
        "mileage": mileage,
        "make": fields.get("Make"),
        "model": fields.get("Model"),
        "seller_type": fields.get("Dealer or Private"),
        "advert_url": fields.get("Source URL"),
        "dealer_name": fields.get("Seller Name") or fields.get("Dealer Name") or "",
        "distance": fields.get("Distance") or "",
        "image_url": fields.get("Image URL"),
    }

    derivative = fields.get("Derivative ID")

    if derivative:
        dealer_by_derivative[
            derivative
        ].append(dealer_data)

    make = fields.get("Make")
    model = fields.get("Model")

    if make and model:

        key = (
            make.strip().lower(),
            model.strip().lower()
        )

        dealer_by_make_model[
            key
        ].append(dealer_data)

count_with_derivative = 0

for bike in all_bikes:

    d = bike["fields"].get("Derivative ID")

    if d:
        count_with_derivative += 1

print(
    f"Derivative groups: {len(dealer_by_derivative)}"
)

print(
    f"Bikes with Derivative ID: {count_with_derivative}"
)

print(
    list(dealer_by_derivative.keys())[:20]
)

print(
    list(dealer_by_derivative.keys())[:20]
)

print(
    f"Make/model groups: {len(dealer_by_make_model)}"
)

# =====================================
# PRESERVE EXISTING OPPORTUNITIES
# =====================================
# Opportunities store user-managed fields like notes, status, favourite
# and hidden. We preserve active/private rows and only upsert market-owned
# fields by Listing ID. Stale rows are removed later only when the source
# AutoTrader listing is missing, inactive or no longer private.

print("Preserving existing active/private opportunities")

# =====================================
# FIND OPPORTUNITIES
# =====================================

print("Scanning private adverts...")

opportunities = []

for record in all_bikes:

    fields = record.get("fields", {})

    if fields.get("Dealer or Private") != "Private":
        continue

    if fields.get("Listing Status") != "Active":
        continue

    asking_price = fields.get("Listed Price")
    year = fields.get("Year")
    mileage = fields.get("Mileage")

    if not asking_price or not year:
        continue

    try:
        asking_price = float(asking_price)
        year = int(year)
        mileage = int(mileage or 0)
    except:
        continue

    if asking_price < 500:
        continue

    comparables = []

    derivative = fields.get("Derivative ID")

    # -----------------------------
    # Match by Derivative ID
    # -----------------------------

    if derivative:

        for dealer in dealer_by_derivative.get(
            derivative,
            []
        ):

            if abs(
                dealer["year"] - year
            ) > 2:
                continue

            if mileage:

                low = mileage * 0.5
                high = mileage * 1.5

                if dealer["mileage"]:

                    if (
                        dealer["mileage"] < low
                        or dealer["mileage"] > high
                    ):
                        continue

            comparables.append(dealer)

    # -----------------------------
    # Fallback Make/Model
    # -----------------------------

    else:

        make = fields.get("Make")
        model = fields.get("Model")

        if make and model:

            key = (
                make.strip().lower(),
                model.strip().lower()
            )

            for dealer in dealer_by_make_model.get(
                key,
                []
            ):

                if abs(
                    dealer["year"] - year
                ) > 2:
                    continue

                if mileage:

                    low = mileage * 0.5
                    high = mileage * 1.5

                    if dealer["mileage"]:

                        if (
                            dealer["mileage"] < low
                            or dealer["mileage"] > high
                        ):
                            continue

                comparables.append(dealer)

    comparable_count = len(comparables)

    if comparable_count < 5:
        continue

    comparable_prices = [
        c["price"]
        for c in comparables
    ]

    dealer_median = statistics.median(
        comparable_prices
    )

    margin = (
        dealer_median - asking_price
    )

    margin_percent = (
        margin / asking_price
    )

    if margin < 500 and margin_percent < 0.20:
        continue

    try:
        days_live = int(
            fields.get("Days Live") or 0
        )
    except:
        days_live = 0

    score = int(
        min(
            100,
            (margin / asking_price) * 100
        )
    )

    hpi_category = (
        fields.get("HPI Category") or ""
    ).strip()

    if hpi_category == "Cat N":
        score -= 15

    if hpi_category == "Cat S":
        score -= 30

    if hpi_category == "Cat C":
        score -= 30

    if hpi_category == "Cat D":
        score -= 20

    if days_live > 30:
        score += 10

    if days_live > 60:
        score += 10

    score = max(0, min(score, 100))

    opportunities.append({
        "fields": {

            "Listing ID":
            normalize_listing_id(fields.get("Listing ID")),

            "Score":
            score,

            "Potential Margin":
            round(margin),

            "Asking Price":
            asking_price,

            "Dealer Median":
            round(dealer_median),

            "Comparable Count":
            comparable_count,

            "Make":
            fields.get("Make"),

            "Model":
            fields.get("Model"),

            "Year":
            fields.get("Year"),

            "Mileage":
            fields.get("Mileage"),

            "Seller Type":
            fields.get("Dealer or Private"),

            "Advert URL":
            fields.get("Source URL"),

            "Derivative ID":
            fields.get("Derivative ID"),

            "HPI Category":
            fields.get("HPI Category"),

            "Days Live":
            days_live,

            "First Seen Date":
            fields.get("First Seen Date"),

            "last_seen":
            fields.get("Last Seen Date"),

            "primary_image_url":
            fields.get("Image URL")
        },

        "comparables": comparables
    })

print(
    f"Found {len(opportunities)} opportunities"
)

# =====================================
# SAVE TO SUPABASE
# =====================================

print("Uploading...")

rows_dict = {}

for opportunity in opportunities:

    listing_id = (
        opportunity["fields"]["Listing ID"]
    )

    if listing_id is None:
        continue

    rows_dict[listing_id] = (
        opportunity["fields"]
    )

rows = list(
    rows_dict.values()
)

print(
    f"Uploading {len(rows)} unique opportunities"
)

if rows:

    supabase.table(
        "buying_opportunities"
    ).upsert(
        rows,
        on_conflict="Listing ID"
    ).execute()

if (
    expected_source_count is not None
    and expected_source_count > 0
    and len(all_bikes) == expected_source_count
):
    try:
        delete_stale_opportunities(
            active_private_listing_ids,
            all_source_listing_ids
        )
    except Exception as e:
        print(f"WARNING: Stale opportunity cleanup failed and was skipped: {e}")
else:
    expected_display = expected_source_count if expected_source_count is not None else "unknown"
    print(
        f"WARNING: Loaded {len(all_bikes)} of {expected_display} source rows. "
        "Stale cleanup skipped."
    )

url_removed_listing_ids = verify_live_opportunity_urls()

print("Uploading comparable advert details...")

for opportunity in opportunities:
    listing_id = opportunity["fields"]["Listing ID"]

    if listing_id is None:
        continue

    if listing_id in url_removed_listing_ids:
        continue

    comparable_rows = opportunity.get("comparables", [])

    payload = []

    for comparable in comparable_rows:
        payload.append({
            "comparable_listing_id": comparable.get("listing_id"),
            "make": comparable.get("make"),
            "model": comparable.get("model"),
            "year": comparable.get("year"),
            "mileage": comparable.get("mileage"),
            "price": str(round(comparable.get("price", 0))),
            "seller_type": comparable.get("seller_type"),
            "advert_url": comparable.get("advert_url"),
            "dealer_name": comparable.get("dealer_name"),
            "distance": comparable.get("distance"),
            "image_url": comparable.get("image_url")
        })

    try:
        response = supabase.rpc(
            "replace_opportunity_comparables",
            {
                "p_opportunity_listing_id": listing_id,
                "p_comparables": payload
            }
        ).execute()

    except Exception as e:
        print(f"Failed uploading comparables for {listing_id}: {e}")

remaining_opportunity_count = count_current_opportunities()

print()
print("Finished")
print(f"Current active opportunities: {remaining_opportunity_count}")

supabase.table("scanner_status").upsert({
    "id": 1,
    "last_run": datetime.now().isoformat(),
    "opportunity_count": remaining_opportunity_count
}).execute()
