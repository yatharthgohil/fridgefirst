# Pantry and inventory API

KAN-5 through KAN-8 backend persistence is implemented with versioned SQL migrations, authenticated HTTP routes, shared Zod contracts, and read-time urgency. The dashboard still uses frontend fixtures. Amy and Samia's frontend tasks must connect those views to these endpoints. Photo analysis, recipes, cooking, and the rest of the MVP remain pending.

## Authentication and deployment

All six operations reuse the existing Supabase Google cookie session. Every protected request calls `auth.getUser()` before input validation. Signed-out requests return JSON 401 without a redirect. Services use the cookie-scoped publishable-key client and only the public RPCs in [backend-commands.md](backend-commands.md). There is no service-role key, writable owner field, table mutation, or fixture fallback.

Environment variables are listed in [.env.example](../.env.example). `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configure the existing client. Google setup remains in [auth-setup.md](auth-setup.md) and [README.md](../README.md). `APP_ORIGIN` is the canonical browser origin, such as `https://fridgefirst.example` or `http://localhost:3000`, without a path. It is server configuration, not a credential.

Mutation requests require `Content-Type: application/json`, with optional charset, and at most 64 KiB of UTF-8 JSON. An explicit `Origin` must match `APP_ORIGIN`; without that setting it must match the request URL origin. `Sec-Fetch-Site: cross-site` is rejected. Requests without Origin are allowed for nonbrowser clients but still need the authenticated cookie session. No permissive CORS headers are emitted.

Behind a reverse proxy, set `APP_ORIGIN` to the external browser origin. The application does not trust forwarded host or protocol headers to choose an allowed origin. The deployment must restrict allowed hosts and configure its proxy to route the public origin correctly. Local development without `APP_ORIGIN` uses the request origin, including its port.

Every route response, including failures and empty delete responses, uses `Cache-Control: private, no-store`.

## Endpoints

| Method and path | Request | Success |
| --- | --- | --- |
| `GET /api/pantry` | No query parameters | 200 `{items,asOfDate}` |
| `POST /api/pantry` | `PantryCreateRequest` | 201 `{item}` |
| `PATCH /api/pantry/{itemId}` | `PantryUpdateRequest` | 200 `{item}` |
| `DELETE /api/pantry/{itemId}` | `PantryDeleteRequest` JSON body | 204, empty body |
| `POST /api/inventory/adjustments` | `InventoryAdjustmentRequest` | 200 `{item,entry,replayed}` |
| `GET /api/inventory/history?limit=20` | Optional decimal integer 1 through 100 | 200 `{entries}` |

History defaults to 20. Unknown query parameters, duplicate limits, signs, decimal points, exponents, and empty limits return validation 422. Pantry list filtering is not implemented. Clients can filter using the returned metadata. List order is expiration ascending, unknown dates last, then UUID ascending. Zero-quantity items remain visible. History order is timestamp descending, then transaction UUID descending.

### Create, update, and delete

The following browser calls use the current same-origin session. Responses must be checked for errors before consuming their success body.

```js
const created = await fetch('/api/pantry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Raw chicken pieces', quantity: 2, unit: 'portion',
    storageLocation: 'Fridge', addedOn: '2026-11-12',
    expiration: { kind: 'estimate' }, notes: null,
  }),
});
const { item } = await created.json(); // after checking created.ok

const updated = await fetch(`/api/pantry/${item.id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ expectedVersion: item.version, changes: {
    notes: 'Opened today', expiration: { kind: 'override', date: '2026-11-13' },
  } }),
});
const { item: latest } = await updated.json(); // after checking updated.ok

