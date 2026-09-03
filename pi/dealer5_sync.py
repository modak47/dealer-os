from playwright.sync_api import sync_playwright
import requests
import os
import re
import time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit, urlunsplit
from dotenv import load_dotenv

# Load the fixed project environment file before any os.environ reads. Using
# expanduser keeps this reliable under the existing user cron and venv setup.
load_dotenv(os.path.expanduser("~/dealerbot/.env"))

# =========================================
# LOGIN
# =========================================

USERNAME = os.environ.get("DEALER5_USERNAME")
PASSWORD = os.environ.get("DEALER5_PASSWORD")

# =========================================
# SUPABASE
# =========================================

SUPABASE_URL = "https://ejtbbpiqwytcyvromalw.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_SERVICE_ROLE_KEY must be configured for stock sync writes"
    )

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

AUTOMATION_JOB_NAME = "dealer5_sync"
SYNC_STARTED_AT = datetime.now(timezone.utc).isoformat()
SYNC_STARTED_MONOTONIC = time.monotonic()
sync_completed = False


def update_automation_job(status, last_error=None):
    try:
        payload = {
            "job_name": AUTOMATION_JOB_NAME,
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if status == "running":
            payload.update({
                "last_started": SYNC_STARTED_AT,
                "last_error": None,
                "duration_ms": None,
            })
        else:
            payload.update({
                "last_finished": datetime.now(timezone.utc).isoformat(),
                "duration_ms": int((time.monotonic() - SYNC_STARTED_MONOTONIC) * 1000),
                "last_error": last_error,
            })

        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/automation_jobs?on_conflict=job_name",
            headers=SUPABASE_HEADERS,
            json=payload,
            timeout=20
        )
        if response.status_code not in (200, 201, 204):
            print(
                f"WARNING: Could not update automation status "
                f"({response.status_code}): {response.text}"
            )
    except Exception as status_error:
        print(f"WARNING: Could not update automation status: {status_error}")


if not USERNAME or not PASSWORD:
    credential_error = "DEALER5_USERNAME and DEALER5_PASSWORD must be configured"
    update_automation_job("failed", credential_error)
    raise RuntimeError(credential_error)


# =========================================
# TRACK DEALER5 REGS
# =========================================

unsold_regs = set()
reserved_regs = set()
dealer5_visible_regs = set()
FORCE_REFRESH_IMAGES = os.environ.get("FORCE_REFRESH_IMAGES", "").strip().lower() in {"1", "true", "yes"}
MINIMUM_COMPLETE_GALLERY_IMAGES = int(os.environ.get("MINIMUM_COMPLETE_GALLERY_IMAGES", "50"))
PUBLIC_STOCK_BASE_URL = os.environ.get("PUBLIC_STOCK_BASE_URL", "https://yesmoto.co.uk").rstrip("/")


def utc_timestamp():
    return datetime.now(timezone.utc).isoformat()


def utc_date():
    return datetime.now(timezone.utc).date().isoformat()


def normalise_registration(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def image_url(value):
    if isinstance(value, dict):
        return str(value.get("url") or "").strip()
    return value.strip() if isinstance(value, str) else ""


def canonical_image_url(value):
    raw = image_url(value)
    if not raw:
        return ""
    raw = raw.replace("/w200/", "/")
    parts = urlsplit(raw)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, "", ""))


def dedupe_images(values, canonical_output=False):
    result = []
    seen = set()
    for value in values or []:
        raw = image_url(value)
        canonical = canonical_image_url(raw)
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        result.append({"url": canonical if canonical_output else raw})
    return result


def is_permanent_dealer_image(value):
    url = canonical_image_url(value).lower()
    return bool(url) and "airtableusercontent.com" not in url and (
        "cd5.uk/" in url
        or "cardealer5.co.uk/" in url
        or "/storage/v1/object/public/stock-images/" in url
    )


def is_probably_promo_image(value):
    url = canonical_image_url(value).lower()
    return bool(re.search(
        r"awaiting.?prep|awaiting.?preparation|coming.?soon|placeholder|"
        r"finance|warranty|reserve|google|review|rating|sell.?my.?bike|"
        r"part.?exchange|delivery",
        url
    ))


def real_dealer_images(values):
    return [
        item for item in permanent_dealer_images(values)
        if not is_probably_promo_image(item)
    ]


def permanent_dealer_images(values):
    return [
        item for item in dedupe_images(values, canonical_output=True)
        if is_permanent_dealer_image(item)
    ]


