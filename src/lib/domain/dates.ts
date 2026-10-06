import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, differenceInCalendarDays, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { formatDistanceToNowStrict } from "date-fns";

export const APP_TZ = process.env.NEXT_PUBLIC_TIMEZONE ?? "America/Lima";
export const APP_LOCALE = "es-PE";

/** Fecha/hora "de pared" en la zona horaria de la inmobiliaria. */
export function tz(value: Date | string | number = new Date()): TZDate {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return new TZDate(ms, APP_TZ);
}

// --- Formato -----------------------------------------------------------------
const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TZ, ...opts });
    cache.set(key, f);
  }
  return f;
}

type DateLike = string | Date | null | undefined;
const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

function wrap(v: DateLike, f: (d: Date) => string): string {
  if (!v) return "—";
  const d = toDate(v);
  return Number.isNaN(d.getTime()) ? "—" : f(d);
}

/** "6 oct 2026" */
export const fmtDate = (v: DateLike) =>
  wrap(v, (d) => dtf("date", { day: "numeric", month: "short", year: "numeric" }).format(d).replace(/\./g, ""));

/** "6 oct" */
export const fmtDateShort = (v: DateLike) =>
  wrap(v, (d) => dtf("dshort", { day: "numeric", month: "short" }).format(d).replace(/\./g, ""));

/** "4:00 p. m." */
export const fmtTime = (v: DateLike) => wrap(v, (d) => dtf("time", { hour: "numeric", minute: "2-digit", hour12: true }).format(d));

/** "6 oct, 4:00 p. m." */
export const fmtDateTime = (v: DateLike) => wrap(v, (d) => `${fmtDateShort(d)}, ${fmtTime(d)}`);

/** "6 oct 2026, 4:00 p. m." */
export const fmtDateTimeFull = (v: DateLike) =>
  wrap(v, (d) => `${fmtDate(d)}, ${fmtTime(d)}`);

/** "martes 6 de octubre" */
export const fmtLongDate = (v: DateLike) =>
  wrap(v, (d) => dtf("long", { weekday: "long", day: "numeric", month: "long" }).format(d));

export const fmtMonthYear = (v: DateLike) => wrap(v, (d) => dtf("my", { month: "long", year: "numeric" }).format(d));

/** "hace 3 días" / "en 2 horas" */
export function fmtRelative(v: DateLike, now: Date = new Date()): string {
  if (!v) return "—";
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return "—";
  if (Math.abs(d.getTime() - now.getTime()) < 60_000) return "ahora";
  return formatDistanceToNowStrict(d, { locale: es, addSuffix: true });
}

/** Hoy / Mañana / Ayer / "mar 6 oct" */
export function dayLabel(v: DateLike, now: Date = new Date()): string {
  if (!v) return "—";
  const diff = differenceInCalendarDays(tz(v), tz(now));
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return wrap(v, (d) => dtf("dlabel", { weekday: "short", day: "numeric", month: "short" }).format(d).replace(/\./g, ""));
}

export function daysSince(v: DateLike, now: Date = new Date()): number | null {
  if (!v) return null;
  return Math.floor((now.getTime() - toDate(v).getTime()) / 86_400_000);
}

// --- Entradas de formulario (datetime-local) ----------------------------------
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO -> "YYYY-MM-DDTHH:mm" en la zona de la empresa. */
export function toInputDateTime(v: DateLike): string {
  if (!v) return "";
  const d = tz(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toInputDate(v: DateLike): string {
  if (!v) return "";
  const d = tz(v);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DDTHH:mm" (hora de la empresa) -> ISO UTC. */
export function fromInputDateTime(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new TZDate(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, APP_TZ);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime()).toISOString();
}

/** Fecha 'YYYY-MM-DD' (día de la empresa) -> instante de inicio de ese día. */
export function startOfDayIso(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return new Date(new TZDate(+m[1], +m[2] - 1, +m[3], 0, 0, 0, APP_TZ).getTime()).toISOString();
}

// --- Periodos ----------------------------------------------------------------
export type PeriodKey = "today" | "week" | "7d" | "30d" | "month" | "last_month" | "90d" | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoy",
  week: "Esta semana",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  month: "Este mes",
  last_month: "Mes anterior",
  "90d": "Últimos 90 días",
  custom: "Personalizado",
};

export interface ResolvedPeriod {
  key: PeriodKey;
  label: string;
  from: Date;
  /** Fin exclusivo. */
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  fromIso: string;
  toIso: string;
  prevFromIso: string;
  prevToIso: string;
  days: number;
  /** Valores 'YYYY-MM-DD' para inputs de rango personalizado. */
  fromDate: string;
  toDate: string;
}

const instant = (d: Date) => new Date(d.getTime());

export function isPeriodKey(v: unknown): v is PeriodKey {
  return typeof v === "string" && v in PERIOD_LABELS;
}

export function resolvePeriod(
  key: PeriodKey,
  custom: { from?: string | null; to?: string | null } = {},
  now: Date = new Date(),
): ResolvedPeriod {
  const today = startOfDay(tz(now));
  const tomorrow = addDays(today, 1);
  let from: Date;
  let to: Date;
  let k: PeriodKey = key;

  switch (key) {
    case "today":
      from = today;
      to = tomorrow;
      break;
    case "week":
      from = startOfWeek(today, { weekStartsOn: 1 });
      to = tomorrow;
      break;
    case "7d":
      from = subDays(today, 6);
      to = tomorrow;
      break;
    case "90d":
      from = subDays(today, 89);
      to = tomorrow;
      break;
    case "month":
      from = startOfMonth(today);
      to = tomorrow;
      break;
    case "last_month": {
      const thisMonth = startOfMonth(today);
      from = addMonths(thisMonth, -1);
      to = thisMonth;
      break;
    }
    case "custom": {
      const f = custom.from ? startOfDayIso(custom.from) : null;
      const t = custom.to ? startOfDayIso(custom.to) : null;
      if (f && t && new Date(t) >= new Date(f)) {
        from = tz(f);
        to = addDays(tz(t), 1);
      } else {
        k = "30d";
        from = subDays(today, 29);
        to = tomorrow;
      }
      break;
    }
    case "30d":
    default:
      k = "30d";
      from = subDays(today, 29);
      to = tomorrow;
  }

  const days = Math.max(1, differenceInCalendarDays(to, from));
  const prevTo = from;
  const prevFrom = subDays(from, days);
  const lastDay = subDays(to, 1);
  const iso = (d: Date) => toInputDate(instant(d));

  return {
    key: k,
    label: PERIOD_LABELS[k],
    from: instant(from),
    to: instant(to),
    prevFrom: instant(prevFrom),
    prevTo: instant(prevTo),
    fromIso: instant(from).toISOString(),
    toIso: instant(to).toISOString(),
    prevFromIso: instant(prevFrom).toISOString(),
    prevToIso: instant(prevTo).toISOString(),
    days,
    fromDate: iso(from),
    toDate: iso(lastDay),
  };
}

/** Granularidad sugerida de series temporales según el largo del periodo. */
export function defaultGranularity(days: number): "day" | "week" | "month" {
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

/** Suma días calendario (hora de la empresa) a un instante ISO. */
export function addDaysIso(iso: string, days: number): string {
  return new Date(addDays(tz(iso), days).getTime()).toISOString();
}
