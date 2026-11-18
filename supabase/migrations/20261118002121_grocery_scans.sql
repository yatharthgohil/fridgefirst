begin;
grant pantry_writer, pantry_executor to postgres with set true;
grant create on schema private to pantry_writer;
grant create on schema public to pantry_executor;

create table private.scan_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind = 'grocery_photo'),
  status text not null default 'uploading' check (status in ('uploading','analyzing','review','failed','confirmed')),
  images jsonb not null,
  proposals jsonb not null default '[]',
  message text not null default '',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  claim_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  deletion_requested boolean not null default false,
  confirmation_request jsonb,
  confirmation_response jsonb
);
create index scan_sessions_owner on private.scan_sessions(user_id,created_at);
create table private.scan_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  created integer not null default 0,
  attempts integer not null default 0,
  primary key(user_id,day)
);
alter table private.scan_sessions enable row level security;
alter table private.scan_daily_usage enable row level security;
create policy scan_owner on private.scan_sessions to pantry_writer using (user_id=private.request_user_id()) with check (user_id=private.request_user_id());
create policy scan_usage_owner on private.scan_daily_usage to pantry_writer using (user_id=private.request_user_id()) with check (user_id=private.request_user_id());
grant select,insert,update,delete on private.scan_sessions to pantry_writer;
grant select,insert,update on private.scan_daily_usage to pantry_writer;

create function private.scan_json(s private.scan_sessions) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',s.id,'kind',s.kind,'status',s.status,'images',s.images,'version',s.version,'createdAt',s.created_at)
 || case s.status when 'review' then jsonb_build_object('proposals',s.proposals)
 when 'failed' then jsonb_build_object('message',s.message)
 when 'confirmed' then jsonb_build_object('itemIds',(select coalesce(jsonb_agg(i->'id'),'[]') from jsonb_array_elements(s.confirmation_response->'items') i))
 else '{}'::jsonb end;
$$;

create function private.scan_create_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.request_user_id(); s private.scan_sessions; i jsonb; manifest jsonb:='[]'; ordinal integer:=0; ext text; day_utc date:=(now() at time zone 'UTC')::date; usage private.scan_daily_usage;
begin
 if uid is null then return private.command_error('unauthorized','Authentication required'); end if;
 if jsonb_typeof(p_request) is distinct from 'object' or p_request - array['kind','images'] <> '{}' or p_request->>'kind' is distinct from 'grocery_photo' or jsonb_typeof(p_request->'images') is distinct from 'array' then return private.command_error('validation','Invalid scan request'); end if;
 if jsonb_array_length(p_request->'images') <>1 then return private.command_error('validation','Choose one image'); end if;
 s.id:=gen_random_uuid();
 for i in select value from jsonb_array_elements(p_request->'images') loop
  if jsonb_typeof(i) is distinct from 'object' or i-array['contentType','size'] <> '{}' or jsonb_typeof(i->'contentType') is distinct from 'string' or i->>'contentType' not in ('image/jpeg','image/png','image/webp') or jsonb_typeof(i->'size') is distinct from 'number' then return private.command_error('validation','Invalid image'); end if;
  if (i->>'size')::numeric not between 1 and 5242880 or (i->>'size')::numeric<>trunc((i->>'size')::numeric) then return private.command_error('validation','Image exceeds size limit'); end if;
  ext:=case i->>'contentType' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
  manifest:=manifest||jsonb_build_array(i||jsonb_build_object('path',uid::text||'/'||s.id::text||'/'||ordinal::text||'.'||ext)); ordinal:=ordinal+1;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1729));
 insert into private.scan_daily_usage(user_id,day) values(uid,day_utc) on conflict do nothing;
 select * into usage from private.scan_daily_usage where user_id=uid and day=day_utc for update;
 if usage.created>=20 or (select count(*) from private.scan_sessions where user_id=uid)>=100 then return private.command_error('conflict','Scan limit reached. Delete old scans or try tomorrow.'); end if;
 update private.scan_daily_usage set created=created+1 where user_id=uid and day=day_utc;
 insert into private.scan_sessions(id,user_id,kind,images) values(s.id,uid,p_request->>'kind',manifest) returning * into s;
 return jsonb_build_object('scan',private.scan_json(s));
end;
$$;

