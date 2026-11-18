import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/register-ts-paths.mjs";
const { createVisionAnalyzer, receiptInstructions } =
  await import("../src/server/modules/scans/vision-client.ts");
const { scanCreateRequestSchema, scanProposalSchema } =
  await import("../src/contracts/scans.ts");

const image = "data:image/jpeg;base64,aGVsbG8=";
const food = {
  category: "food",
  name: "Milk",
  sourceText: "ORG MLK",
  quantity: null,
  unit: null,
  storageLocation: "Fridge",
  confidence: "medium",
  imageIndex: 0,
  warnings: ["Purchased amount is unclear."],
};
const response = (body) =>
  Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(body) }],
      },
    ],
  });
const analyzer = (body) =>
  createVisionAnalyzer({
    apiKey: "controlled-test",
    model: "controlled-model",
    fetchImpl: async () => response(body),
  });

test("receipt contract accepts bounded food evidence and rejects unsupported kinds and evidence", () => {
  assert.equal(
    scanCreateRequestSchema.parse({
      kind: "receipt",
      images: [{ contentType: "image/png", size: 10 }],
    }).kind,
    "receipt",
  );
  assert.equal(
    scanCreateRequestSchema.safeParse({ kind: "pdf", images: [] }).success,
    false,
  );
  const { category, ...item } = food;
  assert.equal(category, "food");
  const proposal = { ...item, id: "00000000-0000-4000-8000-000000000001" };
  assert.equal(scanProposalSchema.parse(proposal).sourceText, "ORG MLK");
  for (const sourceText of [null, "", " ", "x".repeat(201), 12])
    assert.equal(
      scanProposalSchema.safeParse({ ...proposal, sourceText }).success,
      false,
    );
});

test("receipt extraction drops every excluded category and keeps repeated food purchases with unknown amounts", async () => {
  let request;
  const lines = [
    food,
    ...["nonfood", "tax", "discount", "total", "payment"].map((category) => ({
      category,
    })),
    { ...food },
  ];
  const analyze = createVisionAnalyzer({
    apiKey: "test",
    model: "test",
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return response({ lines });
    },
  });
  const result = await analyze([image], "receipt");
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], result.items[1]);
  assert.equal(result.items[0].quantity, null);
  assert.equal(result.items[0].unit, null);
  assert.equal(result.items[0].sourceText, "ORG MLK");
  assert.equal("category" in result.items[0], false);
  assert.equal(request.instructions, receiptInstructions);
  assert.equal(request.store, false);
  assert.equal(request.text.format.name, "receipt_scan");
  assert.equal(request.text.format.strict, true);
  const visit = (schema) => {
    if (!schema || typeof schema !== "object") return;
    assert.equal("oneOf" in schema, false);
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(
        [...schema.required].sort(),
        Object.keys(schema.properties).sort(),
      );
    }
    for (const child of Object.values(schema)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(request.text.format.schema);
  assert.equal(
    request.text.format.schema.properties.lines.items.anyOf.length,
    2,
  );
  assert.match(request.instructions, /never a price/i);
  assert.match(request.instructions, /Multipacks/);
  assert.match(request.instructions, /Weighted foods/);
  assert.match(request.instructions, /never expiration dates/);
});

test("receipt extraction accepts explicit food weights without deriving amounts from price", async () => {
  const item = {
    ...food,
    name: "Bananas",
    sourceText: "BANANA 0.640 kg",
    quantity: 0.64,
    unit: "kg",
    storageLocation: "Counter",
    warnings: [],
  };
  const result = await analyzer({ lines: [item, food] })([image], "receipt");
  assert.equal(result.items[0].quantity, 0.64);
  assert.equal(result.items[0].unit, "kg");
  assert.equal(result.items[1].quantity, null);
});

test("receipt extraction rejects malformed strict output, transcript leaks and limits", async () => {
  const invalid = [
    { lines: [{ ...food, sourceText: null }] },
    { lines: [{ ...food, sourceText: "" }] },
    { lines: [{ ...food, sourceText: "x".repeat(201) }] },
    { lines: [{ ...food, quantity: "$3.99" }] },
    { lines: [{ ...food, price: 3.99 }] },
    { lines: [{ ...food, expirationDate: "2027-01-01" }] },
    { lines: [{ ...food, imageIndex: 1 }] },
    { lines: [{ category: "payment", sourceText: "CARD 1234" }] },
    { lines: [{ category: "nonfood", name: "Soap" }] },
    { lines: [{ category: "unknown" }] },
    { lines: Array.from({ length: 51 }, () => food) },
    { lines: Array.from({ length: 101 }, () => ({ category: "tax" })) },
    { lines: [], transcript: "private text" },
    { items: [] },
  ];
  for (const body of invalid)
    await assert.rejects(
      analyzer(body)([image], "receipt"),
      /could not be validated/,
    );
  assert.deepEqual(await analyzer({ lines: [] })([image], "receipt"), {
    items: [],
  });
});

test("receipt extraction refuses provider refusals without leaking diagnostics", async () => {
  const analyze = createVisionAnalyzer({
    apiKey: "test",
    model: "test",
    fetchImpl: async () =>
      Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "refusal", text: "private" }] },
        ],
      }),
  });
  await assert.rejects(
    analyze([image], "receipt"),
    (error) =>
      /could not be analyzed/.test(error.message) &&
      !error.message.includes("private"),
  );
});

test("photo provider keeps the original strict item shape", async () => {
  let request;
  const { category, sourceText, ...item } = food;
  assert.equal(category, "food");
  assert.equal(sourceText, "ORG MLK");
  const analyze = createVisionAnalyzer({
    apiKey: "test",
    model: "test",
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return response({ items: [item] });
    },
  });
  assert.deepEqual(await analyze([image], "grocery_photo"), { items: [item] });
  assert.equal(request.text.format.name, "grocery_scan");
  assert.equal(
    "sourceText" in
      request.text.format.schema.properties.items.items.properties,
    false,
  );
  await assert.rejects(
    analyzer({ items: [{ ...item, sourceText: "ORG MLK" }] })(
      [image],
      "grocery_photo",
    ),
  );
});
