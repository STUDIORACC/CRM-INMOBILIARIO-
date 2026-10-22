# Altura CRM · CRM inmobiliario

CRM completo para **una inmobiliaria** (instalación por cliente, no SaaS): leads, pipeline de oportunidades con
tablero Kanban, clientes, propiedades, propietarios, visitas, calendario, tareas, actividades y auditoría, equipo
de vendedores, reportes con exportación, importación de leads, notificaciones y configuración.

- **Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, Auth, Storage, RLS)
  · React Hook Form + Zod · Recharts · @dnd-kit.
- **Seguridad:** autorización real en la base de datos con **Row Level Security** (la interfaz solo refleja lo que Postgres permite).
- **Datos de demostración:** ~300 leads, 100 propiedades, 190 oportunidades, visitas y tareas de una inmobiliaria ficticia de
  Lima (Altura Inmobiliaria). Todos los nombres, teléfonos y correos son inventados.

---

## 1. Probarlo en 1 minuto (modo demo)

No necesitas Supabase ni Docker. Sin variables de entorno la app levanta un **Postgres embebido (PGlite)** con el mismo
esquema, triggers y políticas RLS de producción, y carga los datos de ejemplo la primera vez.

```bash
npm install
npm run dev          # http://localhost:3000
```

Entra con cualquiera de los usuarios de la pantalla de login (contraseña `Demo2026!`):

| Rol | Usuario | Qué ve |
|---|---|---|
| Administradora | patricia.villanueva@altura.example | Todo, incluida configuración y usuarios |
| Gerente comercial | ricardo.paredes@altura.example | Todo el negocio, equipo, reportes y auditoría |
| Asesor | jose.lopez@altura.example | Solo sus leads, oportunidades, visitas y tareas |
| Asistente | daniela.quispe@altura.example | Leads y visitas de todos; sin oportunidades ni propietarios |

Los datos quedan en `.data/` (ignorado por git). `npm run demo:reset` (con el servidor detenido) vuelve al estado inicial.
En Vercel el modo demo corre en memoria: la primera visita tras un arranque en frío tarda unos segundos en sembrar los datos, y los cambios de los visitantes se pierden al reciclarse la instancia. Define `DEMO_SESSION_SECRET` en las variables de entorno.

---

## 2. Puesta en producción con Supabase

1. **Crea un proyecto en Supabase** y copia: URL, `anon key`, `service_role key` y la cadena de conexión
   (*Settings → Database → Connection string → Transaction pooler*, puerto 6543).
2. **Variables de entorno** (`.env.local` o panel de Vercel; ver `.env.example`):

   | Variable | Para qué |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Autenticación (cookies de sesión) |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor**: alta de usuarios y Storage |
   | `DATABASE_URL` | Conexión SQL (al definirla se desactiva el modo demo) |
   | `NEXT_PUBLIC_TIMEZONE`, `NEXT_PUBLIC_DEFAULT_COUNTRY_CODE` | `America/Lima`, `51` |
   | `CRON_SECRET` | Protege `/api/cron/alerts` (Vercel Cron la llama una vez al día, compatible con el plan Hobby; en Pro puedes usar `*/15 * * * *` en `vercel.json`) |

3. **Aplica las migraciones y crea el administrador:**

   ```bash
   npm run db:migrate
   npm run db:create-admin -- --email gerente@miinmobiliaria.pe --name "Nombre Apellido" --password "ClaveSegura123"
   ```

   Las migraciones viven en `supabase/migrations/` (también puedes pegarlas en el SQL Editor o usar `supabase db push`).
   Incluyen esquema, triggers, RLS, catálogos de referencia (etapas, fuentes, motivos de pérdida, 19 distritos de Lima, plantillas
   de WhatsApp) y la base de la empresa lista para editar en *Configuración*.
4. **Buckets de Storage** `crm-documents` (privado) y `crm-images` (público): `npm run db:seed -- --confirm` los crea; si no
   quieres datos de ejemplo créalos a mano desde el panel de Supabase.
