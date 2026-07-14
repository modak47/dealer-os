import json
import os
import re
import traceback
from datetime import datetime, timezone
from statistics import median

import requests
from playwright.sync_api import sync_playwright
from supabase import create_client

from vrm_lookup import lookup_vrm


SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CAZOO_EMAIL = os.getenv("CAZOO_EMAIL", "")
CAZOO_PASSWORD = os.getenv("CAZOO_PASSWORD", "")
CAZOO_PROFILE_PATH = os.getenv("CAZOO_PROFILE_PATH", "/home/yesmoto/dealerbot/cazoo_profile")
HEADLESS = os.getenv("RETAIL_CHECK_HEADLESS", "false").lower() in {"1", "true", "yes"}
MAX_ATTEMPTS = int(os.getenv("RETAIL_CHECK_MAX_ATTEMPTS", "3"))

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


def load_market_records(make, model, derivative_id):
    columns = '"Listed Price","Mileage","Year","Source URL","Make","Model","Derivative ID","Dealer or Private","Listing Status","Colour","Days Live","Days On Market"'
    query = supabase.table("autotrader_listings").select(columns).eq("Dealer or Private", "Dealer").eq("Listing Status", "Active")
    if derivative_id:
        query = query.eq("Derivative ID", derivative_id)
    else:
        query = query.eq("Make", make).eq("Model", model)
    rows = query.execute().data or []
    return [{"fields": row} for row in rows]


def comparable_from_record(record):
    f = record["fields"]
    year = safe_int(f.get("Year"), None)
    mileage = safe_int(f.get("Mileage"), None)
    price = money_number(f.get("Listed Price"))
    if not year or not mileage or not price or mileage <= 100:
        return None
    return {
        "price": price,
        "mileage": mileage,
        "year": year,
        "colour": f.get("Colour", ""),
        "days": f.get("Days On Market") or f.get("Days Live") or "",
        "url": f.get("Source URL", ""),
    }


def select_comparables(all_records, bike_year, bike_mileage):
    comparables = []
    for record in all_records:
        comp = comparable_from_record(record)
        if not comp:
            continue
        if bike_year - 1 <= comp["year"] <= bike_year + 1 and bike_mileage * 0.60 <= comp["mileage"] <= bike_mileage * 1.40:
            comparables.append(comp)

    if len(comparables) < 8:
        comparables = []
        for record in all_records:
            comp = comparable_from_record(record)
            if not comp:
                continue
            if bike_year - 2 <= comp["year"] <= bike_year + 2 and bike_mileage * 0.60 <= comp["mileage"] <= bike_mileage * 1.40:
                comparables.append(comp)

    if len(comparables) < 4:
        comparables = [comp for record in all_records if (comp := comparable_from_record(record))]

    return comparables


def calculate_market(comparables):
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


def lookup_percayso(registration, bike_mileage, worker_id, record_id):
    days_to_sale = None
    percayso_retail = None
    percayso_trade = None
    percayso_independent = None
    percayso_franchise = None
    if not CAZOO_EMAIL or not CAZOO_PASSWORD:
        return percayso_retail, percayso_trade, percayso_independent, percayso_franchise, days_to_sale

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(CAZOO_PROFILE_PATH, headless=HEADLESS)
        try:
            page = context.new_page()
            page.goto("https://stock.cazoo.co.uk", wait_until="networkidle")
            update_progress(record_id, "Percayso Valuation", "Checking the independent valuation data.", 82, worker_id)
            cookies_list = context.cookies()
        finally:
            context.close()

    cookies = {cookie["name"]: cookie["value"] for cookie in cookies_list}
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "*/*", "Referer": "https://stock.cazoo.co.uk/"}
    percayso_url = (
        "https://stock.cazoo.co.uk/cfc/ajax/ajax.cfc"
        "?method=getData&base=percayso.percayso&request=getValuation&returnType=4"
        f"&vrm={registration}&mileage={bike_mileage}"
    )
    response = requests.get(percayso_url, cookies=cookies, headers=headers, timeout=15)
    response.raise_for_status()
    percayso_json = json.loads(response.text)
    if isinstance(percayso_json, str):
        percayso_json = json.loads(percayso_json)
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
        make = vrm["make"]
        model = vrm["model"]
        derivative = vrm["derivative"]
        derivative_id = vrm["derivative_id"]
        bike_year = vrm["bike_year"]
        bike_mileage = safe_int(fields.get("Mileage"), 0)

        update_progress(record_id, "Loading Market Listings", "Finding current dealer listings.", 30, worker_id, client)
        all_records = load_market_records(make, model, derivative_id)
        if derivative_id and len(all_records) < 3:
            all_records = load_market_records(make, model, None)

        update_progress(record_id, "Filtering Comparables", "Selecting the closest comparable motorcycles.", 50, worker_id, client)
        comparables = select_comparables(all_records, bike_year, bike_mileage)

        update_progress(record_id, "Calculating Valuation", "Calculating market retail and suggested offer.", 70, worker_id, client)
        market = calculate_market(comparables)
        partial_vehicle = {
            "Make": make,
            "Model": model,
            "Derivative": derivative,
            "Derivative ID": derivative_id,
            "Year": bike_year,
        }
        if not market:
            mark_manual_review(
                record_id,
                "Not enough reliable comparable motorcycles were found. This check needs manual review.",
                {**partial_vehicle, "Comparable Count": 0, "Confidence": "No Comparables"},
                worker_id,
                client,
            )
            return

        percayso_retail = percayso_trade = percayso_independent = percayso_franchise = days_to_sale = None
        try:
            update_progress(record_id, "Percayso Valuation", "Checking the independent valuation data.", 82, worker_id, client)
            percayso_retail, percayso_trade, percayso_independent, percayso_franchise, days_to_sale = lookup_percayso(registration, bike_mileage, worker_id, record_id)
        except Exception as exc:
            print(f"Percayso Error: {safe_error(exc)}", flush=True)

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
