-- =============================================================================
-- Notificaciones entre usuarios
--
-- INSERT ... ON CONFLICT exige que la fila nueva también cumpla la política de SELECT
-- (user_id = auth.uid()), por lo que un usuario no podía notificar a otro. Esta función
-- SECURITY DEFINER es el único camino para crear avisos dirigidos a terceros: solo personal
-- activo puede invocarla y respeta la deduplicación (user_id, dedupe_key).
-- =============================================================================
create or replace function public.push_notification(
  p_user_id     uuid,
  p_type        text,
  p_title       text,
  p_body        text default null,
  p_href        text default null,
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_dedupe_key  text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, href, entity_type, entity_id, dedupe_key)
  select p_user_id, p_type, p_title, p_body, p_href, p_entity_type, p_entity_id, p_dedupe_key
   where public.is_staff()
     and exists (select 1 from public.users u where u.id = p_user_id and u.status = 'active')
  on conflict (user_id, dedupe_key) do nothing;
$$;

revoke all on function public.push_notification(uuid, text, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.push_notification(uuid, text, text, text, text, text, uuid, text) to authenticated, service_role;
