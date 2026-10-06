-- =============================================================================
-- CRM Inmobiliario · Esquema principal
-- Instalación independiente para UNA inmobiliaria (sin multitenancy).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' then return null; end if;
  if left(d, 2) = '00' then d := substr(d, 3); end if;
  -- Móvil peruano de 9 dígitos -> prefijo país 51
  if length(d) = 9 and left(d, 1) = '9' then d := '51' || d; end if;
  return d;
end
$$;

-- ---------------------------------------------------------------------------
-- Roles y usuarios (equipo de la inmobiliaria)
-- ---------------------------------------------------------------------------
create table public.roles (
  key         text primary key,
  label       text not null,
  description text not null default ''
);

create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (length(btrim(full_name)) >= 2),
  email       text not null unique,
  phone       text,
  avatar_url  text,
  role        text not null default 'advisor' references public.roles (key),
  status      text not null default 'active' check (status in ('active', 'inactive')),
  hired_at    date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index users_role_idx on public.users (role) where status = 'active';

-- ---------------------------------------------------------------------------
-- Configuración y catálogos
-- ---------------------------------------------------------------------------
create table public.company_settings (
  id                      int primary key default 1 check (id = 1),
  name                    text not null,
  legal_name              text,
  tax_id                  text,
  logo_url                text,
  phone                   text,
  email                   text,
  address                 text,
  website                 text,
  currency                text not null default 'PEN' check (currency in ('PEN', 'USD')),
  usd_exchange_rate       numeric(8, 4) not null default 3.75 check (usd_exchange_rate > 0),
  -- Umbrales de alertas
  alert_lead_idle_days    int not null default 5 check (alert_lead_idle_days > 0),
  alert_opportunity_days  int not null default 7 check (alert_opportunity_days > 0),
  alert_client_idle_days  int not null default 30 check (alert_client_idle_days > 0),
  alert_first_response_h  int not null default 2 check (alert_first_response_h > 0),
  -- Notificaciones activas
  notify_settings         jsonb not null default '{}'::jsonb,
  alerts_synced_at        timestamptz,
  updated_at              timestamptz not null default now()
);

create table public.catalog_items (
  id        uuid primary key default gen_random_uuid(),
  catalog   text not null check (catalog in ('lead_source', 'loss_reason', 'property_type', 'district')),
  key       text not null check (key ~ '^[a-z0-9_]+$'),
  label     text not null check (length(btrim(label)) > 0),
  color     text,
  position  int not null default 0,
  active    boolean not null default true,
  unique (catalog, key)
);

create table public.pipeline_stages (
  key                 text primary key,
  label               text not null,
  position            int not null,
  kind                text not null check (kind in ('open', 'won', 'lost')),
  default_probability int not null check (default_probability in (0, 10, 25, 50, 75, 90, 100)),
  color               text not null default '#64748b'
);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) > 0),
  color      text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create table public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  channel    text not null default 'whatsapp' check (channel in ('whatsapp', 'email')),
  category   text not null default 'general',
  subject    text,
  body       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Propietarios y propiedades
