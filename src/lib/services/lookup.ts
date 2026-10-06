import { likePattern } from "@/lib/db/builder";
import type { Db } from "@/lib/db/types";
import { formatMoney } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/phone";
import type { Currency } from "@/lib/domain/constants";

export interface LookupItem {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
  meta?: Record<string, string | number | null>;
}

export interface LookupParams {
  kind: "lead" | "client" | "party" | "property" | "owner";
  q?: string;
  id?: string;
  operation?: string;
  status?: string;
}

const digits = (s: string) => s.replace(/\D/g, "");

async function leads(db: Db, p: LookupParams, onlyUnconverted: boolean): Promise<LookupItem[]> {
  const q = (p.q ?? "").trim();
  const params: Array<string | null> = [];
  const where: string[] = [];
  if (p.id) {
    params.push(p.id);
    where.push(`l.id = $${params.length}::uuid`);
  }
  if (q) {
    params.push(likePattern(q));
    const t = `$${params.length}`;
    const d = digits(q);
    let cond = `l.full_name ilike ${t} or l.email ilike ${t}`;
    if (d.length >= 3) {
      params.push(`%${d}%`);
      cond += ` or l.phone_normalized like $${params.length}`;
    }
    where.push(`(${cond})`);
  }
  if (onlyUnconverted) where.push("l.client_id is null");
  const rows = await db.query<{ id: string; full_name: string; phone: string | null; email: string | null; stage: string }>(
    `select l.id, l.full_name, l.phone, l.email, l.stage from public.leads l ${where.length ? `where ${where.join(" and ")}` : ""} order by l.created_at desc limit 12`,
    params,
  );
  return rows.map((r) => ({ id: r.id, label: r.full_name, sublabel: [r.phone ? formatPhone(r.phone) : null, r.email].filter(Boolean).join(" · "), badge: "Lead" }));
}

async function clients(db: Db, p: LookupParams): Promise<LookupItem[]> {
  const q = (p.q ?? "").trim();
  const params: string[] = [];
  const where: string[] = [];
  if (p.id) {
    params.push(p.id);
    where.push(`c.id = $${params.length}::uuid`);
  }
  if (q) {
    params.push(likePattern(q));
    const t = `$${params.length}`;
    const d = digits(q);
    let cond = `c.full_name ilike ${t} or c.email ilike ${t} or c.doc_number ilike ${t}`;
    if (d.length >= 3) {
      params.push(`%${d}%`);
      cond += ` or c.phone_normalized like $${params.length}`;
    }
    where.push(`(${cond})`);
  }
  const rows = await db.query<{ id: string; full_name: string; phone: string | null; email: string | null }>(
    `select c.id, c.full_name, c.phone, c.email from public.clients c ${where.length ? `where ${where.join(" and ")}` : ""} order by c.created_at desc limit 12`,
    params,
  );
  return rows.map((r) => ({ id: r.id, label: r.full_name, sublabel: [r.phone ? formatPhone(r.phone) : null, r.email].filter(Boolean).join(" · "), badge: "Cliente" }));
}

export async function lookup(db: Db, p: LookupParams): Promise<LookupItem[]> {
  switch (p.kind) {
    case "lead":
      return leads(db, p, false);
    case "client":
      return clients(db, p);
    case "party": {
      if (p.id) {
        const [type, id] = p.id.split(":");
        const items = type === "client" ? await clients(db, { ...p, id }) : await leads(db, { ...p, id }, false);
        return items.map((i) => ({ ...i, id: p.id! }));
      }
      const [l, c] = await Promise.all([leads(db, p, true), clients(db, p)]);
      return [...c.map((i) => ({ ...i, id: `client:${i.id}` })), ...l.map((i) => ({ ...i, id: `lead:${i.id}` }))].slice(0, 14);
    }
    case "property": {
      const params: string[] = [];
      const where: string[] = [];
      if (p.id) {
        params.push(p.id);
        where.push(`p.id = $${params.length}::uuid`);
      }
      const q = (p.q ?? "").trim();
      if (q) {
        params.push(likePattern(q));
        where.push(`(p.code ilike $${params.length} or p.title ilike $${params.length} or p.address ilike $${params.length})`);
      }
      if (p.operation && ["sale", "rent"].includes(p.operation)) {
        params.push(p.operation);
        where.push(`p.operation = $${params.length}`);
      }
      if (p.status === "available") where.push("p.status in ('available', 'reserved')");
      const rows = await db.query<{ id: string; code: string; title: string; district: string; price: number; currency: Currency; status: string; operation: string }>(
        `select p.id, p.code, p.title, p.district, p.price, p.currency, p.status, p.operation
           from public.properties p ${where.length ? `where ${where.join(" and ")}` : ""}
          order by (p.status = 'available') desc, p.created_at desc limit 12`,
        params,
      );
      return rows.map((r) => ({
        id: r.id,
        label: `${r.code} · ${r.title}`,
        sublabel: `${formatMoney(r.price, r.currency)}${r.operation === "rent" ? " /mes" : ""}`,
        badge: r.status === "available" ? undefined : r.status === "reserved" ? "Reservada" : r.status,
        meta: { price: r.price, currency: r.currency, operation: r.operation },
      }));
    }
    case "owner": {
      const params: string[] = [];
      const where: string[] = [];
      if (p.id) {
        params.push(p.id);
        where.push(`o.id = $${params.length}::uuid`);
      }
      const q = (p.q ?? "").trim();
      if (q) {
        params.push(likePattern(q));
        where.push(`(o.full_name ilike $${params.length} or o.doc_number ilike $${params.length} or o.phone ilike $${params.length})`);
      }
      const rows = await db.query<{ id: string; full_name: string; phone: string | null; doc_number: string | null }>(
        `select o.id, o.full_name, o.phone, o.doc_number from public.owners o ${where.length ? `where ${where.join(" and ")}` : ""} order by o.full_name limit 12`,
        params,
      );
      return rows.map((r) => ({ id: r.id, label: r.full_name, sublabel: [r.doc_number, r.phone ? formatPhone(r.phone) : null].filter(Boolean).join(" · ") }));
    }
  }
}
