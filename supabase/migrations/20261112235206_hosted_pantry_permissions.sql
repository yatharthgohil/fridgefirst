begin;

-- Hosted postgres cannot grant custom roles USAGE on Supabase's auth schema.
-- Read the same request claims as auth.uid(), without escalating privileges.
create function private.request_user_id() returns uuid
language sql stable security invoker set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;
revoke all on function private.request_user_id() from public, anon, authenticated, pantry_executor;
grant execute on function private.request_user_id() to pantry_writer;

grant pantry_writer to postgres with set true;
grant create on schema private to pantry_writer;

-- Keep the existing commands and their ACLs; change only their user-ID lookup.
do $$
declare signature text; definition text;
begin
  foreach signature in array array[
    'private.pantry_create_command(jsonb)',
    'private.pantry_update_command(uuid,jsonb)',
    'private.pantry_delete_command(uuid,jsonb)',
    'private.pantry_list_command()',
    'private.inventory_adjust_command(jsonb)',
    'private.inventory_history_command(integer)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('auth.uid()' in definition) = 0 then
      raise exception 'Expected auth.uid() lookup in %', signature;
    end if;
    execute replace(definition, 'auth.uid()', 'private.request_user_id()');
  end loop;
end $$;

revoke create on schema private from pantry_writer;
revoke pantry_writer from postgres granted by postgres;

commit;
