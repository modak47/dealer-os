# BikeBuyerUK → DealerOS registration lookup and form connection

Updated 23 October 2026. This v2 handover adds registration lookup to the existing lead connection. The existing API key and lead payload remain valid.

Give this guide, the example JSON and the optional JavaScript client to the developer building BikeBuyerUK. Give the API key separately using a private channel. The key is not included in this guide.

## What the connection does

BikeBuyerUK's server submits a completed form to DealerOS. It creates a Website Lead labelled **Bike Buyer UK**, with status **new / Needs review**, using the existing direct lead workflow. DealerOS staff review and distribute it through the existing controls. Sending a form does not automatically release it to dealers.

There are two authenticated endpoints: basic registration lookup to prefill the form, and completed lead submission. The submission is already integrated with DealerOS's Supabase `public.website_leads` table. BikeBuyerUK does not need Supabase credentials or a direct table connection: DealerOS performs that write on its own server and returns the lead ID.

The key does not expose customer records, stock, admin functions or the database. Photo file uploads, MotorGeeks draft sessions, seller accounts, seller magic-link emails and the marketplace offer journey are separate features. BikeBuyerUK collects the form information using its own CMS.

## Server configuration

Store these on the BikeBuyerUK **server**, for example as private hosting environment variables:

```dotenv
DEALEROS_BIKEBUYERUK_LEADS_URL=https://dealer-os-ten.vercel.app/api/integrations/bikebuyeruk/leads
DEALEROS_BIKEBUYERUK_VRM_URL=https://dealer-os-ten.vercel.app/api/integrations/bikebuyeruk/vrm-lookup
BIKEBUYERUK_LEADS_API_KEY=<provided privately by DealerOS>
```

No `NEXT_PUBLIC_` or other public prefix. Never place the key in form HTML, browser JavaScript, a public repository, request logs or a ChatGPT/Codex prompt. The browser posts to BikeBuyerUK's own backend, which forwards the data to DealerOS.

DealerOS uses its own copy of `BIKEBUYERUK_LEADS_API_KEY` for both endpoints. It is separate from the existing website webhook, vehicle provider, database and MotorGeeks credentials. Changing or removing this variable and redeploying DealerOS rotates or disables this integration without changing those credentials.

## Registration lookup

Your **server** calls:

```http
POST /api/integrations/bikebuyeruk/vrm-lookup
Authorization: Bearer <same private BikeBuyerUK key>
Content-Type: application/json
```

Request:

```json
{"registration":"GY26 ABC"}
```

Whitespace is removed and the registration is uppercased. Send a UK registration containing 2–8 letters/digits after spaces are removed. No other lookup options are accepted. Body limit: **1 KiB**.

An illustrative successful response is:

```json
{"ok":true,"vehicle":{"reg":"GY26ABC","make":"Honda","model":"CB500F","year":2021,"engine":"471","colour":"Blue"},"manual_entry_available":true}
```

Returned fields are restricted to `reg`, `make`, `model`, `year`, `engine` and `colour`; fields missing from the provider result are omitted. These names are directly accepted by the lead-submission endpoint. Do not infer missing answers. Ask the seller to confirm or correct the prefilled details and manually enter any missing make/model/year. The lookup does **not** provide a current mileage; collect that from the seller.

The lookup requests basic vehicle details only. VIN, keeper information, provider account IDs, raw responses, finance/write-off/history reports and full vehicle-check data are not returned. A successful lookup is not a vehicle history clearance, valuation or offer.

Limits are **20 actual lookup attempts per minute and 250 per 24-hour window**, shared across this BikeBuyerUK integration and enforced in the database. Invalid requests and dry runs do not call the provider. Real lookups can consume the existing provider allowance. Protect your own form endpoint against abuse and avoid calling on every keystroke: use an explicit lookup button and prevent repeated clicks while pending.

Responses:

- `200`: successful lookup, or `dry_run: true` when explicitly requested.
- `400`, `413`, `415`: invalid registration/JSON, oversized body or wrong content type.
- `401`: incorrect/missing BikeBuyerUK key.
- `404` / `code: not_found`: no vehicle found; offer manual entry.
- `429` / `code: rate_limited`: allowance reached; inspect `limit_window` (`minute` or `day`) and `Retry-After`. Offer manual entry rather than repeatedly retrying.
- `503` / `code: lookup_unavailable`: provider/configuration/limiter unavailable. Preserve answers and offer manual entry. Do not use the staff-only or MotorGeeks cookie-based endpoints as a workaround.

Authenticated `GET` to this lookup URL returns feature/configuration metadata without calling the provider. POST `{"registration":"TEST123","dry_run":true}` validates the connection without a lookup, quota consumption or lead write. A real lookup by itself creates **no lead**.

## Lookup → Supabase lead flow

