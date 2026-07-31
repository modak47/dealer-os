# Website Leads Webhook Switchover

## Audit Findings

This repository is the YesMoto internal/admin application. It already has a Supabase-backed Website Leads UI at `/website-leads`, plus Retail Checker, dealer referral, location lookup, and Book Into Stock flows that depend on numeric `website_leads.id` values.

The attached Airtable export columns are:

`id`, `owner`, `reg`, `make`, `model`, `year`, `engine`, `colour`, `mileage`, `owners`, `spare_keys`, `bike_condition`, `damage`, `history`, `service`, `mot`, `extras`, `price`, `fname`, `lname`, `email`, `phone`, `postcode`, `image1` through `image10`, `website`, `date`, `Images`, `valuation_status`, `retail_estimate`, `suggested_offer`, `estimated_margin`, `similar_bikes`, `auto_trader_search`, `valuation_notes`, `Motorway output`.

Known Zapier sample fields from the screenshot map to the same legacy fields: `Application Id`, `Application Owner`, `Application Reg`, `Application Make`, and `Application Model`.

The Bike Buyer UK and Sell Your Motorbike repositories were not present in this workspace, so their actual server-side form handlers and existing Zapier calls still need to be inspected in those repos before switchover.

## Canonical Mapping

| Canonical field | Airtable/source fields |
| --- | --- |
| `external_submission_id` | `external_submission_id`, `applicationId`, `Application Id`, `field_id`, `id` |
| `lead_source` | `source`, `website`, normalised to `bike_buyer_uk` or `sell_your_motorbike` |
| `form_name` | `form_name`, `formName` |
| `submitted_at` | `submitted_at`, `submittedAt`, `date`, fallback server receive time |
| `reg` | `reg`, `registration`, `vrm`, `vehicle_registration`, `application_reg` |
| `make` / `model` | `make`, `model`, `application_make`, `application_model` |
| vehicle details | `year`, `engine`, `colour`, `mileage`, `owners`, `spare_keys`, `bike_condition`, `damage`, `history`, `service`, `mot`, `extras` |
| price | `price`, `asking_price`, `expected_price`, `valuation_price` |
| finance | `finance_information`, `finance`, `outstanding_finance` |
| customer message | `message`, `customer_message`, `notes` |
| contact | `fname`, `lname`, `first_name`, `last_name`, `email`, `phone`, `postcode` |
| consent | `consent_marketing`, `marketing_consent`, `consent_terms`, `privacy_consent`, `consent_source` |
| images | `images`, `image1` through `image10` |
| original payload | `raw_payload` |

Email addresses, UK phone numbers, postcodes, and registrations are normalised in the webhook receiver.

## Environment Variables

YesMoto Vercel project:

`NEXT_PUBLIC_SUPABASE_URL`
`SUPABASE_URL` if different from public URL
`SUPABASE_SERVICE_ROLE_KEY`
`WEBSITE_LEADS_WEBHOOK_SECRET`
`LEGACY_LEADS_IMAGE_BASE_URL`

Bike Buyer UK and Sell Your Motorbike Vercel projects:

`YESMOTO_LEADS_WEBHOOK_URL=https://<dealeros-production-domain>/api/webhooks/website-leads`
`WEBSITE_LEADS_WEBHOOK_SECRET=<same secret as YesMoto>`
`ENABLE_LEGACY_ZAPIER_WEBSITE_LEADS=true` during parallel testing

## Source Website Requirements

Update each source site's server-side form handler, not browser code, to POST JSON to `YESMOTO_LEADS_WEBHOOK_URL` with header `x-website-leads-secret`.

Each payload must include:

`source`, `external_submission_id`, `form_name`, `submitted_at`, customer fields, vehicle fields, consent fields, and any image URLs.

Use a stable external submission ID generated once per real form submission. Keep the existing Zapier call behind `ENABLE_LEGACY_ZAPIER_WEBSITE_LEADS` until the checklist below passes.

## Local Testing Commands

Run unit tests:

```bash
npm test
```

Run lint:

```bash
npm run lint
```

Run type checking:

```bash
npm run typecheck
```

Dry-run historical import:

```bash
node scripts/import-airtable-website-leads.mjs --file="C:/Users/car-n/Downloads/Website Leads-Grid view.csv"
```

Import historical CSV after dry-run review:

```bash
node scripts/import-airtable-website-leads.mjs --file="C:/Users/car-n/Downloads/Website Leads-Grid view.csv" --dry-run=false
```

## Switchover Checklist

1. Submit a Bike Buyer UK test lead.
2. Confirm one Supabase row is created.
3. Confirm it appears correctly in YesMoto.
4. Resend the same external ID and confirm no duplicate is created.
5. Test an invalid secret.
6. Test missing required fields.
7. Submit a Sell Your Motorbike lead.
8. Confirm each source is labelled correctly.
9. Confirm status and notes can be updated.
10. Confirm Retail Checker transfer still works.
11. Confirm no secret is present in browser JavaScript, Git history or logs.
12. Import a small historical sample in dry-run mode.
13. Import the sample and verify dates and values.
14. Disable `ENABLE_LEGACY_ZAPIER_WEBSITE_LEADS` only after all checks pass.

## Rollback

Leave the existing Zapier/Airtable workflow enabled during testing. If webhook submissions fail in production, re-enable or keep `ENABLE_LEGACY_ZAPIER_WEBSITE_LEADS=true` in the source websites, pause calls to the YesMoto webhook, and investigate the failed responses/logs. The migration is additive and does not remove legacy columns.
