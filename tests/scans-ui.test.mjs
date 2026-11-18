import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/register-ts-paths.mjs";
const { createHttpScanApi } = await import("../src/features/scans/scan-api.ts");
const {
  buildScanConfirmation,
  createScanDrafts,
  validateScanFiles,
  scanRecoveryKey,
} = await import("../src/features/scans/scan-core.ts");
const id = "11111111-1111-4111-8111-111111111111";
const proposalId = "22222222-2222-4222-8222-222222222222";
const proposal = {
  id: proposalId,
  name: "Milk",
  quantity: null,
  unit: null,
  storageLocation: "Fridge",
  confidence: "low",
  imageIndex: 0,
  warnings: ["Check package size"],
};
const scan = {
  id,
  kind: "grocery_photo",
  images: [{ path: `owner/${id}/0.jpg`, contentType: "image/jpeg", size: 3 }],
  version: 2,
  createdAt: "2026-11-18T00:00:00Z",
  status: "review",
  proposals: [proposal],
};

test("unknown quantity and unit stay blank and must be corrected before confirmation", () => {
  const drafts = createScanDrafts(scan.proposals, "2026-11-17");
  assert.equal(drafts[0].quantity, "");
  assert.equal(drafts[0].unit, "");
  assert.throws(() => buildScanConfirmation(scan, drafts), /positive quantity/);
  drafts[0].quantity = "1";
  assert.throws(() => buildScanConfirmation(scan, drafts), /Check the name/);
  drafts[0].unit = "L";
  assert.deepEqual(buildScanConfirmation(scan, drafts), {
    expectedVersion: 2,
    items: [
      {
        proposalId,
        fields: {
          name: "Milk",
          quantity: 1,
          unit: "L",
          storageLocation: "Fridge",
          addedOn: "2026-11-17",
          expiration: { kind: "estimate" },
        },
      },
    ],
  });
});
test("separate same-name lots keep their IDs and manual dates require validation", () => {
  const another = {
    ...proposal,
    id: "33333333-3333-4333-8333-333333333333",
    quantity: 2,
    unit: "item",
  };
  const review = {
    ...scan,
    proposals: [{ ...proposal, quantity: 1, unit: "item" }, another],
  };
  const drafts = createScanDrafts(review.proposals, "2026-11-17");
  assert.equal(buildScanConfirmation(review, drafts).items.length, 2);
  drafts[0].expirationMode = "override";
  assert.throws(() => buildScanConfirmation(review, drafts));
  drafts[0].expirationDate = "2026-11-20";
  assert.deepEqual(
    buildScanConfirmation(review, drafts).items[0].fields.expiration,
    { kind: "override", date: "2026-11-20" },
  );
  drafts[0].selected = false;
  assert.equal(
    buildScanConfirmation(review, drafts).items[0].proposalId,
    another.id,
  );
});
test("confirmation retries preserve the identical payload and fresh scans reset edits", () => {
  const drafts = createScanDrafts(scan.proposals, "2026-11-17");
  drafts[0].quantity = "2";
  drafts[0].unit = "item";
  drafts[0].name = "Corrected milk";
  assert.deepEqual(
    buildScanConfirmation(scan, drafts),
    buildScanConfirmation(scan, drafts),
  );
  assert.equal(createScanDrafts(scan.proposals, "2026-11-17")[0].name, "Milk");
  assert.notEqual(scanRecoveryKey("alice-id"), scanRecoveryKey("bob-id"));
});
test("file selection enforces formats and limits and explains HEIC conversion", () => {
  assert.throws(
    () =>
      validateScanFiles([
        new File(["a"], "photo.heic", { type: "image/heic" }),
      ]),
    /Export them as JPEG/,
  );
  assert.throws(() => validateScanFiles([]));
  assert.throws(() =>
    validateScanFiles([
      new File(["a"], "receipt.pdf", { type: "application/pdf" }),
    ]),
  );
  assert.throws(() =>
    validateScanFiles([
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", {
        type: "image/jpeg",
      }),
    ]),
  );
  assert.equal(
    validateScanFiles([new File(["abc"], "photo.jpg", { type: "image/jpeg" })])
      .images[0].size,
    3,
  );
});
test("client uploads only server-assigned paths to private storage without sending file bodies through API", async () => {
  const requests = [];
  const uploads = [];
  const api = createHttpScanApi({
    fetchImpl: async (...args) => {
      requests.push(args);
      return Response.json({
        scan: { ...scan, status: "uploading", proposals: undefined },
      });
    },
    uploadFile: async (...args) => {
      uploads.push(args);
    },
  });
  const file = new File(["abc"], "photo.jpg", { type: "image/jpeg" });
  const created = await api.create(validateScanFiles([file]));
  await api.upload(created, [file]);
  assert.equal(uploads[0][0], "grocery-scans");
  assert.equal(uploads[0][1], scan.images[0].path);
  assert.equal(uploads[0][2], file);
  assert.equal(requests[0][1].credentials, "same-origin");
  assert.deepEqual(JSON.parse(requests[0][1].body).images, [
    { contentType: "image/jpeg", size: 3 },
  ]);
  await assert.rejects(
    api.upload(created, [
      new File(["different"], "changed.jpg", { type: "image/jpeg" }),
    ]),
    /do not match/,
  );
});
test("client parses real responses and surfaces backend errors without mock detections", async () => {
  const api = createHttpScanApi({
    fetchImpl: async () =>
      Response.json(
        { error: { message: "Recognition is not configured" } },
        { status: 503 },
      ),
    uploadFile: async () => {},
  });
  await assert.rejects(api.analyze(id), /not configured/);
  const malformed = createHttpScanApi({
    fetchImpl: async () => Response.json({ scan: { id } }),
    uploadFile: async () => {},
  });
  await assert.rejects(malformed.get(id));
  await assert.rejects(malformed.get("not-an-id"));
});
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const scanCore = await import("../src/features/scans/scan-core.ts");
const scanContracts = await import("../src/contracts/scans.ts");
const common = await import("../src/contracts/common.ts");
function flowHarness(api) {
  const states = [];
  let cursor = 0;
  let closed = 0;
  let confirmed = 0;
  const data = new Map([[scanRecoveryKey("alice"), id]]);
  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState(init) {
      const i = cursor++;
      if (!(i in states))
        states[i] = typeof init === "function" ? init() : init;
      return [
        states[i],
        (value) => {
          states[i] = typeof value === "function" ? value(states[i]) : value;
        },
      ];
    },
    useRef(init) {
      const i = cursor++;
      return (states[i] ??= { current: init });
    },
    useEffect() {
      cursor++;
    },
  };
  const output = ts.transpileModule(
    fs.readFileSync(
      new URL("../src/features/scans/scan-flow.tsx", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const compiled = { exports: {} };
  const require = (path) =>
    path === "react"
      ? react
      : path === "@/components"
        ? { Modal: "Modal", Button: "Button" }
        : path === "@/contracts/common"
          ? common
          : path === "@/contracts/scans"
            ? scanContracts
            : path === "./scan-core"
              ? scanCore
              : {};
  vm.runInNewContext(output, {
    require,
    module: compiled,
    exports: compiled.exports,
    window: {},
    localStorage: {
      getItem: (key) => data.get(key),
      setItem: (key, value) => data.set(key, value),
      removeItem: (key) => data.delete(key),
    },
    Date,
    console,
  });
  return {
    render() {
      cursor = 0;
      return compiled.exports.ScanFlow({
        ownerId: "alice",
        api,
        onClose: () => closed++,
        onConfirmed: () => confirmed++,
      });
    },
    closed: () => closed,
    confirmed: () => confirmed,
    data,
  };
}
function elements(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [
    ...(predicate(tree) ? [tree] : []),
    ...(tree.props?.children ?? [])
      .flat(Infinity)
      .flatMap((child) => elements(child, predicate)),
  ];
}
function button(tree, text) {
  return elements(
    tree,
    (node) =>
      node.type === "Button" &&
      node.props.children.flat(Infinity).includes(text),
  )[0];
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("real scan callbacks preserve corrected drafts after failed confirmation and block duplicate requests", async () => {
  let finish;
  const calls = [];
  const h = flowHarness({
    get: async () => scan,
    confirm: async (...args) => {
      calls.push(args);
      return new Promise((_resolve, reject) => {
        finish = reject;
      });
    },
  });
  button(h.render(), "Resume scan").props.onClick();
  await settle();
  for (const [label, value] of [
    ["Quantity for Milk", "2"],
    ["Unit for Milk", "L"],
    ["Name for Milk", "Edited milk"],
  ]) {
    elements(
      h.render(),
      (node) => node.props["aria-label"] === label,
    )[0].props.onChange({ target: { value } });
  }
  const confirm = button(h.render(), "Confirm selected groceries").props
    .onClick;
  confirm();
  confirm();
  assert.equal(calls.length, 1);
  h.render().props.onClose();
  assert.equal(h.closed(), 0);
  finish(new Error("Network unavailable"));
  await settle();
  const tree = h.render();
  assert.equal(
    elements(tree, (node) => node.props["aria-label"] === "Name for Milk")[0]
      .props.value,
    "Edited milk",
  );
  button(tree, "Confirm selected groceries").props.onClick();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  finish(new Error("Network unavailable"));
  await settle();
});
test("real confirmed recovery refreshes pantry and keeps deletion available without adding again", async () => {
  let deleted;
  const h = flowHarness({
    get: async () => ({ ...scan, status: "confirmed", itemIds: [proposalId] }),
    delete: async (scanId) => {
      deleted = scanId;
    },
  });
  button(h.render(), "Resume scan").props.onClick();
  await settle();
  assert.equal(h.confirmed(), 1);
  assert.equal(h.data.get(scanRecoveryKey("alice")), id);
  button(h.render(), "Delete source photos").props.onClick();
  await settle();
  assert.equal(deleted, id);
  assert.equal(h.data.has(scanRecoveryKey("alice")), false);
});

test("failed recognition can be retried from the real flow without changing pantry data", async () => {
  let analyzed = 0;
  const h = flowHarness({
    get: async () => ({
      ...scan,
      status: "failed",
      message: "Try a clearer photo.",
    }),
    analyze: async (scanId) => {
      assert.equal(scanId, id);
      analyzed++;
      return scan;
    },
  });
  button(h.render(), "Resume scan").props.onClick();
  await settle();
  button(h.render(), "Retry recognition").props.onClick();
  await settle();
  assert.equal(analyzed, 1);
  assert.ok(button(h.render(), "Confirm selected groceries"));
  assert.equal(h.confirmed(), 0);
});

test("receipt selection uploads the chosen kind and reviews food-line evidence before saving", async () => {
  const receipt = {
    ...scan,
    kind: "receipt",
    proposals: [{ ...proposal, sourceText: "ORG MLK  3.49" }],
  };
  let created;
  let saved;
  const h = flowHarness({
    create: async (request) => {
      created = request;
      return { ...receipt, status: "uploading", proposals: undefined };
    },
    upload: async () => {},
    analyze: async () => receipt,
    confirm: async (_id, request) => {
      saved = request;
      return { items: [{}] };
    },
  });
  h.data.clear();
  elements(h.render(), (node) => node.type === "select")[0].props.onChange({
    target: { value: "receipt" },
  });
  const chooser = elements(h.render(), (node) => node.props.type === "file")[0];
  chooser.props.onChange({
    target: {
      files: [new File(["abc"], "receipt.jpg", { type: "image/jpeg" })],
      value: "receipt.jpg",
    },
  });
  await settle();
  assert.equal(created.kind, "receipt");
  assert.deepEqual(created.images, [{ contentType: "image/jpeg", size: 3 }]);
  assert.equal(
    elements(h.render(), (node) => node.type === "q")[0].props.children[0],
    "ORG MLK  3.49",
  );
  button(h.render(), "Confirm selected groceries").props.onClick();
  assert.equal(saved, undefined);
  for (const [label, value] of [
    ["Quantity for Milk", "1"],
    ["Unit for Milk", "item"],
  ]) {
    elements(
      h.render(),
      (node) => node.props["aria-label"] === label,
    )[0].props.onChange({ target: { value } });
  }
  button(h.render(), "Confirm selected groceries").props.onClick();
  await settle();
  assert.equal(saved.items[0].fields.quantity, 1);
  assert.equal(saved.items[0].fields.unit, "item");
  assert.equal(saved.items[0].fields.sourceText, undefined);
  assert.equal(h.confirmed(), 1);
});
