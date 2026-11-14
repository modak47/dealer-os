-- Preserve preparation history; stop creating or editing work for retired stock.
begin;
create or replace function public.stock_preparation_active(p_status text, p_test boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select not coalesce(p_test, false) and
    lower(trim(regexp_replace(coalesce(p_status, ''), '[_-]+', ' ', 'g'))) not in
      ('sold','sale completed','completed','delivered','collected','archived','cancelled','canceled',
       'purchase cancelled','purchase canceled','deleted','purchase pending');
$$;

create or replace function public.stock_workflow_create_defaults(p_stock_bike_id text)
returns void language plpgsql security invoker set search_path = '' as $$
declare b public.stock_bikes%rowtype;
begin
  select * into b from public.stock_bikes where id::text = p_stock_bike_id for update;
  if not found or not public.stock_preparation_active(b.status, b.is_test_record) then return; end if;
  insert into public.stock_workflow_tasks(stock_bike_id,department,status,completed_at)
  select p_stock_bike_id, department,
    case when lower(coalesce(prep_status,'')) in ('completed','complete','pdi complete','done') then 'completed' else 'pending' end,
    case when lower(coalesce(prep_status,'')) in ('completed','complete','pdi complete','done') then now() else null end
  from (values
    ('Workshop Preparation',b.workshop_status),('Wash / Initial Valet',b.valeting_status),
    ('Final Valet',b.valeting_status),('Photos',b.photo_status)
  ) as defaults(department,prep_status)
  on conflict(stock_bike_id,department) do nothing;
end;
$$;

create or replace function public.stock_workflow_sync_preparation()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_status text; v_field text;
begin
  if new.department = 'Workshop Preparation' then v_field := 'workshop_status';
  elsif new.department = 'Photos' then v_field := 'photo_status';
  else v_field := 'valeting_status'; end if;
  if v_field = 'valeting_status' then
    select case when bool_or(status = 'blocked') then 'Blocked'
      when bool_and(status = 'completed') and count(*) = 2 then 'Completed'
      when bool_or(status in ('in_progress','completed')) then 'In Progress'
      else 'Not Started' end into v_status
    from public.stock_workflow_tasks
    where stock_bike_id = new.stock_bike_id and department in ('Wash / Initial Valet','Final Valet');
  else
    v_status := case new.status when 'completed' then 'Completed' when 'in_progress' then 'In Progress' when 'blocked' then 'Blocked' else 'Not Started' end;
  end if;
  if v_field = 'workshop_status' then
    update public.stock_bikes set workshop_status = case when v_status = 'Completed' and workshop_status = 'PDI complete' then 'PDI complete' else v_status end
    where id::text = new.stock_bike_id and public.stock_preparation_active(status,is_test_record);
  elsif v_field = 'photo_status' then
    update public.stock_bikes set photo_status = v_status
    where id::text = new.stock_bike_id and public.stock_preparation_active(status,is_test_record);
  else
    update public.stock_bikes set valeting_status = v_status
    where id::text = new.stock_bike_id and public.stock_preparation_active(status,is_test_record);
  end if;
  return new;
end;
$$;
drop trigger if exists sync_stock_preparation_status on public.stock_workflow_tasks;
create trigger sync_stock_preparation_status after update of status on public.stock_workflow_tasks
for each row when (old.status is distinct from new.status) execute function public.stock_workflow_sync_preparation();

create or replace function public.stock_workflow_update_task(
  p_task_id uuid, p_updates jsonb, p_user_id uuid, p_expected_updated_at timestamptz default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare t public.stock_workflow_tasks%rowtype; b public.stock_bikes%rowtype;
  v_stock_id text; v_status text; v_notes text; v_action text;
begin
  if not exists(select 1 from public.dealer_users where id = p_user_id and active and role = 'team_member') then
    raise exception 'Staff access required' using errcode = '42501';
  end if;
  select stock_bike_id into v_stock_id from public.stock_workflow_tasks where id = p_task_id;
  if not found then raise exception 'Workflow task not found' using errcode = 'P0002'; end if;
  -- Serialise sibling tasks and stock sale/preparation changes using the bike lock.
  select * into b from public.stock_bikes where id::text = v_stock_id for update;
  if not found then raise exception 'The linked stock record no longer exists. This task is read-only.' using errcode = '55000'; end if;
  if not public.stock_preparation_active(b.status,b.is_test_record) then
    raise exception 'This bike is no longer in active preparation. Refresh the board.' using errcode = '55000';
  end if;
  select * into t from public.stock_workflow_tasks where id = p_task_id for update;
  if not found then raise exception 'Workflow task not found' using errcode = 'P0002'; end if;
  if p_expected_updated_at is not null and t.updated_at <> p_expected_updated_at then
    raise exception 'This task changed since you opened it. Refresh before saving.' using errcode = '40001';
  end if;
  v_action := coalesce(p_updates->>'action','');
  v_status := case v_action when 'start' then 'in_progress' when 'complete' then 'completed'
    when 'block' then 'blocked' when 'reopen' then 'pending' else coalesce(p_updates->>'status',t.status) end;
  if v_action not in ('','start','complete','block','reopen') or v_status not in ('pending','in_progress','completed','blocked') then
    raise exception 'Unknown workflow action or status' using errcode = '22023';
  end if;
  if t.status = 'completed' and v_status not in ('completed','pending') then
    raise exception 'Reopen completed tasks before starting or blocking them.' using errcode = '22023';
  end if;
  v_notes := case when p_updates ? 'notes' then nullif(trim(p_updates->>'notes'),'') else t.notes end;
  if v_status = 'blocked' and nullif(trim(v_notes),'') is null then
    raise exception 'Add a note explaining why this task is blocked.' using errcode = '22023';
  end if;
  update public.stock_workflow_tasks set status = v_status, notes = v_notes,
    assigned_to = case when p_updates ? 'assigned_to' then nullif(trim(p_updates->>'assigned_to'),'') else t.assigned_to end,
    started_at = case when v_status = 'pending' then null when v_status in ('in_progress','completed') then coalesce(t.started_at,now()) else t.started_at end,
    completed_at = case when v_status = 'completed' then coalesce(t.completed_at,now()) else null end,
    completed_by = case when v_status = 'completed' then coalesce(t.completed_by,p_user_id::text) else null end
  where id = p_task_id returning * into t;
  return to_jsonb(t);
end;
$$;
revoke all on function public.stock_workflow_update_task(uuid,jsonb,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.stock_workflow_update_task(uuid,jsonb,uuid,timestamptz) to service_role;

create or replace function public.stock_workflow_finish_pdi(p_stock_bike_id text, p_user_id uuid, p_task_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_result jsonb;
begin
  -- The server calls this only after the PDI document has been stored successfully.
  if p_task_id is null then perform public.stock_workflow_create_defaults(p_stock_bike_id); end if;
  select id into v_id from public.stock_workflow_tasks
    where stock_bike_id = p_stock_bike_id and department = 'Workshop Preparation'
      and (p_task_id is null or id = p_task_id);
  if not found then raise exception 'Workshop task not found for this bike' using errcode = 'P0002'; end if;
  v_result := public.stock_workflow_update_task(v_id,'{"action":"complete"}'::jsonb,p_user_id);
  update public.stock_bikes set workshop_status = 'PDI complete' where id::text = p_stock_bike_id;
  return v_result;
end;
$$;
revoke all on function public.stock_workflow_finish_pdi(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.stock_workflow_finish_pdi(text,uuid,uuid) to service_role;
commit;
