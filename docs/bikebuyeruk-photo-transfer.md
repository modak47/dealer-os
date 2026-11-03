# Bike Buyer UK photo transfer

This change adds authenticated binary photo transfer to the existing DealerOS application and the existing private `motorgeeks-seller-photos` bucket. It creates no new database or cloud project. Website forms never receive the Supabase service key.

## Deployment status and source preservation

Not activated. The current production deployment is `dpl_8z7an8s3FNPf7LLd7d1EncHjoYXp`, uploaded with the CLI on 23 October. GitHub main is `0a578ac9c744020bc0891e8519f1633de71d45b1` and lacks dozens of those deployed changes. **Do not deploy this whole branch over production.** Apply the photo change to the complete current DealerOS checkout first. `lib/bikebuyeruk-leads.ts` was recovered from Vercel and its SHA-1 is exactly `e73adf1a6154555b32ab13f498e90667166dfd3c`; it is not a replacement implementation.

The companion changes are on `modak47/motorcycle-cms`, branch `codex/bike-buyer-release-candidate-20261023`, draft PR 7. Its public WordPress site, main aliases, delivery activation and email remain unchanged. No live enquiry or photo was created, and BBUK-10001 / DealerOS 1665 was not touched.

## Protocol and data flow

The website retains normalized photo bytes in its existing private durable queue. Its delivery worker sends the lead with `images: []`, avoiding protected Preview URLs. It then calls `/api/integrations/bikebuyeruk/photos` using the existing server-only `BIKEBUYERUK_LEADS_API_KEY`:

- `GET`: authenticated readiness (private bucket and transfer table).
- `POST application/json`: `{action: 'reserve' | 'complete', lead_id: string, external_submission_id: string, photos: [{id,sha256,byte_size,width,height}]}`. The manifest is immutable, limited to ten, and must match the existing Bike Buyer UK lead and external identity.
- `PUT image/jpeg`: bytes plus `X-Lead-ID`, `X-Submission-ID`, `X-Photo-ID`. The receiver verifies digest, dimensions, decoded pixels and absence of EXIF/XMP/IPTC. Immutable object paths and content-checked retries prevent duplicate files or replacement of another photo.
- `DELETE`: bounded retention maintenance for completed Bike Buyer batches only, 30 days after completion. Storage removal precedes marking photo rows removed; interrupted maintenance can retry.

The existing staff gallery signs uploaded `lead_photos` for 15 minutes. It no longer signs unfinished/failed uploads. The worker marks the website outbox delivered only after the complete photo batch is acknowledged. Interrupted transfers retain original submission and photo IDs. No-photo enquiries retain their existing transport.

## Rollout prerequisites

After combining with the current production checkout, apply `supabase/migrations/20261103142428_bikebuyeruk_photo_transfer.sql` to the existing DealerOS project `ejtbbpiqwytcyvromalw`. It adds a service-only RLS transfer table and an invoker RPC restricted to `service_role`; it does not change Storage policies, make the bucket public, or modify any existing enquiry. The 50 MB staging allowance counts only the new `bike-buyer-uk/` prefix, separately from MotorGeeks photos.

Deploy the integrated DealerOS source with `BIKEBUYERUK_PHOTOS_ENABLED=true`, then verify authenticated photo readiness. On the existing website release Preview, set `BBUK_PHOTO_DELIVERY=dealeros-storage`; keep the approved retention=30 and staging budget=50. Enable website photos only after the hosted upload/read path has been accepted. Ordinary delivery remains subject to the existing monitoring gates. A new synthetic live enquiry for downstream proof still needs the user's specific authorisation; do not attach test photos to lead 1665. These rollout operations have **not** been performed by this change.

## Validation

Local real PostgreSQL/PGlite tests exercise anonymous/authenticated denial, source and external-ID ownership, exact replay, manifest conflicts, count/size checks, completion, expiry and retry after expiry. Real Supabase Storage client tests use a local mocked HTTP transport for immutable upload and lost-acknowledgement recovery. Sharp decodes generated fixtures, rejects corrupt/wrong-digest/metadata-bearing files, and accepts normalized JPEG. Companion queue tests prove photo outages leave a pending enquiry and retry delivers against the same lead.

Staff `/website-leads/1408` was rendered using fictional fixtures in Chrome at 1440×900; two gallery images loaded and existing map/booking controls passed. This is local fixture verification, not production Supabase retrieval or physical-device acceptance.
