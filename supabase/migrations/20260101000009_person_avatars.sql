-- =============================================================================
-- Foto opcional de leads y clientes (los usuarios del equipo ya tenían avatar_url).
-- Cuando no hay foto la interfaz muestra las iniciales. Un lead convertido comparte
-- la foto de su cliente.
-- =============================================================================
alter table public.clients add column if not exists avatar_url text;
alter table public.leads   add column if not exists avatar_url text;