def extract_dealer5_gallery_images(page):
    """Collect image URLs from Dealer5's image tab, including lazy-loaded fields."""
    for _ in range(8):
        page.evaluate("""
            () => {
                const gallery = document.querySelector("#image_gallery");
                if (gallery) gallery.scrollTop = gallery.scrollHeight;
                window.scrollTo(0, document.body.scrollHeight);
            }
        """)
        page.wait_for_timeout(600)

    candidates = page.evaluate("""
        () => {
            const root = document.querySelector("#image_gallery") || document;
            const values = [];
            const push = value => {
                if (value && typeof value === "string") values.push(value.trim());
            };
            root.querySelectorAll("img, a, source, [style]").forEach(element => {
                [
                    "src",
                    "data-src",
                    "data-original",
                    "data-full",
                    "data-large",
                    "data-url",
                    "href"
                ].forEach(attribute => push(element.getAttribute(attribute)));

                const srcset = element.getAttribute("srcset");
                if (srcset) {
                    srcset.split(",").forEach(item => push(item.trim().split(/\\s+/)[0]));
                }

                const style = element.getAttribute("style") || "";
                const match = style.match(/url\\(["']?([^"')]+)["']?\\)/i);
                if (match) push(match[1]);
            });
            return values;
        }
    """)

    images = []
    seen = set()
    for raw in candidates:
        if not raw:
            continue
        src = urljoin(page.url, raw)
        if "CD5-" in src or "login5" in src:
            continue
        if "/originals/" not in src.lower():
            continue
        src = canonical_image_url(src)
        if not src or src in seen or is_probably_promo_image(src):
            continue
        seen.add(src)
        images.append({"url": src})
    return images


def stock_id_from_url(value):
    match = re.search(r"(?:[?&]id=|/)(\d{6,})(?:[/?#&]|$)", str(value or ""))
    return match.group(1) if match else ""


def public_stock_listing_html():
    for path in ("/used/cars/brighton/?stock=reset", "/used/cars/brighton/"):
        try:
            response = requests.get(
                f"{PUBLIC_STOCK_BASE_URL}{path}",
                headers={"User-Agent": "Mozilla/5.0 DealerOS image sync"},
                timeout=30
            )
            if response.status_code == 200:
                return response.text
        except Exception as error:
            log(f"Public stock listing lookup failed for {path}: {error}")
    return ""


def find_public_stock_url(stock_id):
    if not stock_id:
        return ""
    html = public_stock_listing_html()
    if not html:
        return ""
    candidates = re.findall(r"""(?:href|data-href)=["']([^"']+)["']""", html, re.I)
    for candidate in candidates:
        if stock_id not in candidate:
            continue
        try:
            return urljoin(PUBLIC_STOCK_BASE_URL, candidate)
        except Exception:
            return candidate
    return ""


def extract_public_dealer5_gallery_images(stock_id):
    public_url = find_public_stock_url(stock_id)
    if not public_url:
        log(f"{stock_id or 'UNKNOWN'} public Dealer5 advert URL not found")
        return []

    try:
        response = requests.get(
            public_url,
            headers={"User-Agent": "Mozilla/5.0 DealerOS image sync"},
            timeout=30
        )
        if response.status_code != 200:
            log(f"{stock_id} public Dealer5 advert returned {response.status_code}")
            return []
    except Exception as error:
        log(f"{stock_id} public Dealer5 advert fetch failed: {error}")
        return []

    values = []
    html = response.text
    values.extend(re.findall(r"""(?:src|href|data-src|data-original|data-large|data-full)=["']([^"']+)["']""", html, re.I))
    values.extend(re.findall(r"""url\(["']?([^"')]+)["']?\)""", html, re.I))

    images = []
    seen = set()
    marker = f"/stockimages/{stock_id}/"
    for raw in values:
        if not raw:
            continue
        src = urljoin(public_url, raw.replace("&amp;", "&"))
        if marker not in src or "/w640/" in src:
            continue
        src = canonical_image_url(src)
        if not src or src in seen or is_probably_promo_image(src):
            continue
        seen.add(src)
        images.append({"url": src})

    log(f"{stock_id} public Dealer5 advert image count: {len(images)}")
    return images


def image_url_loads(value):
    url = image_url(value)
    if not url:
        return False
    try:
        response = requests.head(
            url,
            headers={"User-Agent": "Mozilla/5.0 DealerOS image sync"},
            allow_redirects=True,
            timeout=12
        )
        content_type = response.headers.get("content-type", "")
        if response.status_code == 200 and content_type.startswith("image/"):
            return True
        if response.status_code in (403, 405, 501):
            response = requests.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 DealerOS image sync", "Range": "bytes=0-1024"},
                timeout=12
            )
            content_type = response.headers.get("content-type", "")
            return response.status_code in (200, 206) and content_type.startswith("image/")
    except Exception:
        return False
    return False


