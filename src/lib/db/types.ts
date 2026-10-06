export type Role = "admin" | "manager" | "advisor" | "assistant";

/** Valor que se serializa como JSON (para columnas json/jsonb). */
export class JsonParam {
  constructor(public readonly value: unknown) {}
}
export const json = (value: unknown) => new JsonParam(value);

export type SqlParam =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | JsonParam
  | Array<string | number | boolean | null>;

export interface Db {
  /** Ejecuta una consulta parametrizada ($1, $2…) y devuelve las filas. */
  query<T = Record<string, unknown>>(text: string, params?: SqlParam[]): Promise<T[]>;
  /** Primera fila o null. */
  one<T = Record<string, unknown>>(text: string, params?: SqlParam[]): Promise<T | null>;
  /** Escalar de la primera fila/columna. */
  scalar<T = number>(text: string, params?: SqlParam[]): Promise<T | null>;
}

/** Identidad con la que se ejecutan las consultas (se traduce a claims del JWT). */
export interface DbActor {
  id: string;
  email?: string | null;
}

/** Contrato mínimo que implementa cada driver (postgres.js / PGlite). */
export interface RawTx {
  query(text: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  exec(text: string): Promise<void>;
}

export interface Driver {
  readonly kind: "postgres" | "pglite";
  transaction<T>(fn: (tx: RawTx) => Promise<T>): Promise<T>;
}
