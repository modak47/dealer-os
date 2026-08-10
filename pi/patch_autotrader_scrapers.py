from pathlib import Path
import re


SCRAPER_DIR = Path(__file__).resolve().parent
SCRAPER_FILES = [
    path
    for path in sorted(SCRAPER_DIR.glob("scraper*.py"))
    if re.fullmatch(r"scraper[1-5]\.py", path.name)
]
RECENT_SCRAPER = SCRAPER_DIR / "recent_scraper.py"
if RECENT_SCRAPER.exists():
    SCRAPER_FILES.append(RECENT_SCRAPER)


PATCHED_LOAD_SUPABASE_RECORDS = '''def chunked(values, size=200):

    values = list(values)

    for index in range(0, len(values), size):

        yield values[index:index + size]


def load_supabase_records(listing_ids=None):

    records = {}

    if not listing_ids:

        print("Loaded 0 matching Supabase records")

        return records

    for batch in chunked(listing_ids, 200):

        response = (
            supabase
            .table("autotrader_listings")
            .select('"Listing ID","Listed Price"')
            .in_("Listing ID", [str(value) for value in batch])
            .execute()
        )

        for row in response.data or []:

            records[str(row["Listing ID"])] = {
                "price": row.get("Listed Price")
            }

        print(
            f"Loaded {len(records)} matching Supabase records"
        )

    return records
'''


def automation_job_name(path):
    match = re.fullmatch(r"scraper([1-5])\.py", path.name)
    if match:
        return f"autotrader_scraper_{match.group(1)}"
    return "autotrader_recent_scraper"


def status_block(job_name):
    return f'''AUTOMATION_JOB_NAME = "{job_name}"
SCAN_STARTED_AT = datetime.now(timezone.utc).isoformat()
SCAN_STARTED_MONOTONIC = time.monotonic()
scan_completed = False


def local_env_value(key):
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return None

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        env_key, value = line.split("=", 1)
        if env_key.strip() == key:
            return value.strip().strip('"').strip("'")
    return None


def automation_client():
    url = os.environ.get("SUPABASE_URL") or local_env_value("SUPABASE_URL") or SUPABASE_URL
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or local_env_value("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        print("Automation status skipped: SUPABASE_SERVICE_ROLE_KEY is not available.")
        return None
    return create_client(url, key)


def update_automation_job(status, last_error=None):
    try:
        client = automation_client()
        if not client:
            return

        payload = {{
            "job_name": AUTOMATION_JOB_NAME,
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}

        if status == "running":
            payload.update({{
                "last_started": SCAN_STARTED_AT,
                "last_error": None,
                "duration_ms": None,
            }})
        else:
            payload.update({{
                "last_finished": datetime.now(timezone.utc).isoformat(),
                "duration_ms": int((time.monotonic() - SCAN_STARTED_MONOTONIC) * 1000),
                "last_error": last_error,
            }})

        client.table("automation_jobs").upsert(payload, on_conflict="job_name").execute()
    except Exception as status_error:
        print(f"WARNING: Could not update automation status: {{status_error}}")


def mark_scan_failed_if_needed():
    if scan_completed:
        return

    error_type, error, _ = sys.exc_info()
    if error_type is None:
        return

    update_automation_job("failed", str(error))


atexit.register(mark_scan_failed_if_needed)
update_automation_job("running")
'''


def ensure_imports(source):
    if "from pathlib import Path" not in source:
        source = source.replace("import re\n", "import re\nfrom pathlib import Path\n", 1)
    if "import os\n" not in source:
        source = source.replace("import re\n", "import re\nimport os\n", 1)
    if "import time\n" not in source:
        source = source.replace("import re\n", "import re\nimport time\n", 1)
    if "import atexit\n" not in source:
        source = source.replace("import re\n", "import re\nimport atexit\n", 1)
    if "import sys\n" not in source:
        source = source.replace("import re\n", "import re\nimport sys\n", 1)
    source = source.replace("from datetime import date\n", "from datetime import date, datetime, timezone\n", 1)
    return source