await fetch(`/api/pantry/${latest.id}`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ expectedVersion: latest.version }),
}); // check status; successful 204 has no JSON body
```

Shared schemas in [pantry.ts](../src/contracts/pantry.ts) and [common.ts](../src/contracts/common.ts) define exact fields, units, storage tokens, and real calendar dates. Requests are strict objects. Quantity is numeric, nonnegative, at most 999999.999, and has at most three decimal places. Unit changes require replacement quantity. Updates require nonempty changes and the last observed positive integer version. Every accepted edit increments version, including a no-op edit. Stale edits or deletes return conflict 409. Refresh before asking the user to confirm a new edit.

Create is not idempotent. After an uncertain create result, refresh the list before resubmitting. Delete preserves audit snapshots and clears their linked item IDs. Missing and foreign IDs return the same 404. Invalid path UUIDs also return 404 before a typed RPC is called.

### Consume, discard, and history

```js
const requestId = crypto.randomUUID(); // retain this for retries of this intent
await fetch('/api/inventory/adjustments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId },
  body: JSON.stringify({
    requestId, itemId: item.id, operation: 'consume',
    amount: 1, unit: item.unit, expectedQuantity: item.quantity,
  }),
});
const history = await fetch('/api/inventory/history?limit=20');
const { entries } = await history.json(); // after checking history.ok
```

`discard` uses the same request shape. A successful adjustment returns the resulting quantity, audit entry, and `replayed:false`. Retrying the identical successful intent with the same requestId returns the original snapshot with `replayed:true`, even after item deletion. Reusing that key for a changed payload returns validation 422. The optional `Idempotency-Key` header must equal the body requestId. Failures do not reserve keys. A new intended deduction needs a new key.

The expected quantity and unit must match the stored values. Conflict includes `error.current` with `{id,quantity,unit}`. These preconditions cannot detect a change that later restores both original values. There is no implicit unit conversion. Overdraw returns validation 422 and changes nothing. Non-UUID adjustment item IDs return not_found through the SQL command, preserving receipt lookup semantics. Full deductions mark the item consumed or discarded; positive corrections reactivate it.

## Responses and failures

Errors use `{error:{code,message,current?}}`, shared with the inventory client. Messages are descriptive, not stable identifiers.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `validation` | Invalid JSON, encoding, media type, oversized body, or cross-origin mutation |
| 401 | `unauthorized` | Missing or invalid verified session |
| 404 | `not_found` | Missing, foreign, or invalid item ID |
| 405 | `validation` | Unsupported HTTP method, with an Allow header |
| 409 | `conflict` | Stale version or quantity/unit mismatch |
| 422 | `validation` | Shared contract, query, idempotency, or database business validation failed |
| 500 | `server` | Unexpected transport, SQL, response-contract, or server failure |

Unexpected errors return a generic message. Raw SQL diagnostics, payloads, and secrets are neither returned nor logged by these adapters. Zod parses every RPC result, including business failures. Authentication precedes validation, and no route probes foreign records.

Pantry create, update, and list return persisted metadata plus urgency. List includes one UTC `asOfDate` used for every item. Expiration distinguishes estimate with provenance, override, and unknown with a reason. Urgency distinguishes unknown, past_date, critical, soon, and later. It describes dates, not food safety. The complete policy is in [backend-expiration.md](backend-expiration.md).

## Migrations and security

The versioned migration order is:

1. `20261112205443_pantry_foundation.sql`.
2. `20261112210856_pantry_commands.sql`.
3. `20261112211427_inventory_commands.sql`.
4. `20261112211901_expiration_references.sql`.

Files live in [supabase/migrations](../supabase/migrations). Reference values and sources live in [supabase/seed/README.md](../supabase/seed/README.md). [backend-foundation.md](backend-foundation.md) documents grants and ownership. [backend-commands.md](backend-commands.md) is the SQL/RPC contract, including atomicity, lock ordering, rollback, and durable retry receipts. [backend-architecture.md](backend-architecture.md) records the design rationale. Per-ticket statements about missing later work are historical; this document describes the integrated API.

The migration administrator must be able to create restricted roles and assign function owners. `private` must remain outside the Supabase Data API exposed schemas. Authenticated table writes and private command access stay denied. Public RPC execution uses the verified user's session and the restricted executor/writer roles. No hosted migration or deployment was performed by this integration task.

The adapter follows Supabase's [getUser reference](https://supabase.com/docs/reference/javascript/auth-getuser) and [RPC reference](https://supabase.com/docs/reference/javascript/rpc).

## Frontend handoff and verification limits

Production item IDs are UUIDs. The current fixtures retain demo string IDs and display quantities. Frontend tasks must replace the fixture path, use API numeric quantities for requests, format them for display, refresh on conflicts, and render backend unknown/date/provenance metadata. Client filters can use storage and urgency. The frozen fixture date helper must not replace the backend's UTC urgency.

`tests/backend-http.test.mjs` uses `TEST_BASE_URL` and checks signed-out JSON 401 for all six operations, validation precedence, cache headers, and absent CORS. `tests/backend-protocol.test.mjs` checks the actual parser and mapper without a fake user bypass or mocked application session. Existing SQL suites use [tests/helpers/postgres.mjs](../tests/helpers/postgres.mjs) with a disposable native PostgreSQL 18 cluster.

Local verification uses `npm ci`, `npm run typecheck`, `npm run lint`, and `npm run build`. With the production server running on a dedicated free port, the PowerShell test command is:

```powershell
$env:TEST_BASE_URL = 'http://localhost:50543'
$env:POSTGRES_BIN = 'C:/Program Files/PostgreSQL/18/bin'
npx --yes --package=node@22.22.0 node --test tests/*.test.mjs
```

The port must match the running server. Use the same hostname as Next.js's callback URLs; this local production run uses `localhost`.

Typechecking, lint, production build, and all tests run locally. Hosted Supabase Data API behavior with a real Google session, signed-in HTTP validation/query handling, session refresh cookies, and frontend rendering require integration verification after authorized hosted setup. Pure parser checks do not establish signed-in HTTP behavior.