5. **Despliega en Vercel**: importa el repositorio, carga las variables y listo. `vercel.json` ya programa el cron de alertas.
6. Datos de ejemplo en un entorno de pruebas (opcional): `npm run db:seed -- --confirm`. **Nunca** en producción con datos reales.

> Para una instalación nueva de un cliente: crear proyecto → migrar → `db:create-admin` → entrar a *Configuración*
> (empresa, tipo de cambio, fuentes, distritos, usuarios, plantillas) → importar sus leads desde Excel/CSV.

---

## 3. Qué incluye

| Módulo | Highlights |
|---|---|
| **Dashboard** | KPIs calculados desde la base (leads, pipeline, ponderado, visitas, conversión, tiempo de cierre), embudo, ranking, alertas accionables, tareas de hoy, filtro por vendedor y periodo. Vista propia para asesores. |
| **Leads** | Tabla con filtros/orden/paginación en servidor, puntaje 0–100 con desglose y temperatura, alertas (sin contactar, sin actividad, seguimiento vencido…), próxima acción sugerida, WhatsApp con plantillas, detección y fusión de duplicados, conversión a cliente, **importación CSV/Excel con revisión previa**. |
| **Oportunidades** | Kanban de 10 etapas con arrastrar y soltar (táctil y teclado), motivos de pérdida, probabilidad y pipeline ponderado, vista de tabla. |
| **Clientes · Propiedades · Propietarios** | Preferencias de búsqueda, **matching con % y razones**, galería, historial de precios, documentos, vínculos cruzados. |
| **Visitas · Calendario · Tareas** | Agenda con confirmación/reprogramación/resultado, conflictos de horario, calendario día/semana/mes, tareas con vencimiento y seguimiento. |
| **Actividades y auditoría** | Línea de tiempo del equipo y bitácora inmutable (quién cambió qué y cuándo) con diferencias campo por campo. |
| **Vendedores** | Ranking, tablero individual y comparativos. |
| **Reportes** | Comercial, vendedores, pipeline (tiempo por etapa, proyección), propiedades (estancadas) y seguimiento; **exportación CSV/Excel**. |
| **Configuración** | Empresa, catálogos y etapas, usuarios y roles, alertas, etiquetas y plantillas de mensajes. |

### Roles y permisos

| | Admin | Gerente | Asesor | Asistente |
|---|---|---|---|---|
| Ver todo el negocio | ✅ | ✅ | solo lo suyo | leads/visitas de todos |
| Oportunidades / propietarios | ✅ | ✅ | propias | ✖ |
| Equipo, reportes globales, auditoría | ✅ | ✅ | ✖ (reportes propios) | ✖ |
| Configuración y usuarios | ✅ | ✖ | ✖ | ✖ |

La matriz completa se ve en *Configuración → Usuarios y roles*.

---

## 4. Arquitectura

```
src/
  app/(app)/…          Pantallas (server components) + componentes cliente por módulo
  app/api/…            lookup, búsqueda global, notificaciones, export, media, documentos, cron, health
  actions/             Server actions (una por caso de uso): validan → autorizan → ejecutan en transacción
  lib/
    db/                Capa SQL con dos drivers (postgres.js ↔ PGlite). withUser() aplica RLS por transacción
    domain/            Reglas puras y testeables: scoring, matching, permisos, fechas, importación, auditoría…
    services/          Consultas y operaciones por módulo (leads, oportunidades, reportes, equipo…)
    validation/        Esquemas Zod compartidos entre formularios y servidor
    seed/              Simulador determinista de la inmobiliaria de ejemplo
  components/          UI (shadcn/ui), tablas, filtros, diálogos de acción rápida, gráficos
supabase/migrations/   Esquema, triggers, RLS y datos de referencia (fuente de verdad)
tests/                 unit/ (reglas puras) · integration/ (flujos completos contra Postgres real, con RLS)
```

**Decisiones clave**

- **RLS como única fuente de autorización de datos.** Cada operación corre en una transacción con
  `set local role authenticated` + los claims del usuario: Postgres decide qué filas existen para cada rol, tanto en
  Supabase como en modo demo. Una capa *restrictive* adicional (`…_staff_only`) niega todo a cuentas que no sean personal activo.
