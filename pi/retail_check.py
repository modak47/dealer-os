import json
import os
import re
import traceback
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

import requests
from playwright.sync_api import sync_playwright
from supabase import create_client

from vrm_lookup import lookup_vrm


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


load_local_env()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CAZOO_EMAIL = os.getenv("CAZOO_EMAIL", "")
CAZOO_PASSWORD = os.getenv("CAZOO_PASSWORD", "")
CAZOO_PROFILE_PATH = os.getenv("CAZOO_PROFILE_PATH", "/home/yesmoto/dealerbot/cazoo-profile")
HEADLESS = os.getenv("RETAIL_CHECK_HEADLESS", "false").lower() in {"1", "true", "yes"}
MAX_ATTEMPTS = int(os.getenv("RETAIL_CHECK_MAX_ATTEMPTS", "3"))
MIN_PRICE = int(os.getenv("RETAIL_CHECK_MIN_PRICE", "500"))

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def money_number(value):
    if value is None:
        return None
    try:
        return float(str(value).replace("£", "").replace("Â£", "").replace(",", "").strip())
    except Exception:
        return None


def safe_int(value, default=0):
    try:
        return int(float(str(value)))
    except Exception:
        return default


def safe_error(message):
    text = re.sub(r"(password|token|bearer|apikey|api_key|cookie|authorization)[^\n]*", "[redacted]", str(message), flags=re.I)
    return text[:1000]


