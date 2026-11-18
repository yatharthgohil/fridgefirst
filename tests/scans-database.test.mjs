import assert from "node:assert/strict";
import test from "node:test";
import { withPostgres } from "./helpers/postgres.mjs";
import "./helpers/register-ts-paths.mjs";
const { scanResponseSchema, scanConfirmResponseSchema } =
  await import("../src/contracts/scans.ts");
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const proposalId = "00000000-0000-4000-8000-000000000003";
const proposal = {
  id: proposalId,
  name: "Milk",
  quantity: 1,
  unit: "item",
  storageLocation: "Fridge",
  confidence: "high",
  imageIndex: 0,
  warnings: [],
};
const fields = {
  name: "Milk",
  quantity: 1,
  unit: "item",
  storageLocation: "Fridge",
  addedOn: "2026-11-17",
  expiration: { kind: "unknown" },
};
const literal = (v) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
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
  const create = async (user = alice) =>
    scanResponseSchema.parse(
      await call(
        "create",
        literal({
          kind: "grocery_photo",
          images: [{ contentType: "image/png", size: 10 }],
        }),
        user,
      ),
    ).scan;
  const review = async (proposals = [proposal]) => {
    const s = await create();
    const claim = await call("claim", `'${s.id}'`);
    return scanResponseSchema.parse(
      await call(
        "finish",
        `'${s.id}','${claim.token}',${literal(proposals)},null`,
      ),
    ).scan;
  };
  await test("private scan rows and storage uploads enforce exact ownership and manifest", async () => {
    const s = await create();
    assert.equal((await call("get", `'${s.id}'`, bob)).error.code, "not_found");
    await assert.rejects(
      sql(as(alice, "select * from private.scan_sessions")),
      /42501/,
    );
    await assert.rejects(
      sql(as(alice, `select public.scan_get('${s.id}')`, "anon")),
      /42501/,
    );
    const insert = (path, user = alice) =>
      sql(
        as(
          user,
          `insert into storage.objects(bucket_id,name,owner_id) values('grocery-scans','${path}','${user}')`,
        ),
      );
    await insert(s.images[0].path);
    await assert.rejects(insert(s.images[0].path, bob), /42501/);
    await assert.rejects(insert(`${alice}/${s.id}/wrong.png`), /42501/);
    await assert.rejects(
      insert(`${alice}/00000000-0000-4000-8000-000000000099/0.png`),
      /42501/,
    );
    assert.equal(
      (await sql(as(bob, "select count(*) from storage.objects")))
        .split("\n")
        .at(-1),
      "0",
    );
    await sql(as(alice, `update storage.objects set name='changed'`));
    assert.equal(
      await sql("select count(*) from storage.objects where name='changed'"),
      "0",
    );
    await call("claim", `'${s.id}'`);
    await sql(as(alice, "delete from storage.objects"));
    await assert.rejects(insert(s.images[0].path), /42501/);
    await sql(
      `update private.scan_sessions set lease_until=now()-interval '1 second' where id='${s.id}'`,
    );
  });
  await test("concurrent claims serialize, stale completion cannot overwrite and review is cached", async () => {
    const s = await create();
    const results = await Promise.all([
      call("claim", `'${s.id}'`),
      call("claim", `'${s.id}'`),
    ]);
    const first = results.find((r) => r.token);
    assert.equal(results.filter((r) => r.error?.code === "conflict").length, 1);
    await sql(
      `update private.scan_sessions set lease_until=now()-interval '1 second' where id='${s.id}'`,
    );
    const second = await call("claim", `'${s.id}'`);
    assert.equal(
      (
        await call(
          "finish",
          `'${s.id}','${first.token}',${literal([proposal])},null`,
        )
      ).error.code,
      "conflict",
    );
    const done = await call(
      "finish",
      `'${s.id}','${second.token}',${literal([proposal])},null`,
    );
    scanResponseSchema.parse(done);
    assert.equal(done.scan.status, "review");
    assert.equal((await call("claim", `'${s.id}'`)).token, null);
    assert.equal(await sql("select count(*) from public.pantry_items"), "0");
  });
  await test("confirmation rolls back all pantry/history writes and supports exact concurrent replay", async () => {
    const secondId = "00000000-0000-4000-8000-000000000009";
    const s = await review([proposal, { ...proposal, id: secondId }]);
    const bad = {
      expectedVersion: s.version,
      items: [
        { proposalId, fields },
        { proposalId: secondId, fields: { ...fields, quantity: -1 } },
      ],
    };
    assert.equal(
      (await call("confirm", `'${s.id}',${literal(bad)}`)).error.code,
      "validation",
    );
    assert.equal(await sql("select count(*) from public.pantry_items"), "0");
    assert.equal(
      await sql("select count(*) from public.inventory_transactions"),
      "0",
    );
    assert.equal((await call("get", `'${s.id}'`)).scan.status, "review");
    const request = {
      expectedVersion: s.version,
      items: [{ proposalId, fields }],
    };
    const results = await Promise.all([
      call("confirm", `'${s.id}',${literal(request)}`),
      call("confirm", `'${s.id}',${literal(request)}`),
    ]);
    results.forEach((r) => scanConfirmResponseSchema.parse(r));
    assert.deepEqual(results[0], results[1]);
    assert.equal(await sql("select count(*) from public.pantry_items"), "1");
    assert.equal(
      await sql("select count(*) from public.inventory_transactions"),
      "1",
    );
    request.items[0].fields = { ...fields, name: "Changed" };
    assert.equal(
      (await call("confirm", `'${s.id}',${literal(request)}`)).error.code,
      "conflict",
    );
    await call("prepare_delete", `'${s.id}'`);
    await call("delete", `'${s.id}'`);
    assert.equal(await sql("select count(*) from public.pantry_items"), "1");
  });
  await test("analysis budgets survive failed scans and deletion; pending deletion cannot be analyzed", async () => {
    const s = await create();
    const claimed = await call("claim", `'${s.id}'`);
    assert.equal(
      (await call("prepare_delete", `'${s.id}'`)).error.code,
      "conflict",
    );
    await call(
      "finish",
      `'${s.id}','${claimed.token}',null,'Could not recognize this photo.'`,
    );
    const before = await sql(
      `select attempts from private.scan_daily_usage where user_id='${alice}'`,
    );
    await call("prepare_delete", `'${s.id}'`);
    assert.equal((await call("claim", `'${s.id}'`)).error.code, "conflict");
    await call("delete", `'${s.id}'`);
    assert.equal(
      await sql(
        `select attempts from private.scan_daily_usage where user_id='${alice}'`,
      ),
      before,
    );
    await sql(
      `update private.scan_daily_usage set attempts=10 where user_id='${alice}'`,
    );
    const fresh = await create();
    assert.equal((await call("claim", `'${fresh.id}'`)).error.code, "conflict");
  });
});
