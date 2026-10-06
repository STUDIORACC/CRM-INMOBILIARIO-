-- =============================================================================
-- Acceso solo para personal activo (defensa en profundidad)
--
-- Varias políticas permiten ver filas "propias" (assigned_to = auth.uid(), created_by = auth.uid())
-- o sin responsable. Sin esta capa, una cuenta autenticada que NO es personal activo (un usuario
-- desactivado cuyo JWT aún no expira, o una cuenta de Auth sin perfil) conservaría acceso parcial.
-- Las políticas RESTRICTIVE se combinan con AND con las permisivas: ninguna fila es accesible
-- si quien consulta no es un usuario activo del CRM.
-- =============================================================================
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
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff())',
      t || '_staff_only', t
    );
  end loop;
end
$$;
