-- PanelVerse library sync. Run once in the project's SQL Editor as postgres.
-- No credentials, destructive data migration, or public library access.
begin;

create or replace function public.panelverse_valid_series(value jsonb, series_id text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare n integer; total integer;
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  if not (value ?& array['id','title','publisher','status','lastRead','total','url','cover','notes','updatedAt']) then return false; end if;
  if (select count(*) from jsonb_object_keys(value)) <> 10 then return false; end if;
  if value->>'id' is distinct from series_id or series_id !~ '^[A-Za-z0-9_-]{1,100}$' then return false; end if;
  if jsonb_typeof(value->'title') <> 'string' or char_length(btrim(value->>'title')) not between 1 and 120 then return false; end if;
  if jsonb_typeof(value->'publisher') <> 'string' or char_length(value->>'publisher') > 60 then return false; end if;
  if jsonb_typeof(value->'status') <> 'string' or value->>'status' not in ('reading','pending','finished') then return false; end if;
  if jsonb_typeof(value->'lastRead') <> 'number' or value->>'lastRead' !~ '^\d{1,5}$' then return false; end if;
  n := (value->>'lastRead')::integer;
  if n not between 0 and 99999 then return false; end if;
  if value->'total' <> 'null'::jsonb then
    if jsonb_typeof(value->'total') <> 'number' or value->>'total' !~ '^\d{1,5}$' then return false; end if;
    total := (value->>'total')::integer;
    if total not between 1 and 99999 or total < n then return false; end if;
  end if;
  if jsonb_typeof(value->'url') <> 'string' or char_length(value->>'url') > 2048
    or value->>'url' !~ '^https?://[^/@?#[:space:]]+([/?#][^[:space:]]*)?$' then return false; end if;
  if jsonb_typeof(value->'cover') <> 'string' or char_length(value->>'cover') > 2048 then return false; end if;
  if value->>'cover' not in ('','./assets/superman.svg') and value->>'cover' !~ '^https?://[^/@?#[:space:]]+([/?#][^[:space:]]*)?$' then return false; end if;
  if jsonb_typeof(value->'notes') <> 'string' or char_length(value->>'notes') > 2000 then return false; end if;
  if jsonb_typeof(value->'updatedAt') <> 'string' or char_length(value->>'updatedAt') > 50 then return false; end if;
  perform (value->>'updatedAt')::timestamptz;
  return true;
exception when others then return false;
end $$;

create table if not exists public.panelverse_library (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  data jsonb,
  deleted boolean not null default false,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  operation_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id,id),
  constraint panelverse_library_valid_data check (
    (deleted and data is null) or (not deleted and public.panelverse_valid_series(data,id))
  )
);
alter table public.panelverse_library enable row level security;
drop policy if exists panelverse_library_read_own on public.panelverse_library;
create policy panelverse_library_read_own on public.panelverse_library for select to authenticated
  using ((select auth.uid()) = owner_id);
revoke all on table public.panelverse_library from public, anon, authenticated;
grant select on table public.panelverse_library to authenticated;

create or replace function public.panelverse_library_pull(expected_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := auth.uid(); result jsonb;
begin
  if owner is null or expected_owner is distinct from owner then raise exception 'Account mismatch' using errcode = '28000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'data',r.data,'deleted',r.deleted,
    'revision',r.revision,'operationId',r.operation_id) order by r.id),'[]'::jsonb)
    into result from public.panelverse_library r where r.owner_id = owner;
  return result;
end $$;

create or replace function public.panelverse_library_apply(mutations jsonb, expected_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid(); item jsonb; record public.panelverse_library%rowtype;
  result jsonb := '[]'::jsonb; series_id text; base_revision bigint; op uuid;
  is_deleted boolean; payload jsonb; outcome text; existed boolean;
begin
  if owner is null or expected_owner is distinct from owner then raise exception 'Account mismatch' using errcode = '28000'; end if;
  if jsonb_typeof(mutations) is distinct from 'array' or jsonb_array_length(mutations) > 100
    or octet_length(mutations::text) > 5000000 then
    raise exception 'Invalid batch' using errcode = '22023';
  end if;
  -- Serialize only this owner's writes. A revision comparison is done in the same transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,0));
  for item in select value from jsonb_array_elements(mutations) loop
    series_id := item->>'id';
    if series_id is null or series_id !~ '^[A-Za-z0-9_-]{1,100}$'
      or jsonb_typeof(item->'baseRevision') is distinct from 'number'
      or item->>'baseRevision' !~ '^\d{1,16}$'
      or jsonb_typeof(item->'deleted') is distinct from 'boolean' then
      raise exception 'Invalid mutation' using errcode = '22023';
    end if;
    base_revision := (item->>'baseRevision')::bigint;
    if base_revision > 9007199254740991 then raise exception 'Invalid revision' using errcode = '22023'; end if;
    op := (item->>'operationId')::uuid;
    if op is null then raise exception 'Missing operation' using errcode = '22023'; end if;
    is_deleted := (item->>'deleted')::boolean;
    payload := case when is_deleted then null else item->'data' end;
    if not is_deleted and not public.panelverse_valid_series(payload,series_id) then
      raise exception 'Invalid series' using errcode = '22023';
    end if;
    select r.* into record from public.panelverse_library r where r.owner_id = owner and r.id = series_id for update;
    existed := found;
    if existed and record.operation_id = op then
      outcome := 'applied';
    elsif (existed and record.revision <> base_revision) then
      outcome := 'conflict';
    elsif not existed and base_revision <> 0 then
      raise exception 'Missing cloud revision; no data overwritten' using errcode = '22023';
    else
      if not is_deleted and (not existed or record.deleted) and
        (select count(*) from public.panelverse_library r where r.owner_id=owner and not r.deleted) >= 2000 then
        raise exception 'Library limit: 2000 series' using errcode = '22023';
      end if;
      if not existed and (select count(*) from public.panelverse_library r where r.owner_id=owner) >= 10000 then
        raise exception 'Library history limit' using errcode = '22023';
      end if;
      insert into public.panelverse_library as target(owner_id,id,data,deleted,revision,operation_id,updated_at)
        values(owner,series_id,payload,is_deleted,1,op,now())
        on conflict (owner_id,id) do update set data=excluded.data,deleted=excluded.deleted,
          revision=target.revision+1,operation_id=excluded.operation_id,updated_at=now()
        returning * into record;
      outcome := 'applied';
    end if;
    result := result || jsonb_build_array(jsonb_build_object('id',series_id,'status',outcome,'record',
      jsonb_build_object('id',record.id,'data',record.data,'deleted',record.deleted,'revision',record.revision,'operationId',record.operation_id)));
  end loop;
  return result;
end $$;

revoke all on function public.panelverse_valid_series(jsonb,text) from public,anon,authenticated;
revoke all on function public.panelverse_library_pull(uuid) from public,anon,authenticated;
revoke all on function public.panelverse_library_apply(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.panelverse_library_pull(uuid) to authenticated;
grant execute on function public.panelverse_library_apply(jsonb,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