def add_status_reporting(source, path):
    if "AUTOMATION_JOB_NAME =" in source:
        return source, False

    source = ensure_imports(source)
    marker = "supabase = create_client(\n"
    start = source.find(marker)
    if start == -1:
        raise RuntimeError("Could not find Supabase client creation for automation status.")

    end = source.find("\n)", start)
    if end == -1:
        raise RuntimeError("Could not find end of Supabase client creation.")
    insert_at = end + len("\n)")
    source = source[:insert_at] + "\n\n" + status_block(automation_job_name(path)) + source[insert_at:]

    close_pattern = re.compile(r"\n\s*browser\.close\(\)\s*$")
    replacement = (
        "\n    update_automation_job(\"success\")\n"
        "    scan_completed = True\n\n"
        "    browser.close()\n"
    )
    source, count = close_pattern.subn(replacement, source, count=1)
    if count != 1:
        raise RuntimeError("Could not find final browser.close() for success status.")

    return source, True


def replace_loader(source):
    pattern = re.compile(
        r"def load_supabase_records\(\):\r?\n"
        r".*?"
        r"\r?\n\s*return records\r?\n",
        re.S,
    )
    next_source, count = pattern.subn(PATCHED_LOAD_SUPABASE_RECORDS, source, count=1)
    if count != 1:
        raise RuntimeError("Could not find load_supabase_records().")
    return next_source


def replace_standard_call(source):
    replacements = [
        (
            re.compile(r"airtable_records = \(\s*\r?\n\s*load_supabase_records\(\)\s*\r?\n\s*\)", re.S),
            "airtable_records = (\n        load_supabase_records(advert_ids)\n    )",
        ),
        (
            re.compile(r"airtable_records\s*=\s*load_supabase_records\(\)"),
            "airtable_records = load_supabase_records(advert_ids)",
        ),
    ]
    for pattern, replacement in replacements:
        next_source, count = pattern.subn(replacement, source, count=1)
        if count == 1:
            return next_source
    raise RuntimeError("Could not find the standard load_supabase_records() call.")


def replace_recent_scraper_call(source):
    early_pattern = re.compile(
        r"\r?\n\s*airtable_records = \(\s*\r?\n\s*load_supabase_records\(\)\s*\r?\n\s*\)\r?\n",
        re.S,
    )
    source, count = early_pattern.subn("\n    airtable_records = {}\n", source, count=1)
    if count != 1:
        early_pattern = re.compile(r"\r?\n\s*airtable_records\s*=\s*load_supabase_records\(\)\r?\n")
        source, count = early_pattern.subn("\n    airtable_records = {}\n", source, count=1)
    if count != 1:
        raise RuntimeError("Could not remove the early recent-scraper Supabase load.")

    found_pattern = re.compile(
        r"(print\(\s*\n\s*f\"\\nFound \{len\(advert_ids\)\} unique adverts\"\s*\n\s*\)\n)",
        re.S,
    )
    insertion = (
        "\\1\n"
        "    airtable_records = load_supabase_records(advert_ids)\n"
        "    advert_ids = [advert_id for advert_id in advert_ids if advert_id not in airtable_records]\n"
        "    print(f\"Found {len(advert_ids)} adverts missing from Supabase\")\n"
    )
    source, count = found_pattern.subn(insertion, source, count=1)
    if count != 1:
        raise RuntimeError("Could not add the recent-scraper targeted Supabase load.")
    return source


def patch_file(path):
    source = path.read_text()
    next_source = source
    changes = []

    if "def load_supabase_records(listing_ids=None)" in next_source:
        changes.append("lookup already patched")
    else:
        next_source = replace_loader(next_source)
        if "Recent Listings Scraper" in next_source:
            next_source = replace_recent_scraper_call(next_source)
        else:
            next_source = replace_standard_call(next_source)
        changes.append("lookup patched")

    next_source, added_status = add_status_reporting(next_source, path)
    if added_status:
        changes.append("automation status patched")
    else:
        changes.append("automation status already patched")

    if next_source == source:
        print(f"Already patched: {path.name}")
        return

    backup = path.with_suffix(path.suffix + ".bak")
    if not backup.exists():
        backup.write_text(source)
    path.write_text(next_source)
    print(f"Patched: {path.name} ({', '.join(changes)})")


def main():
    if not SCRAPER_FILES:
        raise SystemExit(f"No scraper1.py-scraper5.py or recent_scraper.py files found in {SCRAPER_DIR}")

    patched = 0
    skipped = 0
    for path in SCRAPER_FILES:
        try:
            patch_file(path)
            patched += 1
        except Exception as exc:
            skipped += 1
            print(f"Skipped {path.name}: {exc}")

    print(f"Done. Patched/already patched: {patched}; skipped: {skipped}")


if __name__ == "__main__":
    main()
