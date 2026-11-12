# Pantry backend delivery

## Review order

Each branch contains one focused commit relative to the preceding branch. Review and merge the PRs from the first row downward. No changes were pushed to main. The original authentication and implementation branches remain available as working-history references.

| Branch | Base | Change |
| --- | --- | --- |
| `fix/modal-state-lifecycle` | `main` | Remove conditional hooks and reset item drafts |
| `feat/google-auth` | `fix/modal-state-lifecycle` | Google authentication, verified sessions, setup, and auth checks |
| `feat/pantry-schema` | `feat/google-auth` | KAN-5 schema, grants, contracts, and PostgreSQL runner |
| `feat/pantry-crud` | `feat/pantry-schema` | KAN-6 atomic pantry commands |
| `feat/inventory-adjustments` | `feat/pantry-crud` | KAN-7 deductions, durable retries, and history |
| `feat/expiration-policy` | `feat/inventory-adjustments` | KAN-8 reference seed and UTC urgency |
| `feat/pantry-api` | `feat/expiration-policy` | Authenticated endpoints and integration documentation |

The new `feat/google-auth` branch replaces the old provider-labelled branch as the review branch. The modal changes previously mixed into authentication are isolated in the first PR. Supabase package versions are pinned. The backend source and tests match the separately verified implementation units. The authentication review's unused sign-out message branch was removed before the final run.

## Verified locally

The final stack was checked with Node.js 22.22.0 on November 12, 2026.

- Lint passes with zero errors and the same 11 existing frontend warnings.
- Typechecking and the production build pass. The build includes pantry and inventory API routes.
- All 60 tests pass against a production Next.js server and disposable native PostgreSQL 18 clusters.
- SQL checks use restricted roles and independent connections for ownership, grants, rollback, stale writes, and retry races.
- HTTP checks cover signed-out JSON responses, cache behavior, and authentication redirects. Protocol checks cover parsing, origin policy, and error mapping.

Start the built production server on localhost, then run the tests from another terminal using the same hostname and port:

```powershell
npm run lint
npm run typecheck
npm run build
npm start -- --hostname localhost --port 3000
```

```powershell
$env:TEST_BASE_URL = 'http://localhost:3000'
$env:POSTGRES_BIN = 'C:/Program Files/PostgreSQL/18/bin'
npm test
```

The test runtime must be Node.js 22.18 or newer. On the development machine, Node.js 22.16 was present, so verification used `npx --yes --package=node@22.22.0 node --test tests/*.test.mjs`. Each database suite creates and removes its own cluster. It never connects to an installed PostgreSQL service or a hosted database.

Two local tooling failures were corrected before the passing final run. A running local server held the SWC binary during `npm ci`; `npm install --ignore-scripts` repaired dependencies without stopping that server or changing the lockfile. Saved generated route types initially appeared under the audit directory and polluted lint. Moving them under Next.js's ignored cache corrected the check. Neither failure required an application change or a relaxed lint rule.

## Remaining integration limits

No hosted migrations or deployment were performed. A role-capable migration administrator must apply the versioned SQL and keep the private schema outside the Data API exposed schemas. The local database bootstrap supplies test-only Auth stubs; it does not establish hosted Supabase behavior.

Successful live Google login, refresh, sign-out, and signed-in HTTP requests through hosted Supabase remain unverified. The current dashboard still uses frontend fixtures. Amy and Samia's frontend tasks must connect the APIs, use UUID identifiers, format numeric quantities, and render unknown expiration explicitly. These limits are also described in [backend-api.md](backend-api.md).

The scoped auth review found no blocking defects. Its minor unused-message finding was fixed. The backend review and decision trail accompany this delivery. The unavailable `deslop` dependency was replaced by scoped diff reviews, as specified by the local T3 adapter.
