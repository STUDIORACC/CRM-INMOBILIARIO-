-- =============================================================================
-- Reglas de negocio en base de datos: funciones y triggers
-- Las reglas viven aquí para que se cumplan sin importar por dónde entre el dato
-- (app, importación, scripts).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'company_settings', 'owners', 'properties', 'clients', 'leads',
    'opportunities', 'visits', 'tasks', 'notes', 'message_templates', 'property_matches'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Auditoría genérica: quién, qué, cuándo
-- ---------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key     text;
  v_event   text := 'update';
  v_action  text;
  v_row     jsonb;
  v_label   text;
  v_ignored text[] := array[
    'updated_at', 'last_activity_at', 'score', 'temperature', 'stage_changed_at',
    'next_follow_up_at', 'next_follow_up_title', 'next_activity_at', 'next_activity_title',
    'first_contacted_at', 'phone_normalized', 'email_normalized', 'alerts_synced_at'
  ];
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_action := 'delete';
    v_event := 'delete';
    v_changes := jsonb_build_object('snapshot', v_row);
  elsif tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_action := 'create';
    v_event := 'create';
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;
    v_action := 'update';
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any (v_ignored)) and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(
          v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key)
        );
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new;
    end if;
    if v_changes ? 'stage' then v_event := 'stage_change';
    elsif v_changes ? 'assigned_to' or v_changes ? 'advisor_id' then v_event := 'assignment';
    elsif v_changes ? 'price' then v_event := 'price_change';
    elsif v_changes ? 'status' then v_event := 'status_change';
    end if;
  end if;

  v_label := coalesce(
    v_row ->> 'full_name',
    case when v_row ? 'code' then (v_row ->> 'code') || ' · ' || coalesce(v_row ->> 'title', '') end,
    v_row ->> 'title',
    v_row ->> 'name',
    v_row ->> 'label',
    v_row ->> 'key'
  );

  insert into public.audit_logs (user_id, entity_type, entity_id, entity_label, action, event, changes)
  values (
    auth.uid(),
    tg_table_name,
    case
      when (v_row ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (v_row ->> 'id')::uuid
    end,
    v_label,
    v_action,
    v_event,
    case when v_action = 'create' then null else v_changes end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'leads', 'clients', 'owners', 'properties', 'opportunities', 'visits', 'tasks',
    'users', 'company_settings', 'catalog_items', 'pipeline_stages'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Historial de etapas (leads y oportunidades)
-- ---------------------------------------------------------------------------
create or replace function public.track_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.stage_history (entity_type, entity_id, stage, entered_at, changed_by)
    values (tg_argv[0], new.id, new.stage, new.created_at, auth.uid());
  elsif new.stage is distinct from old.stage then
    update public.stage_history
       set exited_at = now()
     where entity_type = tg_argv[0] and entity_id = new.id and exited_at is null;
    insert into public.stage_history (entity_type, entity_id, stage, entered_at, changed_by)
    values (tg_argv[0], new.id, new.stage, now(), auth.uid());
  end if;
  return new;
end
$$;

create trigger leads_track_stage
  after insert or update of stage on public.leads
  for each row execute function public.track_stage('lead');

create trigger opportunities_track_stage
  after insert or update of stage on public.opportunities
  for each row execute function public.track_stage('opportunity');

-- ---------------------------------------------------------------------------
-- Leads: fecha de asignación
-- ---------------------------------------------------------------------------
create or replace function public.lead_rules()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_to is not null and new.assigned_at is null then
      new.assigned_at := now();
    end if;
  elsif new.assigned_to is distinct from old.assigned_to then
    if new.assigned_at is not distinct from old.assigned_at then
      new.assigned_at := case when new.assigned_to is null then null else now() end;
    end if;
  end if;
  return new;
end
$$;

create trigger leads_rules
  before insert or update on public.leads
  for each row execute function public.lead_rules();

-- ---------------------------------------------------------------------------
-- Oportunidades: cierre ganado / perdido
-- ---------------------------------------------------------------------------
create or replace function public.opportunity_rules()
returns trigger
language plpgsql
as $$
declare
  v_prob int;
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage
     and new.stage_changed_at is not distinct from old.stage_changed_at then
    new.stage_changed_at := now();
  end if;

  if new.stage = 'won' then
    new.probability := 100;
    new.won_at := coalesce(new.won_at, now());
    new.lost_at := null;
  elsif new.stage = 'lost' then
    new.probability := 0;
    new.lost_at := coalesce(new.lost_at, now());
    new.won_at := null;
  else
    if tg_op = 'UPDATE' and old.stage in ('won', 'lost') then
      -- Reabierta: limpia datos de cierre y restituye probabilidad de la etapa
      new.won_at := null;
      new.lost_at := null;
      new.lost_reason := null;
      new.lost_notes := null;
    end if;
    if new.probability in (0, 100) then
      select default_probability into v_prob from public.pipeline_stages where key = new.stage;
      new.probability := coalesce(v_prob, 10);
    end if;
  end if;
  return new;
end
$$;

create trigger opportunities_rules
  before insert or update on public.opportunities
  for each row execute function public.opportunity_rules();

-- Estado de la propiedad derivado de la oportunidad (reserva / cierre)
create or replace function public.sync_property_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop      uuid;
  v_stage     text;
  v_old_stage text;
  v_op        text;
  v_other     int;
begin
  if tg_op = 'DELETE' then
    v_prop := old.property_id; v_stage := null; v_old_stage := old.stage;
  elsif tg_op = 'INSERT' then
    v_prop := new.property_id; v_stage := new.stage; v_old_stage := null;
  else
    v_prop := new.property_id; v_stage := new.stage; v_old_stage := old.stage;
  end if;

  select operation into v_op from public.properties where id = v_prop;
  if v_op is null then return null; end if;

  if v_stage = 'won' then
    update public.properties
       set status = case when v_op = 'sale' then 'sold' else 'rented' end
     where id = v_prop and status not in ('sold', 'rented');
  elsif v_stage = 'reserved' then
    update public.properties set status = 'reserved' where id = v_prop and status = 'available';
  end if;

  if v_old_stage in ('reserved', 'won') and coalesce(v_stage, '') not in ('reserved', 'won') then
    select count(*) into v_other
      from public.opportunities
     where property_id = v_prop and stage in ('reserved', 'won') and id <> old.id;
    if v_other = 0 then
      update public.properties set status = 'available' where id = v_prop and status in ('reserved', 'sold', 'rented');
    end if;
  end if;
  return null;
end
$$;

create trigger opportunities_sync_property
  after insert or update of stage or delete on public.opportunities
  for each row execute function public.sync_property_status();

-- ---------------------------------------------------------------------------
-- Visitas y tareas: sellos de tiempo
-- ---------------------------------------------------------------------------
create or replace function public.visit_rules()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmed' and new.confirmed_at is null then new.confirmed_at := now(); end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end
$$;

create trigger visits_rules
  before insert or update on public.visits
  for each row execute function public.visit_rules();

create or replace function public.task_rules()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end
$$;

create trigger tasks_rules
  before insert or update on public.tasks
  for each row execute function public.task_rules();

-- ---------------------------------------------------------------------------
-- Propiedades: publicación e historial de precio
-- ---------------------------------------------------------------------------
create or replace function public.property_rules()
returns trigger
language plpgsql
as $$
begin
  if new.publication_status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end
$$;

create trigger properties_rules
  before insert or update on public.properties
  for each row execute function public.property_rules();

create or replace function public.track_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.property_price_history (property_id, old_price, new_price, currency, changed_by, changed_at)
    values (new.id, null, new.price, new.currency, auth.uid(), new.created_at);
  elsif new.price is distinct from old.price or new.currency is distinct from old.currency then
    insert into public.property_price_history (property_id, old_price, new_price, currency, changed_by)
    values (new.id, old.price, new.price, new.currency, auth.uid());
  end if;
  return null;
end
$$;

create trigger properties_track_price
  after insert or update of price, currency on public.properties
  for each row execute function public.track_price();

-- ---------------------------------------------------------------------------
-- Actividades: última actividad / primer contacto
-- ---------------------------------------------------------------------------
create or replace function public.on_activity_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'system' then
    return null;
  end if;

  if new.lead_id is not null then
    update public.leads
       set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at),
           first_contacted_at = case
             when first_contacted_at is null
                  and new.type in ('call', 'whatsapp', 'email')
                  and new.direction = 'outbound'
             then new.occurred_at
             else first_contacted_at end
     where id = new.lead_id;
  end if;
  if new.client_id is not null then
    update public.clients
       set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
     where id = new.client_id;
  end if;
  if new.opportunity_id is not null then
    update public.opportunities
       set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
     where id = new.opportunity_id;
  end if;
  return null;
end
$$;

create trigger activities_after_insert
  after insert on public.activities
  for each row execute function public.on_activity_insert();

-- ---------------------------------------------------------------------------
-- Próxima acción de leads y oportunidades (denormalizada para ordenar/filtrar)
-- ---------------------------------------------------------------------------
create or replace function public.refresh_lead_followup(p_lead uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at    timestamptz;
  v_title text;
begin
  select due_at, title into v_at, v_title
    from public.tasks
   where lead_id = p_lead and status in ('pending', 'in_progress')
   order by due_at asc
   limit 1;
  update public.leads
     set next_follow_up_at = v_at, next_follow_up_title = v_title
   where id = p_lead
     and (next_follow_up_at is distinct from v_at or next_follow_up_title is distinct from v_title);
end
$$;

create or replace function public.refresh_opportunity_next(p_opp uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t_at    timestamptz;
  t_title text;
  v_at    timestamptz;
  v_title text;
  r_at    timestamptz;
  r_title text;
begin
  select due_at, title into t_at, t_title
    from public.tasks
   where opportunity_id = p_opp and status in ('pending', 'in_progress')
   order by due_at asc
   limit 1;
  select v.scheduled_at, 'Visita · ' || p.code into v_at, v_title
    from public.visits v
    join public.properties p on p.id = v.property_id
   where v.opportunity_id = p_opp and v.status in ('scheduled', 'confirmed')
   order by v.scheduled_at asc
   limit 1;

  if t_at is not null and (v_at is null or t_at <= v_at) then
    r_at := t_at; r_title := t_title;
  else
    r_at := v_at; r_title := v_title;
  end if;

  update public.opportunities
     set next_activity_at = r_at, next_activity_title = r_title
   where id = p_opp
     and (next_activity_at is distinct from r_at or next_activity_title is distinct from r_title);
end
$$;

create or replace function public.on_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if new.lead_id is not null then perform public.refresh_lead_followup(new.lead_id); end if;
    if new.opportunity_id is not null then perform public.refresh_opportunity_next(new.opportunity_id); end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    if old.lead_id is not null and (tg_op = 'DELETE' or old.lead_id is distinct from new.lead_id) then
      perform public.refresh_lead_followup(old.lead_id);
    end if;
    if old.opportunity_id is not null and (tg_op = 'DELETE' or old.opportunity_id is distinct from new.opportunity_id) then
      perform public.refresh_opportunity_next(old.opportunity_id);
    end if;
  end if;
  return null;
end
$$;

create trigger tasks_after_change
  after insert or update or delete on public.tasks
  for each row execute function public.on_task_change();

create or replace function public.on_visit_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.opportunity_id is not null then
    perform public.refresh_opportunity_next(new.opportunity_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.opportunity_id is not null
     and (tg_op = 'DELETE' or old.opportunity_id is distinct from new.opportunity_id) then
    perform public.refresh_opportunity_next(old.opportunity_id);
  end if;
  return null;
end
$$;

create trigger visits_after_change
  after insert or update or delete on public.visits
  for each row execute function public.on_visit_change();