def compact_text(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def model_matches(wanted, candidate):
    wanted_key = compact_text(wanted)
    candidate_key = compact_text(candidate)
    if not wanted_key or not candidate_key:
        return False
    return wanted_key == candidate_key or (len(wanted_key) >= 4 and wanted_key in candidate_key) or (len(candidate_key) >= 4 and candidate_key in wanted_key)


def make_matches(wanted, candidate):
    wanted_key = compact_text(wanted)
    candidate_key = compact_text(candidate)
    if not wanted_key or not candidate_key:
        return False
    if wanted_key == candidate_key or wanted_key in candidate_key or candidate_key in wanted_key:
        return True
    return wanted_key.startswith("bmw") and candidate_key.startswith("bmw")


def update_progress(record_id, stage, message, percent, worker_id, supabase_client=None):
    client = supabase_client or supabase
    client.table("retail_checks").update(
        {
            "Progress Stage": stage,
            "Progress Message": message,
            "Progress Percent": percent,
            "Processing Heartbeat At": now_iso(),
            "Worker ID": worker_id,
        }
    ).eq("id", record_id).execute()


def verify_claim(record_id, worker_id, supabase_client=None):
    client = supabase_client or supabase
    result = client.table("retail_checks").select("id,Status,\"Worker ID\"").eq("id", record_id).limit(1).execute()
    row = result.data[0] if result.data else None
    if not row or row.get("Status") != "Processing" or row.get("Worker ID") != worker_id:
        raise RuntimeError("Retail check is no longer assigned to this worker.")


def mark_manual_review(record_id, reason, additional_fields=None, worker_id="", supabase_client=None):
    client = supabase_client or supabase
    fields = {
        "Status": "Manual Review",
        "Progress Stage": "Manual Review",
        "Progress Message": reason,
        "Progress Percent": 100,
        "Completed At": now_iso(),
        "Processing Heartbeat At": now_iso(),
        "Last Error": None,
        "Worker ID": worker_id or None,
    }
    if additional_fields:
        fields.update(additional_fields)
    client.table("retail_checks").update(fields).eq("id", record_id).execute()


def mark_failed(record_id, error_message, worker_id="", supabase_client=None, max_attempts=MAX_ATTEMPTS):
    client = supabase_client or supabase
    current_rows = client.table("retail_checks").select("id,\"Attempt Count\"").eq("id", record_id).limit(1).execute().data or []
    current = current_rows[0] if current_rows else {}
    attempts = int(current.get("Attempt Count") or 0)
    retry = attempts < max_attempts
    client.table("retail_checks").update(
        {
            "Status": "Pending" if retry else "Failed",
            "Progress Stage": "Queued" if retry else "Failed",
            "Progress Message": "Retrying retail check after a worker error." if retry else "The retail check could not be completed.",
            "Progress Percent": 0 if retry else 100,
            "Processing Heartbeat At": now_iso(),
            "Failed At": None if retry else now_iso(),
            "Last Error": safe_error(error_message),
            "Worker ID": None if retry else worker_id,
        }
    ).eq("id", record_id).execute()


def market_query(columns):
    return supabase.table("autotrader_listings").select(columns).eq("Dealer or Private", "Dealer").eq("Listing Status", "Active")


def dedupe_records(records):
    seen = set()
    deduped = []
    for record in records:
        f = record["fields"]
        key = f.get("Listing ID") or f.get("Source URL") or json.dumps(f, sort_keys=True, default=str)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(record)
    return deduped


def load_market_records(make, model, derivative_id):
    columns = '"Listing ID","Listed Price","Mileage","Year","Source URL","Make","Model","Derivative ID","Dealer or Private","Listing Status","Colour","Days Live","Days On Market","Dealer Name"'
    records = []
    if derivative_id:
        rows = market_query(columns).eq("Derivative ID", derivative_id).execute().data or []
        records.extend({"fields": row, "match_basis": "derivative"} for row in rows)

    if make and model:
        rows = market_query(columns).eq("Make", make).eq("Model", model).execute().data or []
        if len(rows) < 4:
            try:
                make_probe = str(make).split()[0]
                rows = market_query(columns).ilike("Make", f"%{make_probe}%").execute().data or []
            except Exception:
                rows = market_query(columns).eq("Make", make).execute().data or []
        records.extend(
            {"fields": row, "match_basis": "make_model"}
            for row in rows
            if make_matches(make, row.get("Make")) and model_matches(model, row.get("Model"))
        )

    return dedupe_records(records)


def comparable_from_record(record):
    f = record["fields"]
    year = safe_int(f.get("Year"), None)
    mileage = safe_int(f.get("Mileage"), None)
    price = money_number(f.get("Listed Price"))
    if not year or not mileage or not price or mileage <= 100 or price < MIN_PRICE:
        return None
    return {
        "price": price,
        "mileage": mileage,
        "year": year,
        "colour": f.get("Colour", ""),
        "days": f.get("Days On Market") or f.get("Days Live") or "",
        "url": f.get("Source URL", ""),
        "make": f.get("Make", ""),
        "model": f.get("Model", ""),
        "dealer": f.get("Dealer Name") or f.get("Seller Name") or "",
        "match_basis": record.get("match_basis", ""),
    }


def within_mileage(comp_mileage, bike_mileage, low_factor, high_factor):
    if not bike_mileage:
        return True
    return bike_mileage * low_factor <= comp_mileage <= bike_mileage * high_factor


def select_comparables(all_records, bike_year, bike_mileage):
    valid = [comp for record in all_records if (comp := comparable_from_record(record))]
    if not valid:
        return [], "No valid dealer listings with price, year and mileage."

    stages = [
        ("Very close year/mileage", lambda c: bike_year - 1 <= c["year"] <= bike_year + 1 and within_mileage(c["mileage"], bike_mileage, 0.60, 1.40)),
        ("Close year/mileage", lambda c: bike_year - 2 <= c["year"] <= bike_year + 2 and within_mileage(c["mileage"], bike_mileage, 0.50, 1.50)),
        ("Year-focused", lambda c: bike_year - 2 <= c["year"] <= bike_year + 2),
        ("Broad model fallback", lambda c: True),
    ]

    for label, predicate in stages:
        comparables = [comp for comp in valid if predicate(comp)]
        if len(comparables) >= 3:
            return comparables, label

    return valid, "Very low sample fallback"


def calculate_market_legacy(comparables):
    used_prices = [x["price"] for x in comparables]
    used_mileages = [x["mileage"] for x in comparables]
    if not used_prices:
        return None

    summary_lines = []
    for comp in sorted(comparables, key=lambda x: x["price"]):
        summary_lines.append(f"£{comp['price']} | {comp['year']} | {comp['mileage']} miles | {comp['colour']} | {comp['days']} DOM")
        summary_lines.append(comp["url"])
        summary_lines.append("")
    comparable_summary = "\n".join(summary_lines)

    used_prices.sort()
    if len(used_prices) >= 10:
        trim = int(len(used_prices) * 0.10)
        used_prices = used_prices[trim:-trim]

    comparable_count = len(used_prices)
    if comparable_count >= 12:
        confidence = "High"
    elif comparable_count >= 8:
        confidence = "Medium"
    elif comparable_count >= 4:
        confidence = "Low"
    else:
        confidence = "Very Low"

    market_retail = round(median(used_prices))
    fast_sale = round(used_prices[max(0, int(len(used_prices) * 0.25) - 1)])
    premium = round(used_prices[min(len(used_prices) - 1, int(len(used_prices) * 0.90))])
    avg_mileage = round(sum(used_mileages) / len(used_mileages))

    if market_retail < 5000:
        profit_target = 1000
    elif market_retail < 10000:
        profit_target = 1500
    else:
        profit_target = 2000

    suggested_offer = market_retail - profit_target
    if profit_target >= 2000:
        score = 100
    elif profit_target >= 1500:
        score = 90
    elif profit_target >= 1000:
        score = 75
    else:
        score = 50

    return {
        "Market Retail": market_retail,
        "Fast Sale Retail": fast_sale,
        "Premium Retail": premium,
        "Comparable Count": comparable_count,
        "Comparable Summary": comparable_summary,
        "Average Comparable Mileage": avg_mileage,
        "Suggested Offer": suggested_offer,
        "Available Margin": profit_target,
        "Opportunity Score": score,
        "Confidence": confidence,
        "Target Profit": profit_target,
    }


def percentile(sorted_values, position):
    if not sorted_values:
        return None
    index = round((len(sorted_values) - 1) * position)
    return sorted_values[max(0, min(len(sorted_values) - 1, index))]


def confidence_for(comparable_count, match_quality):
    if comparable_count >= 10 and match_quality in {"Very close year/mileage", "Close year/mileage"}:
        return "High"
    if comparable_count >= 6 and match_quality in {"Very close year/mileage", "Close year/mileage", "Year-focused"}:
        return "Medium"
    if comparable_count >= 3:
        return "Low"
    return "Very Low"


def calculate_market(comparables, bike_mileage, asking_price=0, match_quality=""):
    if not comparables:
        return None

    sorted_comps = sorted(comparables, key=lambda x: x["price"])
    if len(sorted_comps) >= 10:
        trim = max(1, int(len(sorted_comps) * 0.10))
        valuation_comps = sorted_comps[trim:-trim]
    else:
        valuation_comps = sorted_comps

    used_prices = [x["price"] for x in valuation_comps]
    used_mileages = [x["mileage"] for x in valuation_comps]
    comparable_count = len(valuation_comps)
    confidence = confidence_for(comparable_count, match_quality)

    market_retail = round(median(used_prices))
    fast_sale = round(percentile(used_prices, 0.25))
    premium = round(percentile(used_prices, 0.90))
    avg_mileage = round(sum(used_mileages) / len(used_mileages))

    if bike_mileage and avg_mileage:
        mileage_delta = bike_mileage - avg_mileage
        mileage_adjustment = round(max(-1500, min(1500, -mileage_delta * 0.04)))
        market_retail = max(MIN_PRICE, market_retail + mileage_adjustment)
        fast_sale = max(MIN_PRICE, fast_sale + mileage_adjustment)
        premium = max(MIN_PRICE, premium + mileage_adjustment)
    else:
        mileage_adjustment = 0

    if market_retail < 5000:
        profit_target = 1000
    elif market_retail < 10000:
        profit_target = 1500
    else:
        profit_target = 2000

    suggested_offer = market_retail - profit_target
    expected_profit = market_retail - asking_price if asking_price else profit_target
    if not asking_price:
        score = {"High": 85, "Medium": 75, "Low": 60, "Very Low": 40}.get(confidence, 40)
    else:
        margin_percent = expected_profit / asking_price if asking_price > 0 else 0
        score = int(max(0, min(100, margin_percent * 100)))
        if expected_profit >= profit_target:
            score = max(score, 75)
        if confidence == "High":
            score += 10
        elif confidence == "Low":
            score -= 10
        elif confidence == "Very Low":
            score -= 25
        score = max(0, min(score, 100))

    summary_lines = []
    for comp in valuation_comps:
        summary_lines.append(f"GBP {round(comp['price'])} | {comp['year']} | {comp['mileage']} miles | {comp['colour']} | {comp['days']} DOM")
        summary_lines.append(comp["url"])
        summary_lines.append("")
    comparable_summary = "\n".join(summary_lines)

    return {
        "Market Retail": market_retail,
        "Fast Sale Retail": fast_sale,
        "Premium Retail": premium,
        "Comparable Count": comparable_count,
        "Comparable Summary": comparable_summary,
        "Average Comparable Mileage": avg_mileage,
        "Suggested Offer": suggested_offer,
        "Available Margin": expected_profit,
        "Opportunity Score": score,
        "Confidence": confidence,
        "Target Profit": profit_target,
    }


def target_profit_for(retail):
    if retail < 5000:
        return 1000
    if retail < 10000:
        return 1500
    return 2000


def score_for_margin(expected_profit, asking_price, confidence):
    if not asking_price:
        return {"High": 85, "Medium": 75, "Low": 60, "Very Low": 40}.get(confidence, 40)
    margin_percent = expected_profit / asking_price if asking_price > 0 else 0
    score = int(max(0, min(100, margin_percent * 100)))
    if expected_profit >= target_profit_for(asking_price + expected_profit):
        score = max(score, 75)
    if confidence == "High":
        score += 10
    elif confidence == "Low":
        score -= 10
    elif confidence == "Very Low":
        score -= 25
    return max(0, min(score, 100))


def blend_with_percayso(market, percayso_retail, asking_price):
    percayso_value = money_number(percayso_retail)
    if not market or not percayso_value:
        return market

    autotrader_value = money_number(market.get("Market Retail"))
    if not autotrader_value:
        return market

    confidence = market.get("Confidence") or "Very Low"
    if confidence in {"Low", "Very Low"}:
        blended_retail = round(median([autotrader_value, percayso_value]))
    else:
        gap = abs(autotrader_value - percayso_value) / autotrader_value if autotrader_value else 0
        percayso_weight = 0.25 if gap <= 0.15 else 0.10
        blended_retail = round((autotrader_value * (1 - percayso_weight)) + (percayso_value * percayso_weight))

    adjustment = blended_retail - round(autotrader_value)
    if not adjustment:
        return market

    market["Market Retail"] = blended_retail
    market["Fast Sale Retail"] = max(MIN_PRICE, round((market.get("Fast Sale Retail") or blended_retail) + adjustment))
    market["Premium Retail"] = max(MIN_PRICE, round((market.get("Premium Retail") or blended_retail) + adjustment))
    market["Target Profit"] = target_profit_for(blended_retail)
    market["Suggested Offer"] = blended_retail - market["Target Profit"]
    market["Available Margin"] = blended_retail - asking_price if asking_price else market["Target Profit"]
    market["Opportunity Score"] = score_for_margin(market["Available Margin"], asking_price, confidence)
    return market


def lookup_registration(registration):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        try:
            page = browser.new_page()
            page.goto("https://www.autotrader.co.uk")
            page.wait_for_timeout(5000)
            vehicle = lookup_vrm(page, registration)
        finally:
            browser.close()

    lookup = vehicle["data"]["vehicle"]["vrmLookup"]
    first_registration = lookup.get("firstRegistrationDate")
    bike_year = datetime.fromtimestamp(int(first_registration) / 1000).year if first_registration else 0
    return {
        "make": lookup.get("make"),
        "model": lookup.get("model"),
        "derivative": lookup.get("derivative"),
        "derivative_id": lookup.get("derivativeId"),
        "bike_year": bike_year,
    }


def is_cazoo_login_url(url):
    lowered = (url or "").lower()
    return "login" in lowered or "account/login" in lowered or "signin" in lowered


def has_login_fields(page):
    try:
        username_count = page.locator('input[name="Username"], input[name="username"], input[type="email"], input[name*="user" i]').count()
        password_count = page.locator('input[name="Password"], input[name="password"], input[type="password"]').count()
        return username_count > 0 and password_count > 0
    except Exception:
        return False


def on_authenticated_stock_page(page):
    lowered = page.url.lower()
    return "stock.cazoo.co.uk" in lowered and not is_cazoo_login_url(lowered) and not has_login_fields(page)


def fill_first_visible(page, selectors, value):
    last_error = None
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() and locator.is_visible():
                locator.fill(value)
                return
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Unable to find login field. {safe_error(last_error) if last_error else ''}".strip())


def click_first_visible(page, selectors):
    last_error = None
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() and locator.is_visible():
                locator.click()
                return
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Unable to find login submit control. {safe_error(last_error) if last_error else ''}".strip())


def ensure_cazoo_session(force_login=False):
    cookies_list = []
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(CAZOO_PROFILE_PATH, headless=HEADLESS)
        try:
            page = context.new_page()
            if force_login:
                page.goto("https://dealercentre.cazoo.co.uk/account/login", wait_until="networkidle")
            else:
                page.goto("https://stock.cazoo.co.uk", wait_until="networkidle")

            needs_login = force_login or is_cazoo_login_url(page.url) or has_login_fields(page) or "stock.cazoo.co.uk" not in page.url.lower()

            if needs_login:
                page.goto("https://dealercentre.cazoo.co.uk/account/login", wait_until="networkidle")
                if not has_login_fields(page):
                    raise RuntimeError(f"Cazoo login page did not show login fields. Current URL: {page.url}")
                fill_first_visible(page, ['input[name="Username"]', 'input[name="username"]', 'input[type="email"]', 'input[name*="user" i]'], CAZOO_EMAIL)
                fill_first_visible(page, ['input[name="Password"]', 'input[name="password"]', 'input[type="password"]'], CAZOO_PASSWORD)
                click_first_visible(page, ['button[type="submit"]', 'input[type="submit"]'])
                page.wait_for_load_state("networkidle")
                if is_cazoo_login_url(page.url) or has_login_fields(page):
                    raise RuntimeError("Cazoo login did not complete.")

            page.goto("https://stock.cazoo.co.uk", wait_until="networkidle")
            if not on_authenticated_stock_page(page):
                raise RuntimeError(f"Authenticated Cazoo stock page was not verified. Current URL: {page.url}")

            print(f"Cazoo stock page verified: {page.url}", flush=True)
            cookies_list = context.cookies()
            print(f"Cazoo session cookie count: {len(cookies_list)}", flush=True)
        finally:
            context.close()
    return {cookie["name"]: cookie["value"] for cookie in cookies_list}


def parse_percayso_response(response):
    content_type = response.headers.get("Content-Type", "")
    body = response.text or ""
    print(
        f"Percayso HTTP {response.status_code}; Content-Type: {content_type or '-'}; Length: {len(body)}",
        flush=True,
    )
    if response.status_code in {401, 403}:
        raise RuntimeError(f"Percayso authentication failed with HTTP {response.status_code}.")
    response.raise_for_status()
    stripped = body.strip()
    if not stripped:
        raise RuntimeError("Percayso returned an empty response.")
    lower_start = stripped[:200].lower()
    if "<html" in lower_start or "<!doctype html" in lower_start or "account/login" in lower_start or "signin" in lower_start:
        raise RuntimeError("Percayso returned a login or HTML page instead of JSON.")
    percayso_json = json.loads(stripped)
    if isinstance(percayso_json, str):
        percayso_json = json.loads(percayso_json)
    return percayso_json


def call_percayso_endpoint(registration, bike_mileage, cookies):
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "*/*", "Referer": "https://stock.cazoo.co.uk/"}
    percayso_url = (
        "https://stock.cazoo.co.uk/cfc/ajax/ajax.cfc"
        "?method=getData&base=percayso.percayso&request=getValuation&returnType=4"
        f"&vrm={registration}&mileage={bike_mileage}"
    )
    response = requests.get(percayso_url, cookies=cookies, headers=headers, timeout=15)
    return parse_percayso_response(response)


