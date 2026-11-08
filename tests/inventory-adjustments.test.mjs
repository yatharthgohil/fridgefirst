import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/register-ts-paths.mjs";

const core = await import("../src/features/pantry/inventory-core.ts");
const { adjustmentReducer, createAdjustmentState } = await import("../src/features/pantry/adjustment-state.ts");
const { createFixtureInventoryApi } = await import("../src/features/pantry/inventory-fixtures.ts");
const contracts = await import("../src/contracts/inventory.ts");

const spinach = { id: "1", name: "Baby spinach", quantity: 1, unit: "bag" };

function makeApi(overrides = {}) {
  return createFixtureInventoryApi({ items: [{ ...spinach }], history: [], latencyMs: 0, ...overrides });
}

function request(overrides = {}) {
  return {
    requestId: "req-00000001",
    itemId: "1",
    operation: "consume",
    amount: 0.5,
    unit: "bag",
    expectedQuantity: 1,
    ...overrides,
  };
}

// ---------- amount validation & preview ----------

test("checkAdjustmentAmount accepts decimals and fractions and computes the remainder", () => {
  assert.deepEqual(core.checkAdjustmentAmount("0.5", 1, "bag"), { ok: true, amount: 0.5, remaining: 0.5 });
  assert.deepEqual(core.checkAdjustmentAmount(".25", 1, "bag"), { ok: true, amount: 0.25, remaining: 0.75 });
  assert.deepEqual(core.checkAdjustmentAmount("1/2", 2, "can"), { ok: true, amount: 0.5, remaining: 1.5 });
  assert.deepEqual(core.checkAdjustmentAmount("1 1/2", 2, "can"), { ok: true, amount: 1.5, remaining: 0.5 });
  // Floating point noise does not leak into the remainder.
  assert.deepEqual(core.checkAdjustmentAmount("0.1", 0.3, "L"), { ok: true, amount: 0.1, remaining: 0.2 });
  // Using everything is allowed and leaves exactly zero.
  assert.deepEqual(core.checkAdjustmentAmount("0.75", 0.75, "tub"), { ok: true, amount: 0.75, remaining: 0 });
});

test("checkAdjustmentAmount blocks empty, invalid, non-positive, over-precise and excessive amounts", () => {
  const reason = (raw, available = 1) => {
    const result = core.checkAdjustmentAmount(raw, available, "bag");
    assert.equal(result.ok, false);
    assert.ok(result.message.length > 0);
    return result.reason;
  };
  assert.equal(reason(""), "empty");
  assert.equal(reason("   "), "empty");
  assert.equal(reason("abc"), "invalid");
  assert.equal(reason("-1"), "invalid");
  assert.equal(reason("1/0"), "invalid");
  assert.equal(reason("0"), "not_positive");
  assert.equal(reason("0.0001"), "too_precise");
  assert.equal(reason("1.5"), "exceeds_available");
  assert.equal(reason("1", 0), "exceeds_available");
  assert.match(core.checkAdjustmentAmount("3", 2, "bag").message, /Only 2 bags left/);
});

test("quickAmounts offers quarter, half and all without duplicates", () => {
  assert.deepEqual(core.quickAmounts(2), [
    { label: "¼", value: "0.5" },
    { label: "½", value: "1" },
    { label: "All", value: "2" },
  ]);
  assert.deepEqual(core.quickAmounts(0), []);
  assert.equal(core.quickAmounts(0.001).length, 1);
});

// ---------- labels & formatting ----------

test("every history operation has a readable label, including unknown future ones", () => {
  for (const op of contracts.inventoryOperationSchema.options) {
    const label = core.operationLabel(op);
    assert.ok(label.length > 0);
    assert.doesNotMatch(label, /_/);
  }
  assert.equal(core.operationLabel("add"), "Added");
  assert.equal(core.operationLabel("edit"), "Edited");
  assert.equal(core.operationLabel("delete"), "Deleted");
  assert.equal(core.operationLabel("consume"), "Used");
  assert.equal(core.operationLabel("discard"), "Discarded");
  assert.equal(core.operationLabel("recipe_deduction"), "Used in recipe");
  assert.equal(core.operationLabel("bulk_import"), "Bulk import");
});

