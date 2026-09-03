# DealerOS

Standalone multi-dealership website and dealer management platform. The active
customer-facing tenant is configured in `config/dealership.ts` (currently
YesMoto).

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

No authentication, database, payment, or marketplace integrations are enabled
in this version. Stock and CRM content use local placeholder data.

## Visual Development

Use the permanent Playwright workflow before completing frontend layout, styling,
component or responsive changes.

```bash
npm run dev:visual
npm run test:visual
```

Approved screenshots live in `design-references/approved/`; failed comparisons
and traces live in `design-references/failures/`. See `docs/visual-development.md`
for authentication, screenshot approval and troubleshooting details.