def gallery_sample_looks_live(values, sample_size=3):
    urls = [image_url(item) for item in values or [] if image_url(item)]
    if not urls:
        return False
    sample = urls[:sample_size]
    return all(image_url_loads(url) for url in sample)


def clean_numeric(value):
    try:
        digits = "".join(
            c for c in str(value or "").replace(",", "")
            if c.isdigit() or c == "."
        )
        return float(digits) if digits else 0
    except Exception:
        return 0


def is_incomplete_dealer5_stock(make, model, reg, mileage, price, image_urls):
    has_identity = bool(str(reg or "").strip()) and bool(str(make or "").strip()) and bool(str(model or "").strip())
    has_price = clean_numeric(price) > 0
    has_mileage = clean_numeric(mileage) > 0
    has_images = bool(image_urls)
    return not has_identity or (not has_price and not has_mileage and not has_images)

# =========================================
# LOGGING
# =========================================

def log(message):

    timestamp = datetime.now(timezone.utc).strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    print(f"[{timestamp}] {message}")

# =========================================
# STATUS MAPPING
# =========================================

def map_status(text):

    text = text.upper()

    if "RESERVED" in text:
        return "Reserved"

    if "SOLD" in text:
        return "Sold"

    return "In Stock"

# =========================================
# SUPABASE STOCK HELPERS
# =========================================

SUPABASE_STOCK_TABLE = "stock_bikes"
SUPABASE_STATUS_COLUMN = "status"
SUPABASE_REGISTRATION_COLUMNS = ("registration", "dealer5_id")
SUPABASE_STOCK_SELECT = (
    "dealer5_id,registration,status,sold_date,updated_at"
)
ACTIVE_STATUS_MINIMUMS = {"in stock", "reserved", "prep"}


def supabase_stock_url(query=""):
    return f"{SUPABASE_URL}/rest/v1/{SUPABASE_STOCK_TABLE}{query}"


def load_supabase_stock_records(select=SUPABASE_STOCK_SELECT, page_size=1000):
    records = []
    offset = 0

    while True:
        response = requests.get(
            supabase_stock_url(),
            headers=SUPABASE_HEADERS,
            params={
                "select": select,
                "offset": str(offset),
                "limit": str(page_size)
            },
            timeout=30
        )

        if response.status_code != 200:
            raise RuntimeError(
                f"Supabase stock load failed ({response.status_code}): {response.text}"
            )

        rows = response.json()
        records.extend(rows)

        if len(rows) < page_size:
            return records

        offset += page_size


def existing_supabase_status_values(records):
    return sorted({
        str(row.get(SUPABASE_STATUS_COLUMN) or "").strip()
        for row in records
        if str(row.get(SUPABASE_STATUS_COLUMN) or "").strip()
    })


def active_supabase_status_values(records):
    return [
        status for status in existing_supabase_status_values(records)
        if status.lower() in ACTIVE_STATUS_MINIMUMS
    ]


def active_supabase_stock_records(records, active_status_values):
    active = []
    active_status_lookup = {status.lower() for status in active_status_values}

    for row in records:
        status = str(row.get(SUPABASE_STATUS_COLUMN) or "").strip()
        if status.lower() not in active_status_lookup:
            continue

        reg = normalise_registration(
            row.get("registration") or row.get("dealer5_id")
        )
        if not reg:
            continue

        copy = dict(row)
        copy["_normalised_registration"] = reg
        active.append(copy)

    return active


# =========================================
# UPSERT SUPABASE STOCK BIKE
# =========================================

def load_supabase_stock_images(reg):
    response = requests.get(
        supabase_stock_url(),
        headers=SUPABASE_HEADERS,
        params={"dealer5_id": f"eq.{reg}", "select": "image_urls", "limit": "1"},
        timeout=30
    )
    if response.status_code != 200:
        raise RuntimeError(f"Supabase image lookup failed ({response.status_code})")
    rows = response.json()
    return rows[0].get("image_urls") or [] if rows else []

