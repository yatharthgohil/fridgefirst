import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import "./helpers/register-ts-paths.mjs";
const { prepareScanImage } = await import("../src/server/modules/scans/images.ts");
const { createVisionAnalyzer } = await import("../src/server/modules/scans/vision-client.ts");

const image = "data:image/jpeg;base64,aGVsbG8=";
const item = { name: "Milk", quantity: null, unit: null, storageLocation: "Fridge", confidence: "low", imageIndex: 0, warnings: ["Check amount"] };
const response = (body, status = "completed") => Response.json({ status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(body) }] }] });

test("image preparation decodes each supported format and strips metadata", async () => {
  for (const [format, contentType] of [["png", "image/png"], ["jpeg", "image/jpeg"], ["webp", "image/webp"]]) {
    const bytes = await sharp({ create: { width: 30, height: 20, channels: 3, background: "green" } }).toFormat(format).toBuffer();
    const { dataUrl } = await prepareScanImage(bytes, contentType);
    const metadata = await sharp(Buffer.from(dataUrl.split(",")[1], "base64")).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 30);
    assert.equal(metadata.exif, undefined);
  }
});

test("image preparation rejects corrupt, mislabeled, oversized and high-pixel images", async () => {
  await assert.rejects(prepareScanImage(new Uint8Array(), "image/png"));
  await assert.rejects(prepareScanImage(Buffer.from("not an image"), "image/png"));
  await assert.rejects(prepareScanImage(Buffer.alloc(5 * 1024 * 1024 + 1), "image/jpeg"));
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  await assert.rejects(prepareScanImage(png, "image/jpeg"));
  await assert.rejects(prepareScanImage(png, "image/heic"));
  const giant = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(prepareScanImage(giant, "image/png"));
  await assert.rejects(prepareScanImage(png.subarray(0, 40), "image/png"));
});

test("provider sends bounded structured image extraction without retaining the response", async () => {
  let request;
  const analyze = createVisionAnalyzer({ apiKey: "test-key", model: "test-model", fetchImpl: async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    request = JSON.parse(init.body);
    return response({ items: [item] });
  } });
  assert.deepEqual(await analyze([image], "grocery_photo"), { items: [item] });
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.schema.additionalProperties, false);
  assert.equal(request.input[0].content[0].type, "input_image");
  assert.ok(request.max_output_tokens <= 8000);
});

test("provider accepts no detections and rejects invalid, refused, incomplete, foreign-image or oversized output", async () => {
  const results = [
    () => response({ items: [] }),
    () => response({ items: [{ ...item, quantity: -2 }] }),
    () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }),
    () => response({ items: [] }, "incomplete"),
    () => response({ items: [{ ...item, imageIndex: 2 }] }),
    () => new Response("x".repeat(262145)),
    () => response({ items: [{ ...item, expirationDate: "2099-01-01" }] }),
    () => new Response("private provider diagnostic", { status: 500 }),
  ];
  for (let i = 0; i < results.length; i++) {
    const analyze = createVisionAnalyzer({ apiKey: "test", model: "test", fetchImpl: async () => results[i]() });
    if (i === 0) assert.deepEqual(await analyze([image], "grocery_photo"), { items: [] });
    else await assert.rejects(analyze([image], "grocery_photo"), (error) => !error.message.includes("private provider diagnostic"));
  }
});

test("provider timeout aborts the request without an automatic paid retry", async () => {
  let calls = 0;
  const analyze = createVisionAnalyzer({ apiKey: "test", model: "test", timeoutMs: 5, fetchImpl: async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      setTimeout(() => reject(new Error("test deadline")), 100);
    });
  } });
  await assert.rejects(analyze([image], "grocery_photo"), /timed out/);
  assert.equal(calls, 1);
});
