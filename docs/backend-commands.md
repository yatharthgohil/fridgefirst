# Pantry database commands

KAN-6 installs pantry CRUD and list RPCs. KAN-7 installs atomic adjustments and recent history. The API adapter must use the verified user's Supabase session and parse returned JSON with the shared contracts. No owner argument is accepted. HTTP handlers and urgency are separate work.

| Public RPC | Arguments | Successful JSON |
| --- | --- | --- |
| `pantry_create` | `p_request jsonb`, `PantryCreateRequest` | `{item: PersistedPantryItem}` |
| `pantry_update` | `p_item_id uuid`, `p_request jsonb`, `PantryUpdateRequest` | `{item: PersistedPantryItem}` |
| `pantry_delete` | `p_item_id uuid`, `p_request jsonb`, `PantryDeleteRequest` | `{deleted:true}` |
| `pantry_list` | none | `{items: PersistedPantryItem[]}` |
| `inventory_adjust` | `p_request jsonb`, `InventoryAdjustmentRequest` | `InventoryAdjustmentResponse`, exactly `{item:{id,quantity,unit},entry:InventoryHistoryEntry,replayed:boolean}` |
| `inventory_history` | `p_limit integer default 20` | `{entries: InventoryHistoryEntry[]}` |

The fixed `pantry_list()` and `inventory_history(p_limit integer default 20)` read RPCs extend the reserved foundation signatures. Pantry list includes zero quantities and orders by expiration date ascending, null dates last, then UUID ascending. The API adds urgency using one UTC `asOfDate`. Create and update records contain no urgency or owner field. Delete maps to HTTP 204. UUID path arguments and integer history limits must be validated by the adapter before invoking PostgreSQL's typed RPC signatures.

Requests are strict JSON objects. Names are trimmed and contain 1 through 200 characters. Notes are omitted, null, or strings up to 2000 characters. Dates must be real canonical `YYYY-MM-DD` dates in years 0001 through 9999. Quantities are JSON numbers from 0 through 999999.999 with at most three decimal places. SQL rejects excess precision rather than rounding. Use the shared fourteen unit tokens and four storage tokens. Expiration accepts only `{kind:"estimate"}`, `{kind:"unknown"}`, or `{kind:"override",date:"YYYY-MM-DD"}`.

Update requires a positive safe integer `expectedVersion` and nonempty `changes`. Supplying a unit requires replacement quantity. Every accepted edit increments the version and audits once, including metadata and no-op changes. Cross-unit edits have null delta and unit. Same-unit metadata/no-op edits have null delta and preserve the unit. A positive quantity reactivates the item. At the maximum safe version, edits fail validation without mutation.

Update and delete lock the owned row before checking its version. Absent and foreign items both return `not_found`. Delete inserts a negative quantity snapshot before removal. The foreign key then clears all related history item IDs while preserving names, quantities and units. Every item write and audit insert is atomic. Unexpected database failures propagate and roll back the command.

Expiration uses the foundation resolver. Name, storage and added date changes rematch saved estimates using the retained or supplied added date. Overrides and user-cleared unknown dates persist until explicitly reset. Estimates outside the supported calendar range return validation. Reference provenance remains immutable between rematches.

Business errors return `{error:{code,message}}`. Codes map to HTTP `validation` 422, `unauthorized` 401, `not_found` 404 and `conflict` 409. Stale pantry versions use conflict without a `current` quantity. Validation messages are descriptive, not stable identifiers. Unexpected SQL exceptions must map to server errors without exposing raw diagnostics.

Adjustments require exactly `requestId`, `itemId`, `operation`, `amount`, `unit`, and `expectedQuantity`. The request ID is a string of 8 through 128 characters. Item ID remains a nonempty string in the shared contract. Production non-UUID IDs return `not_found`. Operations are `consume` and `discard`. Amount must be positive and obey the quantity precision/range rules. A valid supported unit that differs from the stored unit produces conflict, as does a mismatched expected quantity. Conflict includes `error.current` with exactly `{id,quantity,unit}`. An amount above the available quantity produces validation. No unit conversion occurs.

Adjustment canonicalization stores numeric JSON arguments as PostgreSQL numeric values, so trailing decimal zeros do not change identity. The transaction advisory lock uses a hash of the verified owner UUID plus request ID. Hash collisions can serialize unrelated requests without changing correctness. Receipt lookup occurs before UUID parsing or item lookup. Equal retries return the original item and history snapshots with `replayed:true`, even after item deletion. A changed payload under an existing successful key returns validation (HTTP 422). This corrects the earlier foundation sentence that called it conflict. Keys are independent across owners. Failed business requests have no receipt and can be retried after correcting input.

Every successful deduction increments version, writes one negative history entry, and persists its response receipt in the same transaction. Full consume marks `consumed`; full discard marks `discarded`. Partial deductions remain active. Audit or receipt insert failure propagates and rolls back all three writes. Successful receipts last for the account lifetime and have no item foreign key. Stored receipts retain `replayed:false`; only the replayed return value changes it. Existing quantity/unit preconditions still cannot detect an intervening change that restores both original values.

History accepts limits 1 through 100, defaults to 20, and returns validation for null or out-of-range limits. Entries are owner-restricted and ordered by timestamp descending, then transaction UUID descending. It uses the existing private history projection, including null item IDs after deletion. An empty account returns `{entries:[]}`.

Each public RPC is a security definer owned by `pantry_executor`, with empty search path and execution granted only to `authenticated`. It forwards to a matching `private.*_command` definer owned by `pantry_writer`. Only the executor receives explicit private command execution. Helpers are executable only by the writer. Both roles remain restricted, without table ownership or bypass RLS. Commands require non-null `auth.uid()` and restrict owner rows. Authenticated direct private access and table writes remain denied. The private schema must stay outside exposed Data API schemas.

Focused verification runs against a new disposable PostgreSQL 18 cluster:

```powershell
npx --yes --package=node@22.22.0 node --test tests/pantry-commands.test.mjs tests/inventory-database.test.mjs
```

The six grouped KAN-6 checks exercise RPC contracts, validation, two-user isolation, stale and concurrent writes, expiration, audit failure rollback, deletion snapshots, and role permissions. Seven grouped KAN-7 checks exercise deductions, validation/conflicts, durable replay, audit and receipt rollback, equal and changed payload races, different-key item races, bounded history, and permission gates. Tests use independent restricted psql sessions. Concurrency scheduling waits until the first session holds its completed command transaction before starting the competitor. Adjustment races also assert that the competing session is waiting on a database lock. No installed service or hosted project is used.

These commands follow the existing [Supabase function privilege guidance](https://supabase.com/docs/guides/database/functions) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). The migrations use the foundation's restricted two-level definer pattern. Supabase CLI 3.1.0 generated both filenames. Hosted Data API execution remains for integration verification. Scoped diff review replaces unavailable `deslop`; no delegation is part of this implementation worker.
