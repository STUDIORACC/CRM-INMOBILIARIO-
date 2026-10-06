-- =============================================================================
-- Detección de duplicados
-- Corre con SECURITY DEFINER: un asesor debe poder saber que un contacto ya existe
-- aunque pertenezca a otro vendedor (evita competencia interna por el mismo lead).
-- Solo devuelve datos mínimos de identificación.
-- =============================================================================
create or replace function public.find_duplicates(p_phone text, p_email text, p_exclude uuid default null)
returns table (
  kind          text,
  id            uuid,
  full_name     text,
  phone         text,
  email         text,
  stage         text,
  assigned_to   uuid,
  assigned_name text,
  created_at    timestamptz,
  phone_match   boolean,
  email_match   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select public.normalize_phone(p_phone) as ph, nullif(lower(btrim(coalesce(p_email, ''))), '') as em
  )
  select * from (
    select 'lead'::text as kind, l.id, l.full_name, l.phone, l.email, l.stage, l.assigned_to, u.full_name as assigned_name, l.created_at,
           (q.ph is not null and l.phone_normalized = q.ph) as phone_match,
           (q.em is not null and l.email_normalized = q.em) as email_match
      from public.leads l
      left join public.users u on u.id = l.assigned_to, q
     where (p_exclude is null or l.id <> p_exclude)
       and ((q.ph is not null and l.phone_normalized = q.ph) or (q.em is not null and l.email_normalized = q.em))
    union all
    select 'client'::text, c.id, c.full_name, c.phone, c.email, c.status, c.assigned_to, u.full_name, c.created_at,
           (q.ph is not null and c.phone_normalized = q.ph),
           (q.em is not null and c.email_normalized = q.em)
      from public.clients c
      left join public.users u on u.id = c.assigned_to, q
     where ((q.ph is not null and c.phone_normalized = q.ph) or (q.em is not null and c.email_normalized = q.em))
  ) d
  where public.is_staff()
  order by d.created_at desc
  limit 10
$$;

revoke all on function public.find_duplicates(text, text, uuid) from public, anon;
grant execute on function public.find_duplicates(text, text, uuid) to authenticated, service_role;
