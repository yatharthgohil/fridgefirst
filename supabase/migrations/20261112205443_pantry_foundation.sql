begin;

create role pantry_writer nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role pantry_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema public, private, auth to pantry_writer;
grant usage on schema private to pantry_executor;
grant execute on function auth.uid() to pantry_writer;

create domain public.pantry_quantity as numeric
  check (value >= 0 and value <= 999999.999 and value = trunc(value, 3));
create domain public.pantry_unit as text
  check (value in ('item','portion','bag','tub','head','can','bunch','cup','tsp','tbsp','g','kg','mL','L'));
create domain public.pantry_storage as text
  check (value in ('Fridge','Freezer','Pantry','Counter'));

create table public.shelf_life_references (
  reference_id uuid primary key default gen_random_uuid(),
  food_name text not null check (length(btrim(food_name)) between 1 and 200),
  normalized_food_name text generated always as (lower(btrim(regexp_replace(food_name, '\s+', ' ', 'g')))) stored,
  storage_location public.pantry_storage not null,
  shelf_life_days integer not null check (shelf_life_days between 1 and 36500),
  source_name text not null check (length(btrim(source_name)) > 0),
  source_url text not null check (source_url ~ '^https?://[^[:space:]]+$'),
  source_accessed_on date not null check (source_accessed_on between date '0001-01-01' and date '9999-12-31'),
  assumptions text not null check (length(btrim(assumptions)) > 0),
  active boolean not null default true
);
create unique index shelf_life_active_match on public.shelf_life_references (normalized_food_name, storage_location) where active;

create table public.pantry_items (
  item_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  quantity public.pantry_quantity not null,
  unit public.pantry_unit not null,
  storage_location public.pantry_storage not null,
  added_on date not null check (added_on between date '0001-01-01' and date '9999-12-31'),
  expiration_mode text not null check (expiration_mode in ('estimate','override','unknown')),
  expiration_date date check (expiration_date between date '0001-01-01' and date '9999-12-31'),
  expiration_reason text check (expiration_reason in ('no_match','user_cleared')),
  shelf_life_id uuid references public.shelf_life_references(reference_id),
  expiration_provenance jsonb,
  expiry_is_estimate boolean generated always as (expiration_mode = 'estimate') stored,
  notes text check (length(notes) <= 2000),
  status text not null default 'active' check (status in ('active','consumed','discarded')),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pantry_status_quantity check (status = 'active' or quantity = 0),
  constraint pantry_expiration_state check ((
    (expiration_mode = 'unknown' and expiration_date is null and expiration_reason is not null and shelf_life_id is null and expiration_provenance is null)
    or (expiration_mode = 'override' and expiration_date is not null and expiration_reason is null and shelf_life_id is null and expiration_provenance is null)
    or (expiration_mode = 'estimate' and expiration_date is not null and expiration_reason is null and shelf_life_id is not null
      and jsonb_typeof(expiration_provenance) = 'object' and expiration_provenance is not null
      and expiration_provenance ?& array['referenceId','foodName','storageLocation','days','sourceName','sourceUrl','sourceAccessedOn','assumptions']
      and expiration_provenance->>'referenceId' = shelf_life_id::text
      and jsonb_typeof(expiration_provenance->'days') = 'number'
      and (expiration_provenance->>'days')::numeric between 1 and 36500
      and (expiration_provenance->>'days')::numeric = trunc((expiration_provenance->>'days')::numeric)
      and expiration_provenance->>'storageLocation' = storage_location
      and length(expiration_provenance->>'foodName') > 0
      and length(expiration_provenance->>'sourceName') > 0
      and expiration_provenance->>'sourceUrl' ~ '^https?://[^[:space:]]+$'
      and expiration_provenance->>'sourceAccessedOn' ~ '^\d{4}-\d{2}-\d{2}$'
      and length(expiration_provenance->>'assumptions') > 0)
  ) is true)
);
create index pantry_items_owner on public.pantry_items (user_id, created_at desc, item_id);
create index pantry_items_reference on public.pantry_items (shelf_life_id) where shelf_life_id is not null;

create table public.inventory_transactions (
  transaction_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.pantry_items(item_id) on delete set null,
  item_name text not null check (length(btrim(item_name)) between 1 and 200),
  operation text not null check (operation in ('add','edit','delete','consume','discard','recipe_deduction')),
  quantity_delta numeric check (abs(quantity_delta) <= 999999.999 and quantity_delta = trunc(quantity_delta, 3)),
  unit public.pantry_unit,
  occurred_at timestamptz not null default now(),
  constraint history_delta_unit check (quantity_delta is null or unit is not null)
);
create index inventory_transactions_owner_recent on public.inventory_transactions (user_id, occurred_at desc, transaction_id desc);
create index inventory_transactions_item on public.inventory_transactions (item_id) where item_id is not null;

create table private.inventory_request_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (length(request_id) between 8 and 128),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.pantry_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.shelf_life_references enable row level security;
alter table private.inventory_request_receipts enable row level security;

