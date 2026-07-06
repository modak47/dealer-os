"""One-off Airtable and Supabase stock-image deduplication.

Runs as a dry run unless --apply is supplied. Credentials are read only from
environment variables and are never printed.
"""
import argparse
import os
from urllib.parse import quote, urlsplit, urlunsplit
import requests


def raw_url(value):
    if isinstance(value, dict):
        return str(value.get("url") or "").strip()
    return str(value or "").strip() if isinstance(value, str) else ""


def canonical_url(value):
    raw = raw_url(value).replace("/w200/", "/")
    if not raw:
        return ""
    parts = urlsplit(raw)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, "", ""))


def stored_url(value):
    raw = raw_url(value).replace("/w200/", "/")
    if any(host in raw.lower() for host in ("cardealer5", "cd5")):
        return canonical_url(raw)
    return raw


def dedupe(values):
    result, seen = [], set()
    for value in values or []:
        key = canonical_url(value)
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(stored_url(value))
    return result


def clean_airtable(apply_changes):
    token = os.environ.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_TOKEN")
    base = os.environ.get("AIRTABLE_BASE_ID")
    table = os.environ.get("AIRTABLE_STOCK_TABLE_NAME", "Motorcycles stock")
    if not token or not base:
        print("Airtable skipped: AIRTABLE_API_KEY/AIRTABLE_TOKEN or AIRTABLE_BASE_ID is missing")
        return
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    endpoint = f"https://api.airtable.com/v0/{base}/{quote(table, safe='')}"
    offset, checked, changed = None, 0, 0
    while True:
        params = [("pageSize", "100"), ("fields[]", "Registration Number"), ("fields[]", "Stock Image")]
        if offset:
            params.append(("offset", offset))
        response = requests.get(endpoint, headers=headers, params=params, timeout=60)
        response.raise_for_status()
        page = response.json()
        for record in page.get("records", []):
            fields = record.get("fields", {})
            before = fields.get("Stock Image") or []
            after = dedupe(before)
            checked += 1
            if len(after) == len(before):
                print(f"Airtable {fields.get('Registration Number') or record['id']}: {len(before)} total / {len(after)} unique; unchanged")
                continue
            changed += 1
            reg = fields.get("Registration Number") or record["id"]
            print(f"Airtable {reg}: {len(before)} -> {len(after)}")
            if apply_changes:
                update = requests.patch(f"{endpoint}/{record['id']}", headers=headers, json={"fields": {"Stock Image": [{"url": url} for url in after]}}, timeout=60)
                update.raise_for_status()
        offset = page.get("offset")
        if not offset:
            break
    print(f"Airtable checked {checked}; {'updated' if apply_changes else 'would update'} {changed}")


def clean_supabase(apply_changes):
    url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Supabase skipped: URL or SUPABASE_SERVICE_ROLE_KEY is missing")
        return
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    endpoint = f"{url}/rest/v1/stock_bikes"
    offset, checked, changed = 0, 0, 0
    while True:
        response = requests.get(endpoint, headers=headers, params={"select": "id,registration,image_urls,primary_image_url", "order": "id.asc", "offset": offset, "limit": 500}, timeout=60)
        response.raise_for_status()
        rows = response.json()
        if not rows:
            break
        for row in rows:
            before = row.get("image_urls") if isinstance(row.get("image_urls"), list) else []
            after = dedupe(before)
            checked += 1
            if len(after) == len(before):
                print(f"Supabase {row.get('registration') or row['id']}: {len(before)} total / {len(after)} unique; unchanged")
                continue
            primary = stored_url(row.get("primary_image_url"))
            if primary and canonical_url(primary) in {canonical_url(item) for item in after}:
                primary = next(item for item in after if canonical_url(item) == canonical_url(primary))
            else:
                primary = after[0] if after else None
            changed += 1
            print(f"Supabase {row.get('registration') or row['id']}: {len(before)} -> {len(after)}")
            if apply_changes:
                update = requests.patch(endpoint, headers={**headers, "Prefer": "return=minimal"}, params={"id": f"eq.{row['id']}"}, json={"image_urls": after, "primary_image_url": primary}, timeout=60)
                update.raise_for_status()
        offset += len(rows)
    print(f"Supabase checked {checked}; {'updated' if apply_changes else 'would update'} {changed}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write the deduplicated arrays. Default is dry-run.")
    args = parser.parse_args()
    print("APPLY MODE" if args.apply else "DRY RUN (use --apply to write changes)")
    clean_airtable(args.apply)
    clean_supabase(args.apply)
