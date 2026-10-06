-- =============================================================================
-- Seguridad: Row Level Security
--
-- Modelo de roles (public.users.role):
--   admin      acceso total
--   manager    todo lo comercial, métricas y equipo (sin configuración)
--   advisor    sus leads/clientes/oportunidades/visitas/tareas; ve todas las propiedades
--   assistant  operativo: leads, clientes, visitas, tareas; sin oportunidades ni propietarios
--
-- La app ejecuta cada request bajo el rol `authenticated` con los claims del JWT,
-- por lo que estas políticas son la barrera real de datos.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Funciones auxiliares (SECURITY DEFINER para evitar recursión de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and status = 'active')
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
     where id = auth.uid() and status = 'active' and role in ('admin', 'manager')
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and status = 'active' and role = 'admin'
  )
$$;

-- Visibilidad heredada del registro "principal" al que se asocia un dato.
-- SECURITY INVOKER: respeta las políticas de la tabla padre para el usuario actual.
create or replace function public.can_see_parent(
  p_lead uuid, p_client uuid, p_opp uuid, p_property uuid, p_owner uuid
)
returns boolean
language sql
stable
as $$
  select case
    when p_lead is not null then exists (select 1 from public.leads where id = p_lead)
    when p_client is not null then exists (select 1 from public.clients where id = p_client)
    when p_opp is not null then exists (select 1 from public.opportunities where id = p_opp)
    when p_property is not null then exists (select 1 from public.properties where id = p_property)
    when p_owner is not null then exists (select 1 from public.owners where id = p_owner)
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- Habilitar RLS en todas las tablas
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'roles', 'users', 'company_settings', 'catalog_items', 'pipeline_stages', 'tags',
    'message_templates', 'owners', 'properties', 'property_images', 'property_price_history',
    'clients', 'leads', 'lead_tags', 'client_tags', 'opportunities', 'visits', 'tasks',
    'notes', 'activities', 'notifications', 'property_matches', 'stage_history',
    'audit_logs', 'documents'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Usuarios, configuración y catálogos
-- ---------------------------------------------------------------------------
create policy roles_select on public.roles for select to authenticated using (public.is_staff());

create policy users_select on public.users for select to authenticated using (public.is_staff());
create policy users_insert on public.users for insert to authenticated with check (public.is_admin());
create policy users_update on public.users for update to authenticated
  using (public.is_admin() or id = auth.uid())
  with check (public.is_admin() or (id = auth.uid() and role = public.app_role()));
create policy users_delete on public.users for delete to authenticated using (public.is_admin());

create policy company_select on public.company_settings for select to authenticated using (public.is_staff());
create policy company_update on public.company_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy catalog_select on public.catalog_items for select to authenticated using (public.is_staff());
create policy catalog_insert on public.catalog_items for insert to authenticated with check (public.is_admin());
create policy catalog_update on public.catalog_items for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy catalog_delete on public.catalog_items for delete to authenticated using (public.is_admin());

create policy stages_select on public.pipeline_stages for select to authenticated using (public.is_staff());
create policy stages_update on public.pipeline_stages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy tags_select on public.tags for select to authenticated using (public.is_staff());
create policy tags_insert on public.tags for insert to authenticated with check (public.is_staff());
create policy tags_update on public.tags for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy tags_delete on public.tags for delete to authenticated using (public.is_manager());

create policy templates_select on public.message_templates for select to authenticated using (public.is_staff());
create policy templates_insert on public.message_templates for insert to authenticated with check (public.is_manager());
create policy templates_update on public.message_templates for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy templates_delete on public.message_templates for delete to authenticated using (public.is_manager());

-- ---------------------------------------------------------------------------
-- Propietarios
-- ---------------------------------------------------------------------------
create policy owners_select on public.owners for select to authenticated using (
  public.is_manager()
  or created_by = auth.uid()
  or exists (select 1 from public.properties p where p.owner_id = owners.id and p.advisor_id = auth.uid())
);
create policy owners_insert on public.owners for insert to authenticated
  with check (public.app_role() in ('admin', 'manager', 'advisor'));
create policy owners_update on public.owners for update to authenticated
  using (
    public.is_manager()
    or created_by = auth.uid()
    or exists (select 1 from public.properties p where p.owner_id = owners.id and p.advisor_id = auth.uid())
  )
  with check (
    public.is_manager()
    or created_by = auth.uid()
    or exists (select 1 from public.properties p where p.owner_id = owners.id and p.advisor_id = auth.uid())
  );
