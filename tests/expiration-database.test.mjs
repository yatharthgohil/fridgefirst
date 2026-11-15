import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import './helpers/register-ts-paths.mjs';
import { withPostgres } from './helpers/postgres.mjs';
const { expirationResultSchema, persistedPantryItemSchema } = await import('../src/contracts/pantry.ts');

const alice = '00000000-0000-4000-8000-0000000000a1';
const item = '00000000-0000-4000-8000-0000000000b1';
const seedFile = fileURLToPath(new URL('../supabase/migrations/20261112211901_expiration_references.sql', import.meta.url));
const seedIds = [
  '5f0e1a20-0000-4000-8000-000000000001',
  '5f0e1a20-0000-4000-8000-000000000002',
  '5f0e1a20-0000-4000-8000-000000000003',
  '5f0e1a20-0000-4000-8000-000000000004',
];
const as = (role, user, statement) => `set session authorization ${role}; begin; select set_config('request.jwt.claim.sub','${user}',true); ${statement}; commit;`;
const last = (output) => output.split('\n').at(-1);

await withPostgres(async ({ sql }) => {
  await sql(`insert into auth.users values ('${alice}');`);

  await test('seeded references are reproducible and rerunnable', async () => {
    const rows = await sql(`select reference_id,food_name,storage_location,shelf_life_days,source_accessed_on,active
      from public.shelf_life_references where reference_id in (${seedIds.map((id) => `'${id}'`).join(',')}) order by reference_id`);
    assert.equal(rows.split('\n').length, seedIds.length);
    assert.match(rows, /5f0e1a20-0000-4000-8000-000000000001\|Raw chicken pieces\|Fridge\|1\|2026-11-12\|t/);
    assert.match(rows, /5f0e1a20-0000-4000-8000-000000000003\|Raw eggs in shell\|Fridge\|21\|2026-11-12\|t/);
    assert.match(rows, /5f0e1a20-0000-4000-8000-000000000004\|Hard-cooked eggs\|Fridge\|7\|2026-11-12\|t/);

    await sql(await readFile(seedFile, 'utf8'));
    const after = await sql(`select count(*) from public.shelf_life_references where reference_id in (${seedIds.map((id) => `'${id}'`).join(',')})`);
    assert.equal(last(after), String(seedIds.length));
    const days = await sql(`select string_agg(shelf_life_days::text,',' order by reference_id) from public.shelf_life_references where reference_id in (${seedIds.map((id) => `'${id}'`).join(',')})`);
    assert.equal(last(days), '1,1,21,7');
  });

  await test('seeded references match only the labelled food and storage', async () => {
    const resolve = async (name, storage, addedOn = '2026-11-12') => JSON.parse(last(await sql(as('pantry_writer', alice,
      `select private.resolve_expiration('${name}','${storage}','${addedOn}','{"kind":"estimate"}')`))));
    const chicken = await resolve('RAW   chicken  PIECES', 'Fridge');
    expirationResultSchema.parse(chicken);
    assert.equal(chicken.kind, 'estimate');
    assert.equal(chicken.date, '2026-11-13');
    assert.equal(chicken.provenance.referenceId, seedIds[0]);
    assert.equal(chicken.provenance.days, 1);
    assert.equal(chicken.provenance.sourceUrl, 'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts');
    assert.equal(chicken.provenance.sourceAccessedOn, '2026-11-12');
    assert.match(chicken.provenance.assumptions, /acquisition or preparation date/);

    const eggs = await resolve('Raw eggs in shell', 'Fridge', '2026-11-12');
    assert.equal(eggs.date, '2026-12-03');
    assert.equal(eggs.provenance.days, 21);
    const cooked = await resolve('Hard-cooked eggs', 'Fridge', '2026-11-12');
    assert.equal(cooked.date, '2026-11-19');
    assert.equal(cooked.provenance.days, 7);

    for (const [name, storage] of [['Chicken pieces', 'Fridge'], ['Raw chicken pieces', 'Freezer'], ['Raw chicken', 'Fridge'], ['Eggs', 'Fridge']]) {
      assert.equal((await resolve(name, storage)).reason, 'no_match', `${name} ${storage}`);
    }
  });

  await test('saved estimates keep their provenance and overrides survive rematching', async () => {
    const estimate = JSON.parse(last(await sql(as('pantry_writer', alice,
      `select private.resolve_expiration('Raw ground beef','Fridge','2026-11-12','{"kind":"estimate"}')`))));
    await sql(as('pantry_writer', alice, `insert into public.pantry_items(item_id,user_id,name,quantity,unit,storage_location,added_on,expiration_mode,expiration_date,shelf_life_id,expiration_provenance)
      values ('${item}','${alice}','Raw ground beef',1,'item','Fridge','2026-11-12','estimate','${estimate.date}','${estimate.provenance.referenceId}','${JSON.stringify(estimate.provenance)}'::jsonb)`));
    const saved = persistedPantryItemSchema.parse(JSON.parse(last(await sql(as('pantry_writer', alice, `select private.pantry_item_json(p) from public.pantry_items p where item_id='${item}'`)))));
    assert.deepEqual(saved.expiration, estimate);

    await sql(`update public.shelf_life_references set shelf_life_days=9 where reference_id='${seedIds[1]}'`);
    const unchanged = persistedPantryItemSchema.parse(JSON.parse(last(await sql(as('pantry_writer', alice, `select private.pantry_item_json(p) from public.pantry_items p where item_id='${item}'`)))));
    assert.deepEqual(unchanged.expiration, estimate);
    const rematched = JSON.parse(last(await sql(as('pantry_writer', alice, `select private.resolve_expiration('Raw ground beef','Fridge','2026-11-12','{"kind":"estimate"}')`))));
    assert.equal(rematched.date, '2026-11-21');

    const override = { kind: 'override', date: '2026-12-01' };
    const preserved = JSON.parse(last(await sql(as('pantry_writer', alice,
      `select private.resolve_expiration('Raw ground beef','Freezer','2026-11-12',null,'${JSON.stringify(override)}'::jsonb,true)`))));
    assert.deepEqual(preserved, override);
  });
});
