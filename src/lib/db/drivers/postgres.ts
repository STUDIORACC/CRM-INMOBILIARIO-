import postgres from "postgres";
import { OID, parseTimestamp } from "../params";
import type { Driver, RawTx } from "../types";

export function createPostgresDriver(url: string): Driver {
  const serverless = Boolean(process.env.VERCEL);
  const sql = postgres(url, {
    // El pooler de Supabase (modo transacción) no soporta prepared statements
    prepare: false,
    max: serverless ? 1 : 10,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    connection: { TimeZone: "UTC" },
    types: {
      bigint: { to: OID.INT8, from: [OID.INT8], parse: (v: string) => Number(v), serialize: (v: unknown) => String(v) },
      numeric: { to: OID.NUMERIC, from: [OID.NUMERIC], parse: (v: string) => Number(v), serialize: (v: unknown) => String(v) },
      date: { to: OID.DATE, from: [OID.DATE], parse: (v: string) => v, serialize: (v: unknown) => String(v) },
      timestamp: { to: OID.TIMESTAMP, from: [OID.TIMESTAMP], parse: parseTimestamp, serialize: (v: unknown) => String(v) },
      timestamptz: { to: OID.TIMESTAMPTZ, from: [OID.TIMESTAMPTZ], parse: parseTimestamp, serialize: (v: unknown) => String(v) },
    },
  });

  return {
    kind: "postgres",
    async transaction<T>(fn: (tx: RawTx) => Promise<T>): Promise<T> {
      return (await sql.begin(async (tx) =>
        fn({
          query: async (text, params) =>
            Array.from(await tx.unsafe(text, params as never[])) as Record<string, unknown>[],
          exec: async (text) => {
            await tx.unsafe(text);
          },
        }),
      )) as T;
    },
  };
}
