import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

export const alice = '00000000-0000-4000-8000-000000000001';
export const bob = '00000000-0000-4000-8000-000000000002';
export const literal = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export const session = (user, statement, role = 'authenticated') =>
  `set session authorization ${role}; begin; select set_config('request.jwt.claim.sub','${user}',true); ${statement}; commit;`;
export const result = (output) => JSON.parse(output.split('\n').filter((line) => line.startsWith('{')).at(-1));
export const food = (changes = {}) => ({ name: 'Example food', quantity: 2, unit: 'bag', storageLocation: 'Fridge',
  addedOn: '2026-11-10', expiration: { kind: 'estimate' }, ...changes });

export function client(sql, user = alice) {
  const rpc = async (name, args = '') => result(await sql(session(user, `select public.${name}(${args})`)));
  return {
    rpc,
    create: async (request = food()) => (await rpc('pantry_create', literal(request))).item,
    update: (item, changes, expectedVersion = item.version) => rpc('pantry_update', `'${item.id}',${literal({ expectedVersion, changes })}`),
    remove: (item, expectedVersion = item.version) => rpc('pantry_delete', `'${item.id}',${literal({ expectedVersion })}`),
  };
}

export async function seedUsers(sql) {
  await sql(`insert into auth.users values ('${alice}'),('${bob}');
    insert into public.shelf_life_references(food_name,storage_location,shelf_life_days,source_name,source_url,source_accessed_on,assumptions)
    values ('Example food','Fridge',5,'Test only','https://example.com','2026-11-12','Test only'),
      ('Example food','Freezer',10,'Test only','https://example.com','2026-11-12','Test only');`);
}

export async function heldCommand(sql, user, statement, name) {
  const pending = sql(`set application_name='${name}'; ${session(user, `${statement}; select pg_sleep(1)`)}`);
  // The second connection starts only after the first command has acquired its locks.
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event='PgSleep')`) === 't') return { pending };
    await setTimeout(10);
  }
  await pending;
  assert.fail('First command did not reach its held transaction');
}

export async function failureTrigger(sql, table, run) {
  await sql(`create function public.test_fail_write() returns trigger language plpgsql as $$ begin raise exception 'forced write failure'; end $$;
    create trigger test_fail before insert on ${table} for each row execute function public.test_fail_write()`);
  try { await run(); } finally {
    await sql(`drop trigger test_fail on ${table}; drop function public.test_fail_write()`);
  }
}
