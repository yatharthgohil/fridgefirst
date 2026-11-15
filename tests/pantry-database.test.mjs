import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/register-ts-paths.mjs';
import { withPostgres } from './helpers/postgres.mjs';
const { persistedPantryItemSchema, expirationResultSchema } = await import('../src/contracts/pantry.ts');
const { inventoryHistoryEntrySchema } = await import('../src/contracts/inventory.ts');

const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const item = '00000000-0000-4000-8000-000000000003';
const otherItem = '00000000-0000-4000-8000-000000000004';
const reference = '00000000-0000-4000-8000-000000000005';
const as = (role, user, statement) => `set session authorization ${role}; begin; select set_config('request.jwt.claim.sub','${user}',true); ${statement}; commit;`;
const last = (output) => output.split('\n').at(-1);

await withPostgres(async ({ sql }) => {
  await sql(`insert into auth.users values ('${alice}'), ('${bob}');
    insert into public.shelf_life_references(reference_id,food_name,storage_location,shelf_life_days,source_name,source_url,source_accessed_on,assumptions)
      values ('${reference}','Example food','Fridge',5,'Test source','https://example.com/test','2026-11-12','Test only');
    insert into public.pantry_items(item_id,user_id,name,quantity,unit,storage_location,added_on,expiration_mode,expiration_reason)
      values ('${item}','${alice}','Example food',1,'bag','Fridge','2026-11-12','unknown','no_match'),
             ('${otherItem}','${bob}','Bob food',2,'item','Pantry','2026-11-12','unknown','user_cleared');`);

  await test('authenticated reads isolate owners and direct writes/private access fail', async () => {
    assert.equal(last(await sql(as('authenticated', alice, 'select count(*) from public.pantry_items'))), '1');
    assert.equal(last(await sql(as('authenticated', bob, `select count(*) from public.pantry_items where item_id='${item}'`))), '0');
    assert.equal(last(await sql(as('authenticated', alice, `select count(*) from public.shelf_life_references where reference_id='${reference}'`))), '1');
    for (const statement of [
      `update public.pantry_items set quantity=0`, `delete from public.pantry_items`,
      `insert into public.pantry_items(user_id,name,quantity,unit,storage_location,added_on,expiration_mode,expiration_reason) values ('${alice}','food',1,'item','Fridge','2026-11-12','unknown','no_match')`,
      `insert into public.inventory_transactions(user_id,item_name,operation) values ('${alice}','food','edit')`,
      `update public.inventory_transactions set item_name='x'`, `delete from public.inventory_transactions`,
      `update public.shelf_life_references set active=false`,
      `select * from private.inventory_request_receipts`,
      `select private.resolve_expiration('x','Fridge','2026-11-12','{"kind":"estimate"}')`,
      `set local role pantry_writer`, `set local role pantry_executor`,
    ]) await assert.rejects(sql(as('authenticated', alice, statement)), /42501/, statement);
    await assert.rejects(sql(as('anon', '', 'select * from public.pantry_items')), /42501/);
  });

  await test('writer remains subject to RLS and cannot edit history or foreign-owner rows', async () => {
    assert.equal(last(await sql(as('pantry_writer', alice, `with changed as (update public.pantry_items set quantity=0 where item_id='${otherItem}' returning *) select count(*) from changed`))), '0');
    await assert.rejects(sql(as('pantry_writer', alice, `update public.pantry_items set user_id='${bob}' where item_id='${item}'`)), /42501/);
    await assert.rejects(sql(as('pantry_writer', alice, `insert into public.inventory_transactions(user_id,item_id,item_name,operation) values ('${alice}','${otherItem}','stolen','edit')`)), /42501/);
    await assert.rejects(sql(as('pantry_writer', alice, `insert into private.inventory_request_receipts(user_id,request_id,request,response) values ('${bob}','foreign-123','{}','{}')`)), /42501/);
    await assert.rejects(sql(as('pantry_writer', alice, `update public.inventory_transactions set item_name='tampered'`)), /42501/);
    assert.equal(await sql(`select count(*) from pg_roles where rolname in ('pantry_writer','pantry_executor') and not rolcanlogin and not rolbypassrls and not rolsuper`), '2');
    assert.equal(await sql(`select count(*) from pg_class c join pg_roles r on r.oid=c.relowner where r.rolname in ('pantry_writer','pantry_executor')`), '0');
    assert.equal(await sql(`select pg_has_role('authenticated','pantry_writer','MEMBER') or pg_has_role('authenticated','pantry_executor','MEMBER')`), 'f');
    await assert.rejects(sql(as('pantry_executor', alice, 'select * from public.pantry_items')), /42501/);
    await sql(`
      create function private.foundation_probe(p_id uuid) returns jsonb language sql security definer set search_path='' as
        $$ select private.pantry_item_json(p) from public.pantry_items p where item_id=p_id $$;
      alter function private.foundation_probe(uuid) owner to pantry_writer;
      revoke all on function private.foundation_probe(uuid) from public, anon, authenticated;
      grant execute on function private.foundation_probe(uuid) to pantry_executor;
      create function public.foundation_probe(p_id uuid) returns jsonb language sql security definer set search_path='' as
        $$ select private.foundation_probe(p_id) $$;
      alter function public.foundation_probe(uuid) owner to pantry_executor;
      revoke all on function public.foundation_probe(uuid) from public, anon;
      grant execute on function public.foundation_probe(uuid) to authenticated;
    `);
    assert.equal(JSON.parse(last(await sql(as('authenticated', alice, `select public.foundation_probe('${item}')`)))).id, item);
    assert.equal(last(await sql(as('authenticated', bob, `select public.foundation_probe('${item}') is null`))), 't');
    await assert.rejects(sql(as('authenticated', alice, `select private.foundation_probe('${item}')`)), /42501/);
    await assert.rejects(sql(as('anon', '', `select public.foundation_probe('${item}')`)), /42501/);
    await sql('drop function public.foundation_probe(uuid); drop function private.foundation_probe(uuid)');
  });

  await test('quantity/date/state constraints reject invalid data and history/receipts survive deletion', async () => {
    for (const assignment of ["quantity=-1", "quantity=0.0001", "quantity='NaN'", "quantity=1000000", "unit='litre'", "storage_location='Garage'", "added_on='2026-02-29'", "expiration_mode='override'", "status='discarded'", "version=0"]) {
      await assert.rejects(sql(`update public.pantry_items set ${assignment} where item_id='${item}'`), /23514|22008/, assignment);
    }
    await sql(as('pantry_writer', alice, `
      insert into public.inventory_transactions(user_id,item_id,item_name,operation,quantity_delta,unit)
        values ('${alice}','${item}','Example food','delete',-1,'bag');
      insert into private.inventory_request_receipts(user_id,request_id,request,response)
        values ('${alice}','saved-123','{"itemId":"${item}"}','{"replayed":false}');
      delete from public.pantry_items where item_id='${item}'`));
    const history = JSON.parse(last(await sql(as('pantry_writer', alice, `select private.inventory_history_json(t) from public.inventory_transactions t`))));
    inventoryHistoryEntrySchema.parse(history);
    assert.equal(history.itemId, null);
    assert.equal(history.itemName, 'Example food');
    assert.equal(last(await sql(as('pantry_writer', alice, 'select count(*) from private.inventory_request_receipts'))), '1');
    assert.equal(last(await sql(as('pantry_writer', bob, 'select count(*) from private.inventory_request_receipts'))), '0');
    assert.equal(last(await sql(as('authenticated', bob, 'select count(*) from public.inventory_transactions'))), '0');
    const projected = JSON.parse(last(await sql(as('pantry_writer', bob, `select private.pantry_item_json(p) from public.pantry_items p`))));
    persistedPantryItemSchema.parse(projected);
    assert.equal(projected.id, otherItem);
  });

  await test('exact expiration matching snapshots provenance and preserves explicit choices', async () => {
    const resolve = async (name, storage, intent, previous = null, rematch = false) => JSON.parse(last(await sql(as('pantry_writer', alice,
      `select private.resolve_expiration('${name}','${storage}','2026-11-12',${intent === null ? 'null' : `'${JSON.stringify(intent)}'::jsonb`},${previous === null ? 'null' : `'${JSON.stringify(previous)}'::jsonb`},${rematch})`))));
    const estimate = await resolve('  EXAMPLE   FOOD ', 'Fridge', { kind: 'estimate' });
    expirationResultSchema.parse(estimate);
    assert.equal(estimate.date, '2026-11-17');
    assert.equal(estimate.provenance.referenceId, reference);
    await sql(as('pantry_writer', bob, `update public.pantry_items set
      name='Example food', storage_location='Fridge', expiration_mode='estimate',
      expiration_date='${estimate.date}', expiration_reason=null, shelf_life_id='${reference}',
      expiration_provenance='${JSON.stringify(estimate.provenance)}'::jsonb where item_id='${otherItem}'`));
    await assert.rejects(sql(as('pantry_writer', bob, `update public.pantry_items set expiration_provenance='{}' where item_id='${otherItem}'`)), /23514/);
    assert.equal((await resolve('Example foods', 'Fridge', { kind: 'estimate' })).reason, 'no_match');
    assert.equal((await resolve('Example food', 'Freezer', { kind: 'estimate' })).reason, 'no_match');
    const override = { kind: 'override', date: '2026-12-01' };
    assert.deepEqual(await resolve('changed', 'Freezer', null, override, true), override);
    const unknown = await resolve('Example food', 'Fridge', { kind: 'unknown' });
    assert.equal(unknown.reason, 'user_cleared');
    assert.deepEqual(await resolve('Example food', 'Fridge', null, unknown, true), unknown);
    await sql(`update public.shelf_life_references set shelf_life_days=9 where reference_id='${reference}'`);
    const saved = persistedPantryItemSchema.parse(JSON.parse(last(await sql(as('pantry_writer', bob,
      'select private.pantry_item_json(p) from public.pantry_items p')))));
    assert.deepEqual(saved.expiration, estimate);
    assert.deepEqual(await resolve('Example food', 'Fridge', null, estimate), estimate);
    assert.equal((await resolve('Example food', 'Fridge', null, estimate, true)).date, '2026-11-21');
    await assert.rejects(resolve('Example food', 'Fridge', { kind: 'override', date: '2026-02-29' }), /22008/);
    await assert.rejects(sql(`insert into public.shelf_life_references(food_name,storage_location,shelf_life_days,source_name,source_url,source_accessed_on,assumptions) values (' EXAMPLE food ','Fridge',1,'test','https://example.com','2026-11-12','test')`), /23505/);
  });
});
