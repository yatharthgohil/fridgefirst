import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/register-ts-paths.mjs';
import { withPostgres } from './helpers/postgres.mjs';
import { alice, bob, client, failureTrigger, food, heldCommand, literal, result, seedUsers, session } from './helpers/pantry-client.mjs';
const { persistedPantryItemSchema } = await import('../src/contracts/pantry.ts');

await withPostgres(async ({ sql }) => {
  await seedUsers(sql);
  const a = client(sql); const b = client(sql, bob);

  await test('CRUD returns persisted contracts, keeps zero rows, sorts dates and isolates owners', async () => {
    const unknown = await a.create(food({ name: 'Unmatched', quantity: 0 }));
    const early = await a.create(food({ expiration: { kind: 'override', date: '2026-11-11' } }));
    const estimate = await a.create();
    await b.create();
    const items = (await a.rpc('pantry_list')).items;
    items.forEach((item) => persistedPantryItemSchema.parse(item));
    assert.deepEqual(items.map((item) => item.id), [early.id, estimate.id, unknown.id]);
    assert.equal(items.at(-1).quantity, 0);
    assert.equal((await b.rpc('pantry_list')).items.length, 1);
    assert.equal(await sql(`select count(*) from public.inventory_transactions where user_id='${alice}' and operation='add'`), '3');
    assert.equal((await b.update(early, { name: 'stolen' })).error.code, 'not_found');
    assert.equal((await b.remove(early)).error.code, 'not_found');
  });

  await test('SQL boundary rejects unknown keys, wrong types, nulls, bad dates and quantity precision', async () => {
    for (const request of [null, [], {}, food({ owner: alice }), food({ name: null }), food({ name: ' ' }),
      food({ quantity: '2' }), food({ quantity: null }), food({ quantity: -1 }), food({ quantity: 0.0001 }),
      food({ quantity: 1000000 }), food({ unit: 'litre' }), food({ storageLocation: 'Garage' }), food({ notes: 1 }),
      food({ addedOn: '2026-02-29' }), food({ addedOn: '0000-01-01' }), food({ addedOn: '2026-2-01' }),
      food({ expiration: null }), food({ expiration: { kind: 'override', date: '2026-02-30' } }),
      food({ expiration: { kind: 'estimate', extra: true } }), food({ addedOn: '9999-12-31' })]) {
      assert.equal((await a.rpc('pantry_create', literal(request))).error.code, 'validation', JSON.stringify(request));
    }
    const item = await a.create(food({ quantity: 999999.999, notes: null }));
    for (const request of [null, {}, { expectedVersion: 1, changes: {} }, { expectedVersion: '1', changes: { name: 'x' } },
      { expectedVersion: 9007199254740992, changes: { name: 'x' } }, { expectedVersion: 1, changes: { unit: 'g' } },
      { expectedVersion: 1, changes: { quantity: null } }, { expectedVersion: 1, changes: { extra: true } }]) {
      assert.equal((await a.rpc('pantry_update', `'${item.id}',${literal(request)}`)).error.code, 'validation');
    }
    assert.equal((await a.rpc('pantry_delete', `'${item.id}',${literal({ expectedVersion: null })}`)).error.code, 'validation');
  });

  await test('metadata and no-op edits audit once, versions reject stale edits/deletes and unit corrections have no delta', async () => {
    const item = await a.create();
    const edited = (await a.update(item, { notes: 'new' })).item;
    assert.equal(edited.version, 2);
    assert.equal((await a.update(item, { name: 'stale' })).error.code, 'conflict');
    assert.equal((await a.remove(item)).error.code, 'conflict');
    const noop = (await a.update(edited, { notes: 'new' })).item;
    const corrected = (await a.update(noop, { quantity: 200, unit: 'g' })).item;
    assert.equal(corrected.version, 4);
    const history = JSON.parse(await sql(`select jsonb_agg(jsonb_build_object('delta',quantity_delta,'unit',unit) order by occurred_at,transaction_id) from public.inventory_transactions where item_id='${item.id}' and operation='edit'`));
    assert.equal(history.length, 3);
    assert.equal(history.filter((entry) => entry.delta === null).length, 3);
    assert.equal(history.filter((entry) => entry.unit === null).length, 1);
    await sql(`update public.pantry_items set version=9007199254740991 where item_id='${item.id}'`);
    assert.equal((await a.update({ ...corrected, version: 9007199254740991 }, { notes: 'limit' })).error.code, 'validation');
    const raced = await a.create();
    const { pending } = await heldCommand(sql, alice, `select public.pantry_update('${raced.id}',${literal({ expectedVersion: 1, changes: { quantity: 1 } })})`, 'edit_before_delete');
    const deletion = a.remove(raced);
    assert.equal(result(await pending).item.version, 2);
    assert.equal((await deletion).error.code, 'conflict');
  });

  await test('expiration rematches original age and preserves overrides and explicit unknown', async () => {
    let item = await a.create();
    assert.equal(item.expiration.date, '2026-11-15');
    item = (await a.update(item, { storageLocation: 'Freezer' })).item;
    assert.equal(item.expiration.date, '2026-11-20');
    item = (await a.update(item, { addedOn: '2026-11-01' })).item;
    assert.equal(item.expiration.date, '2026-11-11');
    item = (await a.update(item, { expiration: { kind: 'override', date: '2026-12-01' } })).item;
    item = (await a.update(item, { name: 'Other', storageLocation: 'Fridge' })).item;
    assert.deepEqual(item.expiration, { kind: 'override', date: '2026-12-01' });
    item = (await a.update(item, { expiration: { kind: 'unknown' } })).item;
    item = (await a.update(item, { name: 'Example food' })).item;
    assert.equal(item.expiration.reason, 'user_cleared');
    item = (await a.update(item, { expiration: { kind: 'estimate' } })).item;
    assert.equal(item.expiration.date, '2026-11-06');
  });

  await test('audit failures roll back create/edit/delete and deletion keeps the history snapshot', async () => {
    const item = await a.create();
    const count = await sql('select count(*) from public.pantry_items');
    await failureTrigger(sql, 'public.inventory_transactions', async () => {
      await assert.rejects(a.create(), /forced write failure/);
      await assert.rejects(a.update(item, { quantity: 1 }), /forced write failure/);
      await assert.rejects(a.remove(item), /forced write failure/);
    });
    assert.equal(await sql('select count(*) from public.pantry_items'), count);
    assert.deepEqual((await a.rpc('pantry_list')).items.find((p) => p.id === item.id), item);
    assert.deepEqual(await a.remove(item), { deleted: true });
    const deleted = JSON.parse(await sql(`select private.inventory_history_json(t) from public.inventory_transactions t where operation='delete' and item_name='Example food'`));
    assert.equal(deleted.itemId, null); assert.equal(deleted.quantityDelta, -2); assert.equal(deleted.unit, 'bag');
    assert.equal((await a.remove(item)).error.code, 'not_found');
  });

  await test('public wrappers require identity and private execution stays denied with fixed restricted owners', async () => {
    for (const statement of ['select public.pantry_list()', `select public.pantry_create(${literal(food())})`,
      `select public.pantry_update(null,'{}')`, `select public.pantry_delete(null,'{}')`]) {
      assert.equal(result(await sql(session('', statement))).error.code, 'unauthorized');
      await assert.rejects(sql(session('', statement, 'anon')), /42501/);
    }
    for (const statement of [`select private.pantry_create_command(${literal(food())})`, 'select private.pantry_list_command()',
      'select private.pantry_update_command(null,null)', 'select private.pantry_delete_command(null,null)',
      'delete from public.pantry_items', 'set local role pantry_writer']) await assert.rejects(sql(session(alice, statement)), /42501/);
    assert.equal(await sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
      where p.proname in ('pantry_create','pantry_update','pantry_delete','pantry_list','pantry_create_command','pantry_update_command','pantry_delete_command','pantry_list_command')
      and p.prosecdef and p.proconfig=array['search_path=""'] and r.rolname=case when n.nspname='public' then 'pantry_executor' else 'pantry_writer' end`), '8');
  });
});
