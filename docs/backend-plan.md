# Pantry backend implementation plan

## Scope from Jira

The November 12, 2026 Jira read found these backend tickets assigned to Yatharth Gohil.

| Ticket | Delivery | Dependencies |
| --- | --- | --- |
| KAN-5 | Pantry, history, and reference migrations, ownership enforcement, shared Zod contracts, fixtures | KAN-3 database design, existing Google Auth |
| KAN-6 | Authenticated pantry list, create, edit, and delete with atomic history and stale-write conflicts | KAN-5 |
| KAN-7 | Atomic consume and discard, retry protection, bounded recent history | KAN-5, KAN-6 item shape |
| KAN-8 | Reproducible shelf-life references, editable estimates, provenance, urgency metadata | KAN-5, KAN-6 integration |

KAN-1 authentication is in review and already implemented. Reuse its cookie-based Supabase client and verified server identity. KAN-4 limits this milestone to manual pantry management. Photo analysis, recipes, cooking deductions, administrator UI, and password authentication remain deferred.

KAN-9 through KAN-12 belong to Amy Ho and Samia Haynes. Their backend dependencies are included above. Their page and component implementation remains outside this backend change. Existing inventory endpoint names and response shapes in `src/contracts/inventory.ts` must remain compatible.

Jira links use the project site at <https://yatharthsworkspace-27070375.atlassian.net>. The ticket descriptions and linked frontend tasks were read through Jira MCP. KAN-3 has no description or comments. Its local artifact is `FridgeFirst Database Design.pdf`.

## Grounding

`PROJECT_CONTEXT.md` specifies one Next.js modular monolith, server-only domain modules, Zod boundaries, Supabase Auth, and PostgreSQL ownership policies. The PDF supplies `pantry_items`, `inventory_transactions`, and `shelf_life_references`. Reuse its UUID keys, numeric quantities, storage locations, dates, reference association, and inventory audit concept. Use `auth.users` directly rather than adding the PDF's optional profile table for this milestone.

The current repository has Google Auth and fixture-backed pantry UI. It has no product migrations or persistence endpoints. The inventory client already calls `/api/inventory/adjustments` and `/api/inventory/history` and sends a request identifier and expected quantity. Keep the backend compatible with those contracts. Production database IDs can be UUIDs while existing demo fixtures retain their identifiers.

Design gaps to resolve in the implementation rationale include supported units, fractional precision, stale edits, deletion history, idempotency storage, shelf-life matching, override preservation, storage changes, date policy, and urgency thresholds.

## Workflow and verification gates

1. Compare two independent architecture sketches against ownership, atomicity, retry safety, frontend compatibility, and maintainer cost.
2. Establish shared contracts and database foundation before dependent ticket work.
3. Implement coherent ticket units in descriptive feature branches. Use isolated worker checkouts, then integrate reviewed commits into `feat/pantry-backend`.
4. Keep a small set of behavior checks for validation, two-user access, rollback, stale writes, retry, concurrent deductions, and expiration boundaries. Exercise real SQL locally when available. Do not represent fixture tests as database verification.
5. Run lint, typechecking, production build, focused behavior checks, and signed-out endpoint checks. Document any unavailable live verification.
6. Document endpoints, policies, setup, and frontend integration. Review the final diff and decision trail before handback.

The done predicate is that all four ticket behaviors exist, their API contracts and migrations agree, build checks pass, focused behavior checks verify their invariants, and any remaining external setup or verification gaps are stated explicitly.

## Throughput checkpoint

- Blocking first steps. Read the database artifact, choose one transactional write design, and finalize shared contracts before implementation fan-out.
- Independent workstreams. Expiration policy and API services can separate after their shared contracts exist. SQL writes and audit invariants stay with one owner.
- Shared mutable state. Each implementation worker receives an isolated checkout. One integration owner reviews and combines commits. Shared contracts and migration order are established first.
- Smallest safe decomposition. KAN-5 precedes KAN-6 and KAN-7 because their correctness depends on its transaction contract. KAN-8 can separate only after the expiration input and response shapes are settled.

## Baseline

The starting commit is `f82b344e5e7b00dfbf6132841f35561413684b15`, which includes the current authentication and pantry frontend work. Preserve those unpublished dependencies. Initial `npm run typecheck` passes. Initial `npm run lint` passes with 11 existing frontend warnings and no errors.
