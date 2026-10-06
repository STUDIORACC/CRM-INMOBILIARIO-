import Papa from "papaparse";

export type Cell = string | number | boolean | null | undefined;

export interface ExportTable {
  /** Nombre de la hoja de Excel (máx. 31 caracteres). */
  sheet: string;
  headers: string[];
  rows: Cell[][];
}

/** Evita la inyección de fórmulas al abrir el archivo en Excel (celdas que empiezan con = + - @). */
function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) && !/^-?\d+([.,]\d+)?$/.test(v) ? `'${v}` : v;
}

const clean = (c: Cell): string | number => {
  if (c == null) return "";
  if (typeof c === "boolean") return c ? "Sí" : "No";
  return typeof c === "string" ? safeText(c) : c;
};

/** CSV UTF-8 con BOM (Excel lo abre con tildes y ñ correctas). Varias tablas se separan con una línea en blanco. */
export function toCsv(tables: ExportTable[]): string {
  const parts = tables.map((t) => {
    const csv = Papa.unparse({ fields: t.headers, data: t.rows.map((r) => r.map(clean)) }, { newline: "\r\n" });
    return tables.length > 1 ? `${safeText(t.sheet)}\r\n${csv}` : csv;
  });
  return `﻿${parts.join("\r\n\r\n")}\r\n`;
}

export async function toXlsx(tables: ExportTable[]): Promise<Buffer> {
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const sheets = tables.map((t) => ({
    sheet: t.sheet.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Datos",
    data: [
      t.headers.map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#eef2ff" })),
      ...t.rows.map((r) =>
        r.map((c) => {
          const v = clean(c);
          return v === "" ? null : typeof v === "number" ? { value: v, type: Number } : { value: v, type: String };
        }),
      ),
    ],
    columns: t.headers.map((h, i) => ({ width: Math.min(48, Math.max(12, h.length + 2, ...t.rows.slice(0, 50).map((r) => String(r[i] ?? "").length + 2))) })),
    stickyRowsCount: 1,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return writeXlsxFile(sheets as any).toBuffer();
}
