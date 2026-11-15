# Shelf-life reference seed

`supabase/migrations/20261112211901_expiration_references.sql` holds the seeded shelf-life references. That migration is the only place where reference values are maintained. This file explains where the values come from and how to change them.

## Source

The primary source is the [FoodSafety.gov cold food storage chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts), last reviewed September 19, 2023 and read on November 12, 2026.

Only the refrigerator column applies. The chart covers food held at or below 40 F (4 C). The freezer column states quality guidance rather than a safe duration, so the seed does not convert freezer intervals into days.

## Derivation rules

- Each seeded row takes the shortest interval the chart gives for that food and preparation state. A chart range of 1 to 2 days becomes 1 day, and a range of 3 to 5 weeks becomes 21 days.
- The food name states the preparation state, so a generic label such as `Chicken` or `Eggs` never matches a state the chart did not cover. Users must name an item with the same words the reference uses, such as `Raw chicken pieces` or `Hard-cooked eggs`.
- The storage location is `Fridge` because the chart describes refrigeration. A freezer or pantry copy of the same food does not match and stays unknown.
- Every row records the chart row it came from through `source_name`, `source_url`, `source_accessed_on`, and a sentence of assumptions.

## Assumptions carried by every seeded row

The `addedOn` date of an item is the acquisition or preparation date, and the food is assumed to stay continuously refrigerated at or below 4 C. The resulting date is an estimate. It does not verify that food is safe to eat or still fresh, and it does not account for a broken cold chain.

## Adding or changing a reference

1. Edit the seed migration so the row set stays a single list. Give a new row a stable `reference_id` and keep the `on conflict (reference_id) do update` clause, so rerunning the migration converges on the same rows.
2. Keep one active row per food label and storage location. The database enforces this with a partial unique index.
3. Never edit a stored estimate to match a changed reference. A saved estimate keeps the provenance snapshot it was created with.
4. Expect a rerun to restore the source values of a seeded row. A row an administrator deactivated stays deactivated, because the active flag is administrative state rather than a source value.

Provenance on a saved estimate already carries the reference ID, the source URL, and the date the source was read. A separate source revision field is not needed, and adding one would require coordinating with the API work that reads provenance.