def upsert_supabase_stock_bike(
    make,
    model,
    reg,
    mileage,
    year,
    price,
    status,
    image_urls,
    notes_text,
    source_url,
    detail_data
):
    def clean_int(value):
        try:
            digits = "".join(
                c for c in str(value).replace(",", "")
                if c.isdigit()
            )
            return int(digits) if digits else None
        except:
            return None

    def clean_price(value):
        try:
            return float("".join(
                c for c in str(value)
                if c.isdigit() or c == "."
            ))
        except:
            return None

    incoming_images = [image_url(item) for item in real_dealer_images(image_urls)]
    try:
        stored_images = load_supabase_stock_images(reg)
        stored_unique_images = [
            image_url(item)
            for item in dedupe_images(stored_images, canonical_output=True)
        ]
        stored_real_images = [image_url(item) for item in real_dealer_images(stored_unique_images)]
        incoming_has_better_gallery = len(incoming_images) > len(stored_real_images)
        stored_gallery_looks_incomplete = len(stored_real_images) < MINIMUM_COMPLETE_GALLERY_IMAGES
        stored_gallery_looks_dead = stored_real_images and not gallery_sample_looks_live(stored_real_images)
        if (
            stored_real_images
            and not incoming_has_better_gallery
            and not stored_gallery_looks_incomplete
            and not stored_gallery_looks_dead
            and not FORCE_REFRESH_IMAGES
        ):
            clean_images = stored_real_images
            log(f"{reg} preserving existing Supabase photo order ({len(clean_images)} real Dealer5 images)")
        else:
            clean_images = incoming_images or stored_real_images
            if FORCE_REFRESH_IMAGES:
                reason = "forced refresh"
            elif incoming_has_better_gallery:
                reason = f"Dealer5 has better gallery ({len(incoming_images)} > {len(stored_real_images)})"
            elif stored_gallery_looks_incomplete:
                reason = f"stored gallery incomplete ({len(stored_real_images)} < {MINIMUM_COMPLETE_GALLERY_IMAGES})"
            elif stored_gallery_looks_dead:
                reason = "stored Dealer5 image sample returns non-image/404 responses"
            else:
                reason = "empty or non-real image array"
            log(f"{reg} replacing Supabase images from Dealer5 ({len(clean_images)} images; {reason})")
    except Exception as image_lookup_error:
        clean_images = None
        log(f"{reg} Supabase image lookup failed; leaving stored photo order untouched: {image_lookup_error}")

    fields = detail_data.get("fields", {})
    specifications = detail_data.get("specifications", {})
    features = detail_data.get("features", [])
    description = detail_data.get("description", "")
    quarantine_incomplete = is_incomplete_dealer5_stock(make, model, reg, mileage, price, clean_images or incoming_images)

    def detail_value(*wanted_labels):
        wanted = [
            "".join(c for c in label.lower() if c.isalnum())
            for label in wanted_labels
        ]

        for source in (fields, specifications):
            for label, value in source.items():
                clean_label = "".join(
                    c for c in str(label).lower()
                    if c.isalnum()
                )

                if any(
                    target == clean_label
                    or target in clean_label
                    for target in wanted
                ):
                    return value

        return None

    pricing = {
        label: value
        for label, value in {**specifications, **fields}.items()
        if any(
            word in str(label).lower()
            for word in (
                "price",
                "monthly",
                "finance",
                "deposit",
                "retail",
                "vat"
            )
        )
    }

    payload = {
        "dealer5_id": reg,
        "registration": reg,
        "make": make,
        "model": model,
        "variant": detail_value("variant", "derivative", "trim"),
        "mileage": clean_int(mileage),
        "year": clean_int(str(year).split("(")[0]),
        "vin": detail_value("vin", "chassis number"),
        "colour": detail_value("colour", "color"),
        "engine_cc": clean_int(detail_value("engine size", "engine cc", "capacity")),
        "price": clean_price(price),
        "status": status,
        # "advert_title": detail_data.get("advert_title") or f"{make} {model}".strip(),
        "stock_number": detail_value("stock number", "stock id"),
        "category": detail_value("category", "vehicle category"),
        "body_style": detail_value("body style", "body type"),
        "fuel": detail_value("fuel", "fuel type"),
        "transmission": detail_value("transmission", "gearbox"),
        "description": description,
        "service_history": detail_value("service history"),
        "vat_status": detail_value("vat", "vat status"),
        "source_url": source_url,
        "specifications": specifications,
        "features": features,
        "pricing": pricing,
        "dealer5_data": detail_data,
        "dealer5_updated_at": utc_timestamp(),
        "notes": notes_text,
        "updated_at": utc_timestamp(),
        "is_test_record": quarantine_incomplete,
        "show_on_website": False
    }

    if quarantine_incomplete:
        payload["notes"] = (
            f"{notes_text}\n\nDealer5 sync quarantine: incomplete stock data "
            f"(identity, price/mileage or live images missing). Fix in Dealer5 to restore."
        ).strip()
        log(f"{reg} quarantined from normal stock view because Dealer5 data is incomplete")

    if clean_images is not None:
        payload["image_urls"] = clean_images
        payload["primary_image_url"] = clean_images[0] if clean_images else None

    response = requests.post(
        supabase_stock_url("?on_conflict=dealer5_id"),
        headers=SUPABASE_HEADERS,
        json=payload,
        timeout=30
    )

    if response.status_code in [200, 201, 204]:
        log(f"Upserted Supabase stock bike for {reg}")
    else:
        log(f"Supabase stock upsert failed for {reg}")
        print(response.text)


