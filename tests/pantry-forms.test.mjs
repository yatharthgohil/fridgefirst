import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/register-ts-paths.mjs";

const {
  validatePantryForm,
  computePantryChanges,
  defaultPantryFormValues,
  itemToPantryFormValues,
} = await import("../src/features/pantry/pantry-form-core.ts");

const {
  createFixturePantryApi,
  contractToUiItem,
  uiToContractItem,
  PantryApiError,
} = await import("../src/features/pantry/pantry-api.ts");

// ---------------------------------------------------------
// 1. FORM VALIDATION
// ---------------------------------------------------------

test("validatePantryForm validates name requirements", () => {
  const base = defaultPantryFormValues("2026-11-16");

  // Empty name
  const empty = validatePantryForm({ ...base, name: "   " });
  assert.equal(empty.isValid, false);
  assert.ok(empty.errors.name);

  // Overly long name (>200 chars)
  const longName = validatePantryForm({ ...base, name: "a".repeat(201) });
  assert.equal(longName.isValid, false);
  assert.ok(longName.errors.name);

  // Valid name is trimmed
  const valid = validatePantryForm({ ...base, name: "  Organic Strawberries  " });
  assert.equal(valid.isValid, true);
  assert.equal(valid.cleaned?.name, "Organic Strawberries");
});

test("validatePantryForm rejects non-numeric, negative, zero, and over-precise quantities", () => {
  const base = defaultPantryFormValues("2026-11-16");
  base.name = "Milk";

  // Non-numeric
  const nonNum = validatePantryForm({ ...base, quantity: "three" });
  assert.equal(nonNum.isValid, false);
  assert.ok(nonNum.errors.quantity);

  // Negative
  const negative = validatePantryForm({ ...base, quantity: "-2" });
  assert.equal(negative.isValid, false);
  assert.ok(negative.errors.quantity);

  // Zero
  const zero = validatePantryForm({ ...base, quantity: "0" });
  assert.equal(zero.isValid, false);
  assert.ok(zero.errors.quantity);

  // Precision > 3 decimal places
  const overPrecise = validatePantryForm({ ...base, quantity: "1.2345" });
  assert.equal(overPrecise.isValid, false);
  assert.ok(overPrecise.errors.quantity);

  // Valid decimal (up to 3 decimal places)
  const validDecimal = validatePantryForm({ ...base, quantity: "1.25" });
  assert.equal(validDecimal.isValid, true);
  assert.equal(validDecimal.cleaned?.quantity, 1.25);
});

test("validatePantryForm enforces expiration override requirements", () => {
  const base = defaultPantryFormValues("2026-11-16");
  base.name = "Cheddar";

  // Override without date
  const missingDate = validatePantryForm({
    ...base,
    expirationKind: "override",
    expirationDate: "",
  });
  assert.equal(missingDate.isValid, false);
  assert.ok(missingDate.errors.expirationDate);

  // Override with invalid calendar date
  const invalidDate = validatePantryForm({
    ...base,
    expirationKind: "override",
    expirationDate: "not-a-date",
  });
  assert.equal(invalidDate.isValid, false);
  assert.ok(invalidDate.errors.expirationDate);

  // Valid override
  const validOverride = validatePantryForm({
    ...base,
    expirationKind: "override",
    expirationDate: "2026-12-01",
  });
  assert.equal(validOverride.isValid, true);
  assert.deepEqual(validOverride.cleaned?.expiration, {
    kind: "override",
    date: "2026-12-01",
  });

  // Unknown expiration
  const unknownExp = validatePantryForm({
    ...base,
    expirationKind: "unknown",
    expirationDate: "",
  });
  assert.equal(unknownExp.isValid, true);
  assert.deepEqual(unknownExp.cleaned?.expiration, { kind: "unknown" });
});

// ---------------------------------------------------------
// 2. COMPUTE PANTRY CHANGES (DIRTY FIELDS ONLY)
// ---------------------------------------------------------

test("computePantryChanges detects intentional changes and enforces replacement quantity on unit change", () => {
  const initial = defaultPantryFormValues("2026-11-16");
  initial.name = "Oat milk";
  initial.quantity = "2";
  initial.unit = "can";

  // No changes
  const unchanged = computePantryChanges(initial, initial);
  assert.equal(unchanged.hasChanges, false);
  assert.deepEqual(unchanged.changes, {});

  // Intentional name update only
  const renamed = computePantryChanges(initial, { ...initial, name: "Almond milk" });
  assert.equal(renamed.hasChanges, true);
  assert.deepEqual(renamed.changes, { name: "Almond milk" });

  // Unit changed: must include replacement quantity per contract rule
  const unitChanged = computePantryChanges(initial, { ...initial, unit: "tub" });
  assert.equal(unitChanged.hasChanges, true);
  assert.equal(unitChanged.changes.unit, "tub");
  assert.equal(unitChanged.changes.quantity, 2);

  // Expiration kind changed to override
  const overrideChanged = computePantryChanges(initial, {
    ...initial,
    expirationKind: "override",
    expirationDate: "2026-11-30",
  });
  assert.equal(overrideChanged.hasChanges, true);
  assert.deepEqual(overrideChanged.changes.expiration, {
    kind: "override",
    date: "2026-11-30",
  });
});

