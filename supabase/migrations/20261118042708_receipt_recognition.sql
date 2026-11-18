begin;
grant pantry_writer to postgres with set true;
grant create on schema private to pantry_writer;

alter table private.scan_sessions drop constraint scan_sessions_kind_check;
alter table private.scan_sessions add constraint scan_sessions_kind_check check (kind in ('grocery_photo','receipt'));

create or replace function private.scan_create_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.request_user_id(); s private.scan_sessions; i jsonb; manifest jsonb:='[]'; ordinal integer:=0; ext text; day_utc date:=(now() at time zone 'UTC')::date; usage private.scan_daily_usage;
begin
 if uid is null then return private.command_error('unauthorized','Authentication required'); end if;
 if jsonb_typeof(p_request) is distinct from 'object' or p_request - array['kind','images'] <> '{}' or (jsonb_typeof(p_request->'kind') is distinct from 'string' or p_request->>'kind' not in ('grocery_photo','receipt')) or jsonb_typeof(p_request->'images') is distinct from 'array' then return private.command_error('validation','Invalid scan request'); end if;
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

create or replace function private.scan_finish_command(p_scan_id uuid,p_token uuid,p_proposals jsonb,p_message text) returns jsonb
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
   if jsonb_typeof(p) is distinct from 'object' or not p ?& array['id','name','quantity','unit','storageLocation','confidence','imageIndex','warnings'] or p-array['id','name','quantity','unit','storageLocation','confidence','imageIndex','warnings','sourceText']<>'{}' then return private.command_error('validation','Invalid proposal'); end if;
   if p ? 'sourceText' then
    if s.kind<>'receipt' or jsonb_typeof(p->'sourceText') is distinct from 'string' or length(btrim(p->>'sourceText')) not between 1 and 200 then return private.command_error('validation','Invalid receipt evidence'); end if;
   end if;
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

revoke create on schema private from pantry_writer;
revoke pantry_writer from postgres granted by postgres;
commit;