# =========================================
# MARK SUPABASE STOCK BIKE AS SALE COMPLETED
# =========================================

def mark_supabase_stock_bike_sale_completed(stock_record):
    reg = stock_record["_normalised_registration"]
    dealer5_id = stock_record.get("dealer5_id")
    registration = stock_record.get("registration")

    payload = {
        "status": "Sale Completed",
        "updated_at": utc_timestamp()
    }

    if not stock_record.get("sold_date"):
        payload["sold_date"] = utc_date()

    if dealer5_id:
        params = {"dealer5_id": f"eq.{dealer5_id}"}
    elif registration:
        params = {"registration": f"eq.{registration}"}
    else:
        log(f"{reg} cannot be marked Sale Completed because it has no Supabase identifier")
        return

    response = requests.patch(
        supabase_stock_url(),
        headers=SUPABASE_HEADERS,
        params=params,
        json=payload,
        timeout=30
    )

    if response.status_code in [200, 204]:
        log(f"Marked Supabase stock bike as Sale Completed for {reg}")
    else:
        log(f"Failed marking Supabase stock bike as sold for {reg}")
        print(response.text)


# =========================================
# EXTRACT DEALER5 DETAIL DATA
# =========================================

def extract_dealer5_detail_data(page):

    try:

        return page.evaluate("""
            () => {
                const clean = value => (value || '').replace(/\\s+/g, ' ').trim();
                const fields = {};
                const specifications = {};
                const features = [];

                const put = (target, label, value) => {
                    label = clean(label).replace(/:$/, '');
                    value = clean(value);

                    if (label && value && label.length < 100) {
                        target[label] = value;
                    }
                };

                document.querySelectorAll('table tr').forEach(row => {
                    const cells = [...row.querySelectorAll('th, td')]
                        .map(cell => clean(cell.innerText));

                    if (cells.length >= 2) {
                        put(specifications, cells[0], cells.slice(1).join(' '));
                    }
                });

                document.querySelectorAll('input, select, textarea').forEach(input => {
                    const type = (input.type || '').toLowerCase();

                    if (['hidden', 'password', 'submit', 'button'].includes(type)) {
                        return;
                    }

                    if ((type === 'checkbox' || type === 'radio') && !input.checked) {
                        return;
                    }

                    const id = input.id;
                    const explicitLabel = id
                        ? document.querySelector(`label[for="${CSS.escape(id)}"]`)
                        : null;
                    const wrappingLabel = input.closest('label');
                    const label = clean(
                        explicitLabel?.innerText
                        || wrappingLabel?.innerText
                        || input.name
                        || input.id
                    );
                    const value = input.tagName === 'SELECT'
                        ? clean(input.selectedOptions?.[0]?.textContent || input.value)
                        : clean(input.value);

                    put(fields, label, value);

                    if ((type === 'checkbox' || type === 'radio') && input.checked) {
                        features.push(label || value);
                    }
                });

                document.querySelectorAll(
                    '#features li, .features li, [class*="feature"] li, [id*="feature"] li'
                ).forEach(item => {
                    const value = clean(item.innerText);
                    if (value) features.push(value);
                });

                const descriptionEntry = Object.entries(fields).find(([label]) =>
                    /description|advert text|vehicle details|sales text/i.test(label)
                );

                const descriptionElement = document.querySelector(
                    '[data-field="description"], #description, .vehicle-description, .advert-description'
                );

                const description = clean(
                    descriptionEntry?.[1]
                    || descriptionElement?.innerText
                    || descriptionElement?.textContent
                );

                return {
                    advert_title: clean(document.querySelector('h1')?.innerText || document.title),
                    description,
                    fields,
                    specifications,
                    features: [...new Set(features.filter(Boolean))],
                    page_url: window.location.href,
                    captured_at: new Date().toISOString()
                };
            }
        """)

    except Exception as error:

        log(f"Dealer5 detail extraction failed: {error}")

        return {
            "advert_title": "",
            "description": "",
            "fields": {},
            "specifications": {},
            "features": [],
            "page_url": page.url,
            "captured_at": utc_timestamp()
        }


# =========================================
# DEALER5 PAGE SAFETY
# =========================================

def is_dealer5_auth_page(page):
    url = page.url.lower()
    if "login" in url or "admin.php" in url or "not_authed" in url:
        return True

    try:
        password_fields = page.locator('input[type="password"]').count()
        login_buttons = page.locator('input[type="submit"]').count()
        return password_fields > 0 and login_buttons > 0
    except:
        return False


# =========================================
# SCRAPE CURRENT PAGE
# =========================================

