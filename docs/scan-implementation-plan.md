# Grocery photos and receipts

Implement private grocery-photo recognition and receipt recognition, with editable review before anything enters the pantry. Deliver the shared photo flow on `feat/grocery-photo-recognition`. Deliver receipt specialization on `feat/receipt-recognition`, based on the photo branch. Open both pull requests without merging them.

## Design

The server owns a durable scan session. Its states are uploading, analyzing, review, failed, and confirmed. Suggestions are untrusted proposals. Confirmed pantry rows remain the authoritative inventory.

We chose durable sessions over a stateless response because refresh recovery, analysis budgets, concurrency claims, and confirmation receipts need durable ownership. A signed browser token would still require separate persistence for retry protection and provider budgets.

Images upload directly to a private Supabase Storage bucket through the user's session. The server assigns the paths. Storage policies restrict each path to its owner's uploading scan. Image bytes are decoded and checked before being sent to the vision provider. The application never accepts arbitrary remote image URLs.

The initial limits are one JPEG, PNG, or WebP image per scan, five MiB per image, and fifty suggestions. HEIC must be exported to JPEG first. No recognition result may claim a verified expiration date. The existing pantry service calculates reference estimates after confirmation, or accepts an explicit user override.

The server-only provider uses OpenAI Responses with a configured vision model and validated structured output. Missing configuration returns a real error, never sample detections. Adapter tests use controlled provider responses. A real provider smoke test requires the user's credentials and will be reported separately.

Confirmation locks the scan, validates selected proposal IDs and all pantry fields, creates items through the existing pantry commands, and records one durable result in a single database transaction. The same confirmation returns the original result. A changed repeat conflicts. Any failed item rolls back the entire batch and its history.

Receipt extraction is a dependent feature. It preserves bounded food-line evidence, normalizes abbreviated food names, distinguishes purchased quantity from price, and excludes payment, tax, total, discount, and non-food lines. It must not invent package sizes or treat purchase dates as expiration dates. Separate purchases stay separate lots.

## Throughput checkpoint

- Blocking first steps. Fix the shared contract and database state transitions before backend and UI implementation.
- Independent workstreams. One writer owns migrations and server orchestration. One owns scan UI and browser API. The integration owner owns provider and image validation.
- Shared mutable state. Contract changes and commits serialize through the integration owner. Workers own disjoint source files.
- Smallest safe decomposition. Finish and verify the grocery-photo flow before enabling receipt-specific extraction on its own branch.

## Verification and delivery

1. Commit the shared contracts and plan.
2. Implement ownership, private storage, leases and budgets, and atomic confirmation. Test with disposable PostgreSQL, including owner isolation, rollback, repeated confirmation, and concurrent requests.
3. Implement the provider boundary and real image decoding. Test malformed images, incompatible output, refusal, timeout, and missing configuration without paid provider requests.
4. Connect upload, analysis, recovery, editable review, and persisted pantry refresh. Remove sample detections from the live path.
5. Run tests, lint, typecheck, production build, signed-out HTTP checks, and independent review. Commit and open the photo PR.
6. Add receipt extraction and review evidence, run the corresponding fixtures and integration checks, and open its dependent PR.
7. Deliver exact user setup steps for migrations, storage, provider secrets, model configuration, and a real hosted smoke test. Leave hosted changes and paid-model accuracy clearly unverified until those checks run.

## Decision trail

The run's decisions and verification results are recorded in `docs/scan-decisions.tsv`. Provider documentation and test evidence are referenced there. No private images, receipt transcripts, or credentials belong in the trail.