create function private.scan_get_command(p_scan_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s private.scan_sessions;
begin
 if private.request_user_id() is null then return private.command_error('unauthorized','Authentication required'); end if;
 select * into s from private.scan_sessions where id=p_scan_id and user_id=private.request_user_id();
 if not found then return private.command_error('not_found','Scan not found'); end if;
 return jsonb_build_object('scan',private.scan_json(s));
end;
$$;

create function private.scan_claim_command(p_scan_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.request_user_id(); s private.scan_sessions; day_utc date:=(now() at time zone 'UTC')::date; used integer;
begin
 if uid is null then return private.command_error('unauthorized','Authentication required'); end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1729));
 select * into s from private.scan_sessions where id=p_scan_id and user_id=uid for update;
 if not found then return private.command_error('not_found','Scan not found'); end if;
 if s.deletion_requested then return private.command_error('conflict','Scan deletion is pending'); end if;
 if s.status in ('review','confirmed') then return jsonb_build_object('scan',private.scan_json(s),'token',null); end if;
 if exists(select 1 from private.scan_sessions where user_id=uid and status='analyzing' and lease_until>now()) then return private.command_error('conflict','A scan is already being analyzed'); end if;
 insert into private.scan_daily_usage(user_id,day) values(uid,day_utc) on conflict do nothing;
 select attempts into used from private.scan_daily_usage where user_id=uid and day=day_utc for update;
 if s.attempts>=3 or used>=10 then return private.command_error('conflict','Analysis limit reached. Try tomorrow or enter items manually.'); end if;
 update private.scan_daily_usage set attempts=attempts+1 where user_id=uid and day=day_utc;
 update private.scan_sessions set status='analyzing',claim_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',attempts=attempts+1,version=version+1 where id=s.id returning * into s;
 return jsonb_build_object('scan',private.scan_json(s),'token',s.claim_token);
end;
$$;

