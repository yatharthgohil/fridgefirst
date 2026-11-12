begin;

create function private.inventory_adjust_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); item_uuid uuid; p public.pantry_items; t public.inventory_transactions;
  receipt private.inventory_request_receipts; canonical jsonb; response jsonb;
  amount numeric; expected numeric;
begin
  if uid is null then return private.command_error('unauthorized','Authentication required'); end if;
  if jsonb_typeof(p_request) is distinct from 'object' then return private.command_error('validation','Invalid adjustment request'); end if;
  if not p_request ?& array['requestId','itemId','operation','amount','unit','expectedQuantity']
    or p_request - array['requestId','itemId','operation','amount','unit','expectedQuantity'] <> '{}'
    or jsonb_typeof(p_request->'requestId') is distinct from 'string' or length(p_request->>'requestId') not between 8 and 128
    or jsonb_typeof(p_request->'itemId') is distinct from 'string' or length(p_request->>'itemId') < 1
    or jsonb_typeof(p_request->'operation') is distinct from 'string' or p_request->>'operation' not in ('consume','discard')
    or jsonb_typeof(p_request->'unit') is distinct from 'string' or p_request->>'unit' not in ('item','portion','bag','tub','head','can','bunch','cup','tsp','tbsp','g','kg','mL','L')
    or not private.valid_quantity(p_request->'amount') or not private.valid_quantity(p_request->'expectedQuantity') then
    return private.command_error('validation','Invalid adjustment request');
  end if;
  amount := (p_request->>'amount')::numeric; expected := (p_request->>'expectedQuantity')::numeric;
  if amount <= 0 then return private.command_error('validation','Deduction must be positive'); end if;
  canonical := jsonb_build_object('requestId',p_request->>'requestId','itemId',p_request->>'itemId',
    'operation',p_request->>'operation','amount',amount,'unit',p_request->>'unit','expectedQuantity',expected);
  -- Serialize the absent-receipt case as well as retries of an existing receipt.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || (p_request->>'requestId'),0));
  select * into receipt from private.inventory_request_receipts where user_id=uid and request_id=p_request->>'requestId';
  if found then
    if receipt.request <> canonical then return private.command_error('validation','Request ID was already used for a different adjustment'); end if;
    return receipt.response || '{"replayed":true}'::jsonb;
  end if;
  if not pg_input_is_valid(p_request->>'itemId','uuid') then return private.command_error('not_found','Item not found'); end if;
  item_uuid := (p_request->>'itemId')::uuid;
  select * into p from public.pantry_items where item_id=item_uuid and user_id=uid for update;
  if not found then return private.command_error('not_found','Item not found'); end if;
  if p.quantity <> expected or p.unit <> p_request->>'unit' then
    return jsonb_build_object('error',jsonb_build_object('code','conflict','message','Item quantity or unit changed',
      'current',jsonb_build_object('id',p.item_id,'quantity',p.quantity,'unit',p.unit)));
  end if;
  if amount > p.quantity then return private.command_error('validation','Deduction exceeds available quantity'); end if;
  if p.version = 9007199254740991 then return private.command_error('validation','Item version limit reached'); end if;
  update public.pantry_items set quantity=p.quantity-amount,version=p.version+1,updated_at=clock_timestamp(),
    status=case when p.quantity<>amount then 'active' when p_request->>'operation'='consume' then 'consumed' else 'discarded' end
    where item_id=item_uuid and user_id=uid returning * into p;
  insert into public.inventory_transactions(user_id,item_id,item_name,operation,quantity_delta,unit)
    values(uid,p.item_id,p.name,p_request->>'operation',-amount,p.unit) returning * into t;
  response := jsonb_build_object('item',jsonb_build_object('id',p.item_id,'quantity',p.quantity,'unit',p.unit),
    'entry',private.inventory_history_json(t),'replayed',false);
  insert into private.inventory_request_receipts(user_id,request_id,request,response)
    values(uid,p_request->>'requestId',canonical,response);
  return response;
end;
$$;

create function private.inventory_history_command(p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then return private.command_error('unauthorized','Authentication required'); end if;
  if p_limit is null or p_limit not between 1 and 100 then return private.command_error('validation','History limit must be between 1 and 100'); end if;
  return jsonb_build_object('entries',coalesce((select jsonb_agg(private.inventory_history_json(t) order by t.occurred_at desc,t.transaction_id desc)
    from (select * from public.inventory_transactions where user_id=auth.uid()
      order by occurred_at desc,transaction_id desc limit p_limit) t),'[]'::jsonb));
end;
$$;

create function public.inventory_adjust(p_request jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select private.inventory_adjust_command(p_request); $$;
create function public.inventory_history(p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = '' as $$ select private.inventory_history_command(p_limit); $$;

alter function private.inventory_adjust_command(jsonb) owner to pantry_writer;
alter function private.inventory_history_command(integer) owner to pantry_writer;
alter function public.inventory_adjust(jsonb) owner to pantry_executor;
alter function public.inventory_history(integer) owner to pantry_executor;
revoke all on function private.inventory_adjust_command(jsonb),private.inventory_history_command(integer) from public,anon,authenticated;
grant execute on function private.inventory_adjust_command(jsonb),private.inventory_history_command(integer) to pantry_executor;
revoke all on function public.inventory_adjust(jsonb),public.inventory_history(integer) from public,anon;
grant execute on function public.inventory_adjust(jsonb),public.inventory_history(integer) to authenticated;

commit;
