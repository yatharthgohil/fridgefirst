# Expiration estimates and urgency

KAN-8 adds the reference seed, the pure urgency policy, and the read-time metadata the API returns. It adds no HTTP route and no pantry write path. The pantry commands stay with KAN-6 and KAN-7.

## What an expiration result is

Every pantry item carries exactly one expiration result, and the shared contract in `src/contracts/pantry.ts` models it as a three-way union.

| Kind | Meaning | Date |
| --- | --- | --- |
| `estimate` | Derived from a shelf-life reference | The reference date |
| `override` | Set by the user | The user's date |
| `unknown` | No date could be resolved | `null` |

An unknown result carries a reason. `no_match` means no reference matched the food label and storage location. `user_cleared` means the user explicitly cleared the estimate.

## Matching

Matching is exact. The database normalizes whitespace and case on the food label, then compares it with the normalized label of an active reference alongside the storage location. There is no fuzzy matching, no category guess, and no synonym list.

Two consequences follow. A generic label such as `Chicken` does not match `Raw chicken pieces`, because the reference states a preparation state the label does not. A `Freezer` copy of `Raw chicken pieces` does not match either, because the seeded references describe refrigeration only.

The seeded references and their derivation rules are described in [supabase/seed/README.md](../supabase/seed/README.md). The FoodSafety.gov cold food storage chart is the primary source, and the migration `supabase/migrations/20261112211901_expiration_references.sql` is the single maintained list of reference values.

## Urgency

`src/server/modules/expiration/policy.ts` turns an expiration result and a reference date into urgency. It is a pure function with no server-only marker, so the focused checks can import it directly. `src/server/modules/expiration/index.ts` is the server entry point for other server modules.

| Days remaining | Urgency kind | Label |
| --- | --- | --- |
| None, because the result is unknown | `unknown` | `Date unknown` |
| Negative | `past_date` | `Past date` |
| 0 | `critical` | `Use today` |
| 1 | `critical` | `Use tomorrow` |
| 2 to 4 | `soon` | `N days left` |
| 5 or more | `later` | `N days left` |

An unknown result keeps `daysRemaining` at `null`, which keeps it distinct from a known past date. The kind is the filter metadata a list endpoint needs: `unknown`, `past_date`, `critical`, `soon`, and `later` are the only values the shared schema accepts.

No label asserts that food is safe to eat or still fresh. The wording describes time, not condition.

## Dates

All day arithmetic uses UTC calendar dates, not local midnights. `utcToday` returns the current UTC date, and the policy converts both dates to a day index before subtracting them. A day is therefore 24 hours of UTC regardless of a daylight-saving change or a leap day, and two items cannot land on different day counts because the server and the browser sit in different time zones.

The date inputs are already validated by the shared `calendarDateSchema`, which rejects impossible dates such as `2026-02-30`. The policy trusts that contract instead of validating again.

## Overrides, resets, and cleared estimates

One expiration kind is authoritative at a time, and each kind has a defined lifecycle.

- An override survives unrelated edits, including a storage change. The user set that date deliberately.
- A user-cleared unknown stays unknown until the user resets it. Clearing writes the intent `{kind: "unknown"}` and the resolver stores it as `user_cleared`. Resetting writes `{kind: "estimate"}` again, which is the only way a cleared estimate comes back. Adding a reference later does not revive a cleared estimate.
- A saved estimate keeps the provenance snapshot it was created with. Changing a reference row never rewrites a saved estimate, so a pantry does not shift under a user because shared data changed.

## Recalculation

An estimate is recomputed when the inputs that produced it change: the food label, the storage location, or the basis date. The basis date is `addedOn`, which the seed treats as the acquisition or preparation date. The database resolver in `private.resolve_expiration` recomputes the date from that basis date plus the reference interval, never from the date of the edit, so a renamed item keeps the age it had when it was added.

A week-old item renamed to a food with a different interval gets the new interval measured from its original basis date, not from today.

The pantry commands decide when to ask for a recalculation, and they pass the rematch flag to the resolver. This ticket owns neither, so the behavior above is the resolver contract that the commands rely on.

## Verification

The focused checks run against a disposable PostgreSQL cluster created by `tests/helpers/postgres.mjs`.

```powershell
npm ci
npx --yes --package=node@22.22.0 node --test tests/expiration.test.mjs tests/expiration-database.test.mjs
npm run typecheck
npm run lint
```

`tests/expiration.test.mjs` covers the urgency bands, UTC day differences across leap years and clock changes, shared date validation, and the record shape after urgency is added. `tests/expiration-database.test.mjs` covers seed reproducibility, matching against the seeded labels and storage, and the provenance and override behavior of the stored result.

Native PostgreSQL verifies the SQL. Hosted Supabase behavior, the HTTP routes, and the browser rendering of urgency remain unverified in this ticket, because no hosted environment and no route exist yet.
