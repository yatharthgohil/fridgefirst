import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/register-ts-paths.mjs';
import { withPostgres } from './helpers/postgres.mjs';
import { alice, bob, client, failureTrigger, literal, result, scheduledRace, seedUsers, session } from './helpers/pantry-client.mjs';
const { inventoryAdjustmentResponseSchema, inventoryHistoryResponseSchema } = await import('../src/contracts/inventory.ts');

const request = (item, requestId, changes = {}) => ({ requestId, itemId: item.id, operation: 'consume', amount: 0.5,
  unit: item.unit, expectedQuantity: item.quantity, ...changes });
const adjustSQL = (payload) => `select public.inventory_adjust(${literal(payload)})`;

await withPostgres(async ({ sql }) => {
  await seedUsers(sql);
  const a = client(sql); const b = client(sql, bob);
  const adjust = (payload, c = a) => c.rpc('inventory_adjust', literal(payload));
  const saved = async (item) => (await a.rpc('pantry_list')).items.find((row) => row.id === item.id);

  await test('deductions return the shared response, increment versions, preserve zero rows and reactivate on correction', async () => {
    const item = await a.create();
    const response = inventoryAdjustmentResponseSchema.parse(await adjust(request(item, 'partial-0001')));
    assert.equal(response.item.quantity, 1.5); assert.equal(response.entry.quantityDelta, -0.5);
    assert.equal(response.replayed, false); assert.equal((await saved(item)).version, 2);
    assert.equal((await a.update(item, { notes: 'stale' })).error.code, 'conflict');
    const all = await adjust(request({ ...item, quantity: 1.5 }, 'consume-0001', { amount: 1.5 }));
    assert.equal(all.item.quantity, 0); assert.equal((await saved(item)).status, 'consumed');
    let corrected = (await a.update(await saved(item), { quantity: 1 })).item;
    assert.equal(corrected.status, 'active'); assert.equal(corrected.version, 4);
    await adjust(request(corrected, 'discard-0001', { operation: 'discard', amount: 1 }));
    assert.equal((await saved(item)).status, 'discarded'); assert.equal((await saved(item)).version, 5);
    corrected = (await a.update(await saved(item), { quantity: 0.001 })).item;
    assert.equal(corrected.status, 'active');
    assert.equal((await adjust(request(corrected, 'smallest-001', { amount: 0.001 }))).item.quantity, 0);
  });

  await test('SQL validation, missing IDs and quantity/unit conflicts are deliberate business errors', async () => {
    const item = await a.create(); const valid = request(item, 'validate-001');
    for (const payload of [null, [], {}, { ...valid, owner: alice }, { ...valid, requestId: 'short' },
      { ...valid, requestId: 'x'.repeat(129) }, { ...valid, itemId: '' }, { ...valid, itemId: null },
      { ...valid, itemId: {} }, { ...valid, amount: '1' }, { ...valid, amount: null }, { ...valid, amount: 0 },
      { ...valid, amount: -1 }, { ...valid, amount: 0.0001 }, { ...valid, amount: 1000000 },
      { ...valid, expectedQuantity: 1.0001 }, { ...valid, expectedQuantity: null }, { ...valid, unit: null },
      { ...valid, unit: 'litre' }, { ...valid, operation: 'recipe_deduction' }]) {
      assert.equal((await adjust(payload)).error.code, 'validation', JSON.stringify(payload));
    }
    assert.equal((await adjust({ ...valid, itemId: 'fixture-id' })).error.code, 'not_found');
    assert.equal((await adjust({ ...valid, itemId: '00000000-0000-4000-8000-999999999999' })).error.code, 'not_found');
    assert.equal((await adjust(valid, b)).error.code, 'not_found');
    for (const change of [{ expectedQuantity: 1 }, { unit: 'g' }]) {
      const response = await adjust({ ...valid, ...change });
      assert.equal(response.error.code, 'conflict');
      assert.deepEqual(response.error.current, { id: item.id, quantity: 2, unit: 'bag' });
    }
    assert.equal((await adjust({ ...valid, amount: 3 })).error.code, 'validation');
    assert.equal(await sql(`select count(*) from private.inventory_request_receipts where request_id='validate-001'`), '0');
    await sql(`update public.pantry_items set version=9007199254740991 where item_id='${item.id}'`);
    assert.equal((await adjust(valid)).error.code, 'validation');
    assert.equal((await saved(item)).quantity, 2);
  });

  await test('receipts compare canonical requests, retain original snapshots after deletion and scope keys to owners', async () => {
    const item = await a.create(); const payload = request(item, 'lifetime-001');
    const original = await adjust(payload);
    const numericReplay = result(await sql(session(alice, `select public.inventory_adjust('${JSON.stringify(payload).replace('"amount":0.5', '"amount":0.500').replace('"expectedQuantity":2', '"expectedQuantity":2.000')}'::jsonb)`)));
    assert.deepEqual(numericReplay, { ...original, replayed: true });
    assert.equal((await adjust({ ...payload, amount: 1 })).error.code, 'validation');
    await a.remove(await saved(item));
    assert.deepEqual(await adjust(payload), { ...original, replayed: true });
    assert.equal((await adjust({ ...payload, requestId: 'new-deleted1' })).error.code, 'not_found');
    assert.equal((await adjust({ ...payload, operation: 'discard' })).error.code, 'validation');
    const other = await b.create();
    assert.equal((await adjust(request(other, payload.requestId), b)).replayed, false);
    assert.equal(await sql(`select count(*) from private.inventory_request_receipts where request_id='lifetime-001'`), '2');
    const persisted = JSON.parse(await sql(`select response from private.inventory_request_receipts where user_id='${alice}' and request_id='lifetime-001'`));
    assert.deepEqual(persisted, original);
  });

  await test('audit and receipt write failures roll back the item, history and receipt together', async () => {
    const item = await a.create(); const payload = request(item, 'rollback-001');
    const count = await sql(`select count(*) from public.inventory_transactions where item_id='${item.id}'`);
    for (const table of ['public.inventory_transactions', 'private.inventory_request_receipts']) {
      await failureTrigger(sql, table, async () => { await assert.rejects(adjust(payload), /forced write failure/); });
      assert.deepEqual(await saved(item), item);
      assert.equal(await sql(`select count(*) from public.inventory_transactions where item_id='${item.id}'`), count);
      assert.equal(await sql(`select count(*) from private.inventory_request_receipts where request_id='rollback-001'`), '0');
    }
    assert.equal((await adjust(payload)).replayed, false);
  });

  await test('same-key equal and changed payload races serialize before receipt lookup', async () => {
    for (const changed of [false, true]) {
      const item = await a.create(); const payload = request(item, changed ? 'race-changed' : 'race-equal00');
      const [first, second] = await scheduledRace(sql, adjustSQL(payload), adjustSQL({ ...payload, amount: changed ? 1 : 0.5 }), changed ? 'changed' : 'equal');
      assert.equal(first.item.quantity, 1.5);
      if (changed) assert.equal(second.error.code, 'validation');
      else assert.deepEqual(second, { ...first, replayed: true });
      assert.equal((await saved(item)).version, 2);
      assert.equal(await sql(`select count(*) from public.inventory_transactions where item_id='${item.id}' and operation='consume'`), '1');
      assert.equal(await sql(`select count(*) from private.inventory_request_receipts where request_id='${payload.requestId}'`), '1');
    }
  });

  await test('different-key deductions with equal expected quantity serialize at the item and return one conflict', async () => {
    const item = await a.create();
    const [first, second] = await scheduledRace(sql, adjustSQL(request(item, 'different-01')),
      adjustSQL(request(item, 'different-02')), 'different');
    assert.equal(first.item.quantity, 1.5);
    assert.equal(second.error.code, 'conflict');
    assert.deepEqual(second.error.current, first.item);
    assert.equal((await saved(item)).version, 2);
    assert.equal(await sql(`select count(*) from private.inventory_request_receipts where request_id in ('different-01','different-02')`), '1');
  });

  await test('history is bounded, deterministically newest-first and owner-only; role and identity gates hold', async () => {
    assert.deepEqual(await client(sql, '00000000-0000-4000-8000-000000000099').rpc('inventory_history'), { entries: [] });
    await sql(`insert into public.inventory_transactions(user_id,item_name,operation,occurred_at)
      select '${alice}','History test','edit','2030-01-01'::timestamptz from generate_series(1,105)`);
    const history = inventoryHistoryResponseSchema.parse(await a.rpc('inventory_history'));
    assert.equal(history.entries.length, 20);
    const expected = JSON.parse(await sql(`select jsonb_agg(transaction_id order by occurred_at desc,transaction_id desc) from
      (select transaction_id,occurred_at from public.inventory_transactions where user_id='${alice}' order by occurred_at desc,transaction_id desc limit 20) t`));
    assert.deepEqual(history.entries.map((entry) => entry.id), expected);
    assert.equal((await a.rpc('inventory_history', '100')).entries.length, 100);
    assert.equal((await b.rpc('inventory_history')).entries.some((entry) => entry.itemName === 'History test'), false);
    for (const limit of ['0', '-1', '101', 'null']) assert.equal((await a.rpc('inventory_history', limit)).error.code, 'validation');
    for (const statement of ['select public.inventory_history()', `select public.inventory_adjust(${literal({})})`]) {
      assert.equal(result(await sql(session('', statement))).error.code, 'unauthorized');
      await assert.rejects(sql(session('', statement, 'anon')), /42501/);
    }
    for (const statement of ['select private.inventory_history_command(20)', 'select private.inventory_adjust_command(null)',
      'select * from private.inventory_request_receipts', 'delete from public.inventory_transactions']) await assert.rejects(sql(session(alice, statement)), /42501/);
    assert.equal(await sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
      where p.proname in ('inventory_adjust','inventory_history','inventory_adjust_command','inventory_history_command')
      and p.prosecdef and p.proconfig=array['search_path=""'] and r.rolname=case when n.nspname='public' then 'pantry_executor' else 'pantry_writer' end`), '4');
  });
});