test("formatDelta signs and pluralizes quantity changes", () => {
  // Matches formatUnit: anything other than exactly 1 is plural ("0.5 bags").
  assert.equal(core.formatDelta(-0.5, "bag"), "−0.5 bags");
  assert.equal(core.formatDelta(-1, "bag"), "−1 bag");
  assert.equal(core.formatDelta(-2, "bag"), "−2 bags");
  assert.equal(core.formatDelta(3, "item"), "+3 items");
  assert.equal(core.formatDelta(-250, "g"), "−250 g");
  assert.equal(core.formatDelta(null, null), "No quantity change");
  assert.equal(core.formatDelta(0, "bag"), "No quantity change");
});

test("formatRelativeTime produces compact labels", () => {
  const now = new Date("2026-11-08T15:00:00");
  const at = (ms) => new Date(now.getTime() - ms).toISOString();
  assert.equal(core.formatRelativeTime(at(10_000), now), "Just now");
  assert.equal(core.formatRelativeTime(at(5 * 60_000), now), "5 min ago");
  assert.equal(core.formatRelativeTime(at(3 * 3_600_000), now), "3 h ago");
  assert.equal(core.formatRelativeTime(new Date("2026-11-07T20:00:00").toISOString(), now), "Yesterday");
  assert.equal(core.formatRelativeTime(new Date("2026-11-04T12:00:00").toISOString(), now), "Wed");
  assert.equal(core.formatRelativeTime(new Date("2026-10-01T12:00:00").toISOString(), now), "Oct 1");
  assert.equal(core.formatRelativeTime("not a date", now), "");
});

test("withUpdatedQuantity applies the server quantity and scales the fill meter", () => {
  const item = { id: 1, name: "Baby spinach", quantity: "1", unit: "bag", amount: 80 };
  assert.deepEqual(core.withUpdatedQuantity(item, 0.5), { ...item, quantity: "0.5", amount: 40 });
  assert.deepEqual(core.withUpdatedQuantity(item, 0), { ...item, quantity: "0", amount: 0 });
});

// ---------- dialog state machine (repeat safety, cancel, conflicts) ----------

function reviewed(amountText = "0.5") {
  let state = createAdjustmentState("consume", 1, "bag");
  state = adjustmentReducer(state, { type: "amountChanged", text: amountText });
  return adjustmentReducer(state, { type: "reviewRequested", valid: true, requestId: "id-A" });
}

test("an invalid amount cannot reach the confirmation step", () => {
  let state = createAdjustmentState("consume", 1, "bag");
  state = adjustmentReducer(state, { type: "amountChanged", text: "5" });
  state = adjustmentReducer(state, { type: "reviewRequested", valid: false, requestId: "id-A" });
  assert.equal(state.step, "edit");
  assert.equal(state.requestId, null);
  assert.equal(state.showFieldError, true);
});

test("retrying after a network or server failure reuses the same request id", () => {
  let state = reviewed();
  assert.equal(state.requestId, "id-A");
  state = adjustmentReducer(state, { type: "submitStarted" });
  assert.equal(state.pending, true);

  // Further input while pending is ignored (double click, edits).
  assert.equal(adjustmentReducer(state, { type: "submitStarted" }), state);
  assert.equal(adjustmentReducer(state, { type: "backToEdit" }), state);

  state = adjustmentReducer(state, { type: "submitFailed", code: "network", message: "offline" });
  assert.equal(state.step, "review");
  assert.equal(state.pending, false);
  assert.equal(state.requestId, "id-A");
  assert.equal(state.error.retryable, true);

  state = adjustmentReducer(state, { type: "submitStarted" });
  assert.equal(state.requestId, "id-A");
});

test("going back without changes keeps the id; changing the amount or operation issues a new one", () => {
  let state = adjustmentReducer(reviewed(), { type: "backToEdit" });
  state = adjustmentReducer(state, { type: "reviewRequested", valid: true, requestId: "id-B" });
  assert.equal(state.requestId, "id-A");

  state = adjustmentReducer(state, { type: "backToEdit" });
  state = adjustmentReducer(state, { type: "amountChanged", text: "0.25" });
  state = adjustmentReducer(state, { type: "reviewRequested", valid: true, requestId: "id-C" });
  assert.equal(state.requestId, "id-C");

  state = adjustmentReducer(state, { type: "backToEdit" });
  state = adjustmentReducer(state, { type: "operationChanged", operation: "discard" });
  state = adjustmentReducer(state, { type: "reviewRequested", valid: true, requestId: "id-D" });
  assert.equal(state.requestId, "id-D");
  assert.equal(state.operation, "discard");
});

