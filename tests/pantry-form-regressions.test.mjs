import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import "./helpers/register-ts-paths.mjs";
const core = await import("../src/features/pantry/pantry-form-core.ts");
const { PantryApiError } = await import("../src/features/pantry/pantry-api.ts");
const filters = await import("../src/features/pantry/pantry-filters.ts");
const { sortPantryItems } = filters;

function mountModal(file, exportName, props) {
  const states = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useId: () => "modal",
    useMemo: (compute) => compute(),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
  };
  const source = readFileSync(new URL(`../src/features/pantry/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(`${source}\nexport { ${exportName} };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(code, {
    module: compiled, exports: compiled.exports, Error,
    require(specifier) {
      if (specifier === "react") return React;
      if (specifier === "@/components") return { Modal: "Modal", Button: "Button", Icon: "Icon" };
      if (specifier === "./pantry-form-core") return core;
      if (specifier === "./pantry-api") return { PantryApiError };
      if (specifier === "./types") return { formatUnit: (unit) => unit, isAttentionItem: () => false };
      if (specifier === "./pantry-filters") return filters;
      if (specifier === "next/navigation") return { useRouter: () => ({ push() {} }) };
      if (specifier.endsWith(".css")) return {};
      throw new Error(`Unexpected import ${specifier}`);
    },
  });
  const render = () => { cursor = 0; return compiled.exports[exportName](props); };
  return { render };
}

function nodes(tree) {
  return tree && typeof tree === "object"
    ? [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)] : [];
}
function button(tree, label) {
  return nodes(tree).find((node) => node.type === "Button" && node.props.children.flat(Infinity).includes(label));
}
const item = { id: "00000000-0000-4000-8000-000000000001", name: "Milk", quantity: "1", unit: "L", location: "Fridge", addedOn: "2026-11-17", notes: null, version: 1 };
const conflict = () => Object.assign(new PantryApiError("Item changed", "conflict"), { code: "conflict" });
const submit = (tree) => nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
const rename = (tree, value) => nodes(tree).find((node) => node.type === "input" && node.props.name === "name").props.onChange({ target: { value } });

test("edit conflict reload replaces the baseline and version before retry", async () => {
  let request;
  let attempt = 0;
  const props = {
    mode: "edit", item, onClose() {},
    onReloadLatest: async () => ({ ...item, name: "Fresh milk", quantity: "2", version: 2 }),
    onSubmitEdit: async (_id, value) => { if (attempt++ === 0) throw conflict(); request = value; },
  };
  const modal = mountModal("pantry-form-modal.tsx", "PantryFormModalBody", props);
  rename(modal.render(), "Draft");
  await submit(modal.render());
  await button(modal.render(), "Review current values").props.onClick();
  rename(modal.render(), "Updated fresh milk");
  await submit(modal.render());
  assert.equal(request.expectedVersion, 2);
  assert.deepEqual(request.changes, { name: "Updated fresh milk" });
});

test("edit reload failure retains the draft and allows reload retry", async () => {
  let closes = 0;
  const props = {
    mode: "edit", item, onClose() { closes++; },
    onReloadLatest: async () => { throw new Error("Network unavailable"); },
    onSubmitEdit: async () => { throw conflict(); },
  };
  const modal = mountModal("pantry-form-modal.tsx", "PantryFormModalBody", props);
  rename(modal.render(), "Draft");
  await submit(modal.render());
  await button(modal.render(), "Review current values").props.onClick();
  assert.equal(closes, 0);
  assert.ok(nodes(modal.render()).some((node) => node.type === "input" && node.props.value === "Draft"));
  assert.ok(button(modal.render(), "Review current values"));
  assert.ok(nodes(modal.render()).some((node) => node.props.children.includes("Network unavailable")));
});

test("delete reload failure leaves the confirmation open and retryable", async () => {
  let closes = 0;
  const props = { item, onClose() { closes++; }, onConfirmDelete: async () => { throw conflict(); }, onReloadLatest: async () => { throw new Error("Network unavailable"); } };
  const modal = mountModal("pantry-delete-modal.tsx", "DeleteModalBody", props);
  await button(modal.render(), "Remove item").props.onClick();
  await button(modal.render(), "Review current values").props.onClick();
  assert.equal(closes, 0);
  assert.ok(button(modal.render(), "Review current values"));
  assert.ok(nodes(modal.render()).some((node) => node.props.children.includes("Network unavailable")));
});

test("recently added uses calendar dates regardless of UUID ordering", () => {
  const older = { ...item, id: "ffffffff-ffff-4fff-8fff-ffffffffffff", addedOn: "2026-10-31" };
  const newer = { ...item, addedOn: "2026-11-17" };
  assert.deepEqual(sortPantryItems([older, newer], "added"), [newer, older]);
  assert.deepEqual(sortPantryItems([{ ...item, id: 1, addedOn: undefined }, { ...item, id: 2, addedOn: undefined }], "added").map((value) => value.id), [2, 1]);
});

test("change computation refuses invalid patches instead of casting them", () => {
  const initial = { ...core.defaultPantryFormValues("2026-11-17"), name: "Milk" };
  assert.throws(() => core.computePantryChanges(initial, { ...initial, name: " " }));
  assert.throws(() => core.computePantryChanges(initial, { ...initial, quantity: "invalid" }));
});

test("standalone pantry view sorts UUID items by the selected added date", () => {
  const older = { ...item, name: "Older", expirationDate: "2026-11-20", id: "ffffffff-ffff-4fff-8fff-ffffffffffff", addedOn: "2026-10-31" };
  const newer = { ...item, name: "Newer", expirationDate: "2026-11-20", addedOn: "2026-11-17" };
  const view = mountModal("pantry-view.tsx", "PantryView", { items: [older, newer] });
  const select = nodes(view.render()).find((node) => node.type === "select" && node.props["aria-label"] === "Sort pantry items");
  select.props.onChange({ target: { value: "added" } });
  const rows = nodes(view.render()).filter((node) => node.type === "article" && node.props.className?.startsWith("inventory-row"));
  assert.deepEqual(rows.map((row) => nodes(row).find((node) => node.type === "strong").props.children[0]), ["Newer", "Older"]);
});
