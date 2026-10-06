import { likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import { LEAD_STAGES, PROPERTY_STATUSES, labelOf, type Currency } from "@/lib/domain/constants";
import { formatMoney } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/phone";

export type SearchKind = "lead" | "client" | "property" | "owner" | "opportunity" | "activity" | "task";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
}

const digits = (s: string) => s.replace(/\D/g, "");

/** Búsqueda global: leads, clientes, propiedades, propietarios, oportunidades, actividades y tareas. */
export async function globalSearch(db: Db, rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < 2) return [];
  const like = likePattern(q);
  const d = digits(q);
  const phoneLike = d.length >= 3 ? `%${d}%` : null;

  const [leads, clients, props, owners, opps, acts, tasks] = await Promise.all([
    db.query<{ id: string; full_name: string; phone: string | null; email: string | null; stage: string; code: string | null }>(
      `select l.id, l.full_name, l.phone, l.email, l.stage, p.code
         from public.leads l left join public.properties p on p.id = l.property_id
        where l.full_name ilike $1 or l.email ilike $1 or ($2::text is not null and l.phone_normalized like $2)
        order by l.created_at desc limit 6`,
      [like, phoneLike],
    ),
    db.query<{ id: string; full_name: string; phone: string | null; email: string | null; doc_number: string | null }>(
      `select c.id, c.full_name, c.phone, c.email, c.doc_number
         from public.clients c
        where c.full_name ilike $1 or c.email ilike $1 or c.doc_number ilike $1 or ($2::text is not null and c.phone_normalized like $2)
        order by c.created_at desc limit 6`,
      [like, phoneLike],
    ),
    db.query<{ id: string; code: string; title: string; address: string | null; district_label: string | null; price: number; currency: Currency; status: string; operation: string }>(
      `select p.id, p.code, p.title, p.address, d.label as district_label, p.price, p.currency, p.status, p.operation
         from public.properties p
         left join public.catalog_items d on d.catalog = 'district' and d.key = p.district
        where p.code ilike $1 or p.title ilike $1 or p.address ilike $1 or d.label ilike $1
        order by (p.code ilike $1) desc, p.created_at desc limit 6`,
      [like],
    ),
    db.query<{ id: string; full_name: string; phone: string | null; doc_number: string | null }>(
      `select o.id, o.full_name, o.phone, o.doc_number
         from public.owners o
        where o.full_name ilike $1 or o.doc_number ilike $1 or o.email ilike $1 or ($2::text is not null and public.normalize_phone(o.phone) like $2)
        order by o.full_name limit 5`,
      [like, phoneLike],
    ),
    db.query<{ id: string; party: string; code: string; title: string; stage_label: string; value: number; currency: Currency }>(
      `select o.id, coalesce(l.full_name, c.full_name) as party, p.code, p.title, s.label as stage_label, o.value, o.currency
         from public.opportunities o
         join public.properties p on p.id = o.property_id
         join public.pipeline_stages s on s.key = o.stage
         left join public.leads l on l.id = o.lead_id
         left join public.clients c on c.id = o.client_id
        where l.full_name ilike $1 or c.full_name ilike $1 or p.code ilike $1 or p.title ilike $1
        order by o.updated_at desc limit 5`,
      [like],
    ),
    db.query<{ id: string; title: string; body: string | null; type: string; lead_id: string | null; client_id: string | null; opportunity_id: string | null; property_id: string | null; party: string | null }>(
      `select a.id, a.title, a.body, a.type, a.lead_id, a.client_id, a.opportunity_id, a.property_id, coalesce(l.full_name, c.full_name) as party
         from public.activities a
         left join public.leads l on l.id = a.lead_id
         left join public.clients c on c.id = a.client_id
        where a.type <> 'system' and (a.title ilike $1 or a.body ilike $1)
        order by a.occurred_at desc limit 4`,
      [like],
    ),
    db.query<{ id: string; title: string; due_at: string; lead_id: string | null; client_id: string | null; opportunity_id: string | null }>(
      `select k.id, k.title, k.due_at, k.lead_id, k.client_id, k.opportunity_id
         from public.tasks k where k.status in ('pending', 'in_progress') and k.title ilike $1 order by k.due_at limit 3`,
      [like],
    ),
  ]);

  const hits: SearchHit[] = [];
  for (const r of leads) {
    hits.push({ kind: "lead", id: r.id, title: r.full_name, subtitle: [r.phone ? formatPhone(r.phone) : r.email, r.code ? `Interés: ${r.code}` : null].filter(Boolean).join(" · "), href: `/leads/${r.id}`, badge: `Lead · ${labelOf(LEAD_STAGES, r.stage)}` });
  }
  for (const r of clients) {
    hits.push({ kind: "client", id: r.id, title: r.full_name, subtitle: [r.phone ? formatPhone(r.phone) : r.email, r.doc_number ? `DNI/RUC ${r.doc_number}` : null].filter(Boolean).join(" · "), href: `/clients/${r.id}`, badge: "Cliente" });
  }
  for (const r of opps) {
    hits.push({ kind: "opportunity", id: r.id, title: `${r.party} → ${r.code}`, subtitle: `${r.title} · ${formatMoney(r.value, r.currency)}`, href: `/opportunities/${r.id}`, badge: `Oportunidad · ${r.stage_label}` });
  }
  for (const r of props) {
    hits.push({ kind: "property", id: r.id, title: `${r.code} · ${r.title}`, subtitle: [r.district_label, r.address, formatMoney(r.price, r.currency) + (r.operation === "rent" ? "/mes" : "")].filter(Boolean).join(" · "), href: `/properties/${r.id}`, badge: `Propiedad · ${labelOf(PROPERTY_STATUSES, r.status)}` });
  }
  for (const r of owners) {
    hits.push({ kind: "owner", id: r.id, title: r.full_name, subtitle: [r.doc_number, r.phone ? formatPhone(r.phone) : null].filter(Boolean).join(" · "), href: `/owners/${r.id}`, badge: "Propietario" });
  }
  for (const r of acts) {
    const href = r.lead_id ? `/leads/${r.lead_id}` : r.client_id ? `/clients/${r.client_id}` : r.opportunity_id ? `/opportunities/${r.opportunity_id}` : r.property_id ? `/properties/${r.property_id}` : "/activities";
    hits.push({ kind: "activity", id: r.id, title: r.title, subtitle: [r.party, r.body?.slice(0, 80)].filter(Boolean).join(" — "), href, badge: "Actividad" });
  }
  for (const r of tasks) {
    const href = r.lead_id ? `/leads/${r.lead_id}` : r.client_id ? `/clients/${r.client_id}` : r.opportunity_id ? `/opportunities/${r.opportunity_id}` : "/tasks";
    hits.push({ kind: "task", id: r.id, title: r.title, subtitle: "Tarea pendiente", href, badge: "Tarea" });
  }
  return hits;
}
