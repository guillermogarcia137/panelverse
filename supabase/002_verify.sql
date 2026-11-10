-- Transactional verification. Synthetic users have no credentials and all test data is rolled back.
begin;
insert into auth.users(id,aud,role) values
  ('00000000-0000-4000-8000-0000000000a1','authenticated','authenticated'),
  ('00000000-0000-4000-8000-0000000000b2','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
do $$
declare data jsonb := '{"id":"pv-sync-test","title":"Prueba temporal","publisher":"Test","status":"pending","lastRead":0,"total":null,"url":"https://example.com/comic","cover":"","notes":"","updatedAt":"2026-11-10T12:00:00.000Z"}';
  mutation jsonb; result jsonb;
begin
  mutation := jsonb_build_object('id','pv-sync-test','baseRevision',0,'operationId','00000000-0000-4000-8000-000000000011','deleted',false,'data',data);
  result := public.panelverse_library_apply(jsonb_build_array(mutation),auth.uid());
  if result#>>'{0,status}' <> 'applied' or result#>>'{0,record,revision}' <> '1' then raise exception 'FAIL create'; end if;
  result := public.panelverse_library_apply(jsonb_build_array(mutation),auth.uid());
  if result#>>'{0,record,revision}' <> '1' then raise exception 'FAIL idempotency'; end if;
  result := public.panelverse_library_apply(jsonb_build_array(mutation||'{"operationId":"00000000-0000-4000-8000-000000000012"}'),auth.uid());
  if result#>>'{0,status}' <> 'conflict' then raise exception 'FAIL compare and swap'; end if;
  if jsonb_array_length(public.panelverse_library_pull(auth.uid())) <> 1 then raise exception 'FAIL owner pull'; end if;
  begin
    perform public.panelverse_library_apply(jsonb_build_array(mutation||jsonb_build_object('id','valid-before-bad','data',data||'{"id":"valid-before-bad"}'),mutation||jsonb_build_object('data',data||'{"status":null}')),auth.uid());
    raise exception 'FAIL invalid input accepted';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.panelverse_library where id='valid-before-bad') then raise exception 'FAIL batch atomicity'; end if;
  begin
    insert into public.panelverse_library(owner_id,id,data,deleted,revision,operation_id) values(auth.uid(),'bypass',data,false,1,'00000000-0000-4000-8000-000000000099');
    raise exception 'FAIL direct write allowed';
  exception when insufficient_privilege then null; end;
  result := public.panelverse_library_apply('[{"id":"pv-sync-test","baseRevision":1,"operationId":"00000000-0000-4000-8000-000000000013","deleted":true,"data":null}]',auth.uid());
  if result#>>'{0,record,deleted}' <> 'true' or result#>>'{0,record,revision}' <> '2' then raise exception 'FAIL delete'; end if;
  result := public.panelverse_library_apply(jsonb_build_array(mutation||'{"baseRevision":1,"operationId":"00000000-0000-4000-8000-000000000014"}'),auth.uid());
  if result#>>'{0,status}' <> 'conflict' or result#>>'{0,record,deleted}' <> 'true' then raise exception 'FAIL tombstone resurrection'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b2',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}',true);
do $$
declare result jsonb;
begin
  if jsonb_array_length(public.panelverse_library_pull(auth.uid())) <> 0 then raise exception 'FAIL RPC isolation'; end if;
  if (select count(*) from public.panelverse_library) <> 0 then raise exception 'FAIL RLS isolation'; end if;
  begin
    perform public.panelverse_library_pull('00000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL switched-account pull';
  exception when invalid_authorization_specification then null; end;
  begin
    perform public.panelverse_library_apply('[]','00000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL switched-account write';
  exception when invalid_authorization_specification then null; end;
  result := public.panelverse_library_apply('[{"owner_id":"00000000-0000-4000-8000-0000000000a1","id":"pv-sync-test","baseRevision":0,"operationId":"00000000-0000-4000-8000-000000000021","deleted":true,"data":null}]',auth.uid());
  if result#>>'{0,status}' <> 'applied' or result#>>'{0,record,revision}' <> '1' then raise exception 'FAIL owner spoof protection'; end if;
  if exists(select 1 from public.panelverse_library where owner_id <> auth.uid()) then raise exception 'FAIL RLS'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$ begin
  begin perform public.panelverse_library_pull(auth.uid()); raise exception 'FAIL anonymous RPC'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.panelverse_library; raise exception 'FAIL anonymous table'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: owner isolation, RLS, anonymous denial, write restrictions, revisions, retries, atomic batches and tombstones. Test data rolled back.' as verification;
