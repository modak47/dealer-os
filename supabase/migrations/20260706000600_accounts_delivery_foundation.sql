from playwright.sync_api import sync_playwright
import requests
import os
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit

# =========================================
# LOGIN
# =========================================

USERNAME = os.environ.get("DEALER5_USERNAME")
PASSWORD = os.environ.get("DEALER5_PASSWORD")

if not USERNAME or not PASSWORD:
    raise RuntimeError("DEALER5_USERNAME and DEALER5_PASSWORD must be configured")

# =========================================
# AIRTABLE
# =========================================

AIRTABLE_TOKEN = os.environ.get("AIRTABLE_API_KEY")
BASE_ID = os.environ.get("AIRTABLE_BASE_ID")
TABLE_NAME = os.environ.get("AIRTABLE_STOCK_TABLE_NAME", "Motorcycles stock")

HEADERS = {
    "Authorization": f"Bearer {AIRTABLE_TOKEN}",
    "Content-Type": "application/json"
}


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


# =========================================
# TRACK DEALER5 REGS
# =========================================

dealer5_regs = set()
FORCE_REFRESH_IMAGES = os.environ.get("FORCE_REFRESH_IMAGES", "").strip().lower() in {"1", "true", "yes"}


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


def is_durable_dealer_image(value):
    """True for permanent Dealer5/CD5 images; false for expiring Airtable URLs."""
    url = canonical_image_url(value).lower()
    return bool(url) and (
        "cd5.uk/" in url
        or "cardealer5.co.uk/" in url
    ) and "airtableusercontent.com" not in url


def durable_images(values):
    return [item for item in dedupe_images(values, canonical_output=True) if is_durable_dealer_image(item)]

# =========================================
# LOGGING
# =========================================

def log(message):

    timestamp = datetime.now().strftime(
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
# LOAD AIRTABLE RECORDS
# =========================================

def load_airtable_records():

    airtable_records = {}

    url = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_NAME}"

    if not AIRTABLE_TOKEN or not BASE_ID:
        log("Airtable not configured; continuing with direct Dealer5 to Supabase sync")
        return {}

    response = requests.get(
        url,
        headers=HEADERS,
        timeout=30
    )

    data = response.json()

    for record in data.get("records", []):

        fields = record.get("fields", {})

        reg = fields.get("Registration Number")

        if reg:

            reg_clean = str(reg).strip().upper()

            airtable_records[reg_clean] = {
                "id": record["id"],
                "Mileage": fields.get("Mileage"),
                "Year": fields.get("Year"),
                "Sale Price": fields.get("Sale Price"),
                "Current Status": fields.get("Current Status"),
                "Stock Image": fields.get("Stock Image")
            }

    return airtable_records

# =========================================
# UPDATE AIRTABLE RECORD
# =========================================

def update_airtable_record(
    record_id,
    reg,
    mileage,
    year,
    price,
    status,
    image_urls,
    notes_text,
    update_images=True
):

    # =====================================
    # CLEAN PRICE
    # =====================================

    clean_price = 0

    try:

        clean_price = float(
            ''.join(c for c in price if c.isdigit() or c == '.')
        )

    except:
        pass

    # =====================================
    # CLEAN MILEAGE
    # =====================================

    clean_mileage = 0

    try:

        clean_mileage = int(
            mileage.replace(",", "").strip()
        )

    except:
        pass

    # =====================================
    # CLEAN YEAR
    # =====================================

    clean_year = None

    try:

        clean_year = int(
            year.split("(")[0].strip()
        )

    except:
        pass

    # =====================================
    # FIELDS
    # =====================================

    fields = {
        "Registration Number": reg,
        "Mileage": clean_mileage,
        "Year": clean_year,
        "Sale Price": clean_price,
        "Current Status": status,
        "Condition and Notes": notes_text,
    }

    # =====================================
    # IMAGE
    # =====================================

    if image_urls and update_images:

        fields["Stock Image"] = image_urls

    # =====================================
    # UPDATE
    # =====================================

    if not AIRTABLE_TOKEN or not BASE_ID:
        return

    url = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_NAME}/{record_id}"

    data = {
        "fields": fields
    }

    response = requests.patch(
        url,
        headers=HEADERS,
        json=data,
        timeout=30
    )

    if response.status_code == 200:

        log(f"Updated Airtable for {reg}")

    else:

        log(f"Airtable update failed for {reg}")
        print(response.text)

# =========================================
# CREATE AIRTABLE RECORD
# =========================================

