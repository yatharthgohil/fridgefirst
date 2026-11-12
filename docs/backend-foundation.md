# Pantry backend foundation

KAN-5 supplies the shared contracts and database foundation for KAN-6 through KAN-8. The selected contract is [backend-architecture.md](backend-architecture.md). No CRUD or adjustment commands or routes exist in this ticket.

## Shared contracts

`src/contracts/common.ts` owns the fourteen existing units, four storage tokens, three-decimal quantities, and calendar dates. Quantities range from zero through 999999.999. Validation normalizes floating point representation noise once. Tiny positive deductions cannot round to zero. SQL uses an unconstrained numeric domain with explicit precision checks because `numeric(9,3)` would silently round before checking.

`src/contracts/pantry.ts` owns strict create, nonempty update, and delete requests, persisted item JSON, expiration intent and result unions, and response urgency. Persisted item JSON has no owner field. Requests cannot supply an owner or item ID. The route supplies its path ID separately. Unit changes require replacement quantity.

`src/contracts/inventory.ts` retains existing wire fields, fixture string IDs, and public string unit types. Unit values are validated against the common enum. `src/contracts/pantry-fixtures.ts` provides unknown, override, and estimate examples for UI integration. Its estimate is demonstration data, not reference guidance.

## Database and grants

Public tables retain `item_id`, `user_id`, `shelf_life_id`, `transaction_id`, and `reference_id`. Owners reference `auth.users`. History keeps name and unit snapshots. Item deletion sets history `item_id` to null. Account deletion cascades owned data, including receipts. Reference deletion is restricted while items reference it. Active exact food and storage matches are unique.

All four tables enable RLS. Table ownership stays with the migration role. Both application roles are `NOLOGIN NOINHERIT NOBYPASSRLS` without superuser, database creation, role creation, or replication privileges. Neither is granted to `authenticated` or `anon`.

| Object | anon | authenticated | pantry_writer | pantry_executor |
| --- | --- | --- | --- | --- |
| public.pantry_items | none | SELECT own | SELECT, INSERT, UPDATE, DELETE own | none |
| public.inventory_transactions | none | SELECT own | SELECT, INSERT own | none |
| public.shelf_life_references | none | SELECT | SELECT | none |
| private.inventory_request_receipts | none | none | SELECT, INSERT own | none |
| private projection and resolver helpers | none | none | EXECUTE | none |
| private schema | none | none | USAGE | USAGE |

The executor currently has no executable commands. A later ticket grants it execution on each private command explicitly. The writer cannot change references or edit history and receipts. Its history insert policy also requires that a linked item belongs to the current account. Owner indexes support RLS reads. Receipt identity is `(user_id, request_id)` and has no item foreign key.

The `private` schema must remain outside Supabase Data API exposed schemas. Explicit table and function revocations protect against platform default grants. The migration does not change unrelated application default privileges.

## Helpers

Existing SQL signatures are:

```sql
private.pantry_item_json(p public.pantry_items) returns jsonb
private.inventory_history_json(t public.inventory_transactions) returns jsonb
private.resolve_expiration(
  p_name text, p_storage public.pantry_storage, p_added_on date,
  p_intent jsonb, p_previous jsonb default null, p_rematch boolean default false
) returns jsonb
```

All helpers are invokers with empty `search_path` and qualified object names. Only the writer can call them. Projections return camel-case records matching shared schemas. Pantry projection excludes urgency, which is computed from one UTC `asOfDate` at read time in KAN-8.

Expiration resolution normalizes whitespace and case for exact food-label and storage matching. A match returns an estimate with an immutable source snapshot. Missing matches return unknown with `no_match`. Explicit unknown returns `user_cleared`. Explicit override returns its date.

For creates, pass explicit intent and null previous state. For edits, pass explicit intent only when supplied by the user. Otherwise pass the previous expiration result. Set `p_rematch` when name, storage, or added date changes. Omitted intent preserves overrides and user-cleared unknown even with rematching. Saved estimates remain unchanged until rematching is requested. Resetting to estimate explicitly allows a new match. Matching uses the original or newly supplied `addedOn`, never the edit date. Previous results are internal trusted values parsed by the shared schema, not arbitrary client JSON.

## Command contract for KAN-6 and KAN-7

These are reserved signatures, not installed placeholder functions:

