import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function shellHarness() {
  const states = [], effects = [], frames = [];
  let cursor = 0, pending = [];
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(init) { const i = cursor++; if (!(i in states)) states[i] = typeof init === "function" ? init() : init; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    useEffect(fn, deps) { const i = cursor++; if (!effects[i] || deps.some((value, j) => value !== effects[i][j])) pending.push(fn); effects[i] = deps; },
    useMemo(fn) { cursor++; return fn(); },
  };
  function compile(path, require) {
    const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8") + (path.endsWith("AppShell.tsx") ? "\nexport { mergeActivityEvents };" : "");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
    const compiled = { exports: {} };
    vm.runInNewContext(output, { require, module: compiled, exports: compiled.exports, process: { env: {} }, window: {}, localStorage: storage, requestAnimationFrame: cb => { frames.push(cb); return 1; }, cancelAnimationFrame() {}, setTimeout() {}, clearTimeout() {}, Date, console, AbortController });
    return compiled.exports;
  }
  const types = compile("src/features/pantry/types.ts", () => undefined);
  const core = compile("src/features/pantry/inventory-core.ts", () => types);
  const pantry = { ...core, initialPantryItems: [], initialActivityEvents: [], expirationFixtureItems: [], withFixtureExpiration: x => x, contractToUiItem: x => ({ ...x, quantity: String(x.quantity), location: x.storageLocation }), PantryApiError: class extends Error {}, DEFAULT_PANTRY_FILTERS: {}, usePantryFilters: items => ({ filters: {}, visibleItems: items, setFilters() {}, clear() {} }) };
  const names = ["PantryView", "OverviewView", "ActivityView", "PantryFormModal", "PantryDeleteModal", "RecentActivityPanel", "InventoryAdjustControls", "PantryFilterBar", "PantryNoMatches", "Sidebar", "Topbar", "MobileNav", "Icon", "RecipesView", "RecipeDetailModal", "RecipePreferencesModal", "AccountSettingsModal", "ProfileEditModal", "OnboardingWizard", "DeductionsModal", "ScanFlow"];
  const components = Object.fromEntries(names.map(name => [name, name]));
  const require = path => path === "@/features/pantry/rescued-totals" ? { loadRescuedTotals: async () => ({ monthlyKg: 0, lifetimeKg: 0 }) } : path === "react" ? react : path === "next/navigation" ? { useRouter: () => ({ push() {} }) } : path === "@/features/pantry" ? { ...components, ...pantry } : { ...components, suggestedRecipes: [], defaultRecipePreferences: {} };
  const { AppShell, mergeActivityEvents } = compile("src/components/AppShell.tsx", require);
  const item = { id: "one", name: "Milk", quantity: "2", unit: "kg", location: "Fridge", notes: "old", version: 1, amount: 100 };
  let update = async (_id, request) => ({ item: { ...item, quantity: 2, storageLocation: "Fridge", notes: request.changes.notes ?? "old", version: 2 } });
  const calls = [];
  const props = { authenticatedUserId: "alice-id", initialUser: { name: "Alice", email: "alice@example.com" }, initialPantryItems: [item], pantryApi: { update: async (...args) => { calls.push(args); return update(...args); } }, inventoryApi: { listHistory: async () => [] } };
  storage.setItem("ff_onboarded_alice@example.com", "true");
  storage.setItem("ff_onboarded_alice-id", "true");
  return { props, calls, data, mergeActivityEvents, setUpdate: fn => { update = fn; }, render() { cursor = 0; return AppShell(props); }, async settle() { const jobs = pending; pending = []; jobs.forEach(fn => fn()); frames.splice(0).forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); } };
}

function find(tree, type) {
  if (!tree || typeof tree !== "object") return null;
  if (tree.type === type) return tree;
  for (const child of (tree.props?.children ?? []).flat(Infinity)) { const match = find(child, type); if (match) return match; }
  return null;
}

async function pantryHarness() {
  const h = shellHarness();
  h.render(); await h.settle();
  let tree = h.render(); await h.settle();
  find(tree, "Sidebar").props.onNavigate("My pantry");
  return { ...h, tree: () => h.render() };
}

test("inline note Save writes the draft with the committed version", async () => {
  const h = await pantryHarness();
  find(h.tree(), "PantryView").props.onUpdateNote("one", "new note");
  assert.equal(find(h.tree(), "PantryView").props.items[0].notes, "old");
  await find(h.tree(), "PantryView").props.onSaveNote("one", "new note");
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][1].expectedVersion, 1);
  assert.equal(find(h.tree(), "PantryView").props.items[0].notes, "new note");
});

test("an unrelated edit and an in-flight note save preserve newer drafts", async () => {
  const h = await pantryHarness();
  find(h.tree(), "PantryView").props.onUpdateNote("one", "draft");
  const modals = [];
  function collect(tree) { if (!tree || typeof tree !== "object") return; if (tree.type === "PantryFormModal") modals.push(tree); (tree.props?.children ?? []).flat(Infinity).forEach(collect); }
  collect(h.tree());
  await modals.find(modal => modal.props.mode === "edit").props.onSubmitEdit("one", { expectedVersion: 1, changes: { quantity: 3 } });
  assert.equal(find(h.tree(), "PantryView").props.notes.one, "draft");
  let resolve;
  h.setUpdate(() => new Promise(done => { resolve = done; }));
  const saving = find(h.tree(), "PantryView").props.onSaveNote("one", "draft");
  find(h.tree(), "PantryView").props.onUpdateNote("one", "newer draft");
  resolve({ item: { id: "one", name: "Milk", quantity: 3, storageLocation: "Fridge", notes: "draft", version: 3 } });
  await saving;
  assert.equal(find(h.tree(), "PantryView").props.notes.one, "newer draft");
});

test("editing the displayed email cannot change the activity cache owner", async () => {
  const h = await pantryHarness();
  find(h.tree(), "ProfileEditModal").props.onSave({ name: "Alice", email: "bob@example.com" });
  h.render(); await h.settle(); h.render(); await h.settle();
  assert.equal(h.data.has("ff_activity_bob@example.com"), false);
  assert.equal(h.data.has("ff_activity_alice-id"), true);
});

test("history preserves separate transactions with identical titles", () => {
  const h = shellHarness();
  const event = { title: "Milk consumed", type: "cooked", timestamp: Date.now() };
  assert.equal(h.mergeActivityEvents([{ ...event, id: "new" }], [{ ...event, id: "old" }]).length, 2);
});

test("a failed note save preserves the draft and committed row", async () => {
  const h = await pantryHarness();
  h.setUpdate(async () => { throw new Error("offline"); });
  find(h.tree(), "PantryView").props.onUpdateNote("one", "unsaved draft");
  await find(h.tree(), "PantryView").props.onSaveNote("one", "unsaved draft");
  const view = find(h.tree(), "PantryView");
  assert.equal(view.props.notes.one, "unsaved draft");
  assert.equal(view.props.items[0].notes, "old");
  assert.equal(view.props.items[0].version, 1);
});