create policy owners_delete on public.owners for delete to authenticated using (public.is_manager());

-- ---------------------------------------------------------------------------
-- Propiedades
-- ---------------------------------------------------------------------------
create policy properties_select on public.properties for select to authenticated using (public.is_staff());
create policy properties_insert on public.properties for insert to authenticated
  with check (public.is_manager() or (public.app_role() = 'advisor' and advisor_id = auth.uid()));
create policy properties_update on public.properties for update to authenticated
  using (public.is_manager() or (public.app_role() = 'advisor' and advisor_id = auth.uid()))
  with check (public.is_manager() or (public.app_role() = 'advisor' and advisor_id = auth.uid()));
create policy properties_delete on public.properties for delete to authenticated using (public.is_manager());

create policy property_images_select on public.property_images for select to authenticated using (public.is_staff());
create policy property_images_write on public.property_images for all to authenticated
  using (
    public.is_manager()
    or exists (select 1 from public.properties p
                where p.id = property_images.property_id and p.advisor_id = auth.uid() and public.app_role() = 'advisor')
  )
  with check (
    public.is_manager()
    or exists (select 1 from public.properties p
                where p.id = property_images.property_id and p.advisor_id = auth.uid() and public.app_role() = 'advisor')
  );

create policy price_history_select on public.property_price_history for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Clientes y leads (los no asignados forman un "pool" visible para tomar)
-- ---------------------------------------------------------------------------
create policy clients_select on public.clients for select to authenticated using (
  public.is_manager() or public.app_role() = 'assistant'
  or assigned_to = auth.uid() or assigned_to is null or created_by = auth.uid()
);
create policy clients_insert on public.clients for insert to authenticated with check (
  public.is_manager() or public.app_role() = 'assistant'
  or (public.app_role() = 'advisor' and (assigned_to = auth.uid() or assigned_to is null))
);
create policy clients_update on public.clients for update to authenticated
  using (
    public.is_manager() or public.app_role() = 'assistant'
    or assigned_to = auth.uid() or assigned_to is null or created_by = auth.uid()
  )
  with check (
    public.is_manager() or public.app_role() = 'assistant'
    or assigned_to = auth.uid() or assigned_to is null
  );
create policy clients_delete on public.clients for delete to authenticated using (public.is_manager());

create policy leads_select on public.leads for select to authenticated using (
  public.is_manager() or public.app_role() = 'assistant'
  or assigned_to = auth.uid() or assigned_to is null or created_by = auth.uid()
);
create policy leads_insert on public.leads for insert to authenticated with check (
  public.is_manager() or public.app_role() = 'assistant'
  or (public.app_role() = 'advisor' and (assigned_to = auth.uid() or assigned_to is null))
);
create policy leads_update on public.leads for update to authenticated
  using (
    public.is_manager() or public.app_role() = 'assistant'
    or assigned_to = auth.uid() or assigned_to is null or created_by = auth.uid()
  )
  with check (
    public.is_manager() or public.app_role() = 'assistant'
    or assigned_to = auth.uid() or assigned_to is null
  );
create policy leads_delete on public.leads for delete to authenticated using (public.is_manager());

create policy lead_tags_all on public.lead_tags for all to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_tags.lead_id))
  with check (exists (select 1 from public.leads l where l.id = lead_tags.lead_id));

create policy client_tags_all on public.client_tags for all to authenticated
  using (exists (select 1 from public.clients c where c.id = client_tags.client_id))
  with check (exists (select 1 from public.clients c where c.id = client_tags.client_id));

-- ---------------------------------------------------------------------------
-- Oportunidades (no visibles para asistentes)
-- ---------------------------------------------------------------------------
create policy opportunities_select on public.opportunities for select to authenticated
  using (public.is_manager() or (public.app_role() = 'advisor' and assigned_to = auth.uid()));
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check (public.is_manager() or (public.app_role() = 'advisor' and assigned_to = auth.uid()));
create policy opportunities_update on public.opportunities for update to authenticated
  using (public.is_manager() or (public.app_role() = 'advisor' and assigned_to = auth.uid()))
  with check (public.is_manager() or (public.app_role() = 'advisor' and assigned_to = auth.uid()));