```sql
public.pantry_create(p_request jsonb) returns jsonb
public.pantry_update(p_item_id uuid, p_request jsonb) returns jsonb
public.pantry_delete(p_item_id uuid, p_request jsonb) returns jsonb
public.inventory_adjust(p_request jsonb) returns jsonb
private.pantry_create_command(p_request jsonb) returns jsonb
private.pantry_update_command(p_item_id uuid, p_request jsonb) returns jsonb
private.pantry_delete_command(p_item_id uuid, p_request jsonb) returns jsonb
private.inventory_adjust_command(p_request jsonb) returns jsonb
```

Public wrappers are `SECURITY DEFINER`, owned by `pantry_executor`, with execution granted only to `authenticated`. Each wrapper forwards to its matching private command. Private commands are `SECURITY DEFINER`, owned by `pantry_writer`, and executable only by `pantry_executor`. Both levels use empty `search_path` and qualified names. Explicitly revoke PUBLIC, anon, and authenticated execution on private commands and PUBLIC and anon execution on wrappers. The migration administrator needs authority to assign those function owners. Do not make either role a table owner or grant either role to authenticated users.

Commands derive and require non-null `auth.uid()` rather than accepting user IDs. They validate JSON independently at the SQL boundary. Use the existing inventory error envelope for business errors. Expected errors return `{"error":{"code":"validation|conflict|not_found|unauthorized","message":"..."}}`. Unexpected database exceptions propagate for server error handling. On success, create and update return `{"item": <persisted item>}`, delete returns `{"deleted":true}`, and adjustment returns the existing item, entry, and replayed envelope. HTTP adds urgency and translates successful delete to 204.

Update and delete lock only the owned item, compare `expectedVersion`, and return not_found for absent or foreign items. Each accepted edit increments version and inserts one edit history row, including no-op edits. Cross-unit edits record null delta and null unit. Metadata edits record null delta. Positive corrections reactivate items. Deletions insert snapshot history with negative quantity and the deleted unit before removal. Every mutation and its history insert share one command transaction.

Adjustment validates the existing expected quantity and unit. It takes a transaction advisory lock on the owner and request ID before checking the receipt, then locks the owned item. It compares canonical request JSON with an existing receipt, returns conflict on a different request, and replays the original response with `replayed=true` on a match. A successful adjustment stores its receipt in the same transaction as the item and history changes. Full deductions set consumed or discarded status. Receipts last for the account lifetime and survive item deletion. Error results are not receipts. CRUD creates have no retry guarantee.

## Verification

Run from the checkout with PostgreSQL 18 binaries installed:

```powershell
npm ci
npx --yes --package=node@22.22.0 node --test tests/pantry-contracts.test.mjs tests/pantry-database.test.mjs
npm run typecheck
npm run lint
```

`POSTGRES_BIN` overrides `C:/Program Files/PostgreSQL/18/bin`. `tests/helpers/postgres.mjs` exports `withPostgres(run)`. The callback receives `sql`, `command`, `connectionArgs`, `root`, and `port`, so later tickets can add parallel psql sessions and command behavior checks. `sql` rejects SQL errors with verbose SQLSTATE diagnostics.

The runner uses `mkdtemp`, an available loopback port, a new trust-authenticated cluster, and test-only auth stubs. It applies all repository migrations in filename order. Child processes use `windowsHide`. The runner stops only its own cluster and removes only its validated temporary directory in `finally`. It never reads hosted credentials, uses an existing service connection, or applies remote migrations. Trust authentication is restricted to the temporary loopback cluster for its lifetime. A process killed outside normal cleanup may leave its temporary directory for manual inspection.

The five grouped checks cover contract inputs, authenticated read and write permissions, writer ownership restrictions, quantity/date/state constraints and deletion history, and expiration matching and preservation. SQL sessions use restricted session authorization rather than a superuser's temporary role switch. Test-only definer probes verify that the two-level wrapper design preserves RLS and blocks direct private execution. The probes are removed after the check. SQL projections are parsed with the actual shared Zod schemas.

Native PostgreSQL verifies SQL and role behavior. Hosted Supabase Data API integration, sourced references, urgency computation, CRUD, stale writes, and adjustment retry/concurrency behavior remain for later tickets. The `deslop` skill is unavailable under the T3 adapter, so this ticket uses an ordinary scoped diff review.

The function privilege design follows the current [Supabase database function guidance](https://supabase.com/docs/guides/database/functions) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Supabase CLI 3.1.0 generated the migration filename with `migration new pantry_foundation` after its command help was read. No hosted apply, push, or deployment is part of this ticket.