- **Reglas de negocio en la base** (triggers): auditoría genérica, historial de etapas, sincronización del estado de la
  propiedad (reservada/vendida/alquilada), historial de precios, último contacto y próximo seguimiento. Así valen para
  cualquier cliente de la base, no solo para esta UI.
- **Cifras siempre derivadas**: ningún KPI está escrito a mano; todo sale de consultas SQL parametrizadas por periodo y vendedor.
- **Alquileres valorizados a 12 meses** y tipo de cambio configurable para convertir soles/dólares en pipeline y reportes.
- **Zona horaria `America/Lima`** para fechas, periodos y calendario.
- **Alertas** se calculan con umbrales editables; un cron (`/api/cron/alerts`) y un sync oportunista generan notificaciones sin duplicarlas.

### Seguridad

- Contraseñas gestionadas por Supabase Auth (en demo, hash `scrypt` con sal). Cookies `httpOnly`.
- `service_role` solo se usa en servidor (alta de usuarios, Storage) y nunca llega al navegador.
- Validación con Zod en cliente **y** servidor; errores de base de datos traducidos a mensajes comprensibles.
- Exportaciones neutralizan inyección de fórmulas (`=`, `+`, `-`, `@`), respetan RLS y permisos por rol.
- Documentos privados: se sirven únicamente por `/api/documents/[id]`, tras autorizar con RLS.
- Cabeceras de seguridad (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) y límite de intentos de login.

### Escalabilidad

- Listados paginados, ordenados y filtrados **en el servidor** (índices por responsable, etapa, fecha y búsqueda).
- Búsqueda de duplicados y de teléfonos sobre columnas normalizadas e indexadas.
- Reportes agregados en SQL; para volúmenes muy grandes se pueden materializar vistas (ver `reports.ts`).
- Importaciones en lotes pequeños (100 filas) con una transacción por fila: un error no descarta el archivo.

---

## 5. Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` / `build` / `start` | Desarrollo y producción |
| `npm run typecheck` · `npm run lint` | Calidad estática |
| `npm test` | 101 pruebas: reglas puras + flujos completos contra Postgres con RLS |
| `npm run db:migrate` | Aplica migraciones pendientes (Supabase) |
| `npm run db:create-admin -- --email … --name … --password …` | Primer administrador |
| `npm run db:seed -- --confirm` | Datos ficticios en una base **de pruebas** |
| `npm run demo:reset` | Reinicia la base demo local |

### Pruebas

`tests/integration` ejecuta los flujos del negocio sobre un Postgres real en memoria (mismo esquema y RLS que producción):
lead → oportunidad → visita → cierre · cliente → preferencias → matching → visita · propietario → propiedad → publicar → lead → asignar ·
crear asesor → iniciar sesión → dashboard → gestionar leads; además permisos por rol, importación, reportes vs. consultas directas,
auditoría y exportación.

---

## 6. Límites conocidos y siguientes pasos

- La integración con WhatsApp es por enlace `wa.me` con plantillas (abre la conversación con el mensaje listo); no envía mensajes
  automáticos ni usa la API oficial de WhatsApp Business.
- Las imágenes de demostración son de Unsplash (se cargan por URL). En producción se suben a Supabase Storage.
- **Fotos de perfil:** en la demo, los asesores y unos 30 clientes tienen retratos de Unsplash (licencia Unsplash, hotlink a su CDN, recortados al rostro) elegidos por su aspecto latinoamericano; son personas reales ajenas al sistema que solo ilustran perfiles ficticios, y no implican origen ni nacionalidad alguna. Quien no tiene foto muestra sus iniciales. En una instalación real, `users.avatar_url`, `clients.avatar_url` y `leads.avatar_url` parten vacíos hasta cargar la foto verdadera de cada persona. Las fotos de demostración se definen en `src/lib/seed/avatars.ts`.
- Los datos ficticios usan nombres, teléfonos y correos inventados; los correos usan el dominio reservado `example`.
- Roadmap natural: integración con portales (Urbania/Adondevivir/Mercado Libre), firma y contratos, comisiones y liquidaciones,
  app móvil con notificaciones push, y vistas materializadas para reportes con cientos de miles de registros.