def lookup_percayso(registration, bike_mileage, worker_id, record_id):
    days_to_sale = None
    percayso_retail = None
    percayso_trade = None
    percayso_independent = None
    percayso_franchise = None
    if not CAZOO_EMAIL or not CAZOO_PASSWORD:
        return percayso_retail, percayso_trade, percayso_independent, percayso_franchise, days_to_sale

    print(f"Percayso lookup v2: using Cazoo profile {CAZOO_PROFILE_PATH}", flush=True)
    update_progress(record_id, "Percayso Valuation", "Checking the independent valuation data.", 82, worker_id)
    try:
        cookies = ensure_cazoo_session(force_login=False)
        percayso_json = call_percayso_endpoint(registration, bike_mileage, cookies)
    except Exception as first_error:
        print(f"Percayso first attempt failed safely: {safe_error(first_error)}", flush=True)
        cookies = ensure_cazoo_session(force_login=True)
        percayso_json = call_percayso_endpoint(registration, bike_mileage, cookies)

    valuation = percayso_json["percaysoData"]["valuation"]
    days_to_sale = percayso_json["percaysoData"].get("daysToSale")
    return valuation.get("retail"), valuation.get("trade"), valuation.get("independent"), valuation.get("franchise"), days_to_sale


def process_retail_check(record, worker_id, supabase_client=None, max_attempts=MAX_ATTEMPTS):
    client = supabase_client or supabase
    record_id = record["id"]
    fields = record
    registration = str(fields.get("Registration") or "").strip().upper().replace(" ", "")
    if not registration:
        mark_manual_review(record_id, "Registration required.", worker_id=worker_id, supabase_client=client)
        return

    try:
        verify_claim(record_id, worker_id, client)
        update_progress(record_id, "VRM Lookup", "Looking up the motorcycle details.", 15, worker_id, client)
        vrm = lookup_registration(registration)
        make = str(fields.get("Make") or vrm["make"] or "").strip()
        model = str(fields.get("Model") or vrm["model"] or "").strip()
        derivative = str(fields.get("Derivative") or vrm["derivative"] or "").strip()
        derivative_id = str(fields.get("Derivative ID") or vrm["derivative_id"] or "").strip()
        bike_year = safe_int(fields.get("Year"), 0) or vrm["bike_year"]
        bike_mileage = safe_int(fields.get("Mileage"), 0)
        asking_price = money_number(fields.get("Asking Price")) or 0

        update_progress(record_id, "Loading Market Listings", "Finding current dealer listings.", 30, worker_id, client)
        all_records = load_market_records(make, model, derivative_id)

        update_progress(record_id, "Filtering Comparables", "Selecting the closest comparable motorcycles.", 50, worker_id, client)
        comparables, match_quality = select_comparables(all_records, bike_year, bike_mileage)

        update_progress(record_id, "Calculating Valuation", "Calculating market retail and suggested offer.", 70, worker_id, client)
        market = calculate_market(comparables, bike_mileage, asking_price, match_quality)
        partial_vehicle = {
            "Make": make,
            "Model": model,
            "Derivative": derivative,
            "Derivative ID": derivative_id,
            "Year": bike_year,
        }
        percayso_retail = percayso_trade = percayso_independent = percayso_franchise = days_to_sale = None
        try:
            update_progress(record_id, "Percayso Valuation", "Checking the independent valuation data.", 82, worker_id, client)
            percayso_retail, percayso_trade, percayso_independent, percayso_franchise, days_to_sale = lookup_percayso(registration, bike_mileage, worker_id, record_id)
        except Exception as exc:
            print(f"Percayso unavailable after authenticated retry; continuing with AutoTrader valuation. Reason: {safe_error(exc)}", flush=True)

        if not market:
            mark_manual_review(
                record_id,
                "Not enough reliable AutoTrader comparables were found. Percayso values have been saved where available.",
                {
                    **partial_vehicle,
                    "Comparable Count": 0,
                    "Comparable Summary": match_quality,
                    "Confidence": "No Comparables",
                    "Percayso Retail": percayso_retail,
                    "Percayso Trade": percayso_trade,
                    "Percayso Independent": percayso_independent,
                    "Percayso Franchise": percayso_franchise,
                    "Percayso Days To Sale": days_to_sale,
                },
                worker_id,
                client,
            )
            return

        market = blend_with_percayso(market, percayso_retail, asking_price)

        update_progress(record_id, "Saving Results", "Saving retail check results.", 95, worker_id, client)
        update_data = {
            **partial_vehicle,
            **market,
            "Percayso Retail": percayso_retail,
            "Percayso Trade": percayso_trade,
            "Percayso Independent": percayso_independent,
            "Percayso Franchise": percayso_franchise,
            "Percayso Days To Sale": days_to_sale,
            "Last Checked": datetime.today().strftime("%Y-%m-%d"),
            "Status": "Checked",
            "Progress Stage": "Checked",
            "Progress Message": "Retail check complete.",
            "Progress Percent": 100,
            "Completed At": now_iso(),
            "Processing Heartbeat At": now_iso(),
            "Last Error": None,
            "Worker ID": worker_id,
        }
        client.table("retail_checks").update(update_data).eq("id", record_id).eq("Status", "Processing").eq("Worker ID", worker_id).execute()
    except Exception as exc:
        print(traceback.format_exc(), flush=True)
        mark_failed(record_id, exc, worker_id, client, max_attempts)
        raise


def main():
    result = supabase.table("retail_checks").select("*").eq("Status", "Pending").order("created_at").limit(1).execute()
    if not result.data:
        print("No pending retail checks found")
        return
    record = result.data[0]
    worker_id = "manual-retail-check"
    supabase.table("retail_checks").update({"Status": "Processing", "Worker ID": worker_id, "Processing Started At": now_iso(), "Processing Heartbeat At": now_iso()}).eq("id", record["id"]).execute()
    record["Status"] = "Processing"
    record["Worker ID"] = worker_id
    process_retail_check(record, worker_id)


if __name__ == "__main__":
    main()