create function private.scan_finish_command(p_scan_id uuid,p_token uuid,p_proposals jsonb,p_message text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.scan_sessions; p jsonb;
begin
 if private.request_user_id() is null then return private.command_error('unauthorized','Authentication required'); end if;
 select * into s from private.scan_sessions where id=p_scan_id and user_id=private.request_user_id() for update;
 if not found then return private.command_error('not_found','Scan not found'); end if;
 if s.status<>'analyzing' or s.claim_token is distinct from p_token or s.lease_until<now() then return private.command_error('conflict','Analysis has expired'); end if;
 if p_message is null then
  if jsonb_typeof(p_proposals) is distinct from 'array' then return private.command_error('validation','Invalid proposals'); end if;
  if jsonb_array_length(p_proposals)>50 then return private.command_error('validation','Too many proposals'); end if;
  for p in select value from jsonb_array_elements(p_proposals) loop
   if jsonb_typeof(p) is distinct from 'object' or not p ?& array['id','name','quantity','unit','storageLocation','confidence','imageIndex','warnings'] or p-array['id','name','quantity','unit','storageLocation','confidence','imageIndex','warnings']<>'{}' then return private.command_error('validation','Invalid proposal'); end if;
   if jsonb_typeof(p->'id') is distinct from 'string' or jsonb_typeof(p->'confidence') is distinct from 'string' or jsonb_typeof(p->'storageLocation') is distinct from 'string' or p->>'id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or jsonb_typeof(p->'name') is distinct from 'string' or length(btrim(p->>'name')) not between 1 and 200 or p->>'confidence' not in ('low','medium','high') or p->>'storageLocation' not in ('Fridge','Freezer','Pantry','Counter') or jsonb_typeof(p->'imageIndex') is distinct from 'number' then return private.command_error('validation','Invalid proposal'); end if;
   if (p->>'imageIndex')::numeric<>trunc((p->>'imageIndex')::numeric) or (p->>'imageIndex')::numeric not between 0 and jsonb_array_length(s.images)-1 then return private.command_error('validation','Invalid image reference'); end if;
   if p->'quantity'<>'null' and (not private.valid_quantity(p->'quantity') or (p->>'quantity')::numeric<=0) then return private.command_error('validation','Invalid quantity'); end if;
   if p->'unit'<>'null' and p->>'unit' not in ('item','portion','bag','tub','head','can','bunch','cup','tsp','tbsp','g','kg','mL','L') then return private.command_error('validation','Invalid unit'); end if;
   if jsonb_typeof(p->'warnings') is distinct from 'array' then return private.command_error('validation','Invalid warnings'); end if;
   if jsonb_array_length(p->'warnings')>5 or exists(select 1 from jsonb_array_elements(p->'warnings') w where jsonb_typeof(w)<>'string' or length(w#>>'{}')>200) then return private.command_error('validation','Invalid warnings'); end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_proposals))<>jsonb_array_length(p_proposals) then return private.command_error('validation','Duplicate proposals'); end if;
 elsif length(p_message)>300 then return private.command_error('validation','Invalid failure message'); end if;
 update private.scan_sessions set status=case when p_message is null then 'review' else 'failed' end,proposals=coalesce(p_proposals,'[]'),message=coalesce(p_message,''),claim_token=null,lease_until=null,version=version+1 where id=s.id returning * into s;
 return jsonb_build_object('scan',private.scan_json(s));
end;
$$;

create function private.scan_confirm_command(p_scan_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.scan_sessions; selection jsonb; result jsonb; items jsonb:='[]';
begin
 if private.request_user_id() is null then return private.command_error('unauthorized','Authentication required'); end if;
 select * into s from private.scan_sessions where id=p_scan_id and user_id=private.request_user_id() for update;
 if not found then return private.command_error('not_found','Scan not found'); end if;
 if s.deletion_requested then return private.command_error('conflict','Scan deletion is pending'); end if;
 if s.status='confirmed' then
  if s.confirmation_request=p_request then return s.confirmation_response; end if;
  return private.command_error('conflict','Scan was already confirmed with different items');
 end if;
 if jsonb_typeof(p_request) is distinct from 'object' or p_request-array['expectedVersion','items']<>'{}' or not private.valid_version(p_request->'expectedVersion') or jsonb_typeof(p_request->'items') is distinct from 'array' then return private.command_error('validation','Invalid confirmation'); end if;
 if s.status<>'review' or s.version<>(p_request->>'expectedVersion')::bigint then return private.command_error('conflict','Scan changed. Reload before confirming.'); end if;
 if jsonb_array_length(p_request->'items') not between 1 and 50 or (select count(distinct value->>'proposalId') from jsonb_array_elements(p_request->'items'))<>jsonb_array_length(p_request->'items') then return private.command_error('validation','Select each proposal once'); end if;
 begin
  for selection in select value from jsonb_array_elements(p_request->'items') loop
   if jsonb_typeof(selection) is distinct from 'object' or selection-array['proposalId','fields']<>'{}' or not exists(select 1 from jsonb_array_elements(s.proposals) p where p->>'id'=selection->>'proposalId') then
    result:=private.command_error('validation','Unknown proposal'); raise exception using errcode='P0002';
   end if;
   result:=private.pantry_create_command(selection->'fields');
   if result ? 'error' then raise exception using errcode='P0002'; end if;
   items:=items||jsonb_build_array(result->'item');
  end loop;
 exception when no_data_found then return result;
 end;
 result:=jsonb_build_object('items',items);
 update private.scan_sessions set status='confirmed',version=version+1,confirmation_request=p_request,confirmation_response=result where id=s.id;
 return result;
end;
$$;

create function private.scan_prepare_delete_command(p_scan_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.scan_sessions;
begin
 if private.request_user_id() is null then return private.command_error('unauthorized','Authentication required'); end if;
 select * into s from private.scan_sessions where id=p_scan_id and user_id=private.request_user_id() for update;
 if not found then return private.command_error('not_found','Scan not found'); end if;
 if s.status='analyzing' and s.lease_until>now() then return private.command_error('conflict','Wait for analysis before deleting'); end if;
 update private.scan_sessions set deletion_requested=true,status='failed',message='Deletion pending. Retry deleting this scan.',version=version+1 where id=s.id returning * into s;
 return jsonb_build_object('scan',private.scan_json(s));
end;
$$;
create function private.scan_delete_command(p_scan_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if private.request_user_id() is null then return private.command_error('unauthorized','Authentication required'); end if;
 delete from private.scan_sessions where id=p_scan_id and user_id=private.request_user_id() and deletion_requested;
 if not found then return private.command_error('conflict','Prepare scan deletion first'); end if;
 return '{"deleted":true}'::jsonb;
end;
$$;

create function private.scan_upload_allowed(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.scan_sessions s, jsonb_array_elements(s.images) i where s.user_id=private.request_user_id() and s.status='uploading' and not s.deletion_requested and i->>'path'=p_path);
$$;

create function public.scan_create(p_request jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.scan_create_command(p_request); $$;
alter function private.scan_create_command(jsonb) owner to pantry_writer;
alter function public.scan_create(jsonb) owner to pantry_executor;
revoke all on function private.scan_create_command(jsonb) from public,anon,authenticated;
grant execute on function private.scan_create_command(jsonb) to pantry_executor;
revoke all on function public.scan_create(jsonb) from public,anon;
grant execute on function public.scan_create(jsonb) to authenticated;
create function public.scan_get(p_scan_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.scan_get_command(p_scan_id); $$;
alter function private.scan_get_command(uuid) owner to pantry_writer;
alter function public.scan_get(uuid) owner to pantry_executor;
revoke all on function private.scan_get_command(uuid) from public,anon,authenticated;
grant execute on function private.scan_get_command(uuid) to pantry_executor;
revoke all on function public.scan_get(uuid) from public,anon;
grant execute on function public.scan_get(uuid) to authenticated;
create function public.scan_claim(p_scan_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.scan_claim_command(p_scan_id); $$;
alter function private.scan_claim_command(uuid) owner to pantry_writer;
alter function public.scan_claim(uuid) owner to pantry_executor;
revoke all on function private.scan_claim_command(uuid) from public,anon,authenticated;
grant execute on function private.scan_claim_command(uuid) to pantry_executor;
revoke all on function public.scan_claim(uuid) from public,anon;
grant execute on function public.scan_claim(uuid) to authenticated;
create function public.scan_finish(p_scan_id uuid,p_token uuid,p_proposals jsonb,p_message text) returns jsonb language sql security definer set search_path='' as $$ select private.scan_finish_command(p_scan_id,p_token,p_proposals,p_message); $$;
alter function private.scan_finish_command(uuid,uuid,jsonb,text) owner to pantry_writer;
alter function public.scan_finish(uuid,uuid,jsonb,text) owner to pantry_executor;
revoke all on function private.scan_finish_command(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function private.scan_finish_command(uuid,uuid,jsonb,text) to pantry_executor;
revoke all on function public.scan_finish(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.scan_finish(uuid,uuid,jsonb,text) to authenticated;
create function public.scan_confirm(p_scan_id uuid,p_request jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.scan_confirm_command(p_scan_id,p_request); $$;
alter function private.scan_confirm_command(uuid,jsonb) owner to pantry_writer;
alter function public.scan_confirm(uuid,jsonb) owner to pantry_executor;
revoke all on function private.scan_confirm_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.scan_confirm_command(uuid,jsonb) to pantry_executor;
revoke all on function public.scan_confirm(uuid,jsonb) from public,anon;
grant execute on function public.scan_confirm(uuid,jsonb) to authenticated;
create function public.scan_prepare_delete(p_scan_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.scan_prepare_delete_command(p_scan_id); $$;
alter function private.scan_prepare_delete_command(uuid) owner to pantry_writer;
alter function public.scan_prepare_delete(uuid) owner to pantry_executor;
revoke all on function private.scan_prepare_delete_command(uuid) from public,anon,authenticated;
grant execute on function private.scan_prepare_delete_command(uuid) to pantry_executor;
revoke all on function public.scan_prepare_delete(uuid) from public,anon;
grant execute on function public.scan_prepare_delete(uuid) to authenticated;
create function public.scan_delete(p_scan_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.scan_delete_command(p_scan_id); $$;
alter function private.scan_delete_command(uuid) owner to pantry_writer;
alter function public.scan_delete(uuid) owner to pantry_executor;
revoke all on function private.scan_delete_command(uuid) from public,anon,authenticated;
grant execute on function private.scan_delete_command(uuid) to pantry_executor;
revoke all on function public.scan_delete(uuid) from public,anon;
grant execute on function public.scan_delete(uuid) to authenticated;
create function public.scan_upload_allowed(p_path text) returns boolean language sql security definer set search_path='' as $$ select private.scan_upload_allowed(p_path); $$;
alter function private.scan_upload_allowed(text) owner to pantry_writer;
alter function public.scan_upload_allowed(text) owner to pantry_executor;
revoke all on function private.scan_upload_allowed(text) from public,anon,authenticated;
grant execute on function private.scan_upload_allowed(text) to pantry_executor;
revoke all on function public.scan_upload_allowed(text) from public,anon;
grant execute on function public.scan_upload_allowed(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('grocery-scans','grocery-scans',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy grocery_scan_insert on storage.objects for insert to authenticated with check(bucket_id='grocery-scans' and public.scan_upload_allowed(name));
create policy grocery_scan_read on storage.objects for select to authenticated using(bucket_id='grocery-scans' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy grocery_scan_delete on storage.objects for delete to authenticated using(bucket_id='grocery-scans' and (storage.foldername(name))[1]=(select auth.uid())::text);

revoke all on function private.scan_json(private.scan_sessions) from public,anon,authenticated,pantry_executor;
grant execute on function private.scan_json(private.scan_sessions) to pantry_writer;

revoke create on schema private from pantry_writer;
revoke create on schema public from pantry_executor;
revoke pantry_writer,pantry_executor from postgres granted by postgres;
commit;



