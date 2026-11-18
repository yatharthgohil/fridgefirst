import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import "./helpers/register-ts-paths.mjs";
const state = {};
globalThis.scanServiceTest = state;
const moduleText = (source) => ({
  url: `data:text/javascript,${encodeURIComponent(source)}`,
  shortCircuit: true,
});
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return moduleText("export {};");
    if (specifier === "@/lib/supabase/server")
      return moduleText(
        "export async function createClient(){return globalThis.scanServiceTest.client}",
      );
    if (
      specifier === "./images" &&
      context.parentURL?.endsWith("/scans/service.ts")
    )
      return moduleText(
        "export async function prepareScanImage(...args){return globalThis.scanServiceTest.prepare(...args)}",
      );
    if (
      specifier === "./vision" &&
      context.parentURL?.endsWith("/scans/service.ts")
    )
      return moduleText(
        "export function assertScanProviderConfigured(){globalThis.scanServiceTest.preflight()} export async function analyzeGroceryImages(...args){return globalThis.scanServiceTest.analyze(...args)}",
      );
    return next(specifier, context);
  },
});
const { analyzeScan, deleteScan } =
  await import("../src/server/modules/scans/service.ts");
const id = "00000000-0000-4000-8000-000000000001";
const token = "00000000-0000-4000-8000-000000000002";
const base = {
  id,
  kind: "grocery_photo",
  images: [{ path: `owner/${id}/0.png`, contentType: "image/png", size: 3 }],
  version: 2,
  createdAt: "2026-11-17T12:00:00Z",
};
const item = {
  name: "Milk",
  quantity: 1,
  unit: "item",
  storageLocation: "Fridge",
  confidence: "high",
  imageIndex: 0,
  warnings: [],
};
function setup() {
  const calls = [];
  state.preflight = () => {};
  state.prepare = async () => ({ dataUrl: "data:image/jpeg;base64,AQID" });
  state.analyze = async (images, kind) => {
    calls.push(["provider", images, kind]);
    return { items: [item] };
  };
  state.download = async (path, options, parameters) => {
    calls.push(["download", path]);
    assert.ok(parameters.signal instanceof AbortSignal);
    return { data: new Blob([new Uint8Array([1, 2, 3])]), error: null };
  };
  state.remove = async (paths) => {
    calls.push(["remove", paths]);
    return { error: null };
  };
  state.rpc = async (name, args) => {
    calls.push([name, args]);
    if (name === "scan_claim")
      return {
        data: { scan: { ...base, status: "analyzing" }, token },
        error: null,
      };
    if (name === "scan_finish")
      return {
        data: {
          scan: args.p_message
            ? { ...base, status: "failed", message: args.p_message }
            : { ...base, status: "review", proposals: args.p_proposals },
        },
        error: null,
      };
    if (name === "scan_prepare_delete")
      return {
        data: {
          scan: { ...base, status: "failed", message: "Deletion pending" },
        },
        error: null,
      };
    if (name === "scan_delete") return { data: { deleted: true }, error: null };
    throw Error("Unexpected RPC");
  };
  state.client = {
    rpc: (...args) => state.rpc(...args),
    storage: {
      from: (bucket) => {
        assert.equal(bucket, "grocery-scans");
        return {
          download: (...args) => state.download(...args),
          remove: (...args) => state.remove(...args),
        };
      },
    },
  };
  return calls;
}
test("unconfigured recognition fails safely before any claim or paid work", async () => {
  const calls = setup();
  state.preflight = () => {
    throw Error("secret key diagnostic");
  };
  await assert.rejects(
    analyzeScan(id),
    (e) => e.status === 503 && !e.message.includes("secret"),
  );
  assert.deepEqual(calls, []);
});
test("successful analysis downloads server manifest and saves fresh UUID suggestions", async () => {
  const calls = setup();
  const result = await analyzeScan(id);
  assert.equal(result.scan.status, "review");
  assert.match(result.scan.proposals[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(calls.find((c) => c[0] === "download")[1], base.images[0].path);
  assert.equal(calls.find((c) => c[0] === "scan_finish")[1].p_token, token);
  assert.equal(calls.filter((c) => c[0] === "provider").length, 1);
});
test("cached review avoids storage and provider calls; foreign RPC errors are preserved", async () => {
  const calls = setup();
  state.rpc = async () => ({
    data: { scan: { ...base, status: "review", proposals: [] }, token: null },
    error: null,
  });
  assert.equal((await analyzeScan(id)).scan.status, "review");
  assert.deepEqual(calls, []);
  state.rpc = async () => ({
    data: { error: { code: "not_found", message: "Scan not found" } },
    error: null,
  });
  await assert.rejects(analyzeScan(id), (e) => e.status === 404);
});
test("missing uploads and provider failures persist only safe failed messages", async () => {
  for (const failure of ["download", "provider"]) {
    const calls = setup();
    if (failure === "download")
      state.download = async () => ({
        data: null,
        error: { message: "private URL" },
      });
    else
      state.analyze = async () => {
        throw Error("provider secret");
      };
    const result = await analyzeScan(id);
    assert.equal(result.scan.status, "failed");
    assert.doesNotMatch(result.scan.message, /private URL|provider secret/);
    assert.equal(
      calls.find((c) => c[0] === "scan_finish")[1].p_proposals,
      null,
    );
  }
});
test("cleanup failure preserves row for retry and missing rows make repeated deletion succeed", async () => {
  const calls = setup();
  state.remove = async () => ({ error: { message: "storage unavailable" } });
  await assert.rejects(deleteScan(id), /Photo deletion failed/);
  assert.equal(
    calls.some((c) => c[0] === "scan_delete"),
    false,
  );
  state.remove = async () => ({ error: null });
  await deleteScan(id);
  assert.equal(calls.filter((c) => c[0] === "scan_delete").length, 1);
  state.rpc = async () => ({
    data: { error: { code: "not_found", message: "Scan not found" } },
    error: null,
  });
  await deleteScan(id);
});

test("receipt analysis keeps food evidence and assigns separate IDs to repeated purchases", async () => {
  setup();
  const rpc = state.rpc;
  state.rpc = async (...args) => {
    const result = await rpc(...args);
    if (result.data.scan) result.data.scan.kind = "receipt";
    return result;
  };
  state.analyze = async (_images, kind) => {
    assert.equal(kind, "receipt");
    return {
      items: [
        { ...item, sourceText: "ORG MLK 1 L" },
        { ...item, sourceText: "ORG MLK 1 L" },
      ],
    };
  };
  const { scan } = await analyzeScan(id);
  assert.equal(scan.kind, "receipt");
  assert.equal(scan.proposals.length, 2);
  assert.notEqual(scan.proposals[0].id, scan.proposals[1].id);
  assert.equal(scan.proposals[0].sourceText, "ORG MLK 1 L");
  assert.equal(scan.proposals[1].sourceText, "ORG MLK 1 L");
});
