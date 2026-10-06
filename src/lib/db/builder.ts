import type { SqlParam } from "./types";

/**
 * Acumula condiciones y parámetros para consultas dinámicas.
 *
 *   const f = new Filters();
 *   f.add("l.stage = any(?::text[])", stages);
 *   const lim = f.param(20);
 *   `select … from leads l ${f.where} limit ${lim}`
 */
export class Filters {
  private conds: string[] = [];
  readonly params: SqlParam[] = [];

  /** Registra un parámetro y devuelve su marcador ($n). */
  param(value: SqlParam): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  /** Agrega una condición; cada `?` se reemplaza por el siguiente parámetro. */
  add(fragment: string, ...values: SqlParam[]): this {
    let i = 0;
    const text = fragment.replace(/\?/g, () => {
      if (i >= values.length) throw new Error(`Filtro mal formado: ${fragment}`);
      return this.param(values[i++]);
    });
    this.conds.push(text);
    return this;
  }

  /** Condición sin parámetros (p. ej. "l.assigned_to is null"). */
  raw(fragment: string): this {
    this.conds.push(fragment);
    return this;
  }

  get isEmpty(): boolean {
    return this.conds.length === 0;
  }

  /** `where a and b` o cadena vacía. */
  get where(): string {
    return this.conds.length ? `where ${this.conds.join(" and ")}` : "";
  }

  /** `and a and b` para añadir a un where existente. */
  get and(): string {
    return this.conds.length ? ` and ${this.conds.join(" and ")}` : "";
  }
}

/** Escapa comodines de LIKE. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
