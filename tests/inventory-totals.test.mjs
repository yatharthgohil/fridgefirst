import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import "./helpers/register-ts-paths.mjs";
const core = await import("../src/server/modules/inventory/totals-core.ts");
const { rescuedMonthSchema } = await import("../src/contracts/inventory-totals.ts");

function serviceHarness(rows, { signedIn = true, fail = false } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: "alice-id" } : null }, error: null }) },
    from(table) {
      const filters = {};
      calls.push({ table, filters });
      const query = {
        select(value) { filters.select = value; return this; },
        eq(key, value) { filters[key] = value; return this; },
        in(key, value) { filters[key] = value; return this; },
        lte(key, value) { filters[key] = value; return this; },
        order(key, value) { filters.order = [key, value]; return this; },
        limit(value) { filters.limit = value; return this; },
        gt(key, value) { filters.after = [key, value]; return this; },
        then(resolve) {
          const result = rows.filter(row => row.user_id === filters.user_id && filters.operation.includes(row.operation) && row.occurred_at <= filters.occurred_at && (!filters.after || row.transaction_id > filters.after[1])).slice(0, filters.limit);
          return Promise.resolve({ data: result, error: fail ? new Error("offline") : null }).then(resolve);
        },
      };
      return query;
    },
  };
  const source = fs.readFileSync(new URL("../src/server/modules/inventory/totals.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(output, { module: compiled, exports: compiled.exports, Date, require: path => path === "server-only" ? {} : path.endsWith("totals-core") ? core : path.endsWith("supabase/server") ? { createClient: async () => client } : { ApiError: Error } });
  return { ...compiled.exports, calls };
}

const start = "2026-11-01T04:00:00.000Z";
const end = "2026-12-01T05:00:00.000Z";
const row = (id, occurred_at = start, overrides = {}) => ({ transaction_id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`, user_id: "alice-id", operation: "consume", occurred_at, quantity_delta: -1, unit: "kg", ...overrides });

test("totals query walks more than 1000 rows and enforces owner, operation, cutoff and month boundaries", async () => {
  const rows = Array.from({ length: 1101 }, (_, i) => row(i + 1));
  rows.push(row(1102, "2026-10-31T23:59:59.000Z"));
  rows.push(row(1103, start, { user_id: "bob-id" }));
  rows.push(row(1104, start, { operation: "discard" }));
  rows.push(row(1105, "2099-12-01T05:00:00.000Z"));
  const h = serviceHarness(rows);
  const totals = await h.inventoryTotals(start, end);
  assert.equal(totals.monthlyKg, 1101);
  assert.equal(totals.lifetimeKg, 1102);
  assert.equal(h.calls.length, 4);
  assert.equal(h.calls[1].filters.after[0], "transaction_id");
  assert.equal(h.calls[1].filters.after[1], rows[499].transaction_id);
  assert.equal(h.calls[0].filters.user_id, "alice-id");
  assert.deepEqual(Array.from(h.calls[0].filters.operation), ["consume", "recipe_deduction"]);
});

test("month totals include the start and exclude the end", async () => {
  const rows = [row(1, start), row(2, end), row(3, "2026-11-01T03:59:59.999Z")];
  const totals = await core.sumRescuedTransactions(async after => after ? [] : rows, Date.parse(start), Date.parse(end));
  assert.equal(totals.monthlyKg, 1);
  assert.equal(totals.lifetimeKg, 3);
  assert.equal(rescuedMonthSchema.safeParse({ start, end }).success, true);
  assert.equal(rescuedMonthSchema.safeParse({ start: "invalid", end }).success, false);
});

test("totals refuse unauthenticated access and failed queries", async () => {
  const signedOut = serviceHarness([], { signedIn: false });
  await assert.rejects(signedOut.inventoryTotals(start, end));
  assert.equal(signedOut.calls.length, 0);
  await assert.rejects(serviceHarness([], { fail: true }).inventoryTotals(start, end), /Inventory totals failed/);
});
