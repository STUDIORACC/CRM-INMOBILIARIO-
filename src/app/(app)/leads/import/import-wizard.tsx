"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { importLeadsAction, validateImportAction } from "@/actions/import";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IMPORT_FIELDS, MAX_IMPORT_ROWS, guessMapping, type ImportMapping, type RawImportRow } from "@/lib/domain/lead-import";
import type { ImportOutcome, ImportRowResult } from "@/lib/services/lead-import";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };
type Step = "upload" | "map" | "review" | "done";
type SourceRow = Record<string, string>;

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "upload", label: "Archivo" },
  { key: "map", label: "Columnas" },
  { key: "review", label: "Revisión" },
  { key: "done", label: "Resultado" },
];
const NONE = "__none__";
const MAX_BYTES = 5 * 1024 * 1024;
const VALIDATE_CHUNK = 400;
const IMPORT_CHUNK = 100;

const TEMPLATE_HEADERS = ["Nombre", "Teléfono", "Email", "Fuente", "Mensaje", "Operación", "Tipo de propiedad", "Distrito", "Presupuesto máximo", "Vendedor"];
const TEMPLATE_ROWS = [
  ["Carlos Mendoza Ríos", "987 654 321", "carlos.mendoza@gmail.com", "WhatsApp", "Busca departamento de 3 dormitorios", "Compra", "Departamento", "San Miguel", "S/ 480,000", ""],
  ["Lucía Fernández", "912 345 678", "", "Facebook", "Alquiler cerca de la Av. Arequipa", "Alquiler", "Departamento", "Lince", "US$ 900", ""],
];

function download(name: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([`﻿${content}`], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function readFile(file: File): Promise<{ headers: string[]; rows: SourceRow[] }> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx") {
    const { readSheet } = await import("read-excel-file/browser");
    const data = (await readSheet(file)) as unknown[][];
    const [head, ...body] = data;
    const headers = (head ?? []).map((h, i) => String(h ?? "").trim() || `Columna ${i + 1}`);
    const rows = body
      .filter((r) => r.some((c) => c != null && String(c).trim() !== ""))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] == null ? "" : r[i] instanceof Date ? (r[i] as Date).toISOString().slice(0, 10) : String(r[i])])));
    return { headers, rows };
  }
  if (ext === "csv" || ext === "txt") {
    const text = await file.text();
    const res = Papa.parse<SourceRow>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    const headers = (res.meta.fields ?? []).filter(Boolean);
    return { headers, rows: res.data.map((r) => Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "").trim()]))) };
  }
  throw new Error("Formato no compatible. Sube un archivo .csv o .xlsx");
}