1. Browser submits a registration to BikeBuyerUK's own server.
2. That server calls the lookup endpoint above; show its `vehicle` fields as editable prefill.
3. Customer confirms the bike details and supplies mileage, condition, photos, contact details and actual consent.
4. Persist the completed canonical payload, unique submission ID and original timestamp in BikeBuyerUK's CMS/outbox.
5. BikeBuyerUK's server posts that completed payload to `/api/integrations/bikebuyeruk/leads`.
6. DealerOS saves it to its existing Supabase `website_leads` table as `bike_buyer_uk` and returns the DealerOS lead ID. Confirm it under **Website Leads → Bike Buyer UK**.

Never give the browser the API key or give the developer a Supabase service-role key. No Supabase migrations, browser writes or relaxed database policies are needed on either side. Do not mark a lookup-only result as a delivered lead.

## HTTP contract (v1)

Send **one JSON object per request**:

```http
POST /api/integrations/bikebuyeruk/leads
Authorization: Bearer <private API key>
Content-Type: application/json
```

Use `docs/examples/bikebuyeruk-lead.json` as the field example. Replace the example details and consent wording with actual customer answers and the actual notice they accepted.

| Required field | Format |
| --- | --- |
| `external_submission_id` | Stable unique ID, 1–120 characters; letters, digits, `.`, `_`, `:`, `-`; starts with a letter or digit. A UUID is suitable. |
| `submitted_at` | Original submission timestamp in ISO 8601 with timezone, e.g. `2026-10-21T10:00:00Z`. Keep it unchanged on retries. |
| `fname`, `lname` | First and last names, maximum 100 characters each. |
| `email` | Valid email address, maximum 160 characters. |
| `phone` | Phone number, 10–20 characters including optional spaces, parentheses, hyphens and leading `+`. |
| `postcode` | Valid UK postcode format. |
| `make`, `model` | Maximum 80 and 120 characters. Manual entry is supported. |
| `year` | Integer from 1900 through next year. |
| `mileage` | Whole number from 0 to 2,000,000. Zero is valid; do not invent zero for a missing answer. |
| `consent_terms` | Boolean `true`, reflecting the customer's explicit acceptance of the relevant privacy/terms notice. |
| `consent_source` | Actual form/privacy notice URL or version accepted, maximum 500 characters. |

Optional fields:

| Field | Format / meaning |
| --- | --- |
| `reg` | Registration, maximum 12 characters; letters, numbers and spaces. Omit when unavailable. |
| `form_name` | Maximum 120 characters; defaults to `BikeBuyerUK valuation`. |
| `engine`, `colour` | Text, maximum 60 characters each. |
| `owners` | Whole number, 0–100. |
| `spare_keys`, `owner` | Text: spare-key answer (40 characters), registered-keeper answer (120 characters). |
| `bike_condition` | Condition description, maximum 500 characters. |
| `damage`, `history`, `service`, `extras` | Text, maximum 1,000 characters each. |
| `mot` | MOT date/status text, maximum 120 characters. |
| `price` | Seller's asking price in **GBP pounds**, nonnegative, up to £10m. Number or plain decimal string (up to 2 decimal places); no `£` sign or commas. Omit when unknown. It is not a DealerOS valuation or offer. |
| `finance_information` | Finance answer/details, maximum 2,000 characters. |
| `customer_message` | Other seller notes, maximum 4,000 characters. |
| `images` | Up to **10 HTTPS photo URLs**, maximum 1,000 characters per URL; defaults to `[]`. Host the files in BikeBuyerUK's storage. Links must stay usable by DealerOS; do not send short-lived URLs, base64, files, or CMS admin-only URLs. |
| `consent_marketing` | Boolean; only `true` with actual separate marketing permission. Omit or send `false` otherwise. |
| `dry_run` | Boolean; `true` validates only and saves nothing. Defaults to `false`. |

Whole-number fields also accept plain digit strings. Omit optional values when blank; do not send `null` or empty strings. Unknown fields are rejected, including `source`, `lead_source`, `status`, internal valuations and assignment fields. DealerOS sets the source and initial status itself.

Request body limit: **32 KiB**. Saved submission attempts are limited to **120/minute** for this integration. Keep the form backend protected against spam and abuse.

## Responses and duplicate protection

New lead: HTTP **201**:

```json
{"ok":true,"duplicate":false,"source":"bike_buyer_uk","lead":{"id":12345,"external_submission_id":"bbuk-example-001"}}
```

Safe retry of the same ID and payload: HTTP **200**, `duplicate: true`, same lead ID. This is a successful delivery. Duplicate protection is enforced by the existing database unique index on source and external submission ID, including concurrent requests.

The API returns the lead ID and submission ID only, never customer data. Save that acknowledgement in the CMS/outbox.

| HTTP status | Action |
| --- | --- |
| `200` + `dry_run: true` | Validated only. Do not mark as delivered or show a real submission success. |
| `200` + `duplicate: true`, or `201` | Successfully delivered. Save the DealerOS lead ID. |
| `400` | Validation/JSON error; inspect `code` and `fields` and correct the payload. |
| `401` | Missing/incorrect key; alert your developer. |
| `409` | Same submission ID sent with different details. Do not retry indefinitely or overwrite the existing lead. Investigate against the original saved payload; do not generate a fresh ID just to bypass this error. |
| `413` / `415` | Body too large / wrong content type; fix the request. |
| `429` | Retry after `Retry-After` seconds (normally 60). |
| `5xx`, timeout, connection loss | Keep the saved payload and retry with exponential backoff and jitter, respecting `Retry-After`. |

