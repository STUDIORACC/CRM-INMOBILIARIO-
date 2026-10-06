-- =============================================================================
-- Datos de referencia (necesarios en toda instalación, con o sin demo)
-- =============================================================================

insert into public.roles (key, label, description) values
  ('admin',     'Administrador', 'Acceso total: configuración, usuarios, reportes y toda la operación comercial.'),
  ('manager',   'Gerente',       'Gestión comercial completa, métricas, reportes y equipo. Sin configuración del sistema.'),
  ('advisor',   'Asesor',        'Gestiona sus leads, clientes, oportunidades, visitas, tareas y propiedades propias.'),
  ('assistant', 'Asistente',     'Acceso operativo: registro de leads y clientes, agenda de visitas y tareas.');

insert into public.pipeline_stages (key, label, position, kind, default_probability, color) values
  ('new',             'Nuevo',                 1, 'open', 10,  '#94a3b8'),
  ('contacted',       'Contactado',            2, 'open', 10,  '#60a5fa'),
  ('qualified',       'Calificado',            3, 'open', 25,  '#818cf8'),
  ('interested',      'Interesado',            4, 'open', 25,  '#a78bfa'),
  ('visit_scheduled', 'Visita programada',     5, 'open', 50,  '#f59e0b'),
  ('visit_done',      'Visita realizada',      6, 'open', 50,  '#f97316'),
  ('negotiation',     'Negociación',           7, 'open', 75,  '#ec4899'),
  ('reserved',        'Reserva / separación',  8, 'open', 90,  '#14b8a6'),
  ('won',             'Cerrado ganado',        9, 'won', 100,  '#10b981'),
  ('lost',            'Cerrado perdido',      10, 'lost',  0,  '#ef4444');

insert into public.catalog_items (catalog, key, label, color, position) values
  ('lead_source', 'whatsapp',  'WhatsApp',             '#22c55e', 1),
  ('lead_source', 'web',       'Sitio web',            '#6366f1', 2),
  ('lead_source', 'facebook',  'Facebook',             '#3b82f6', 3),
  ('lead_source', 'instagram', 'Instagram',            '#ec4899', 4),
  ('lead_source', 'google',    'Google',               '#f59e0b', 5),
  ('lead_source', 'referral',  'Referidos',            '#14b8a6', 6),
  ('lead_source', 'portal',    'Portal inmobiliario',  '#8b5cf6', 7),
  ('lead_source', 'phone',     'Llamada',              '#64748b', 8),
  ('lead_source', 'walk_in',   'Visita presencial',    '#f97316', 9),

  ('loss_reason', 'price',          'Precio',                         null, 1),
  ('loss_reason', 'other_property', 'Encontró otra propiedad',       null, 2),
  ('loss_reason', 'no_financing',   'No obtuvo financiamiento',      null, 3),
  ('loss_reason', 'no_response',    'No respondió',                  null, 4),
  ('loss_reason', 'location',       'Ubicación',                     null, 5),
  ('loss_reason', 'features',       'Características',               null, 6),
  ('loss_reason', 'competition',    'Competencia',                   null, 7),
  ('loss_reason', 'postponed',      'Postergó la compra',            null, 8),
  ('loss_reason', 'other',          'Otro',                          null, 9),

  ('property_type', 'house',      'Casa',             null, 1),
  ('property_type', 'apartment',  'Departamento',     null, 2),
  ('property_type', 'office',     'Oficina',          null, 3),
  ('property_type', 'commercial', 'Local comercial',  null, 4),
  ('property_type', 'land',       'Terreno',          null, 5),
  ('property_type', 'project',    'Proyecto',         null, 6),

  ('district', 'miraflores',           'Miraflores',            null,  1),
  ('district', 'san_isidro',           'San Isidro',            null,  2),
  ('district', 'barranco',             'Barranco',              null,  3),
  ('district', 'surco',                'Santiago de Surco',     null,  4),
  ('district', 'la_molina',            'La Molina',             null,  5),
  ('district', 'san_borja',            'San Borja',             null,  6),
  ('district', 'surquillo',            'Surquillo',             null,  7),
  ('district', 'san_miguel',           'San Miguel',            null,  8),
  ('district', 'magdalena',            'Magdalena del Mar',     null,  9),
  ('district', 'pueblo_libre',         'Pueblo Libre',          null, 10),
  ('district', 'jesus_maria',          'Jesús María',           null, 11),
  ('district', 'lince',                'Lince',                 null, 12),
  ('district', 'brena',                'Breña',                 null, 13),
  ('district', 'cercado',              'Cercado de Lima',       null, 14),
  ('district', 'san_martin_de_porres', 'San Martín de Porres',  null, 15),
  ('district', 'los_olivos',           'Los Olivos',            null, 16),
  ('district', 'chorrillos',           'Chorrillos',            null, 17),
  ('district', 'ate',                  'Ate',                   null, 18),
  ('district', 'callao',               'Callao',                null, 19);