def create_airtable_record(
    make,
    model,
    reg,
    mileage,
    year,
    price,
    status,
    image_urls,
    notes_text
):

    if not AIRTABLE_TOKEN or not BASE_ID:
        return

    clean_price = 0

    try:
        clean_price = float(
            ''.join(c for c in price if c.isdigit() or c == '.')
        )
    except:
        pass

    clean_mileage = 0

    try:
        clean_mileage = int(
            mileage.replace(",", "").strip()
        )
    except:
        pass

    clean_year = None

    try:
        clean_year = int(
            year.split("(")[0].strip()
        )
    except:
        pass

    fields = {
        "Registration Number": reg,
        "Make": make,
        "Model": model,
        "Mileage": clean_mileage,
        "Year": clean_year,
        "Sale Price": clean_price,
        "Current Status": status,
        "Valeting Pending": "Not started",
        "Workshop Status": "Not started",
        "Photo Pending": "Not started",
        "Detailing": "Not started",
        "Ready For Sale": "Not Ready",
        "Condition and Notes": notes_text
    }

    if image_urls:
        fields["Stock Image"] = image_urls

    url = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_NAME}"

    data = {
        "fields": fields
    }

    response = requests.post(
        url,
        headers=HEADERS,
        json=data,
        timeout=30
    )

    if response.status_code == 200:
        log(f"Created Airtable record for {reg}")
    else:
        log(f"Failed to create Airtable record for {reg}")
        print(response.text)


# =========================================
# UPSERT SUPABASE STOCK BIKE
# =========================================

def load_supabase_stock_images(reg):
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/stock_bikes",
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

    incoming_images = [image_url(item) for item in dedupe_images(image_urls, canonical_output=True)]
    try:
        stored_images = load_supabase_stock_images(reg)
        stored_unique_images = [image_url(item) for item in dedupe_images(stored_images, canonical_output=True)]
        stored_durable_images = [url for url in stored_unique_images if is_durable_dealer_image(url)]
        if stored_durable_images and len(stored_durable_images) == len(stored_unique_images) and not FORCE_REFRESH_IMAGES:
            clean_images = stored_durable_images
            log(f"{reg} preserving existing durable Supabase photo order ({len(clean_images)} unique images)")
        else:
            clean_images = incoming_images
            reason = "forced refresh" if FORCE_REFRESH_IMAGES else "empty or temporary/expired image URLs"
            log(f"{reg} replacing Supabase photo order from Dealer5 ({len(clean_images)} images; {reason})")
    except Exception as image_lookup_error:
        clean_images = None
        log(f"{reg} Supabase image lookup failed; leaving stored photo order untouched: {image_lookup_error}")

    fields = detail_data.get("fields", {})
    specifications = detail_data.get("specifications", {})
    features = detail_data.get("features", [])
    description = detail_data.get("description", "")

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
        "dealer5_updated_at": datetime.utcnow().isoformat(),
        "notes": notes_text,
        "updated_at": datetime.utcnow().isoformat()
    }

    if clean_images is not None:
        payload["image_urls"] = clean_images
        payload["primary_image_url"] = clean_images[0] if clean_images else None

    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/stock_bikes?on_conflict=dealer5_id",
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
# MARK SUPABASE STOCK BIKE AS SOLD
# =========================================

def mark_supabase_stock_bike_sold(reg):

    current = requests.get(
        f"{SUPABASE_URL}/rest/v1/stock_bikes",
        headers=SUPABASE_HEADERS,
        params={"dealer5_id": f"eq.{reg}", "select": "status"},
        timeout=30
    )

    if current.status_code == 200 and any(
        str(row.get("status") or "").strip().lower() == "reserved"
        for row in current.json()
    ):
        log(f"Skipping Sale Completed for reserved Supabase bike {reg}")
        return

    payload = {
        "status": "Sale Completed",
        "sold_date": datetime.utcnow().date().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }

    response = requests.patch(
        f"{SUPABASE_URL}/rest/v1/stock_bikes",
        headers=SUPABASE_HEADERS,
        params={
            "dealer5_id": f"eq.{reg}"
        },
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
            "captured_at": datetime.utcnow().isoformat()
        }


# =========================================
# SCRAPE CURRENT PAGE
# =========================================