def scrape_current_page(page, context, forced_status=None, registration_set=None):

    try:

        page.wait_for_timeout(3000)

        if is_dealer5_auth_page(page):
            log("Dealer5 scrape blocked by authentication page")
            return {
                "ok": False,
                "row_count": 0,
                "row_errors": 0
            }

        page.wait_for_selector("table tbody", timeout=30000)

        return_url = page.url
        row_errors = 0

        row_count = page.locator("table tbody tr").count()

    except Exception as error:

        log(f"Dealer5 table did not load correctly: {error}")
        return {
            "ok": False,
            "row_count": 0,
            "row_errors": 0
        }

    log(f"Found {row_count} rows")

    for i in range(row_count):

        try:

            rows = page.locator("table tbody tr")
            row = rows.nth(i)

            log(f"Processing row {i+1}")

            bike_name = ""
            reg = ""
            source_url = ""
            detail_data = {
                "advert_title": "",
                "description": "",
                "fields": {},
                "specifications": {},
                "features": [],
                "page_url": "",
                "captured_at": ""
            }

            try:

                first_td = row.locator("td").nth(0)

                description = first_td.inner_text(
                    timeout=3000
                )

                lines = [
                    l.strip()
                    for l in description.splitlines()
                    if l.strip()
                ]

                if len(lines) >= 1:
                    bike_name = lines[0]

                for line in reversed(lines):

                    cleaned = (
                        line.replace(" ", "")
                        .upper()
                        .strip()
                    )

                    if (
                        len(cleaned) >= 5
                        and len(cleaned) <= 8
                        and any(c.isalpha() for c in cleaned)
                        and any(c.isdigit() for c in cleaned)
                    ):

                        reg = cleaned
                        break

            except:
                pass

            reg_key = reg.upper().strip()

            # =====================================
            # IMAGES
            # =====================================

            existing_images = []
            try:
                if reg_key:
                    existing_images = load_supabase_stock_images(reg_key)
            except Exception as error:
                log(f"{reg_key or 'UNKNOWN'} Supabase image lookup failed: {error}")

            existing_unique_images = dedupe_images(
                existing_images,
                canonical_output=True
            )
            existing_permanent_images = permanent_dealer_images(
                existing_unique_images
            )
            existing_real_images = real_dealer_images(
                existing_unique_images
            )
            fetched_images = []
            fetched_images_successfully = False
            should_scrape_images = (
                FORCE_REFRESH_IMAGES
                or not existing_unique_images
                or len(existing_permanent_images) != len(existing_unique_images)
                or len(existing_real_images) < MINIMUM_COMPLETE_GALLERY_IMAGES
            )
            image_urls = []

            image_count = len(existing_unique_images)
            log(f"{reg_key or 'UNKNOWN'} existing image count: {len(existing_images)}")
            log(f"{reg_key or 'UNKNOWN'} existing unique canonical image count: {image_count}")
            log(f"{reg_key or 'UNKNOWN'} permanent Dealer5/CD5 image count: {len(existing_permanent_images)}")
            log(f"{reg_key or 'UNKNOWN'} real Dealer5/CD5 image count: {len(existing_real_images)}")
            if should_scrape_images:
                log(f"{reg_key or 'UNKNOWN'} scraping Dealer5 image tab")
            else:
                log(f"{reg_key or 'UNKNOWN'} existing gallery looks complete; image scrape skipped")

            if True:

                try:

                    bike_link = row.locator(
                        "a"
                    ).nth(1).get_attribute("href")

                    if bike_link.startswith("/"):

                        bike_link = (
                            "https://dealers.cardealer5.co.uk/dms"
                            + bike_link
                        )

                    source_url = bike_link

                    images_link = bike_link

                    if "activetab=images" not in images_link:

                        if "?" in images_link:
                            images_link += "&activetab=images"

                        else:
                            images_link += "?activetab=images"

                    print("OPENING URL:", images_link)

                    page.goto(
                        images_link,
                        timeout=60000
                    )

                    # ============================
                    # RE-LOGIN
                    # ============================

                    if (
                        "admin.php" in page.url
                        or "not_authed" in page.url
                    ):

                        log(
                            "Session expired - logging back in"
                        )

                        page.fill(
                            'input[type="text"]',
                            USERNAME
                        )

                        page.fill(
                            'input[type="password"]',
                            PASSWORD
                        )

                        page.click(
                            'input[type="submit"]'
                        )

                        page.wait_for_timeout(5000)

                    # ============================
                    # CLOSE POPUPS
                    # ============================

                    for i in range(3):

                        try:

                            page.locator(
                                "text=REMIND ME LATER"
                            ).click(
                                timeout=2000,
                                no_wait_after=True
                            )

                            log(
                                "Closed security popup"
                            )

                            page.wait_for_timeout(1000)

                        except:

                            break

                    # ============================
                    # RELOAD IMAGE PAGE
                    # ============================

                    page.goto(
                        images_link,
                        timeout=60000
                    )

                    page.wait_for_timeout(5000)

                    # ============================
                    # TELEGRAM PAGE
                    # ============================

                    if "TelegramStaticPage.php" in page.url:

                        log("Telegram popup detected")

                        try:

                            page.locator(
                                "text=REMIND ME LATER"
                            ).click(
                                timeout=5000,
                                no_wait_after=True
                            )

                            log(
                                "Closed security popup"
                            )

                            page.wait_for_timeout(3000)

                            page.goto(
                                images_link,
                                timeout=60000
                            )

                            page.wait_for_timeout(5000)

                        except Exception as e:

                            log(
                                f"Popup close failed: {e}"
                            )


                    # ============================
                    # SCRAPE IMAGES
                    # ============================

                    detail_data = extract_dealer5_detail_data(page)

                    gallery_imgs = page.locator(
                        '#image_gallery .image-container img.cursor-pointer'
                    )

                    visible_img_count = gallery_imgs.count()
                    fetched_images = (
                        extract_dealer5_gallery_images(page)
                        if should_scrape_images
                        else []
                    )
                    img_count = len(fetched_images) if should_scrape_images else 0

                    log(
                        f"Found {img_count} usable images ({visible_img_count} visible image elements)"
                    )

                    if not should_scrape_images:
                        log(f"{reg_key or 'UNKNOWN'} image scrape skipped; existing images retained")

                    fetched_images_successfully = should_scrape_images and img_count > 0

                    # ============================
                    # RETURN TO STOCK
                    # ============================



                    page.goto(
                        return_url,
                        timeout=60000
                    )

                    page.wait_for_timeout(5000)

                except Exception as e:

                    log(
                        f"Image scrape failed: {e}"
                    )

            fetched_unique_images = real_dealer_images(fetched_images)
            fetched_gallery_live = gallery_sample_looks_live(fetched_unique_images) if fetched_unique_images else False
            if fetched_unique_images and not fetched_gallery_live:
                log(f"{reg_key or 'UNKNOWN'} admin Dealer5 image sample failed live check")

            should_use_public_fallback = should_scrape_images and (
                not fetched_unique_images
                or not fetched_gallery_live
                or len(fetched_unique_images) < MINIMUM_COMPLETE_GALLERY_IMAGES
            )
            if should_use_public_fallback:
                public_images = real_dealer_images(
                    extract_public_dealer5_gallery_images(stock_id_from_url(source_url))
                )
                public_gallery_live = gallery_sample_looks_live(public_images) if public_images else False
                if public_images and public_gallery_live and (
                    not fetched_gallery_live or len(public_images) >= len(fetched_unique_images)
                ):
                    fetched_unique_images = public_images
                    fetched_images_successfully = True
                    log(f"{reg_key or 'UNKNOWN'} using public Dealer5 advert gallery ({len(public_images)} images)")
                elif public_images:
                    log(f"{reg_key or 'UNKNOWN'} public Dealer5 gallery found but did not pass selection ({len(public_images)} images, live={public_gallery_live})")

            image_urls = (
                fetched_unique_images
                if fetched_images_successfully and fetched_unique_images
                else existing_real_images
            )
            log(f"{reg_key or 'UNKNOWN'} fetched image count: {len(fetched_unique_images)}")
            log(f"{reg_key or 'UNKNOWN'} final deduped count: {len(image_urls)}")

            

            # =====================================
            # TABLE DATA
            # =====================================

            tds = row.locator("td")

            mileage = ""
            year = ""
            price = ""

            try:
                mileage = tds.nth(4).inner_text().strip()
            except:
                pass

            try:
                year = tds.nth(5).inner_text().strip()
            except:
                pass

            try:
                price = tds.nth(6).inner_text().strip()
            except:
                pass
            

            # =====================================
            # STATUS
            # =====================================

            row_text = row.inner_text()

            status = forced_status or map_status(row_text)
            
            notes_text = ""

            detail_data["stock_summary"] = {
                "bike_name": bike_name,
                "registration": reg,
                "mileage": mileage,
                "year": year,
                "price": price,
                "status": status,
                "source_url": source_url
            }

            print("========================")
            print("BIKE:", bike_name)
            print("REG:", reg)
            print("MILEAGE:", mileage)
            print("YEAR:", year)
            print("PRICE:", price)
            print("STATUS:", status)
            print("NOTES:", notes_text)

            normalised_reg = normalise_registration(reg_key)
            if normalised_reg:
                dealer5_visible_regs.add(normalised_reg)
                if registration_set is not None:
                    registration_set.add(normalised_reg)
            

            # =====================================
            # MAKE / MODEL
            # =====================================

            make = ""
            model = ""

            try:

                parts = bike_name.split(" ", 1)

                make = parts[0]

                if len(parts) > 1:
                    model = parts[1]

            except:
                pass

            # =====================================
            # UPSERT SUPABASE
            # =====================================

            upsert_supabase_stock_bike(
                make,
                model,
                reg,
                mileage,
                year,
                price,
                status,
                image_urls,
                notes_text,
                source_url,
                detail_data
            )

        except Exception as e:

            row_errors += 1
            log(f"Error on row {i+1}: {e}")

    return {
        "ok": row_errors == 0,
        "row_count": row_count,
        "row_errors": row_errors
    }