test("a stale-data conflict returns to editing with the latest quantity and a new intent", () => {
  let state = adjustmentReducer(reviewed(), { type: "submitStarted" });
  state = adjustmentReducer(state, {
    type: "submitFailed",
    code: "conflict",
    message: "changed",
    current: { id: "1", quantity: 0.25, unit: "bag" },
  });
  assert.equal(state.step, "edit");
  assert.equal(state.available, 0.25);
  assert.equal(state.requestId, null);
  assert.match(state.notice, /now has 0\.25 bag/);
  // The previously entered 0.5 is now excessive and is blocked locally.
  assert.equal(core.checkAdjustmentAmount(state.amountText, state.available, state.unit).ok, false);
});

test("server validation errors return to editing; not-found is not retryable", () => {
  let state = adjustmentReducer(reviewed(), { type: "submitStarted" });
  state = adjustmentReducer(state, { type: "submitFailed", code: "validation", message: "Too much" });
  assert.equal(state.step, "edit");
  assert.equal(state.error.message, "Too much");
  assert.equal(state.requestId, null);

  let gone = adjustmentReducer(reviewed(), { type: "submitStarted" });
  gone = adjustmentReducer(gone, { type: "submitFailed", code: "not_found", message: "Gone" });
  assert.equal(gone.error.retryable, false);
});

// ---------- fixture API (mirrors the backend contract) ----------

test("a successful adjustment updates quantity and history atomically", async () => {
  const api = makeApi();
  const result = await api.adjust(request());
  assert.deepEqual(result.item, { id: "1", quantity: 0.5, unit: "bag" });
  assert.equal(result.replayed, false);
  assert.equal(result.entry.operation, "consume");
  assert.equal(result.entry.quantityDelta, -0.5);
  contracts.inventoryAdjustmentResponseSchema.parse(result);

  const history = await api.listHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].id, result.entry.id);
});

test("replaying the same request id never deducts twice", async () => {
  const api = makeApi();
  const [first, second] = await Promise.all([api.adjust(request()), api.adjust(request())]);
  const third = await api.adjust(request());
  assert.equal(first.item.quantity, 0.5);
  assert.equal(second.item.quantity, 0.5);
  assert.equal(third.item.quantity, 0.5);
  assert.equal([first, second, third].filter((r) => r.replayed).length, 2);
  assert.equal((await api.listHistory()).length, 1);

  await assert.rejects(api.adjust(request({ amount: 0.25 })), { code: "validation" });
});

test("stale expected quantity yields a conflict with the latest value and changes nothing", async () => {
  const api = makeApi();
  await api.adjust(request({ requestId: "req-first-1", amount: 0.75 }));
  await assert.rejects(api.adjust(request({ requestId: "req-second-2", amount: 0.5, expectedQuantity: 1 })), (error) => {
    assert.equal(error.code, "conflict");
    assert.deepEqual(error.current, { id: "1", quantity: 0.25, unit: "bag" });
    return true;
  });
  assert.equal((await api.listHistory()).length, 1);
});

test("excessive amounts, unit mismatches and unknown items are rejected", async () => {
  const api = makeApi();
  await assert.rejects(api.adjust(request({ amount: 2 })), { code: "validation" });
  await assert.rejects(api.adjust(request({ requestId: "req-unit-01", unit: "g" })), { code: "conflict" });
  await assert.rejects(api.adjust(request({ requestId: "req-gone-01", itemId: "99" })), { code: "not_found" });
  assert.equal((await api.listHistory()).length, 0);
});

test("syncItems records add, edit and delete history with readable labels", async () => {
  const api = makeApi();
  api.syncItems([
    { ...spinach, quantity: 0.5 },
    { id: "2", name: "Kale", quantity: 1, unit: "bunch" },
  ]);
  api.syncItems([{ id: "2", name: "Kale", quantity: 1, unit: "bunch" }]);
  const history = await api.listHistory();
  const ops = history.map((entry) => entry.operation).sort();
  assert.deepEqual(ops, ["add", "delete", "edit"]);
  const edit = history.find((entry) => entry.operation === "edit");
  assert.equal(edit.quantityDelta, -0.5);
  for (const entry of history) contracts.inventoryHistoryEntrySchema.parse(entry);
  assert.deepEqual(history.map((e) => core.operationLabel(e.operation)).sort(), ["Added", "Deleted", "Edited"]);
});

test("listHistory honors the limit and returns newest first", async () => {
  const api = createFixtureInventoryApi({ items: [], latencyMs: 0, now: () => new Date("2026-11-08T12:00:00Z") });
  const history = await api.listHistory({ limit: 3 });
  assert.equal(history.length, 3);
  assert.ok(history[0].occurredAt >= history[1].occurredAt);
});