def scrape_current_page(page, airtable_records, context, forced_status=None):

    page.wait_for_timeout(3000)

    page.wait_for_selector("table tbody", timeout=30000)

    return_url = page.url
    row_errors = 0

    row_count = page.locator("table tbody tr").count()

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

            # Supabase is the ordered image source of truth. Airtable attachment
            # URLs are signed and expire, so they must never decide whether the
            # Dealer5 gallery is scraped.
            existing_images = []
            try:
                existing_images = load_supabase_stock_images(reg_key) if reg_key else []
            except Exception as existing_error:
                log(f"{reg_key or 'UNKNOWN'} could not load Supabase images: {existing_error}")

            existing_unique_images = dedupe_images(existing_images, canonical_output=True)
            existing_durable_images = durable_images(existing_unique_images)
            existing_images_have_duplicates = len(existing_images) != len(existing_unique_images)
            fetched_images = []
            fetched_images_successfully = False
            should_scrape_images = (
                FORCE_REFRESH_IMAGES
                or not existing_unique_images
                or len(existing_durable_images) != len(existing_unique_images)
            )
            image_urls = []

            image_count = len(existing_unique_images)
            log(f"{reg_key or 'UNKNOWN'} existing image count: {len(existing_images)}")
            log(f"{reg_key or 'UNKNOWN'} existing unique canonical image count: {image_count}")
            log(f"{reg_key or 'UNKNOWN'} existing durable Dealer5 image count: {len(existing_durable_images)}")

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

                    img_count = gallery_imgs.count() if should_scrape_images else 0

                    log(
                        f"Found {img_count} images"
                    )

                    if not should_scrape_images:
                        log(f"{reg_key or 'UNKNOWN'} image scrape skipped; existing images retained")

                    added = set()

                    for x in range(img_count):

                        # ============================
                        # SKIP PROMO GRAPHICS
                        # ============================

                        if x < 10 and x % 2 == 1:
                            continue

                        try:

                            src = gallery_imgs.nth(
                                x
                            ).get_attribute("src")



                            print("RAW SRC:", src)

                            if not src:
                                continue

                            if (
                                "CD5-" in src
                                or "login5" in src
                            ):
                                continue

                            if (
                                "/originals/"
                                not in src.lower()
                            ):
                                continue

                            if src.startswith("//"):

                                src = "https:" + src

                            elif src.startswith("/"):

                                src = (
                                    "https://dealers.cardealer5.co.uk"
                                    + src
                                )

                            src = canonical_image_url(src)

                            # ============================
                            # FILTER PROMO GRAPHICS
                            # ============================

                            print("FINAL SRC:", src)

                            if src not in added:

                                added.add(src)

                                fetched_images.append({
                                    "url": src
                                })

                        except Exception as e:

                            print("IMAGE ERROR:", e)

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

            fetched_unique_images = dedupe_images(fetched_images, canonical_output=True)
            image_urls = fetched_unique_images if fetched_images_successfully and fetched_unique_images else existing_durable_images
            # Airtable is retained only for legacy stock fields. Do not write
            # image attachments: Supabase now receives Dealer5 URLs directly.
            airtable_images_changed = False
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

            dealer5_regs.add(reg_key)
            

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
            # UPDATE OR CREATE
            # =====================================

            if reg_key in airtable_records:

                record_id = airtable_records[reg_key]["id"]

                update_airtable_record(
                    record_id,
                    reg,
                    mileage,
                    year,
                    price,
                    status,
                    [],
                    notes_text,
                    update_images=False
                )

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

            else:

                create_airtable_record(
                    make,
                    model,
                    reg,
                    mileage,
                    year,
                    price,
                    status,
                    [],
                    notes_text
                )

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

    return row_errors == 0


# =========================================
# MAIN
# =========================================

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
        # LOAD AIRTABLE
        # =====================================

        airtable_records = load_airtable_records()

        log(
            f"Loaded {len(airtable_records)} Airtable records"
        )

        # =====================================
        # UNSOLD
        # =====================================

        log("UNSOLD")

        unsold_scrape_ok = scrape_current_page(
            page,
            airtable_records,
            context
        )

        # =====================================
        # RESERVED
        # =====================================

        log("RESERVED")

        page.goto(
            "https://dealers.cardealer5.co.uk/dms/stock/reserved"
        )

        page.wait_for_timeout(5000)

        reserved_scrape_ok = scrape_current_page(
            page,
            airtable_records,
            context,
            forced_status="Reserved"
        )

        # =====================================
        # MARK SOLD BIKES
        # =====================================

        log("CHECKING SOLD BIKES")

        for reg, airtable_data in airtable_records.items():

            existing_status = str(airtable_data.get("Current Status") or "").strip().lower()

            if unsold_scrape_ok and reserved_scrape_ok and reg not in dealer5_regs and "reserved" not in existing_status:

                record_id = airtable_data["id"]

                log(f"{reg} missing from Dealer5")
                log(f"Marking as Sale Completed")

                url = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE_NAME}/{record_id}"

                data = {
                    "fields": {
                        "Current Status": "Sale Completed"
                    }
                }

                response = requests.patch(
                    url,
                    headers=HEADERS,
                    json=data,
                    timeout=30
                )

                if response.status_code == 200:

                    log(f"Marked {reg} as Sale Completed")

                    mark_supabase_stock_bike_sold(reg)

                else:

                    log(f"Failed marking {reg} as sold")

        browser.close()

except Exception as e:

    log(f"SCRIPT CRASHED: {e}")
