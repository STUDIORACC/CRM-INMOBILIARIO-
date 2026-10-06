-- =============================================================================
-- Cierre ganado: las oportunidades abiertas de OTROS vendedores sobre la misma propiedad
-- también se cierran. La app lo intenta bajo RLS (solo ve las propias); este trigger SECURITY
-- DEFINER garantiza la regla para todos, sin importar quién cierre la operación.
-- =============================================================================
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

    -- La propiedad ya no está disponible: se cierran las demás oportunidades abiertas
    update public.opportunities
       set stage = 'lost',
           lost_reason = 'other_property',
           lost_notes = 'La propiedad se cerró con otro cliente.'
     where property_id = v_prop
       and id <> new.id
       and stage in (select key from public.pipeline_stages where kind = 'open');
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