-- ---------------------------------------------------------------------------
create table public.owners (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (length(btrim(full_name)) >= 2),
  doc_type    text check (doc_type in ('dni', 'ruc', 'ce', 'passport')),
  doc_number  text,
  phone       text,
  email       text,
  address     text,
  owner_type  text not null default 'individual' check (owner_type in ('individual', 'company', 'joint')),
  notes       text,
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index owners_name_idx on public.owners (lower(full_name));
create index owners_doc_idx on public.owners (doc_number);

create table public.properties (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  title              text not null check (length(btrim(title)) >= 3),
  description        text,
  property_type      text not null,
  operation          text not null check (operation in ('sale', 'rent')),
  price              numeric(14, 2) not null check (price >= 0),
  currency           text not null default 'PEN' check (currency in ('PEN', 'USD')),
  min_price          numeric(14, 2) check (min_price is null or min_price >= 0),
  commission_pct     numeric(5, 2) check (commission_pct is null or commission_pct between 0 and 100),
  district           text not null,
  province           text not null default 'Lima',
  address            text,
  reference          text,
  latitude           numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude          numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  total_area         numeric(10, 2) check (total_area is null or total_area >= 0),
  built_area         numeric(10, 2) check (built_area is null or built_area >= 0),
  bedrooms           int check (bedrooms is null or bedrooms >= 0),
  bathrooms          int check (bathrooms is null or bathrooms >= 0),
  parking            int not null default 0 check (parking >= 0),
  age_years          int check (age_years is null or age_years >= 0),
  floor              int,
  elevator           boolean not null default false,
  furnished          boolean not null default false,
  features           text[] not null default '{}',
  status             text not null default 'available'
                       check (status in ('available', 'reserved', 'sold', 'rented', 'paused', 'withdrawn')),
  publication_status text not null default 'pending'
                       check (publication_status in ('published', 'pending', 'paused', 'withdrawn')),
  owner_id           uuid references public.owners (id) on delete set null,
  advisor_id         uuid references public.users (id) on delete set null,
  published_at       timestamptz,
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index properties_status_idx on public.properties (status);
create index properties_owner_idx on public.properties (owner_id);
create index properties_advisor_idx on public.properties (advisor_id);
create index properties_district_idx on public.properties (district);
create index properties_search_idx on public.properties (operation, property_type, price);

create table public.property_images (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  url          text not null,
  storage_path text,
  caption      text,
  position     int not null default 0,
  is_cover     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index property_images_property_idx on public.property_images (property_id, position);
create unique index property_images_one_cover on public.property_images (property_id) where is_cover;

create table public.property_price_history (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  old_price   numeric(14, 2),
  new_price   numeric(14, 2) not null,
  currency    text not null,
  changed_by  uuid references public.users (id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index price_history_property_idx on public.property_price_history (property_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null check (length(btrim(full_name)) >= 2),
  doc_type          text check (doc_type in ('dni', 'ruc', 'ce', 'passport')),
  doc_number        text,
  phone             text,
  phone_normalized  text generated always as (public.normalize_phone(phone)) stored,
  email             text,
  email_normalized  text generated always as (lower(btrim(email))) stored,
  address           text,
  source            text,
  status            text not null default 'active' check (status in ('active', 'inactive')),
  assigned_to       uuid references public.users (id) on delete set null,
  -- Preferencias de búsqueda (alimentan el matching)
  operation_type    text check (operation_type in ('buy', 'rent', 'sell', 'invest')),
  property_type     text,
  budget_min        numeric(14, 2) check (budget_min is null or budget_min >= 0),
  budget_max        numeric(14, 2) check (budget_max is null or budget_max >= 0),
  currency          text not null default 'PEN' check (currency in ('PEN', 'USD')),
  districts         text[] not null default '{}',
  bedrooms_min      int check (bedrooms_min is null or bedrooms_min >= 0),
  bathrooms_min     int check (bathrooms_min is null or bathrooms_min >= 0),
  area_min          numeric(10, 2) check (area_min is null or area_min >= 0),
  area_max          numeric(10, 2) check (area_max is null or area_max >= 0),
  financing         text check (financing in ('cash', 'mortgage', 'undecided')),
  purchase_date     date,
  search_notes      text,
  last_activity_at  timestamptz,
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint clients_budget_chk check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint clients_area_chk check (area_min is null or area_max is null or area_min <= area_max)
);
create index clients_assigned_idx on public.clients (assigned_to);
create index clients_phone_idx on public.clients (phone_normalized);
create index clients_email_idx on public.clients (email_normalized);
create index clients_name_idx on public.clients (lower(full_name));

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id                    uuid primary key default gen_random_uuid(),
  full_name             text not null check (length(btrim(full_name)) >= 2),
  phone                 text,
  phone_normalized      text generated always as (public.normalize_phone(phone)) stored,
  email                 text,
  email_normalized      text generated always as (lower(btrim(email))) stored,
  source                text not null default 'web',
  stage                 text not null default 'new'
                          check (stage in ('new', 'contacted', 'qualified', 'opportunity', 'visit', 'negotiation', 'won', 'lost')),
  priority              text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  score                 int not null default 0 check (score between 0 and 100),
  temperature           text generated always as (
                          case when score <= 30 then 'cold'
                               when score <= 60 then 'warm'
                               when score <= 80 then 'hot'
                               else 'very_hot' end
                        ) stored,
  assigned_to           uuid references public.users (id) on delete set null,
  assigned_at           timestamptz,
  property_id           uuid references public.properties (id) on delete set null,
  message               text,
  -- Calificación
  operation_type        text check (operation_type in ('buy', 'rent', 'sell', 'invest')),
  property_type         text,
  budget_min            numeric(14, 2) check (budget_min is null or budget_min >= 0),
  budget_max            numeric(14, 2) check (budget_max is null or budget_max >= 0),
  currency              text not null default 'PEN' check (currency in ('PEN', 'USD')),
  districts             text[] not null default '{}',
  bedrooms_min          int check (bedrooms_min is null or bedrooms_min >= 0),
  bathrooms_min         int check (bathrooms_min is null or bathrooms_min >= 0),
  area_min              numeric(10, 2) check (area_min is null or area_min >= 0),
  area_max              numeric(10, 2) check (area_max is null or area_max >= 0),
  purchase_date         date,
  financing             text check (financing in ('cash', 'mortgage', 'undecided')),
  interest_level        text check (interest_level in ('low', 'medium', 'high', 'urgent')),
  -- Seguimiento (mantenido por triggers)
  first_contacted_at    timestamptz,
  last_activity_at      timestamptz,
  next_follow_up_at     timestamptz,
  next_follow_up_title  text,
  -- Pérdida / conversión
  lost_reason           text,
  lost_notes            text,
  lost_at               timestamptz,
  client_id             uuid references public.clients (id) on delete set null,
  converted_at          timestamptz,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint leads_contact_chk check (phone is not null or email is not null),
  constraint leads_budget_chk check (budget_min is null or budget_max is null or budget_min <= budget_max),
  constraint leads_area_chk check (area_min is null or area_max is null or area_min <= area_max)
);
create index leads_assigned_idx on public.leads (assigned_to);
create index leads_stage_idx on public.leads (stage);
create index leads_created_idx on public.leads (created_at desc);
create index leads_followup_idx on public.leads (next_follow_up_at) where next_follow_up_at is not null;
create index leads_phone_idx on public.leads (phone_normalized);
create index leads_email_idx on public.leads (email_normalized);
create index leads_source_idx on public.leads (source);
create index leads_property_idx on public.leads (property_id);
create index leads_client_idx on public.leads (client_id);
create index leads_name_idx on public.leads (lower(full_name));
create index leads_districts_idx on public.leads using gin (districts);

create table public.lead_tags (
  lead_id uuid not null references public.leads (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  primary key (lead_id, tag_id)
);
create index lead_tags_tag_idx on public.lead_tags (tag_id);

create table public.client_tags (
  client_id uuid not null references public.clients (id) on delete cascade,
  tag_id    uuid not null references public.tags (id) on delete cascade,
  primary key (client_id, tag_id)
);
create index client_tags_tag_idx on public.client_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Oportunidades (pipeline)
-- ---------------------------------------------------------------------------
create table public.opportunities (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid references public.leads (id) on delete restrict,
  client_id            uuid references public.clients (id) on delete restrict,
  property_id          uuid not null references public.properties (id) on delete restrict,
  assigned_to          uuid not null references public.users (id) on delete restrict,
  stage                text not null default 'new' references public.pipeline_stages (key),
  value                numeric(14, 2) not null check (value >= 0),
  currency             text not null default 'PEN' check (currency in ('PEN', 'USD')),
  probability          int not null default 10 check (probability in (0, 10, 25, 50, 75, 90, 100)),
  priority             text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  operation            text not null default 'sale' check (operation in ('sale', 'rent')),
  expected_close_date  date,
  next_step            text,
  next_activity_at     timestamptz,
  next_activity_title  text,
  stage_changed_at     timestamptz not null default now(),
  last_activity_at     timestamptz,
  won_at               timestamptz,
  lost_at              timestamptz,
  lost_reason          text,
  lost_notes           text,
  created_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint opportunities_party_chk check (lead_id is not null or client_id is not null),
  constraint opportunities_closed_prob_chk check (
    (stage = 'won' and probability = 100) or (stage = 'lost' and probability = 0) or stage not in ('won', 'lost')
  ),
  constraint opportunities_lost_reason_chk check (stage <> 'lost' or lost_reason is not null)
);
create index opportunities_stage_idx on public.opportunities (stage);
create index opportunities_assigned_idx on public.opportunities (assigned_to);
create index opportunities_lead_idx on public.opportunities (lead_id);
create index opportunities_client_idx on public.opportunities (client_id);
create index opportunities_property_idx on public.opportunities (property_id);
create index opportunities_won_idx on public.opportunities (won_at) where won_at is not null;

-- ---------------------------------------------------------------------------
-- Visitas
-- ---------------------------------------------------------------------------
create table public.visits (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties (id) on delete cascade,
  lead_id          uuid references public.leads (id) on delete restrict,
  client_id        uuid references public.clients (id) on delete restrict,
  opportunity_id   uuid references public.opportunities (id) on delete set null,
  advisor_id       uuid not null references public.users (id) on delete restrict,
  scheduled_at     timestamptz not null,
  duration_min     int not null default 45 check (duration_min between 10 and 480),
  status           text not null default 'scheduled'
                     check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  outcome          text check (outcome in ('interested', 'very_interested', 'needs_time', 'not_interested', 'wants_other')),
  advisor_notes    text,
  observations     text,
  cancel_reason    text,
  rescheduled_from uuid references public.visits (id) on delete set null,
  confirmed_at     timestamptz,
  completed_at     timestamptz,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint visits_party_chk check (lead_id is not null or client_id is not null),
  constraint visits_outcome_chk check (status <> 'completed' or outcome is not null)
);
create index visits_property_idx on public.visits (property_id);
create index visits_advisor_date_idx on public.visits (advisor_id, scheduled_at);
create index visits_date_idx on public.visits (scheduled_at);
create index visits_lead_idx on public.visits (lead_id);
create index visits_client_idx on public.visits (client_id);
create index visits_opportunity_idx on public.visits (opportunity_id);

-- ---------------------------------------------------------------------------
-- Tareas
-- ---------------------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(btrim(title)) >= 3),
  description     text,
  kind            text not null default 'follow_up'
                    check (kind in ('call', 'whatsapp', 'meeting', 'visit', 'send_properties', 'follow_up', 'document', 'other')),
  assigned_to     uuid not null references public.users (id) on delete cascade,
  priority        text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  due_at          timestamptz not null,
  status          text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  completed_at    timestamptz,
  lead_id         uuid references public.leads (id) on delete cascade,
  client_id       uuid references public.clients (id) on delete cascade,
  opportunity_id  uuid references public.opportunities (id) on delete cascade,
  property_id     uuid references public.properties (id) on delete set null,
  visit_id        uuid references public.visits (id) on delete set null,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index tasks_assigned_status_idx on public.tasks (assigned_to, status, due_at);
create index tasks_due_idx on public.tasks (due_at) where status in ('pending', 'in_progress');
create index tasks_lead_idx on public.tasks (lead_id) where lead_id is not null;
create index tasks_client_idx on public.tasks (client_id) where client_id is not null;
create index tasks_opportunity_idx on public.tasks (opportunity_id) where opportunity_id is not null;

-- ---------------------------------------------------------------------------
-- Notas, actividades
-- ---------------------------------------------------------------------------
create table public.notes (
  id              uuid primary key default gen_random_uuid(),
  body            text not null check (length(btrim(body)) > 0),
  pinned          boolean not null default false,
  author_id       uuid references public.users (id) on delete set null,
  lead_id         uuid references public.leads (id) on delete cascade,
  client_id       uuid references public.clients (id) on delete cascade,
  opportunity_id  uuid references public.opportunities (id) on delete cascade,
  property_id     uuid references public.properties (id) on delete cascade,
  owner_id        uuid references public.owners (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint notes_parent_chk check (
    lead_id is not null or client_id is not null or opportunity_id is not null
    or property_id is not null or owner_id is not null
  )
);
create index notes_lead_idx on public.notes (lead_id) where lead_id is not null;
create index notes_client_idx on public.notes (client_id) where client_id is not null;
create index notes_opportunity_idx on public.notes (opportunity_id) where opportunity_id is not null;
create index notes_property_idx on public.notes (property_id) where property_id is not null;
create index notes_owner_idx on public.notes (owner_id) where owner_id is not null;

create table public.activities (
  id              uuid primary key default gen_random_uuid(),
  type            text not null
                    check (type in ('call', 'whatsapp', 'email', 'visit', 'meeting', 'note', 'task', 'follow_up', 'system')),
  event           text,
  title           text not null,
  body            text,
  direction       text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  responded       boolean,
  lead_id         uuid references public.leads (id) on delete cascade,
  client_id       uuid references public.clients (id) on delete cascade,
  opportunity_id  uuid references public.opportunities (id) on delete cascade,
  property_id     uuid references public.properties (id) on delete cascade,
  owner_id        uuid references public.owners (id) on delete cascade,
  visit_id        uuid references public.visits (id) on delete set null,
  note_id         uuid references public.notes (id) on delete set null,
  user_id         uuid references public.users (id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index activities_lead_idx on public.activities (lead_id, occurred_at desc) where lead_id is not null;
create index activities_client_idx on public.activities (client_id, occurred_at desc) where client_id is not null;
create index activities_opportunity_idx on public.activities (opportunity_id, occurred_at desc) where opportunity_id is not null;
create index activities_property_idx on public.activities (property_id, occurred_at desc) where property_id is not null;
create index activities_owner_idx on public.activities (owner_id, occurred_at desc) where owner_id is not null;
create index activities_user_idx on public.activities (user_id, occurred_at desc);
create index activities_occurred_idx on public.activities (occurred_at desc);
create index activities_type_idx on public.activities (type, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  type         text not null,
  title        text not null,
  body         text,
  href         text,
  entity_type  text,
  entity_id    uuid,
  dedupe_key   text,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Matching cliente/lead <-> propiedad (decisiones guardadas)
-- ---------------------------------------------------------------------------
create table public.property_matches (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  lead_id      uuid references public.leads (id) on delete cascade,
  client_id    uuid references public.clients (id) on delete cascade,
  score        int not null check (score between 0 and 100),
  reasons      jsonb not null default '[]'::jsonb,
  status       text not null default 'suggested' check (status in ('suggested', 'sent', 'visit_scheduled', 'discarded')),
  sent_at      timestamptz,
  created_by   uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint property_matches_party_chk check ((lead_id is not null) <> (client_id is not null))
);
create unique index property_matches_lead_uq on public.property_matches (property_id, lead_id) where lead_id is not null;
create unique index property_matches_client_uq on public.property_matches (property_id, client_id) where client_id is not null;

-- ---------------------------------------------------------------------------
-- Historial de etapas y auditoría
-- ---------------------------------------------------------------------------
create table public.stage_history (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('lead', 'opportunity')),
  entity_id    uuid not null,
  stage        text not null,
  entered_at   timestamptz not null default now(),
  exited_at    timestamptz,
  changed_by   uuid references public.users (id) on delete set null
);
create index stage_history_entity_idx on public.stage_history (entity_type, entity_id, entered_at);
create index stage_history_stage_idx on public.stage_history (entity_type, stage);

create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users (id) on delete set null,
  entity_type   text not null,
  entity_id     uuid,
  entity_label  text,
  action        text not null check (action in ('create', 'update', 'delete')),
  event         text not null default 'update',
  changes       jsonb,
  created_at    timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Documentos (metadatos; el archivo vive en Supabase Storage / disco en demo)
-- ---------------------------------------------------------------------------
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null default 'other'
                  check (category in ('identity', 'contract', 'deed', 'plans', 'valuation', 'financing', 'other')),
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint,
  owner_id      uuid references public.owners (id) on delete cascade,
  client_id     uuid references public.clients (id) on delete cascade,
  property_id   uuid references public.properties (id) on delete cascade,
  lead_id       uuid references public.leads (id) on delete cascade,
  uploaded_by   uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint documents_parent_chk check (
    owner_id is not null or client_id is not null or property_id is not null or lead_id is not null
  )
);
create index documents_owner_idx on public.documents (owner_id) where owner_id is not null;
create index documents_client_idx on public.documents (client_id) where client_id is not null;
create index documents_property_idx on public.documents (property_id) where property_id is not null;
create index documents_lead_idx on public.documents (lead_id) where lead_id is not null;