create policy opportunities_delete on public.opportunities for delete to authenticated using (public.is_manager());

-- ---------------------------------------------------------------------------
-- Visitas y tareas
-- ---------------------------------------------------------------------------
create policy visits_select on public.visits for select to authenticated using (
  public.is_manager() or public.app_role() = 'assistant'
  or advisor_id = auth.uid() or created_by = auth.uid()
);
create policy visits_insert on public.visits for insert to authenticated with check (
  public.is_manager() or public.app_role() = 'assistant'
  or (public.app_role() = 'advisor' and advisor_id = auth.uid())
);
create policy visits_update on public.visits for update to authenticated
  using (public.is_manager() or public.app_role() = 'assistant' or advisor_id = auth.uid())
  with check (
    public.is_manager() or public.app_role() = 'assistant'
    or (public.app_role() = 'advisor' and advisor_id = auth.uid())
  );
create policy visits_delete on public.visits for delete to authenticated using (public.is_manager());

create policy tasks_select on public.tasks for select to authenticated using (
  public.is_manager() or public.app_role() = 'assistant'
  or assigned_to = auth.uid() or created_by = auth.uid()
);
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_staff() and (created_by = auth.uid() or public.is_manager()));
create policy tasks_update on public.tasks for update to authenticated
  using (
    public.is_manager() or public.app_role() = 'assistant'
    or assigned_to = auth.uid() or created_by = auth.uid()
  )
  with check (public.is_staff());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_manager() or created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Notas, actividades, documentos, matching
-- ---------------------------------------------------------------------------
create policy notes_select on public.notes for select to authenticated using (
  public.is_manager() or author_id = auth.uid()
  or public.can_see_parent(lead_id, client_id, opportunity_id, property_id, owner_id)
);
create policy notes_insert on public.notes for insert to authenticated with check (
  public.is_staff() and author_id = auth.uid()
  and public.can_see_parent(lead_id, client_id, opportunity_id, property_id, owner_id)
);
create policy notes_update on public.notes for update to authenticated
  using (public.is_manager() or author_id = auth.uid())
  with check (public.is_manager() or author_id = auth.uid());
create policy notes_delete on public.notes for delete to authenticated
  using (public.is_manager() or author_id = auth.uid());

create policy activities_select on public.activities for select to authenticated using (
  public.is_manager() or user_id = auth.uid()
  or public.can_see_parent(lead_id, client_id, opportunity_id, property_id, owner_id)
);
create policy activities_insert on public.activities for insert to authenticated with check (
  public.is_staff() and user_id = auth.uid()
  and (public.is_manager() or public.can_see_parent(lead_id, client_id, opportunity_id, property_id, owner_id))
);
create policy activities_update on public.activities for update to authenticated
  using (public.is_manager() or user_id = auth.uid())
  with check (public.is_manager() or user_id = auth.uid());
create policy activities_delete on public.activities for delete to authenticated
  using (public.is_manager() or user_id = auth.uid());

create policy documents_select on public.documents for select to authenticated using (
  public.is_manager() or public.can_see_parent(lead_id, client_id, null, property_id, owner_id)
);
create policy documents_insert on public.documents for insert to authenticated with check (
  public.is_staff() and uploaded_by = auth.uid()
  and (public.is_manager() or public.can_see_parent(lead_id, client_id, null, property_id, owner_id))
);
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_manager() or uploaded_by = auth.uid());

create policy matches_all on public.property_matches for all to authenticated
  using (public.is_manager() or public.can_see_parent(lead_id, client_id, null, null, null))
  with check (public.is_manager() or public.can_see_parent(lead_id, client_id, null, null, null));

-- ---------------------------------------------------------------------------
-- Notificaciones (personales)
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated with check (public.is_staff());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Historial y auditoría (solo lectura; se escriben desde triggers SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create policy stage_history_select on public.stage_history for select to authenticated using (public.is_staff());
create policy audit_select on public.audit_logs for select to authenticated using (public.is_manager());

-- ---------------------------------------------------------------------------
-- Privilegios: el rol anónimo no accede a nada; los usuarios autenticados pasan por RLS
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- La auditoría y el historial son inmutables para los usuarios finales
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.stage_history from authenticated;
revoke insert, update, delete on public.property_price_history from authenticated;
revoke insert, update, delete on public.roles from authenticated;
