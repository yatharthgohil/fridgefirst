import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/register-ts-paths.mjs";

const display = await import("../src/features/pantry/expiration-display.ts");
const filters = await import("../src/features/pantry/pantry-filters.ts");
const fixtures = await import("../src/features/pantry/expiration-fixtures.ts");
const { expirationResultSchema, urgencySchema } = await import("../src/contracts/pantry.ts");
const { compareBySoonestExpiration } = await import("../src/server/modules/expiration/policy.ts");

const provenance = {
  referenceId: "00000000-0000-4000-8000-000000000008",
  foodName: "Yogurt",
  storageLocation: "Fridge",
  days: 10,
  sourceName: "Demo source",
  sourceUrl: "https://example.com/source",
  sourceAccessedOn: "2025-05-01",
  assumptions: "Unopened, refrigerated.",
};

// One API-shaped expiration result per state; urgency comes from the backend policy.
const results = {
  unknownNoMatch: { kind: "unknown", date: null, reason: "no_match" },
  unknownCleared: { kind: "unknown", date: null, reason: "user_cleared" },
  pastEstimate: { kind: "estimate", date: "2025-05-17", provenance },
  pastOverride: { kind: "override", date: "2025-05-18" },
  today: { kind: "estimate", date: "2025-05-19", provenance },
  tomorrowOverride: { kind: "override", date: "2025-05-20" },
  soon: { kind: "estimate", date: "2025-05-22", provenance },
  later: { kind: "estimate", date: "2025-05-28", provenance },
};
const info = Object.fromEntries(Object.entries(results).map(([key, value]) => [key, fixtures.fixtureInfo(value)]));

function item(id, name, { location = "Fridge", state } = {}) {
  return {
    id, name, quantity: "1", unit: "item", location,
    expirationDate: info[state]?.expiration.date ?? "", expiry: "", urgency: "fresh",
    icon: "leaf", amount: 100, added: "May 1", expirationInfo: info[state],
  };
}

// ---------- contract ----------

test("fixtures use the backend expiration/urgency contract and cover every state", () => {
  const kinds = new Set();
  for (const value of Object.values(info)) {
    expirationResultSchema.parse(value.expiration);
    urgencySchema.parse(value.urgency);
    kinds.add(`${value.urgency.kind}/${value.expiration.kind}`);
  }
  for (const required of ["unknown/unknown", "past_date/estimate", "past_date/override", "critical/estimate", "critical/override", "soon/estimate", "later/estimate"]) {
    assert.ok(kinds.has(required), `missing ${required}`);
  }
  for (const entry of fixtures.expirationFixtureItems.map((i) => fixtures.withFixtureExpiration(i))) {
    expirationResultSchema.parse(entry.expirationInfo.expiration);
    urgencySchema.parse(entry.expirationInfo.urgency);
  }
});

// ---------- badge wording ----------

test("unknown dates stay visibly unknown and imply nothing about freshness", () => {
  for (const state of [info.unknownNoMatch, info.unknownCleared]) {
    const d = display.describeExpiration(state);
    assert.equal(d.tone, "unknown");
    assert.equal(d.label, "Date unknown");
    assert.equal(d.tag, null);
    const { lines, source } = display.explainExpiration(state.expiration, state.urgency);
    assert.equal(source, null);
    assert.doesNotMatch([d.description, ...lines].join(" "), /\bsafe\b|expired|spoiled/i);
  }
  assert.match(display.describeExpiration(info.unknownCleared).description, /You cleared/);
  assert.match(display.explainExpiration(results.unknownNoMatch, info.unknownNoMatch.urgency).lines[0], /no shelf-life reference/);
});

test("past dates are labelled as passed without asserting safety", () => {
  const estimate = display.describeExpiration(info.pastEstimate);
  assert.deepEqual([estimate.tone, estimate.label, estimate.tag], ["past", "Past date", "Estimate"]);
  assert.match(estimate.description, /Estimated date May 17, 2025 passed 2 days ago/);

  const override = display.describeExpiration(info.pastOverride);
  assert.deepEqual([override.label, override.tag], ["Past date", "Your date"]);
  assert.match(override.description, /Your date May 18, 2025 passed yesterday/);

  for (const state of [info.pastEstimate, info.pastOverride]) {
    const { lines } = display.explainExpiration(state.expiration, state.urgency);
    const all = [display.describeExpiration(state).description, ...lines].join(" ");
    assert.doesNotMatch(all, /expired|spoiled|is safe|still safe/i);
    assert.match(all, /check/i);
  }
});

test("upcoming dates show the backend label plus the date source", () => {
  assert.deepEqual(
    ["today", "tomorrowOverride", "soon", "later"].map((key) => {
      const d = display.describeExpiration(info[key]);
      return [d.tone, d.label, d.tag];
    }),
    [
      ["critical", "Use today", "Estimate"],
      ["critical", "Use tomorrow", "Your date"],
      ["soon", "3 days left", "Estimate"],
      ["later", "9 days left", "Estimate"],
    ],
  );
});

