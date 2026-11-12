begin;

create function private.command_error(p_code text, p_message text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('error',jsonb_build_object('code',p_code,'message',p_message));
$$;

create function private.valid_calendar_date(p_value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare d date;
begin
  if jsonb_typeof(p_value) is distinct from 'string' or p_value #>> '{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  begin
    d := (p_value #>> '{}')::date;
  exception when datetime_field_overflow or invalid_datetime_format then return false;
  end;
  return d between date '0001-01-01' and date '9999-12-31' and to_char(d,'YYYY-MM-DD') = p_value #>> '{}';
end;
$$;

create function private.valid_quantity(p_value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare q numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'number' then return false; end if;
  q := (p_value #>> '{}')::numeric;
  return q between 0 and 999999.999 and q = trunc(q,3);
end;
$$;

create function private.valid_version(p_value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare v numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'number' then return false; end if;
  v := (p_value #>> '{}')::numeric;
  return v between 1 and 9007199254740991 and v = trunc(v);
end;
$$;

create function private.valid_pantry_fields(p_fields jsonb, p_partial boolean) returns boolean
language plpgsql immutable set search_path = '' as $$
declare e jsonb;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then return false; end if;
  if p_fields = '{}' or p_fields - array['name','quantity','unit','storageLocation','addedOn','expiration','notes'] <> '{}' then return false; end if;
  if not p_partial and not p_fields ?& array['name','quantity','unit','storageLocation','addedOn','expiration'] then return false; end if;
  if p_partial and p_fields ? 'unit' and not p_fields ? 'quantity' then return false; end if;
  if p_fields ? 'name' and (jsonb_typeof(p_fields->'name') is distinct from 'string' or length(btrim(p_fields->>'name')) not between 1 and 200) then return false; end if;
  if p_fields ? 'quantity' and not private.valid_quantity(p_fields->'quantity') then return false; end if;
  if p_fields ? 'unit' and (jsonb_typeof(p_fields->'unit') is distinct from 'string' or p_fields->>'unit' not in ('item','portion','bag','tub','head','can','bunch','cup','tsp','tbsp','g','kg','mL','L')) then return false; end if;
  if p_fields ? 'storageLocation' and (jsonb_typeof(p_fields->'storageLocation') is distinct from 'string' or p_fields->>'storageLocation' not in ('Fridge','Freezer','Pantry','Counter')) then return false; end if;
  if p_fields ? 'addedOn' and not private.valid_calendar_date(p_fields->'addedOn') then return false; end if;
  if p_fields ? 'notes' and p_fields->'notes' <> 'null' and (jsonb_typeof(p_fields->'notes') is distinct from 'string' or length(p_fields->>'notes') > 2000) then return false; end if;
  if p_fields ? 'expiration' then
    e := p_fields->'expiration';
    if e not in ('{"kind":"estimate"}'::jsonb,'{"kind":"unknown"}'::jsonb) then
      if jsonb_typeof(e) is distinct from 'object' then return false; end if;
      if e - 'date' <> '{"kind":"override"}'::jsonb or not private.valid_calendar_date(e->'date') then return false; end if;
    end if;
  end if;
  return true;
end;
$$;

create function private.pantry_create_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); p public.pantry_items; e jsonb;
begin
  if uid is null then return private.command_error('unauthorized','Authentication required'); end if;
  if not private.valid_pantry_fields(p_request,false) then return private.command_error('validation','Invalid pantry create request'); end if;
  begin
    e := private.resolve_expiration(p_request->>'name',(p_request->>'storageLocation')::public.pantry_storage,
      (p_request->>'addedOn')::date,p_request->'expiration');
  exception when invalid_parameter_value then return private.command_error('validation','Expiration exceeds supported range');
  end;
  insert into public.pantry_items(user_id,name,quantity,unit,storage_location,added_on,expiration_mode,expiration_date,expiration_reason,shelf_life_id,expiration_provenance,notes)
    values(uid,btrim(p_request->>'name'),(p_request->>'quantity')::numeric,p_request->>'unit',p_request->>'storageLocation',
      (p_request->>'addedOn')::date,e->>'kind',(e->>'date')::date,e->>'reason',(e->'provenance'->>'referenceId')::uuid,e->'provenance',p_request->>'notes') returning * into p;
  insert into public.inventory_transactions(user_id,item_id,item_name,operation,quantity_delta,unit)
    values(uid,p.item_id,p.name,'add',p.quantity,p.unit);
  return jsonb_build_object('item',private.pantry_item_json(p));
end;
$$;

create function private.pantry_update_command(p_item_id uuid, p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); old public.pantry_items; p public.pantry_items; c jsonb; e jsonb; previous jsonb;
begin
  if uid is null then return private.command_error('unauthorized','Authentication required'); end if;
  if jsonb_typeof(p_request) is distinct from 'object' then return private.command_error('validation','Invalid pantry update request'); end if;
  if p_request - array['expectedVersion','changes'] <> '{}' or not private.valid_version(p_request->'expectedVersion')
    or not private.valid_pantry_fields(p_request->'changes',true) then return private.command_error('validation','Invalid pantry update request'); end if;
  select * into old from public.pantry_items where item_id=p_item_id and user_id=uid for update;
  if not found then return private.command_error('not_found','Item not found'); end if;
  if old.version <> (p_request->>'expectedVersion')::bigint then return private.command_error('conflict','Item version changed'); end if;
  if old.version = 9007199254740991 then return private.command_error('validation','Item version limit reached'); end if;
  c := p_request->'changes'; p := old;
  p.name := case when c ? 'name' then btrim(c->>'name') else p.name end;
  p.quantity := case when c ? 'quantity' then (c->>'quantity')::numeric else p.quantity end;
  p.unit := case when c ? 'unit' then c->>'unit' else p.unit end;
  p.storage_location := case when c ? 'storageLocation' then c->>'storageLocation' else p.storage_location end;
  p.added_on := case when c ? 'addedOn' then (c->>'addedOn')::date else p.added_on end;
  p.notes := case when c ? 'notes' then c->>'notes' else p.notes end;
  previous := private.pantry_item_json(old)->'expiration';
  begin
    e := private.resolve_expiration(p.name,p.storage_location,p.added_on,c->'expiration',previous,
      p.name is distinct from old.name or p.storage_location is distinct from old.storage_location or p.added_on is distinct from old.added_on);
  exception when invalid_parameter_value then return private.command_error('validation','Expiration exceeds supported range');
  end;
  update public.pantry_items set name=p.name,quantity=p.quantity,unit=p.unit,storage_location=p.storage_location,added_on=p.added_on,
    notes=p.notes,expiration_mode=e->>'kind',expiration_date=(e->>'date')::date,expiration_reason=e->>'reason',
    shelf_life_id=(e->'provenance'->>'referenceId')::uuid,expiration_provenance=e->'provenance',
    status=case when p.quantity > 0 then 'active' else old.status end,version=old.version+1,updated_at=clock_timestamp()
    where item_id=p_item_id and user_id=uid returning * into p;
  insert into public.inventory_transactions(user_id,item_id,item_name,operation,quantity_delta,unit)
    values(uid,p.item_id,p.name,'edit',case when p.unit=old.unit and p.quantity<>old.quantity then p.quantity-old.quantity end,
      case when p.unit=old.unit then p.unit end);
  return jsonb_build_object('item',private.pantry_item_json(p));
end;
$$;

create function private.pantry_delete_command(p_item_id uuid, p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); p public.pantry_items;
begin
  if uid is null then return private.command_error('unauthorized','Authentication required'); end if;
  if jsonb_typeof(p_request) is distinct from 'object' then return private.command_error('validation','Invalid pantry delete request'); end if;
  if p_request - 'expectedVersion' <> '{}' or not private.valid_version(p_request->'expectedVersion') then return private.command_error('validation','Invalid pantry delete request'); end if;
  select * into p from public.pantry_items where item_id=p_item_id and user_id=uid for update;
  if not found then return private.command_error('not_found','Item not found'); end if;
  if p.version <> (p_request->>'expectedVersion')::bigint then return private.command_error('conflict','Item version changed'); end if;
  insert into public.inventory_transactions(user_id,item_id,item_name,operation,quantity_delta,unit)
    values(uid,p.item_id,p.name,'delete',-p.quantity,p.unit);
  delete from public.pantry_items where item_id=p_item_id and user_id=uid;
  return '{"deleted":true}'::jsonb;
end;
$$;

create function private.pantry_list_command() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then return private.command_error('unauthorized','Authentication required'); end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(private.pantry_item_json(p) order by p.expiration_date nulls last,p.item_id)
    from public.pantry_items p where p.user_id=auth.uid()),'[]'::jsonb));
end;
$$;

create function public.pantry_create(p_request jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select private.pantry_create_command(p_request); $$;
create function public.pantry_update(p_item_id uuid, p_request jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select private.pantry_update_command(p_item_id,p_request); $$;
create function public.pantry_delete(p_item_id uuid, p_request jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select private.pantry_delete_command(p_item_id,p_request); $$;
create function public.pantry_list() returns jsonb
language sql stable security definer set search_path = '' as $$ select private.pantry_list_command(); $$;

alter function private.pantry_create_command(jsonb) owner to pantry_writer;
alter function private.pantry_update_command(uuid,jsonb) owner to pantry_writer;
alter function private.pantry_delete_command(uuid,jsonb) owner to pantry_writer;
alter function private.pantry_list_command() owner to pantry_writer;
alter function public.pantry_create(jsonb) owner to pantry_executor;
alter function public.pantry_update(uuid,jsonb) owner to pantry_executor;
alter function public.pantry_delete(uuid,jsonb) owner to pantry_executor;
alter function public.pantry_list() owner to pantry_executor;

revoke all on function private.command_error(text,text),private.valid_calendar_date(jsonb),private.valid_quantity(jsonb),
  private.valid_version(jsonb),private.valid_pantry_fields(jsonb,boolean) from public,anon,authenticated,pantry_executor;
grant execute on function private.command_error(text,text),private.valid_calendar_date(jsonb),private.valid_quantity(jsonb),
  private.valid_version(jsonb),private.valid_pantry_fields(jsonb,boolean) to pantry_writer;
revoke all on function private.pantry_create_command(jsonb),private.pantry_update_command(uuid,jsonb),
  private.pantry_delete_command(uuid,jsonb),private.pantry_list_command() from public,anon,authenticated;
grant execute on function private.pantry_create_command(jsonb),private.pantry_update_command(uuid,jsonb),
  private.pantry_delete_command(uuid,jsonb),private.pantry_list_command() to pantry_executor;
revoke all on function public.pantry_create(jsonb),public.pantry_update(uuid,jsonb),public.pantry_delete(uuid,jsonb),public.pantry_list() from public,anon;
grant execute on function public.pantry_create(jsonb),public.pantry_update(uuid,jsonb),public.pantry_delete(uuid,jsonb),public.pantry_list() to authenticated;

commit;
