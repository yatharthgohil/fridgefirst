import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/register-ts-paths.mjs';
const { calendarDateSchema } = await import('../src/contracts/common.ts');
const { pantryItemSchema, persistedPantryItemSchema, urgencySchema } = await import('../src/contracts/pantry.ts');
const { pantryContractFixture } = await import('../src/contracts/pantry-fixtures.ts');
const { compareBySoonestExpiration, expirationUrgency, utcToday, withUrgency } = await import('../src/server/modules/expiration/policy.ts');

const today = '2026-11-12';
const withoutUrgency = (fixture) => Object.fromEntries(Object.entries(fixture).filter(([key]) => key !== 'urgency'));
const estimate = (date) => ({
  kind: 'estimate',
  date,
  provenance: {
    referenceId: '5f0e1a20-0000-4000-8000-000000000001',
    foodName: 'Raw chicken pieces',
    storageLocation: 'Fridge',
    days: 1,
    sourceName: 'FoodSafety.gov Cold Food Storage Chart',
    sourceUrl: 'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts',
    sourceAccessedOn: '2026-11-12',
    assumptions: 'Refrigerated at or below 4 C from the acquisition date.',
  },
});

test('urgency bands separate past dates, today, tomorrow, soon, later and unknown', () => {
  for (const reason of ['no_match', 'user_cleared']) {
    const urgency = expirationUrgency({ kind: 'unknown', date: null, reason }, today);
    assert.equal(urgency.kind, 'unknown');
    assert.equal(urgency.daysRemaining, null);
    urgencySchema.parse(urgency);
  }
  const past = expirationUrgency({ kind: 'override', date: '2026-11-10' }, today);
  assert.equal(past.kind, 'past_date');
  assert.equal(past.daysRemaining, -2);
  assert.equal(past.label, 'Past date');

  const sameDay = expirationUrgency(estimate(today), today);
  assert.equal(sameDay.kind, 'critical');
  assert.equal(sameDay.daysRemaining, 0);
  assert.equal(sameDay.label, 'Use today');

  const tomorrow = expirationUrgency(estimate('2026-11-13'), today);
  assert.equal(tomorrow.kind, 'critical');
  assert.equal(tomorrow.daysRemaining, 1);
  assert.equal(tomorrow.label, 'Use tomorrow');

  for (const [date, kind, label] of [
    ['2026-11-14', 'soon', '2 days left'],
    ['2026-11-16', 'soon', '4 days left'],
    ['2026-11-17', 'later', '5 days left'],
    ['2026-12-01', 'later', '19 days left'],
  ]) {
    const urgency = expirationUrgency(estimate(date), today);
    assert.equal(urgency.kind, kind, date);
    assert.equal(urgency.label, label, date);
    urgencySchema.parse(urgency);
  }
});

test('day differences use UTC calendar days across leap years and clock changes', () => {
  assert.equal(expirationUrgency(estimate('2024-03-01'), '2024-02-28').daysRemaining, 2);
  assert.equal(expirationUrgency(estimate('2023-03-01'), '2023-02-28').daysRemaining, 1);
  assert.equal(expirationUrgency(estimate('2027-01-01'), '2026-12-31').daysRemaining, 1);
  assert.equal(expirationUrgency(estimate('2026-03-09'), '2026-03-07').daysRemaining, 2);
  assert.equal(expirationUrgency(estimate('2026-11-02'), '2026-10-31').daysRemaining, 2);
  assert.equal(expirationUrgency(estimate('2026-03-09'), '2026-03-09').kind, 'critical');
  assert.equal(utcToday(new Date('2026-11-12T23:30:00Z')), '2026-11-12');
  assert.equal(utcToday(new Date('2026-11-13T00:30:00Z')), '2026-11-13');
  assert.equal(utcToday(new Date()), new Date().toISOString().slice(0, 10));
});

test('shared validation, persisted shape and soonest ordering hold together', () => {
  for (const invalid of ['2026-02-30', '2026-13-01', '2026-2-3', '0000-01-01', '2026-11-12T00:00:00Z']) {
    assert.equal(calendarDateSchema.safeParse(invalid).success, false, invalid);
  }
  assert.equal(calendarDateSchema.parse('2024-02-29'), '2024-02-29');

  const item = persistedPantryItemSchema.parse(withoutUrgency(pantryContractFixture.items[1]));
  const withUrgencyValue = withUrgency(item, today);
  pantryItemSchema.parse(withUrgencyValue);
  const { urgency, ...record } = withUrgencyValue;
  assert.deepEqual(record, item);
  assert.equal(urgency.kind, 'critical');
  assert.equal(urgency.label, 'Use tomorrow');

  const items = pantryContractFixture.items.map((fixture) => withUrgency(persistedPantryItemSchema.parse(withoutUrgency(fixture)), pantryContractFixture.asOfDate));
  assert.deepEqual(items.map((entry) => entry.urgency), pantryContractFixture.items.map((entry) => entry.urgency));
  const ordered = [...items].sort(compareBySoonestExpiration);
  assert.deepEqual(ordered.map((entry) => entry.id), [items[1].id, items[2].id, items[0].id]);
});
