import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/register-ts-paths.mjs';
const { quantitySchema, calendarDateSchema } = await import('../src/contracts/common.ts');
const { pantryCreateRequestSchema, pantryUpdateRequestSchema, pantryDeleteRequestSchema, pantryListResponseSchema, persistedPantryItemSchema } = await import('../src/contracts/pantry.ts');
const { pantryContractFixture } = await import('../src/contracts/pantry-fixtures.ts');
const { inventoryAdjustmentRequestSchema } = await import('../src/contracts/inventory.ts');

test('shared contracts reject invalid boundary inputs and preserve fixture wire values', () => {
  assert.equal(quantitySchema.parse(0.1 + 0.2), 0.3);
  for (const quantity of [-1, Infinity, NaN, 1.0001, 0.0000000001, 1000000]) {
    assert.equal(quantitySchema.safeParse(quantity).success, false, String(quantity));
  }
  assert.equal(calendarDateSchema.safeParse('2026-02-29').success, false);
  assert.equal(calendarDateSchema.safeParse('0000-01-01').success, false);
  assert.equal(calendarDateSchema.parse('2024-02-29'), '2024-02-29');
  const request = { name: 'Milk', quantity: 1, unit: 'L', storageLocation: 'Fridge', addedOn: '2026-11-12', expiration: { kind: 'estimate' } };
  assert.deepEqual(pantryCreateRequestSchema.parse(request), request);
  for (const extra of [{ userId: 'owner' }, { expiration: { kind: 'unknown', date: '2026-11-12' } }, { unit: 'litre' }]) {
    assert.equal(pantryCreateRequestSchema.safeParse({ ...request, ...extra }).success, false);
  }
  assert.equal(pantryUpdateRequestSchema.safeParse({ expectedVersion: 1, changes: {} }).success, false);
  assert.equal(pantryUpdateRequestSchema.safeParse({ expectedVersion: 1, changes: { unit: 'g' } }).success, false);
  assert.equal(pantryUpdateRequestSchema.safeParse({ expectedVersion: 1, changes: { unit: 'g', quantity: 250 } }).success, true);
  assert.equal(pantryDeleteRequestSchema.safeParse({ expectedVersion: 0 }).success, false);
  assert.deepEqual(pantryListResponseSchema.parse(pantryContractFixture), pantryContractFixture);
  for (const item of pantryContractFixture.items) {
    const { urgency, ...record } = item;
    assert.ok(urgency);
    assert.deepEqual(persistedPantryItemSchema.parse(record), record);
  }
  const adjustment = { requestId: 'fixture-123', itemId: '1', operation: 'consume', amount: 0.5, unit: 'bag', expectedQuantity: 1 };
  assert.deepEqual(inventoryAdjustmentRequestSchema.parse(adjustment), adjustment);
  assert.equal(inventoryAdjustmentRequestSchema.safeParse({ ...adjustment, amount: 0.00001 }).success, false);
});