test("estimate explanations show provenance and the source link", () => {
  const { lines, source } = display.explainExpiration(results.later, info.later.urgency);
  assert.match(lines[0], /about 10 days for yogurt stored in the fridge/);
  assert.match(lines[1], /Unopened, refrigerated/);
  assert.deepEqual(source, { name: "Demo source", url: "https://example.com/source" });
  assert.match(display.explainExpiration(results.pastOverride, info.pastOverride.urgency).lines[0], /You set this date/);
});

test("items without API expiration info are shown as unknown", () => {
  assert.equal(display.getExpirationInfo({}).urgency.kind, "unknown");
});

// ---------- sorting ----------

test("soonest-expiration sort matches the backend's compareBySoonestExpiration", () => {
  const list = [
    item("e", "Zucchini", { state: "unknownNoMatch" }),
    item("b", "Apple", { state: "later" }),
    item("d", "apple", { state: "unknownCleared" }),
    item("a", "Basil", { state: "pastOverride" }),
    item("c", "Cream", { state: "pastEstimate" }),
    item("g", "Kale", { state: "today" }),
    item("f", "Kale", { state: "today" }),
  ];
  const ids = (sorted) => sorted.map((entry) => entry.id);
  const expected = ["c", "a", "f", "g", "b", "d", "e"];
  assert.deepEqual(ids(filters.sortPantryItems(list, "expiration")), expected);
  assert.deepEqual(ids(filters.sortPantryItems([...list].reverse(), "expiration")), expected);

  // Same order as the API, computed on the API's own item shape.
  const apiShaped = list.map((entry) => ({ id: entry.id, ...entry.expirationInfo }));
  assert.deepEqual(apiShaped.sort(compareBySoonestExpiration).map((entry) => entry.id), expected);
});

test("name sort is case-insensitive with id tiebreak", () => {
  const list = [item("2", "apple", { state: "later" }), item("1", "Apple", { state: "later" }), item("3", "basil", { state: "later" })];
  assert.deepEqual(filters.sortPantryItems(list, "name").map((entry) => entry.id), ["1", "2", "3"]);
});

// ---------- filters ----------

const pantry = [
  item(1, "Spinach", { location: "Fridge", state: "today" }),
  item(2, "Basil", { location: "Counter", state: "pastOverride" }),
  item(3, "Chili", { location: "Fridge", state: "unknownNoMatch" }),
  item(4, "Rice", { location: "Pantry", state: "unknownCleared" }),
  item(5, "Yogurt", { location: "Fridge", state: "later" }),
  item(6, "Cream", { location: "Fridge", state: "pastEstimate" }),
  item(7, "Kale", { location: "Fridge", state: "soon" }),
];
const ids = (list) => list.map((entry) => entry.id).sort((a, b) => a - b);
const state = (overrides) => ({ ...filters.DEFAULT_PANTRY_FILTERS, ...overrides });

test("each filter matches backend urgency kinds", () => {
  assert.deepEqual(ids(filters.filterPantryItems(pantry, state({ expiration: ["expiring_soon"] }))), [1, 7]);
  assert.deepEqual(ids(filters.filterPantryItems(pantry, state({ expiration: ["past"] }))), [2, 6]);
  assert.deepEqual(ids(filters.filterPantryItems(pantry, state({ expiration: ["unknown"] }))), [3, 4]);
  assert.deepEqual(ids(filters.filterPantryItems(pantry, state({ location: "Pantry" }))), [4]);
});

test("filters combine: any selected status AND location AND search", () => {
  const combined = state({ expiration: ["past", "unknown"], location: "Fridge" });
  assert.deepEqual(ids(filters.filterPantryItems(pantry, combined)), [3, 6]);
  assert.deepEqual(ids(filters.filterPantryItems(pantry, { ...combined, query: "cre" })), [6]);
  assert.deepEqual(filters.countByExpirationFilter(pantry, combined), { expiring_soon: 2, past: 1, unknown: 1 });
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

test("changing a date becomes an override, clearing it becomes user_cleared, and filters follow", () => {
  const before = fixtures.withFixtureExpiration({ ...item(1, "Spinach"), expirationDate: "2025-05-28", expirationInfo: undefined });
  assert.equal(before.expirationInfo.expiration.kind, "estimate");
  assert.equal(before.expirationInfo.urgency.kind, "later");

  const overridden = fixtures.applyFixtureExpirationEdit(before, { ...before, expirationDate: "2025-05-18" });
  assert.equal(overridden.expirationInfo.expiration.kind, "override");
  assert.equal(overridden.expirationInfo.urgency.kind, "past_date");
  assert.deepEqual(ids(filters.filterPantryItems([overridden], state({ expiration: ["past"] }))), [1]);

  const cleared = fixtures.applyFixtureExpirationEdit(overridden, { ...overridden, expirationDate: "" });
  assert.deepEqual(cleared.expirationInfo.expiration, { kind: "unknown", date: null, reason: "user_cleared" });
  assert.equal(display.describeExpiration(cleared.expirationInfo).label, "Date unknown");

  const renamed = fixtures.applyFixtureExpirationEdit(overridden, { ...overridden, name: "Baby spinach" });
  assert.equal(renamed.expirationInfo.expiration.kind, "override");
});