Generate the submission ID **once per real submission**. Persist the exact completed payload and original timestamp in your CMS before sending. A double-click, timeout, page reload or worker retry must reuse the same ID and payload. A genuinely new customer enquiry gets a new ID. This API is create-only; retries do not edit submitted leads.

Use a durable outbox/queue in the CMS. Only mark as delivered after a confirmed non-dry-run API acknowledgement. If the customer is told their form has been received while forwarding is pending, first ensure the submission is durably saved in BikeBuyerUK and show accurate pending wording. Alert the developer about unrecoverable failures; never discard them silently.

## Test connection without creating a lead

1. Install the three private environment variables on BikeBuyerUK's backend (two endpoint URLs and the one existing key).
2. An authenticated `GET` to the same endpoint returns connection metadata. It does not read the database or prove a write has succeeded.
3. Send the example JSON with `"dry_run": true`. Expect `200`, `ok: true`, `dry_run: true`. No database or third-party lookup is called by dry run.
4. Agree a clearly marked test submission with DealerOS, send it without `dry_run`, and confirm **Bike Buyer UK → Needs review** in Website Leads. Repeat the identical request and confirm the same lead ID and `duplicate: true`.
5. DealerOS staff should archive the test lead after checking. Confirm wrong-key and invalid-field errors are handled without losing saved customer answers.

Optional Node.js client: `docs/examples/bikebuyeruk-dealeros-client.mjs` (Node 20+, server only). `lookupDealerOsVrm(registration)` performs form prefill; `{ dryRun: true }` validates only. Its `sendToDealerOs(payload, { dryRun: true })` validates the completed lead; `sendToDealerOs(payload)` submits it. Catch `DealerOsError`: offer manual entry for lookup failures; use `retryable` and `retryAfterSeconds` in the completed-lead delivery queue. The helper itself does not implement persistence or retries.

## Ready-to-paste Codex / ChatGPT instruction

```text
Connect the existing BikeBuyerUK enquiry/valuation form to DealerOS using the
attached API handover guide, JSON example and optional server-only JS client.
Inspect this CMS and preserve its existing routes, design and form behaviour.

The completed-lead endpoint is:
https://dealer-os-ten.vercel.app/api/integrations/bikebuyeruk/leads
The basic registration-lookup endpoint is:
https://dealer-os-ten.vercel.app/api/integrations/bikebuyeruk/vrm-lookup

Use private server environment variables DEALEROS_BIKEBUYERUK_LEADS_URL,
DEALEROS_BIKEBUYERUK_VRM_URL and BIKEBUYERUK_LEADS_API_KEY. Both endpoints use
the same existing key. The owner will install the real key privately; do
not ask them to paste it into chat, and never expose it to the browser or logs.
The browser must call our own backend; our backend forwards the completed form
to DealerOS with Authorization: Bearer <key> and Content-Type: application/json.
For a lookup, send {"registration":"..."} to the VRM endpoint from our backend.
Use the returned vehicle fields as editable prefill and ask the customer to
confirm them. Collect mileage and any missing required details manually.
Offer manual entry on 404/429/503. Limit repeat clicks, protect our own backend
against abuse, and do not call the provider on every keystroke. A lookup is not
a lead submission, valuation, history clearance or completed vehicle check.

Map the form to the exact documented flat fields. DealerOS assigns the source;
do not send source, lead_source, status, internal valuations or admin fields.
Require actual terms/privacy acceptance; treat marketing permission separately.
Do not fabricate missing mileage or other required customer answers.
Upload photos to our storage and send up to 10 durable HTTPS URLs, not files.

Persist a UUID, original ISO submission timestamp and complete payload once per
real submission in our CMS/outbox. Reuse the same ID, timestamp and payload for
double-clicks and all retries. Add durable delivery state, the returned DealerOS
lead ID and retry/backoff handling. Treat 201 and 200 duplicate:true as success.
Never treat dry_run as saved. For timeout/429/5xx retry safely; for 400/401/409/
413/415 preserve the record and flag it for correction. Prevent browser abuse.
Do not show a delivered success until acknowledged; if durably queued instead,
show accurate pending wording. Do not silently discard forwarding failures.

Begin with authenticated GET and dry_run:true against the live API. Coordinate
one clearly marked real integration test with DealerOS, then replay exactly
that payload to verify duplicate protection. Run relevant project tests for
mapping, consent, success, duplicates, validation errors and retry behaviour.

The completed lead endpoint already writes into DealerOS's Supabase
website_leads table. Do not create a direct Supabase connection or request
database/admin/provider credentials. Do not call MotorGeeks cookie-based draft,
lookup, seller or photo endpoints. Only the dedicated BikeBuyerUK lookup and
lead endpoints are provided; seller/offer accounts remain separate.
Test both endpoints with dry_run:true before coordinating one real lookup and
one clearly marked lead submission. Report files changed, tests run and any
remaining hosting configuration steps.
```