# =========================================
# MAIN
# =========================================

update_automation_job("running")

try:

    with sync_playwright() as p:

        browser = p.chromium.launch(
            headless=True
        )

        context = browser.new_context()

        page = context.new_page()

        page.set_default_timeout(30000)

        # =====================================
        # LOGIN
        # =====================================

        page.goto(
            "https://dealers.cardealer5.co.uk/dms/login"
        )

        page.wait_for_selector(
            'input[type="text"]',
            timeout=60000
        )

        page.fill(
            'input[type="text"]',
            USERNAME
        )

        page.fill(
            'input[type="password"]',
            PASSWORD
        )


        page.locator(
            'input[type="submit"]'
        ).click()

        page.wait_for_load_state(
            "networkidle"
        )

        login_succeeded = not is_dealer5_auth_page(page)
        if not login_succeeded:
            raise RuntimeError("Dealer5 login did not complete successfully")

        log("Logged in")

        # =====================================
        # STOCK PAGE
        # =====================================

        page.goto(
            "https://dealers.cardealer5.co.uk/dms/stock"
        )

        page.wait_for_timeout(5000)

        log("Stock page loaded")

        # =====================================
        # LOAD SUPABASE STOCK
        # =====================================

        supabase_stock_records = load_supabase_stock_records()
        status_values = existing_supabase_status_values(supabase_stock_records)

        log(f"Loaded {len(supabase_stock_records)} Supabase stock records")
        log(f"Existing Supabase status values: {', '.join(status_values) or 'none'}")

        # =====================================
        # UNSOLD
        # =====================================

        log("UNSOLD")

        unsold_result = scrape_current_page(
            page,
            context,
            forced_status="In Stock",
            registration_set=unsold_regs
        )

        # =====================================
        # RESERVED
        # =====================================

        log("RESERVED")

        page.goto(
            "https://dealers.cardealer5.co.uk/dms/stock/reserved"
        )

        page.wait_for_timeout(5000)

        reserved_result = scrape_current_page(
            page,
            context,
            forced_status="Reserved",
            registration_set=reserved_regs
        )

        # =====================================
        # MARK MISSING ACTIVE BIKES SALE COMPLETED
        # =====================================

        log(f"Dealer5 Unsold registrations: {len(unsold_regs)}")
        log(f"Dealer5 Reserved registrations: {len(reserved_regs)}")
        log(f"Total Dealer5 visible registrations: {len(dealer5_visible_regs)}")

        log("CHECKING SOLD BIKES")

        if login_succeeded and unsold_result["ok"] and reserved_result["ok"]:
            supabase_stock_records = load_supabase_stock_records()
            active_status_values = active_supabase_status_values(supabase_stock_records)
            active_supabase_records = active_supabase_stock_records(
                supabase_stock_records,
                active_status_values
            )

            log(f"Loaded {len(active_supabase_records)} active Supabase stock records")
            log(f"Active Supabase status values: {', '.join(active_status_values) or 'none'}")
            log("Checking active Supabase stock for missing bikes")

            for stock_record in active_supabase_records:
                reg = stock_record["_normalised_registration"]

                if reg not in dealer5_visible_regs:
                    log(f"{reg} missing from Dealer5 - marking Sale Completed")
                    mark_supabase_stock_bike_sale_completed(stock_record)
        else:
            log(
                "Skipping missing-bike Sale Completed check because one or more Dealer5 scrapes failed"
            )

        browser.close()

        failed_sections = []
        if not unsold_result["ok"]:
            failed_sections.append(
                f"unsold scrape failed or had {unsold_result['row_errors']} row errors"
            )
        if not reserved_result["ok"]:
            failed_sections.append(
                f"reserved scrape failed or had {reserved_result['row_errors']} row errors"
            )

        if failed_sections:
            update_automation_job("failed", "; ".join(failed_sections))
        else:
            update_automation_job("success")
        sync_completed = True

except Exception as e:

    log(f"SCRIPT CRASHED: {e}")
    update_automation_job("failed", str(e))