insert into public.company_settings (id, name, email, currency, usd_exchange_rate, notify_settings)
values (
  1,
  'Mi Inmobiliaria',
  null,
  'PEN',
  3.75,
  '{"new_lead_assigned": true, "follow_up_overdue": true, "visit_upcoming": true, "visit_cancelled": true, "opportunity_stalled": true, "task_overdue": true, "property_reserved": true, "new_client": true, "new_opportunity": true}'::jsonb
);

insert into public.message_templates (name, channel, category, subject, body) values
  ('Primer contacto', 'whatsapp', 'first_contact', null,
   'Hola {{nombre}}, soy {{asesor}} de {{empresa}}. Vi que consultaste por {{propiedad}}. ¿Te viene bien que conversemos unos minutos para entender qué estás buscando?'),
  ('Enviar propiedad', 'whatsapp', 'send_properties', null,
   'Hola {{nombre}}, te comparto la propiedad que conversamos: {{propiedad}} ({{codigo}}), {{precio}}. ¿Te gustaría coordinar una visita?'),
  ('Confirmar visita', 'whatsapp', 'confirm_visit', null,
   'Hola {{nombre}}, te escribo para confirmar la visita de {{fecha}} a las {{hora}} a {{propiedad}} en {{direccion}}. ¿Me confirmas por favor?'),
  ('Recordatorio de visita', 'whatsapp', 'remind_visit', null,
   'Hola {{nombre}}, te recuerdo que hoy tenemos la visita a {{propiedad}} a las {{hora}}. Quedo atento(a) a cualquier consulta.'),
  ('Seguimiento post visita', 'whatsapp', 'post_visit', null,
   'Hola {{nombre}}, gracias por visitar {{propiedad}}. ¿Qué te pareció? Si quieres, podemos revisar otras opciones o conversar sobre una propuesta.'),
  ('Seguimiento general', 'whatsapp', 'follow_up', null,
   'Hola {{nombre}}, ¿cómo estás? Te escribo para saber si sigues interesado(a) en {{propiedad}}. Cualquier duda, estoy a tu disposición.'),
  ('Reactivación de lead', 'whatsapp', 'reactivation', null,
   'Hola {{nombre}}, hace un tiempo conversamos sobre tu búsqueda de propiedad. Tenemos nuevas opciones que podrían interesarte. ¿Retomamos?'),
  ('Envío de ficha por correo', 'email', 'send_properties', 'Ficha de {{propiedad}} · {{empresa}}',
   'Hola {{nombre}},\n\nTe comparto la información de {{propiedad}} ({{codigo}}), ubicada en {{direccion}}, con un precio de {{precio}}.\n\nQuedo atento(a) para coordinar una visita.\n\nSaludos,\n{{asesor}}\n{{empresa}}');

insert into public.tags (name, color) values
  ('VIP', '#f59e0b'),
  ('Inversionista', '#6366f1'),
  ('Compra urgente', '#ef4444'),
  ('Alquiler', '#14b8a6'),
  ('Crédito hipotecario', '#3b82f6'),
  ('Cliente recurrente', '#10b981'),
  ('Surco', '#8b5cf6'),
  ('San Miguel', '#ec4899');

-- La carga inicial no es actividad de usuarios
delete from public.audit_logs;
