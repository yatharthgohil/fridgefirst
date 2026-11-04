import assert from "node:assert/strict";
import test from "node:test";
import { calculateExpirationMeta, formatUnit } from "../src/features/pantry/types.ts";

test("calculateExpirationMeta accurately assigns urgency tiers and expiry text", () => {
  const reference = new Date("2025-05-19T00:00:00");

  // Critical: expiring today (0 days)
  const today = calculateExpirationMeta("2025-05-19", reference);
  assert.equal(today.urgency, "critical");
  assert.equal(today.expiry, "Use today");

  // Critical: expiring tomorrow (1 day)
  const tomorrow = calculateExpirationMeta("2025-05-20", reference);
  assert.equal(tomorrow.urgency, "critical");
  assert.equal(tomorrow.expiry, "Use tomorrow");

  // Soon: expiring in 2 to 4 days
  const inTwoDays = calculateExpirationMeta("2025-05-21", reference);
  assert.equal(inTwoDays.urgency, "soon");
  assert.equal(inTwoDays.expiry, "2 days left");

  const inFourDays = calculateExpirationMeta("2025-05-23", reference);
  assert.equal(inFourDays.urgency, "soon");
  assert.equal(inFourDays.expiry, "4 days left");

  // Fresh: expiring in 5+ days
  const inFiveDays = calculateExpirationMeta("2025-05-24", reference);
  assert.equal(inFiveDays.urgency, "fresh");
  assert.equal(inFiveDays.expiry, "5 days left");

  // Fresh: expiring in multiple months
  const inEightMonths = calculateExpirationMeta("2026-01-19", reference);
  assert.equal(inEightMonths.urgency, "fresh");
  assert.equal(inEightMonths.expiry, "8 months");
});

test("formatUnit correctly handles singular, regular plural, and invariant metric units", () => {
  // Singular quantities should keep the singular unit
  assert.equal(formatUnit("bag", "1"), "bag");
  assert.equal(formatUnit("head", "1"), "head");
  assert.equal(formatUnit("item", "1"), "item");

  // Plural quantities for standard units
  assert.equal(formatUnit("bag", "2"), "bags");
  assert.equal(formatUnit("head", "3"), "heads");
  assert.equal(formatUnit("item", "4"), "items");
  assert.equal(formatUnit("tub", "2"), "tubs");

  // Irregular plural unit: bunch -> bunches
  assert.equal(formatUnit("bunch", "1"), "bunch");
  assert.equal(formatUnit("bunch", "2"), "bunches");

  // Invariant metric and culinary abbreviations
  assert.equal(formatUnit("g", "1"), "g");
  assert.equal(formatUnit("g", "250"), "g");
  assert.equal(formatUnit("kg", "2.5"), "kg");
  assert.equal(formatUnit("mL", "500"), "mL");
  assert.equal(formatUnit("L", "2"), "L");
  assert.equal(formatUnit("tbsp", "3"), "tbsp");
  assert.equal(formatUnit("tsp", "2"), "tsp");
});