// ---------------------------------------------------------
// 3. FIXTURE PANTRY API CRUD & OPTIMISTIC CONCURRENCY
// ---------------------------------------------------------

test("createFixturePantryApi creates, updates, and deletes items with version checks", async () => {
  const api = createFixturePantryApi({ asOfDate: "2026-11-16" });

  // Create
  const createRes = await api.create({
    name: "Fresh basil",
    quantity: 1,
    unit: "bunch",
    storageLocation: "Fridge",
    addedOn: "2026-11-16",
    expiration: { kind: "estimate" },
    notes: "For pasta",
  });
  assert.ok(createRes.item.id);
  assert.equal(createRes.item.name, "Fresh basil");
  assert.equal(createRes.item.version, 1);
  assert.equal(createRes.item.expiration.kind, "estimate");

  // Verify it shows up in list
  const listRes = await api.list();
  const found = listRes.items.find((i) => i.id === createRes.item.id);
  assert.ok(found);

  // Update with expectedVersion 1 -> succeeds and increments to 2
  const updateRes = await api.update(createRes.item.id, {
    expectedVersion: 1,
    changes: {
      storageLocation: "Counter",
      notes: "Moved to windowsill",
    },
  });
  assert.equal(updateRes.item.version, 2);
  assert.equal(updateRes.item.storageLocation, "Counter");
  assert.equal(updateRes.item.notes, "Moved to windowsill");

  // Stale update (expectedVersion 1 when current is 2) -> throws 409 Conflict with snapshot
  await assert.rejects(
    async () => {
      await api.update(createRes.item.id, {
        expectedVersion: 1,
        changes: { name: "Stale basil" },
      });
    },
    (err) => {
      assert.ok(err instanceof PantryApiError);
      assert.equal(err.code, "conflict");
      assert.ok(err.current);
      assert.equal(err.current.version, 2);
      assert.equal(err.current.storageLocation, "Counter");
      return true;
    }
  );

  // Stale delete (expectedVersion 1 when current is 2) -> throws 409 Conflict
  await assert.rejects(
    async () => {
      await api.delete(createRes.item.id, { expectedVersion: 1 });
    },
    (err) => {
      assert.ok(err instanceof PantryApiError);
      assert.equal(err.code, "conflict");
      return true;
    }
  );

  // Delete with correct expectedVersion 2 -> succeeds
  await api.delete(createRes.item.id, { expectedVersion: 2 });
  const afterDelete = await api.list();
  assert.equal(afterDelete.items.some((i) => i.id === createRes.item.id), false);
});

// ---------------------------------------------------------
// 4. MAPPING BETWEEN UI AND CONTRACT ITEMS
// ---------------------------------------------------------

test("contractToUiItem and uiToContractItem preserve core data and distinguish expiration modes", () => {
  // Test mapping contract estimate item
  const contractEstimate = {
    id: "00000000-0000-4000-8000-000000001001",
    name: "Baby spinach",
    quantity: 1,
    unit: "bag",
    storageLocation: "Fridge",
    addedOn: "2026-11-16",
    expiration: {
      kind: "estimate",
      date: "2026-11-23",
      provenance: {
        referenceId: "00000000-0000-4000-8000-000000000999",
        foodName: "Baby spinach",
        storageLocation: "Fridge",
        days: 7,
        sourceName: "Shelf-life reference estimate",
        sourceUrl: "https://example.com",
        sourceAccessedOn: "2026-11-16",
        assumptions: "Refrigerated",
      },
    },
    notes: null,
    status: "active",
    version: 1,
    createdAt: "2026-11-16T00:00:00.000Z",
    updatedAt: "2026-11-16T00:00:00.000Z",
    urgency: { kind: "soon", daysRemaining: 7, label: "7 days left" },
  };

  const uiItem = contractToUiItem(contractEstimate);
  assert.equal(uiItem.name, "Baby spinach");
  assert.equal(uiItem.quantity, "1");
  assert.equal(uiItem.location, "Fridge");
  assert.equal(uiItem.expirationInfo?.expiration.kind, "estimate");

  const formValues = itemToPantryFormValues(uiItem);
  assert.equal(formValues.expirationKind, "estimate");
  assert.equal(formValues.name, "Baby spinach");
  assert.equal(formValues.storageLocation, "Fridge");

  // Test mapping override item
  const contractOverride = {
    ...contractEstimate,
    expiration: { kind: "override", date: "2026-11-28" },
  };
  const uiOverride = contractToUiItem(contractOverride);
  const overrideFormValues = itemToPantryFormValues(uiOverride);
  assert.equal(overrideFormValues.expirationKind, "override");
  assert.equal(overrideFormValues.expirationDate, "2026-11-28");

  // Test mapping unknown expiration item
  const contractUnknown = {
    ...contractEstimate,
    expiration: { kind: "unknown", date: null, reason: "user_cleared" },
    urgency: { kind: "unknown", daysRemaining: null, label: "Date unknown" },
  };
  const uiUnknown = contractToUiItem(contractUnknown);
  const unknownFormValues = itemToPantryFormValues(uiUnknown);
  assert.equal(unknownFormValues.expirationKind, "unknown");
  assert.equal(unknownFormValues.expirationDate, "");
});
