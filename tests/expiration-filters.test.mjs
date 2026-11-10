import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/register-ts-paths.mjs";

const display = await import("../src/features/pantry/expiration-display.ts");
const filters = await import("../src/features/pantry/pantry-filters.ts");
const fixtures = await import("../src/features/pantry/expiration-fixtures.ts");
const { expirationMetaSchema } = await import("../src/contracts/expiration.ts");

const { expirationMetaFixtures: meta, buildFixtureExpiration } = fixtures;

function item(id, name, { location = "Fridge", expiration, expirationDate } = {}) {
  return {
    id,
    name,
    quantity: "1",
    unit: "item",
    location,
    expirationDate: expirationDate ?? expiration?.date ?? "",
    expiry: "",
    urgency: "fresh",
    icon: "leaf",
    amount: 100,
    added: "May 1",
    expiration,
  };
}

// ---------- contract fixtures ----------

test("fixtures cover every date state and satisfy the contract", () => {
  const states = new Set();
  for (const value of Object.values(meta)) {
    expirationMetaSchema.parse(value);
    states.add(`${value.status}/${value.source}`);
  }
  for (const required of ["unknown/unknown", "past/estimated", "past/override", "expiring_soon/estimated", "expiring_soon/override", "ok/estimated"]) {
    assert.ok(states.has(required), `missing ${required}`);
  }
  assert.throws(() => expirationMetaSchema.parse({ date: null, source: "estimated", status: "unknown", daysUntil: null }));
  assert.throws(() => expirationMetaSchema.parse({ date: "2025-05-20", source: "estimated", status: "unknown", daysUntil: 1 }));
});

// ---------- badge wording ----------

test("unknown dates stay visibly unknown and imply nothing about freshness", () => {
  const d = display.describeExpiration(meta.unknown);
  assert.equal(d.tone, "unknown");
  assert.equal(d.label, "Date unknown");
  assert.equal(d.tag, null);
  const text = [d.label, d.description, ...display.explainExpiration(meta.unknown)].join(" ");
  assert.doesNotMatch(text, /\bfresh\b(?! or)|\bsafe\b|expired/i);
});

test("past dates are labelled as passed without asserting safety", () => {
  const estimated = display.describeExpiration(meta.pastEstimated);
  assert.equal(estimated.tone, "past");
  assert.equal(estimated.label, "Past estimated date");
  assert.equal(estimated.tag, "Estimate");
  assert.match(estimated.description, /May 17, 2025 passed 2 days ago/);

  const override = display.describeExpiration(meta.pastOverride);
  assert.equal(override.label, "Past your date");
  assert.equal(override.tag, "Your date");
  assert.match(override.description, /passed yesterday/);

  for (const m of [meta.pastEstimated, meta.pastOverride]) {
    const all = [display.describeExpiration(m).label, display.describeExpiration(m).description, ...display.explainExpiration(m)].join(" ");
    assert.doesNotMatch(all, /expired|spoiled|is safe|is unsafe|still safe/i);
    assert.match(all, /check/i);
  }
});

test("upcoming dates show a text label plus estimate/override source", () => {
  assert.deepEqual(
    [meta.today, meta.tomorrow, meta.soonOverride, meta.okEstimated, meta.farEstimated].map((m) => {
      const d = display.describeExpiration(m);
      return [d.tone, d.label, d.tag];
    }),
    [
      ["soon", "Use today", "Estimate"],
      ["soon", "Use by tomorrow", "Estimate"],
      ["soon", "Use within 2 days", "Your date"],
      ["ok", "9 days left", "Estimate"],
      ["ok", "By Jan 19", "Estimate"],
    ],
  );
});

test("explanations describe estimate provenance and overrides", () => {
  assert.match(display.explainExpiration(meta.okEstimated)[0], /typical shelf life for yogurt stored in the fridge \(about 10 days\)/);
  assert.match(display.explainExpiration(meta.soonOverride)[0], /You set this date on May 15, 2025/);
  assert.match(display.explainExpiration(meta.today).join(" "), /estimate/i);
});

test("items without backend metadata are unknown only when undated", () => {
  assert.equal(display.getExpiration({ expirationDate: "" }).status, "unknown");
  assert.equal(display.getExpiration({ expirationDate: "2025-06-01" }).date, "2025-06-01");
});

// ---------- sorting (contract: date asc, unknown last, name, id) ----------