create policy pantry_read on public.pantry_items for select to authenticated using (user_id = (select auth.uid()));
create policy pantry_write on public.pantry_items to pantry_writer using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy history_read on public.inventory_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy history_writer_read on public.inventory_transactions for select to pantry_writer using (user_id = (select auth.uid()));
create policy history_writer_insert on public.inventory_transactions for insert to pantry_writer with check (
  user_id = (select auth.uid()) and (item_id is null or exists (
    select 1 from public.pantry_items p where p.item_id = inventory_transactions.item_id and p.user_id = (select auth.uid())
  ))
);
create policy reference_read on public.shelf_life_references for select to authenticated, pantry_writer using (true);
create policy receipt_read on private.inventory_request_receipts for select to pantry_writer using (user_id = (select auth.uid()));
create policy receipt_insert on private.inventory_request_receipts for insert to pantry_writer with check (user_id = (select auth.uid()));

revoke all on public.pantry_items, public.inventory_transactions, public.shelf_life_references, private.inventory_request_receipts from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.pantry_items, public.inventory_transactions, public.shelf_life_references to authenticated;
grant select, insert, update, delete on public.pantry_items to pantry_writer;
grant select, insert on public.inventory_transactions, private.inventory_request_receipts to pantry_writer;
grant select on public.shelf_life_references to pantry_writer;

create function private.pantry_item_json(p public.pantry_items) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.item_id, 'name', p.name, 'quantity', p.quantity, 'unit', p.unit,
    'storageLocation', p.storage_location, 'addedOn', p.added_on,
    'expiration', case p.expiration_mode
      when 'estimate' then jsonb_build_object('kind','estimate','date',p.expiration_date,'provenance',p.expiration_provenance)
      when 'override' then jsonb_build_object('kind','override','date',p.expiration_date)
      else jsonb_build_object('kind','unknown','date',null,'reason',p.expiration_reason) end,
    'notes', p.notes, 'status', p.status, 'version', p.version,
    'createdAt', p.created_at, 'updatedAt', p.updated_at
  );
$$;
create function private.inventory_history_json(t public.inventory_transactions) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',t.transaction_id,'itemId',t.item_id,'itemName',t.item_name,
    'operation',t.operation,'quantityDelta',t.quantity_delta,'unit',t.unit,'occurredAt',t.occurred_at);
$$;

create function private.resolve_expiration(
  p_name text, p_storage public.pantry_storage, p_added_on date,
  p_intent jsonb, p_previous jsonb default null, p_rematch boolean default false
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  r public.shelf_life_references;
  intent jsonb := p_intent;
  override_date date;
begin
  if intent is null then
    if p_previous is not null and (not p_rematch or p_previous->>'kind' = 'override'
      or p_previous->>'reason' = 'user_cleared') then return p_previous; end if;
    intent := '{"kind":"estimate"}'::jsonb;
  end if;
  if jsonb_typeof(intent) is distinct from 'object' or intent->>'kind' is null then
    raise exception 'Invalid expiration intent' using errcode = '22023';
  end if;
  if intent->>'kind' = 'unknown' and intent = '{"kind":"unknown"}'::jsonb then
    return jsonb_build_object('kind','unknown','date',null,'reason','user_cleared');
  elsif intent->>'kind' = 'override' and intent - 'date' = '{"kind":"override"}'::jsonb
    and jsonb_typeof(intent->'date') = 'string' and intent->>'date' ~ '^\d{4}-\d{2}-\d{2}$' then
    override_date := (intent->>'date')::date;
    if override_date not between date '0001-01-01' and date '9999-12-31' then
      raise exception 'Invalid expiration date' using errcode = '22023';
    end if;
    return jsonb_build_object('kind','override','date',override_date);
  elsif intent is distinct from '{"kind":"estimate"}'::jsonb then
    raise exception 'Invalid expiration intent' using errcode = '22023';
  end if;
  select * into r from public.shelf_life_references
    where active and normalized_food_name = lower(btrim(regexp_replace(p_name, '\s+', ' ', 'g')))
      and storage_location = p_storage;
  if not found then return jsonb_build_object('kind','unknown','date',null,'reason','no_match'); end if;
  if p_added_on + r.shelf_life_days > date '9999-12-31' then
    raise exception 'Estimated date exceeds supported range' using errcode = '22023';
  end if;
  return jsonb_build_object('kind','estimate','date',p_added_on + r.shelf_life_days,
    'provenance',jsonb_build_object('referenceId',r.reference_id,'foodName',r.food_name,
      'storageLocation',r.storage_location,'days',r.shelf_life_days,'sourceName',r.source_name,
      'sourceUrl',r.source_url,'sourceAccessedOn',r.source_accessed_on,'assumptions',r.assumptions));
end;
$$;

revoke all on function private.pantry_item_json(public.pantry_items),
  private.inventory_history_json(public.inventory_transactions),
  private.resolve_expiration(text, public.pantry_storage, date, jsonb, jsonb, boolean)
  from public, anon, authenticated, pantry_executor;
grant execute on function private.pantry_item_json(public.pantry_items),
  private.inventory_history_json(public.inventory_transactions),
  private.resolve_expiration(text, public.pantry_storage, date, jsonb, jsonb, boolean)
  to pantry_writer;

commit;