export function ImportWizard({ sources, advisors, ownOnly }: { sources: Option[]; advisors: Option[]; ownOnly: boolean }) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [defaultSource, setDefaultSource] = useState(sources.find((s) => /import|otro|other/i.test(s.value))?.value ?? sources[0]?.value ?? "");
  const [defaultAssignee, setDefaultAssignee] = useState("");
  const [duplicates, setDuplicates] = useState<"skip" | "create">("skip");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const [filter, setFilter] = useState<"all" | "ok" | "duplicate" | "error">("all");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mapped: Array<{ row: number; values: RawImportRow }> = useMemo(
    () =>
      rows.map((r, i) => ({
        row: i + 1,
        values: Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, mapping[f.key] ? (r[mapping[f.key]!] ?? "") : ""]).filter(([, v]) => v !== "")) as RawImportRow,
      })),
    [rows, mapping],
  );
  const options = { defaultSource, defaultAssignee: ownOnly ? "" : defaultAssignee, duplicates };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return toast.error("El archivo supera los 5 MB. Divídelo en partes más pequeñas.");
    setBusy(true);
    try {
      const data = await readFile(file);
      if (data.rows.length === 0) throw new Error("El archivo no tiene filas de datos.");
      if (data.rows.length > MAX_IMPORT_ROWS) throw new Error(`El archivo tiene ${data.rows.length.toLocaleString("es-PE")} filas; el máximo por importación es ${MAX_IMPORT_ROWS.toLocaleString("es-PE")}.`);
      setFileName(file.name);
      setHeaders(data.headers);
      setRows(data.rows);
      setMapping(guessMapping(data.headers));
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const runReview = async () => {
    if (!mapping.fullName) return toast.error("Relaciona la columna del nombre para continuar.");
    if (!mapping.phone && !mapping.email) return toast.error("Relaciona al menos una columna de teléfono o correo.");
    if (!defaultSource) return toast.error("Selecciona la fuente por defecto.");
    setBusy(true);
    setProgress(0);
    const all: ImportRowResult[] = [];
    try {
      for (let i = 0; i < mapped.length; i += VALIDATE_CHUNK) {
        const res = await validateImportAction({ rows: mapped.slice(i, i + VALIDATE_CHUNK), options });
        if (!res.ok) throw new Error(res.error);
        all.push(...res.data);
        setProgress(Math.round(((i + VALIDATE_CHUNK) / mapped.length) * 100));
      }
      // Los duplicados dentro del archivo se detectan por lote; aquí se revisan también entre lotes
      setResults(all);
      setFilter("all");
      setStep("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revisar el archivo");
    } finally {
      setBusy(false);
    }
  };

  const toImport = useMemo(() => {
    const ok = new Set(results.filter((r) => r.status === "ok" || (r.status === "duplicate" && duplicates === "create")).map((r) => r.row));
    return mapped.filter((m) => ok.has(m.row));
  }, [results, mapped, duplicates]);

  const runImport = async () => {
    setBusy(true);
    setProgress(0);
    const all: ImportOutcome[] = [];
    try {
      for (let i = 0; i < toImport.length; i += IMPORT_CHUNK) {
        const res = await importLeadsAction({ rows: toImport.slice(i, i + IMPORT_CHUNK), options });
        if (!res.ok) throw new Error(res.error);
        all.push(...res.data);
        setProgress(Math.round(((i + IMPORT_CHUNK) / toImport.length) * 100));
      }
      setOutcomes(all);
      setStep("done");
      toast.success(`${all.filter((o) => o.result === "created").length} leads importados`);
    } catch (e) {
      setOutcomes(all);
      toast.error(`${e instanceof Error ? e.message : "Error al importar"}. Se importaron ${all.filter((o) => o.result === "created").length} leads antes del corte; revisa la lista antes de reintentar.`);
      if (all.length) setStep("done");
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => ({ ok: results.filter((r) => r.status === "ok").length, duplicate: results.filter((r) => r.status === "duplicate").length, error: results.filter((r) => r.status === "error").length }), [results]);
  const created = outcomes.filter((o) => o.result === "created").length;
  const skipped = outcomes.filter((o) => o.result === "skipped").length;
  const failed = outcomes.filter((o) => o.result === "failed");

  const reset = () => {
    setStep("upload");
    setRows([]);
    setHeaders([]);
    setResults([]);
    setOutcomes([]);
    setFileName("");
  };

  return (
    <div className="space-y-4">
      <ol className="flex items-center gap-2 overflow-x-auto" aria-label="Pasos de la importación">
        {STEPS.map((s, i) => {
          const idx = STEPS.findIndex((x) => x.key === step);
          const state = i < idx ? "done" : i === idx ? "current" : "todo";
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-semibold", state === "current" ? "bg-primary text-primary-foreground" : state === "done" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>{state === "done" ? "✓" : i + 1}</span>
              <span className={cn("text-sm whitespace-nowrap", state === "current" ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
            </li>
          );
        })}
      </ol>

      {step === "upload" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div
            className={cn("flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card px-6 py-14 text-center shadow-card transition-colors lg:col-span-2", dragging && "border-primary bg-primary/5")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">{busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}</div>
            <p className="text-sm font-medium">Arrastra tu archivo aquí o selecciónalo</p>
            <p className="mt-1 text-xs text-muted-foreground">CSV o Excel (.xlsx) · hasta {MAX_IMPORT_ROWS.toLocaleString("es-PE")} filas y 5 MB · la primera fila debe tener los encabezados</p>
            <input ref={inputRef} type="file" accept=".csv,.txt,.xlsx" className="sr-only" id="import-file" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button className="mt-4" disabled={busy} onClick={() => inputRef.current?.click()}>
              <FileSpreadsheet /> Elegir archivo
            </Button>
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-5 shadow-card">
            <h3 className="text-sm font-semibold">Antes de empezar</h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>• Obligatorio: nombre y al menos un teléfono o correo.</li>
              <li>• Los repetidos se detectan por teléfono o correo, contra tus leads y clientes.</li>
              <li>• Fuente, operación, distritos y vendedor se reconocen por su nombre.</li>
            </ul>
            <Button variant="outline" onClick={() => download("plantilla-importacion-leads.csv", Papa.unparse({ fields: TEMPLATE_HEADERS, data: TEMPLATE_ROWS }, { newline: "\r\n" }))}>
              <Download /> Descargar plantilla CSV
            </Button>
          </div>
        </div>
      )}

      {step === "map" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border bg-card shadow-card lg:col-span-2">
            <header className="border-b px-5 py-3.5">
              <h3 className="text-sm font-semibold">Relaciona las columnas</h3>
              <p className="text-xs text-muted-foreground">
                {fileName} · {rows.length.toLocaleString("es-PE")} filas · {headers.length} columnas. Revisamos los nombres y propusimos una relación; ajústala si hace falta.
              </p>
            </header>
            <ul className="divide-y">
              {IMPORT_FIELDS.map((f) => {
                const col = mapping[f.key];
                const sample = col ? rows.slice(0, 3).map((r) => r[col]).filter(Boolean).join(" · ") : "";
                return (
                  <li key={f.key} className="grid items-center gap-2 px-5 py-3 sm:grid-cols-[1fr_16rem]">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {f.label}
                        {f.required && <span className="ml-0.5 text-destructive">*</span>}
                      </div>
                      {sample && <div className="truncate text-xs text-muted-foreground">Ej.: {sample}</div>}
                    </div>
                    <Select value={col ?? NONE} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === NONE ? undefined : v }))}>
                      <SelectTrigger className="w-full" aria-label={`Columna para ${f.label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No importar</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card lg:self-start">
            <h3 className="text-sm font-semibold">Opciones</h3>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium">Fuente por defecto</label>
              <Select value={defaultSource} onValueChange={setDefaultSource}>
                <SelectTrigger className="w-full" aria-label="Fuente por defecto">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Se usa cuando la fila no trae fuente o no se reconoce.</p>
            </div>
            {!ownOnly && (
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">Vendedor por defecto</label>
                <Select value={defaultAssignee || NONE} onValueChange={(v) => setDefaultAssignee(v === NONE ? "" : v)}>
                  <SelectTrigger className="w-full" aria-label="Vendedor por defecto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin asignar (la gerencia los reparte)</SelectItem>
                    {advisors.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium">Si el contacto ya existe</label>
              <Select value={duplicates} onValueChange={(v) => setDuplicates(v as "skip" | "create")}>
                <SelectTrigger className="w-full" aria-label="Tratamiento de duplicados">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Omitir la fila (recomendado)</SelectItem>
                  <SelectItem value="create">Importar de todos modos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={reset} disabled={busy}>
                <ArrowLeft /> Cambiar archivo
              </Button>
              <Button className="flex-1" onClick={runReview} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null} Revisar <ArrowRight />
              </Button>
            </div>
            {busy && <Progress value={progress} aria-label="Avance de la revisión" />}
          </section>
        </div>
      )}

      {step === "review" && (
        <section className="rounded-xl border bg-card shadow-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
            <div>
              <h3 className="text-sm font-semibold">Revisión antes de importar</h3>
              <p className="text-xs text-muted-foreground">Revisa los resultados. Solo se guardarán las filas listas{duplicates === "create" ? " y los duplicados (los importarás de todos modos)" : ""}.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", `Todas (${results.length})`],
                  ["ok", `Listas (${counts.ok})`],
                  ["duplicate", `Duplicados (${counts.duplicate})`],
                  ["error", `Con errores (${counts.error})`],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", filter === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted")}>
                  {label}
                </button>
              ))}
            </div>
          </header>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-4 py-2 font-medium">Fila</th>
                  <th className="px-2 py-2 font-medium">Nombre</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  <th className="px-2 py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results
                  .filter((r) => filter === "all" || r.status === filter)
                  .slice(0, 300)
                  .map((r) => (
                    <tr key={r.row}>
                      <td className="px-4 py-2 text-muted-foreground tabular">{r.row}</td>
                      <td className="px-2 py-2 font-medium">{r.name}</td>
                      <td className="px-2 py-2">
                        {r.status === "ok" && (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="size-4" /> Lista
                          </span>
                        )}
                        {r.status === "duplicate" && (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="size-4" /> Duplicado
                          </span>
                        )}
                        {r.status === "error" && (
                          <span className="inline-flex items-center gap-1 text-rose-700">
                            <XCircle className="size-4" /> Error
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {r.errors.join("; ")}
                        {r.duplicate && (
                          <>
                            {r.duplicate.reason}
                            {r.duplicate.id ? (
                              <>
                                {" · "}
                                <Link href={`/${r.duplicate.kind === "lead" ? "leads" : "clients"}/${r.duplicate.id}`} target="_blank" className="font-medium text-primary hover:underline">
                                  {r.duplicate.name}
                                </Link>
                              </>
                            ) : null}
                          </>
                        )}
                        {r.warnings.length > 0 && <span className="block text-amber-700">{r.warnings.join(" · ")}</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {results.filter((r) => filter === "all" || r.status === filter).length > 300 && <p className="px-5 py-3 text-center text-xs text-muted-foreground">Mostrando las primeras 300 filas de este filtro.</p>}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5">
            <Button variant="outline" onClick={() => setStep("map")} disabled={busy}>
              <ArrowLeft /> Volver a las columnas
            </Button>
            <div className="flex items-center gap-3">
              {busy && <Progress value={progress} className="w-40" aria-label="Avance de la importación" />}
              <Button onClick={runImport} disabled={busy || toImport.length === 0}>
                {busy ? <Loader2 className="animate-spin" /> : <Upload />} Importar {toImport.length.toLocaleString("es-PE")} {toImport.length === 1 ? "lead" : "leads"}
              </Button>
            </div>
          </footer>
        </section>
      )}

      {step === "done" && (
        <section className="rounded-xl border bg-card p-6 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Importación terminada</h3>
              <p className="text-sm text-muted-foreground">{fileName}</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
            {[
              ["Importados", created, "text-emerald-700 bg-emerald-50"],
              ["Omitidos", skipped + (duplicates === "skip" ? counts.duplicate : 0), "text-amber-700 bg-amber-50"],
              ["Con errores", failed.length + counts.error, "text-rose-700 bg-rose-50"],
            ].map(([label, n, tone]) => (
              <div key={label as string} className={cn("rounded-xl py-4", tone as string)}>
                <dd className="text-2xl font-semibold tabular">{n as number}</dd>
                <dt className="text-xs">{label as string}</dt>
              </div>
            ))}
          </dl>
          {failed.length > 0 && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-sm">
              <p className="font-medium text-rose-800">Estas filas no se pudieron guardar:</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-rose-800">
                {failed.slice(0, 8).map((f) => (
                  <li key={f.row}>
                    Fila {f.row} · {f.name}: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/leads?sort=created_at&dir=desc">Ver los leads</Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              Importar otro archivo
            </Button>
            {(results.some((r) => r.status !== "ok") || failed.length > 0) && (
              <Button
                variant="outline"
                onClick={() => {
                  const lines = [
                    ...results.filter((r) => r.status !== "ok").map((r) => ({ Fila: r.row, Nombre: r.name, Estado: r.status === "duplicate" ? "Duplicado" : "Error", Detalle: [r.errors.join("; "), r.duplicate?.reason].filter(Boolean).join(" · ") })),
                    ...failed.map((f) => ({ Fila: f.row, Nombre: f.name, Estado: "No guardada", Detalle: f.message ?? "" })),
                  ];
                  download("filas-no-importadas.csv", Papa.unparse(lines, { newline: "\r\n" }));
                }}
              >
                <Download /> Descargar filas no importadas
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