test("soonest-expiration sort follows the contract and is deterministic for unknowns and ties", () => {
  const list = [
    item(5, "zucchini", { expiration: meta.unknown }),
    item(2, "Apple", { expiration: meta.okEstimated }),
    item(4, "apple", { expiration: meta.unknown }),
    item(1, "Basil", { expiration: meta.pastOverride }),
    item(3, "Cream", { expiration: meta.pastEstimated }),
    item(7, "Kale", { expiration: meta.today }),
    item(6, "Kale", { expiration: meta.today }),
  ];
  const ids = (sorted) => sorted.map((entry) => entry.id);
  const expected = [3, 1, 6, 7, 2, 4, 5];
  assert.deepEqual(ids(filters.sortPantryItems(list, "expiration")), expected);
  // Same result regardless of input order.
  assert.deepEqual(ids(filters.sortPantryItems([...list].reverse(), "expiration")), expected);
  assert.deepEqual(ids(filters.sortPantryItems(list, "name")), [2, 4, 1, 3, 6, 7, 5]);
  assert.deepEqual(ids(filters.sortPantryItems(list, "added")), [7, 6, 5, 4, 3, 2, 1]);
});

// ---------- filters ----------

const pantry = [
  item(1, "Spinach", { location: "Fridge", expiration: meta.today }),
  item(2, "Basil", { location: "Counter", expiration: meta.pastOverride }),
  item(3, "Chili", { location: "Fridge", expiration: meta.unknown }),
  item(4, "Rice", { location: "Pantry", expiration: meta.unknown }),
  item(5, "Yogurt", { location: "Fridge", expiration: meta.okEstimated }),
  item(6, "Cream", { location: "Fridge", expiration: meta.pastEstimated }),
];
const ids = (list) => list.map((entry) => entry.id).sort((a, b) => a - b);
const state = (overrides) => ({ ...filters.DEFAULT_PANTRY_FILTERS, ...overrides });

test("each expiration filter matches its backend status", () => {
  assert.deepEqual(ids(filters.filterPantryItems(pantry, state({ expiration: ["expiring_soon"] }))), [1]);
  assert.deepEqual(ids(filters.filterPantryItems(pantry, state({ expiration: ["past"] }))), [2, 6]);
  assert.deepEqual(ids(filters.filterPantryItems(pantry, state({ expiration: ["unknown"] }))), [3, 4]);
  assert.deepEqual(ids(filters.filterPantryItems(pantry, state({ location: "Pantry" }))), [4]);
});

test("filters combine: any selected status AND location AND search", () => {
  const combined = state({ expiration: ["past", "unknown"], location: "Fridge" });
  assert.deepEqual(ids(filters.filterPantryItems(pantry, combined)), [3, 6]);
  assert.deepEqual(ids(filters.filterPantryItems(pantry, { ...combined, query: "cre" })), [6]);
  assert.deepEqual(filters.countByExpirationFilter(pantry, combined), { expiring_soon: 1, past: 1, unknown: 1 });
});

test("no matches, then clearing filters restores the full list but keeps the sort", () => {
  const none = state({ expiration: ["expiring_soon"], location: "Pantry", sort: "name" });
  assert.equal(filters.applyPantryFilters(pantry, none).length, 0);
  assert.equal(filters.hasActiveFilters(none), true);

  const cleared = filters.clearPantryFilters(none);
  assert.equal(filters.hasActiveFilters(cleared), false);
  assert.equal(cleared.sort, "name");
  assert.equal(filters.applyPantryFilters(pantry, cleared).length, pantry.length);
});

test("toggling a filter twice removes it", () => {
  let s = filters.toggleExpirationFilter(state({}), "past");
  assert.deepEqual(s.expiration, ["past"]);
  s = filters.toggleExpirationFilter(s, "past");
  assert.deepEqual(s.expiration, []);
});

// ---------- edits / overrides / refreshes ----------

test("changing a date makes it an override and moves it between filters", () => {
  const before = fixtures.withFixtureExpiration(item(1, "Spinach", { expirationDate: "2025-05-28" }));
  assert.equal(before.expiration.source, "estimated");
  assert.equal(before.expiration.status, "ok");

  const now = new Date("2025-05-19T12:00:00Z");
  const overridden = fixtures.applyFixtureExpirationEdit(before, { ...before, expirationDate: "2025-05-18" }, { now });
  assert.equal(overridden.expiration.source, "override");
  assert.equal(overridden.expiration.status, "past");
  assert.equal(overridden.expiration.overriddenAt, now.toISOString());
  assert.deepEqual(ids(filters.filterPantryItems([overridden], state({ expiration: ["past"] }))), [1]);

  const cleared = fixtures.applyFixtureExpirationEdit(overridden, { ...overridden, expirationDate: "" });
  assert.equal(cleared.expiration.status, "unknown");
  assert.equal(display.describeExpiration(cleared.expiration).label, "Date unknown");

  const renamed = fixtures.applyFixtureExpirationEdit(overridden, { ...overridden, name: "Baby spinach" });
  assert.equal(renamed.expiration.source, "override");
});

test("a quantity refresh keeps the item's expiration metadata", () => {
  const original = fixtures.withFixtureExpiration(item(1, "Spinach", { expirationDate: "2025-05-20" }));
  const refreshed = { ...original, quantity: "0.5" };
  assert.deepEqual(refreshed.expiration, original.expiration);
  assert.equal(buildFixtureExpiration("not-a-date", "estimated").status, "unknown");
});
