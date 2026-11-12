# Pantry database commands

KAN-6 installs pantry CRUD and list RPCs. The API adapter must use the verified user's Supabase session and parse returned JSON with the shared contracts. No owner argument is accepted. HTTP handlers and urgency are separate work.

| Public RPC | Arguments | Successful JSON |
| --- | --- | --- |
| `pantry_create` | `p_request jsonb`, `PantryCreateRequest` | `{item: PersistedPantryItem}` |
| `pantry_update` | `p_item_id uuid`, `p_request jsonb`, `PantryUpdateRequest` | `{item: PersistedPantryItem}` |
| `pantry_delete` | `p_item_id uuid`, `p_request jsonb`, `PantryDeleteRequest` | `{deleted:true}` |
| `pantry_list` | none | `{items: PersistedPantryItem[]}` |

The fixed `pantry_list()` read RPC extends the reserved foundation signatures. It includes zero quantities and orders by expiration date ascending, null dates last, then UUID ascending. The API adds urgency using one UTC `asOfDate`. Create and update records contain no urgency or owner field. Delete maps to HTTP 204. UUID path arguments must be validated by the adapter before invoking PostgreSQL's typed RPC signature.

Requests are strict JSON objects. Names are trimmed and contain 1 through 200 characters. Notes are omitted, null, or strings up to 2000 characters. Dates must be real canonical `YYYY-MM-DD` dates in years 0001 through 9999. Quantities are JSON numbers from 0 through 999999.999 with at most three decimal places. SQL rejects excess precision rather than rounding. Use the shared fourteen unit tokens and four storage tokens. Expiration accepts only `{kind:"estimate"}`, `{kind:"unknown"}`, or `{kind:"override",date:"YYYY-MM-DD"}`.

Update requires a positive safe integer `expectedVersion` and nonempty `changes`. Supplying a unit requires replacement quantity. Every accepted edit increments the version and audits once, including metadata and no-op changes. Cross-unit edits have null delta and unit. Same-unit metadata/no-op edits have null delta and preserve the unit. A positive quantity reactivates the item. At the maximum safe version, edits fail validation without mutation.

Update and delete lock the owned row before checking its version. Absent and foreign items both return `not_found`. Delete inserts a negative quantity snapshot before removal. The foreign key then clears all related history item IDs while preserving names, quantities and units. Every item write and audit insert is atomic. Unexpected database failures propagate and roll back the command.

Expiration uses the foundation resolver. Name, storage and added date changes rematch saved estimates using the retained or supplied added date. Overrides and user-cleared unknown dates persist until explicitly reset. Estimates outside the supported calendar range return validation. Reference provenance remains immutable between rematches.

Business errors return `{error:{code,message}}`. Codes map to HTTP `validation` 422, `unauthorized` 401, `not_found` 404 and `conflict` 409. Stale pantry versions use conflict without a `current` quantity. Validation messages are descriptive, not stable identifiers. Unexpected SQL exceptions must map to server errors without exposing raw diagnostics.

Each public RPC is a security definer owned by `pantry_executor`, with empty search path and execution granted only to `authenticated`. It forwards to a matching `private.*_command` definer owned by `pantry_writer`. Only the executor receives explicit private command execution. Helpers are executable only by the writer. Both roles remain restricted, without table ownership or bypass RLS. Commands require non-null `auth.uid()` and restrict owner rows. Authenticated direct private access and table writes remain denied. The private schema must stay outside exposed Data API schemas.

Focused verification runs against a new disposable PostgreSQL 18 cluster:

```powershell
npx --yes --package=node@22.22.0 node --test tests/pantry-commands.test.mjs
```

The six grouped KAN-6 checks exercise RPC contracts, validation, two-user isolation, stale and concurrent writes, expiration, audit failure rollback, deletion snapshots, and role permissions. Tests use independent restricted psql sessions. Concurrency scheduling waits until the first session holds its completed command transaction before starting the competitor. No installed service or hosted project is used.
