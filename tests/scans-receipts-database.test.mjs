import assert from "node:assert/strict";
import test from "node:test";
import { withPostgres } from "./helpers/postgres.mjs";
import "./helpers/register-ts-paths.mjs";
const { scanResponseSchema, scanConfirmResponseSchema } =
  await import("../src/contracts/scans.ts");
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const firstId = "00000000-0000-4000-8000-000000000003";
const secondId = "00000000-0000-4000-8000-000000000004";
const proposal = {
  id: firstId,
  name: "Milk",
  sourceText: "ORG MLK",
  quantity: null,
  unit: null,
  storageLocation: "Fridge",
  confidence: "medium",
  imageIndex: 0,
  warnings: ["Amount unclear. Price omitted."],
};
const literal = (value) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const as = (user, statement, role = "authenticated") =>
  `set session authorization ${role}; begin; select set_config('request.jwt.claim.sub','${user}',true); ${statement}; commit;`;

await withPostgres(async ({ sql }) => {
  await sql(`insert into auth.users values('${alice}'),('${bob}')`);
  const call = async (name, args, user = alice) =>
    JSON.parse(
      (await sql(as(user, `select public.scan_${name}(${args})`)))
        .split("\n")
        .at(-1),
    );
  const create = async (kind = "receipt") =>
    scanResponseSchema.parse(
      await call(
        "create",
        literal({ kind, images: [{ contentType: "image/png", size: 10 }] }),
      ),
    ).scan;
  const finish = (scan, token, items, user = alice) =>
    call("finish", `'${scan.id}','${token}',${literal(items)},null`, user);

  await test("receipt creation preserves private ownership, kind checks, and function roles", async () => {
    const scan = await create();
    assert.equal(scan.kind, "receipt");
    assert.equal(
      (await call("get", `'${scan.id}'`, bob)).error.code,
      "not_found",
    );
    await assert.rejects(
      sql(as(alice, "select * from private.scan_sessions")),
      /42501/,
    );
    await assert.rejects(
      sql(as(alice, `select public.scan_get('${scan.id}')`, "anon")),
      /42501/,
    );
    for (const kind of ["pdf", null, 4])
      assert.equal(
        (
          await call(
            "create",
            literal({ kind, images: [{ contentType: "image/png", size: 10 }] }),
          )
        ).error.code,
        "validation",
      );
    await assert.rejects(
      sql(
        `insert into private.scan_sessions(user_id,kind,images) values('${alice}','pdf','[]')`,
      ),
      /23514/,
    );
    assert.equal(
      await sql(
        "select string_agg(pg_get_userbyid(proowner),',' order by proname) from pg_proc where oid in ('private.scan_create_command(jsonb)'::regprocedure,'private.scan_finish_command(uuid,uuid,jsonb,text)'::regprocedure)",
      ),
      "pantry_writer,pantry_writer",
    );
    await assert.rejects(
      sql(as(alice, `select private.scan_create_command('{}')`)),
      /42501/,
    );
  });

  await test("receipt finish validates optional bounded food evidence without weakening proposal checks", async () => {
    const scan = await create();
    const { token } = await call("claim", `'${scan.id}'`);
    assert.equal(
      (await finish(scan, token, [proposal], bob)).error.code,
      "not_found",
    );
    for (const sourceText of [null, "", " ", "x".repeat(201), 12, {}])
      assert.equal(
        (await finish(scan, token, [{ ...proposal, sourceText }])).error.code,
        "validation",
      );
    for (const extra of [
      { quantity: "$3.99" },
      { price: 3.99 },
      { imageIndex: 1 },
      { expirationDate: "2027-01-01" },
    ])
      assert.equal(
        (await finish(scan, token, [{ ...proposal, ...extra }])).error.code,
        "validation",
      );
    assert.equal(
      (await finish(scan, token, [proposal, proposal])).error.code,
      "validation",
    );
    const withoutEvidence = { ...proposal, id: secondId };
    delete withoutEvidence.sourceText;
    const review = scanResponseSchema.parse(
      await finish(scan, token, [proposal, withoutEvidence]),
    ).scan;
    assert.equal(review.status, "review");
    assert.equal(review.proposals[0].sourceText, "ORG MLK");
    assert.equal(review.proposals[0].quantity, null);
    assert.equal(review.proposals[0].unit, null);
    assert.equal("sourceText" in review.proposals[1], false);
    assert.equal(
      (await call("get", `'${scan.id}'`)).scan.proposals[0].sourceText,
      "ORG MLK",
    );
    assert.equal(await sql("select count(*) from public.pantry_items"), "0");
  });

  await test("photo finish rejects receipt evidence and still accepts its original proposals", async () => {
    const scan = await create("grocery_photo");
    const { token } = await call("claim", `'${scan.id}'`);
    assert.equal(
      (await finish(scan, token, [proposal])).error.code,
      "validation",
    );
    const photo = { ...proposal };
    delete photo.sourceText;
    assert.equal(
      scanResponseSchema.parse(await finish(scan, token, [photo])).scan.status,
      "review",
    );
  });

  await test("same-name receipt purchases confirm into separate lots and repeat atomically", async () => {
    const scan = await create();
    const { token } = await call("claim", `'${scan.id}'`);
    const review = scanResponseSchema.parse(
      await finish(scan, token, [proposal, { ...proposal, id: secondId }]),
    ).scan;
    const fields = {
      name: "Milk",
      quantity: 1,
      unit: "item",
      storageLocation: "Fridge",
      addedOn: "2026-11-17",
      expiration: { kind: "unknown" },
    };
    const request = {
      expectedVersion: review.version,
      items: [
        { proposalId: firstId, fields },
        { proposalId: secondId, fields },
      ],
    };
    assert.equal(
      (await call("confirm", `'${scan.id}',${literal(request)}`, bob)).error
        .code,
      "not_found",
    );
    const bad = {
      ...request,
      items: [
        request.items[0],
        { proposalId: secondId, fields: { ...fields, quantity: -1 } },
      ],
    };
    assert.equal(
      (await call("confirm", `'${scan.id}',${literal(bad)}`)).error.code,
      "validation",
    );
    assert.equal(await sql("select count(*) from public.pantry_items"), "0");
    const results = await Promise.all([
      call("confirm", `'${scan.id}',${literal(request)}`),
      call("confirm", `'${scan.id}',${literal(request)}`),
    ]);
    results.forEach((result) => scanConfirmResponseSchema.parse(result));
    assert.deepEqual(results[0], results[1]);
    assert.equal(new Set(results[0].items.map((item) => item.id)).size, 2);
    assert.equal(
      await sql("select count(*) from public.pantry_items where name='Milk'"),
      "2",
    );
    assert.equal(
      await sql("select count(*) from public.inventory_transactions"),
      "2",
    );
    assert.equal(
      results[0].items.every((item) => item.quantity === 1),
      true,
    );
    assert.equal((await call("get", `'${scan.id}'`)).scan.status, "confirmed");
  });
});
