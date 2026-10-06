import { PGlite, types } from "@electric-sql/pglite";
import { OID, parseTimestamp } from "../params";
import type { Driver, RawTx } from "../types";

export type PgliteDriver = Driver & { raw: PGlite };

// Mismos tipos de salida que el driver de Postgres: números, fechas ISO y 'YYYY-MM-DD'.
const parsers = {
  [types.INT8]: (v: string) => Number(v),
  [types.NUMERIC]: (v: string) => Number(v),
  [OID.DATE]: (v: string) => v,
  [OID.TIMESTAMP]: parseTimestamp,
  [OID.TIMESTAMPTZ]: parseTimestamp,
};

export async function createPgliteDriver(dataDir?: string): Promise<PgliteDriver> {
  const pg = new PGlite(dataDir, { relaxedDurability: true });
  await pg.waitReady;
  await pg.exec("set time zone 'UTC'");

  return {
    kind: "pglite",
    raw: pg,
    async transaction<T>(fn: (tx: RawTx) => Promise<T>): Promise<T> {
      return pg.transaction(async (tx) =>
        fn({
          query: async (text, params) =>
            (await tx.query(text, params as unknown[], { parsers })).rows as Record<string, unknown>[],
          exec: async (text) => {
            await tx.exec(text);
          },
        }),
      );
    },
  };
}
