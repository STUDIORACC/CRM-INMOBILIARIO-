import { JsonParam, type SqlParam } from "./types";

function escapeArrayElement(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  return `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function toPgArray(values: ReadonlyArray<unknown>): string {
  return `{${values.map(escapeArrayElement).join(",")}}`;
}

/** Convierte parámetros de aplicación a valores primitivos que aceptan ambos drivers. */
export function serializeParam(p: SqlParam): string | number | boolean | null {
  if (p === null || p === undefined) return null;
  if (p instanceof JsonParam) return JSON.stringify(p.value);
  if (p instanceof Date) return p.toISOString();
  if (Array.isArray(p)) return toPgArray(p);
  return p;
}

// --- Parsers de tipos: ambos drivers devuelven valores JSON-serializables -------

const TS_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:([+-]\d{2})(?::?(\d{2}))?)?$/;

export function parseTimestamp(v: string): string {
  const m = TS_RE.exec(v);
  if (!m) return v;
  const [, d, t, hh, mm] = m;
  const offset = hh ? `${hh}:${mm ?? "00"}` : "Z";
  const date = new Date(`${d}T${t}${offset}`);
  return Number.isNaN(date.getTime()) ? v : date.toISOString();
}

export const OID = {
  INT8: 20,
  NUMERIC: 1700,
  DATE: 1082,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
} as const;
