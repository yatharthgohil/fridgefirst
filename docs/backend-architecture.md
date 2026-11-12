# Pantry backend architecture

## Selected design

Use the Codex database-command candidate as the base. Both candidates converged on RPC writes. The independent MiniMax review preferred Codex because direct writes cannot bypass audit, retry receipts survive item deletion, and unknown expiration is explicit. Reject application-composed REST writes and trigger protocols that leave transaction ownership scattered across callers.

Model the Domain puts expiration in an estimate, override, or unknown union. Boundary Discipline puts validation at HTTP, RPC, and database-response boundaries. Make Operations Idempotent requires durable account-scoped successful adjustment receipts. Prove It Works requires the actual migration SQL and restricted roles to run in a disposable PostgreSQL cluster.

## Consumer contract

Pantry routes are `GET/POST /api/pantry` and `PATCH/DELETE /api/pantry/[itemId]`. Create accepts name, numeric quantity, unit, storageLocation, addedOn, expiration intent, and optional notes. Expiration intent is `{kind: "estimate"}`, `{kind: "override", date: "YYYY-MM-DD"}`, or `{kind: "unknown"}`. Patch accepts expectedVersion plus a nonempty changes object. Delete accepts expectedVersion. The route supplies the path ID rather than accepting a writable owner. Return `{items, asOfDate}`, `{item}`, `{item}`, and HTTP 204 respectively.

The database returns camel-case item JSON using one private projection helper. A shared record schema defines its persisted fields. API responses add read-time urgency from one UTC calendar date. Services parse RPC and read results with Zod. RPC business errors use the existing inventory error envelope and stay distinct from unexpected database exceptions.

Inventory retains `/api/inventory/adjustments` and `/api/inventory/history`, all existing operation names, fields, and envelopes. Adjustment IDs stay strings in the shared fixture contract. The production endpoint returns not_found for a non-UUID item ID. No new required version field is added to adjustments. The existing quantity and unit precondition cannot detect a change that later returns to the original quantity and unit. Pantry edits and deletes use a positive integer version and detect intervening changes.

## Decisions applied after comparison

- Quantities are finite numbers from zero through 999999.999 at three decimals. Accept floating point representation noise within a small epsilon of a three-decimal value, normalize it once, and reject genuine excess precision. SQL uses numeric and rejects excess precision independently. Never round a tiny positive amount down to zero and apply it. Units are the fourteen tokens already present in the pantry UI. No conversion is inferred. A unit correction must supply a replacement quantity. A cross-unit history delta is null.
- Keep zero-quantity items visible in pantry reads, matching existing fixtures. Full deductions set consumed or discarded status. A positive correction reactivates the item. Explicit deletion removes it from pantry reads.
- Every accepted edit increments version and writes one edit history row, including metadata-only and no-op edits. Delete history has null itemId, operation delete, negative deleted quantity, and the deleted unit. Historical labels survive through snapshots and ON DELETE SET NULL.
- One expiration mode is authoritative. The PDF's expiry_is_estimate may be a generated column derived from mode. Unknown has a null date and reason no_match or user_cleared. Overrides have a date and survive unrelated edits, including storage changes. Estimate mode rematches on name, added date, or storage changes using the original added date. User-cleared unknown stays unknown until explicitly reset.
- An estimate stores immutable provenance. The browser receives enough source and assumption detail to explain it. Reference changes do not silently change saved items. Matching is normalized exact food label plus storage, without fuzzy or category guesses. Active reference matches have a partial unique index.
- Persist successful adjustment receipts for the account lifetime. Key them by owner and request ID, compare canonical request JSON, and inject replayed=true on replay. Acquire a transaction advisory key lock before looking for a receipt, then lock the owned item. A missing receipt cannot provide a row lock. Receipts have no item foreign key and remain private. Replay returns the original snapshot even after item deletion. A new request against that deleted ID returns not_found.
- Shared reference reads and owner-restricted pantry/history reads are permitted. Direct authenticated writes and receipt reads are denied. Private commands derive auth.uid() and enforce ownership under a restricted NOLOGIN NOBYPASSRLS writer role that does not own the tables. If public wrappers need a separate restricted executor role to avoid authenticated EXECUTE on private commands, use it and state the grant matrix. Security-definer functions have empty search_path and qualified names. No authenticated role membership grants are permitted. Private helper schemas stay outside the Data API.
- Dates are real YYYY-MM-DD calendar dates. Return one UTC asOfDate per list response. Unknown urgency stays distinct. Past dates are labelled past date, today and tomorrow are critical, two through four days are soon, and five or more are later. Labels never assert verified freshness or safety. No timezone setting or cron is needed for this milestone.

## Work boundaries

KAN-5 owns shared schemas, tables, constraints, roles, projection and expiration-resolution helpers, and the disposable database runner. KAN-6 and KAN-7 share one SQL mutation owner because audit, versioning, and row locks must agree. After that contract exists, API adaptation and KAN-8 sourced reference seeds with pure urgency can proceed in separate checkouts. Integration remains on `feat/pantry-backend`.

Native PostgreSQL tools are installed at `C:/Program Files/PostgreSQL/18/bin`. Verification creates its own temporary cluster on loopback with a free port. It must never connect to or alter the installed services or hosted Supabase project. Test-only auth stubs belong in the disposable bootstrap. Supabase CLI 3.1.0 creates migration filenames. Production migrations do not create auth.users or auth.uid().

## Tradeoffs and handoff

The database owns transactions rather than adding a Node transaction framework. A small amount of PL/pgSQL protects the same invariants across Vercel instances and direct API calls. The starter reference dataset is intentionally narrow. Unmatched food stays unknown.

Existing UI still uses demo numeric IDs, string display quantities, and a frozen-date helper. The frontend tickets must map UUID IDs, stringify canonical API quantities for their view, use backend urgency including unknown, and swap fixtures for the HTTP APIs. Backend work does not silently claim that the dashboard has been integrated. CRUD creates are not retry-idempotent. The client should refresh after an uncertain create result before submitting again.
