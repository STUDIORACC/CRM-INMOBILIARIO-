"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlParams } from "@/hooks/use-url-params";
import { cn } from "@/lib/utils";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Clave de ordenamiento enviada al servidor (?sort=). */
  sortKey?: string;
  className?: string;
  align?: "right";
  hideBelow?: "md" | "lg" | "xl";
}

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  sort?: string;
  dir?: "asc" | "desc";
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  /** Representación en tarjeta para pantallas pequeñas. */
  mobileCard: (row: T) => ReactNode;
  empty: ReactNode;
  selectable?: boolean;
  bulkActions?: (selectedIds: string[], clear: () => void) => ReactNode;
  rowActions?: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  total,
  page,
  pageSize,
  sort,
  dir = "desc",
  rowKey,
  rowHref,
  mobileCard,
  empty,
  selectable = false,
  bulkActions,
  rowActions,
  className,
}: DataTableProps<T>) {
  const { update, pending } = useUrlParams();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ids = rows.map(rowKey);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const someSelected = ids.some((id) => selected.has(id));
  const clear = () => setSelected(new Set());

  const toggleAll = (checked: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
    setSelected(next);
  };
  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const onSort = (key: string) => {
    if (sort === key) update({ sort: key, dir: dir === "asc" ? "desc" : "asc" });
    else update({ sort: key, dir: "asc" });
  };

  if (total === 0) {
    return <div className="rounded-xl border bg-card shadow-card">{empty}</div>;
  }

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className={cn("space-y-3", className)}>
      {selectable && selected.size > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} seleccionado{selected.size === 1 ? "" : "s"}</span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions(Array.from(selected), clear)}</div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={clear}>
            Quitar selección
          </Button>
        </div>
      )}

      {/* Escritorio / tablet */}
      <div className={cn("hidden overflow-hidden rounded-xl border bg-card shadow-card transition-opacity md:block", pending && "opacity-60")}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {selectable && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAll(v === true)}
                      aria-label="Seleccionar todos"
                    />
                  </TableHead>
                )}
                {columns.map((c) => {
                  const active = c.sortKey && sort === c.sortKey;
                  return (
                    <TableHead key={c.id} className={cn("whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground", c.align === "right" && "text-right", c.hideBelow && HIDE[c.hideBelow])}>
                      {c.sortKey ? (
                        <button
                          type="button"
                          onClick={() => onSort(c.sortKey!)}
                          className={cn("inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground", active && "text-foreground")}
                        >
                          {c.header}
                          {active ? dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        c.header
                      )}
                    </TableHead>
                  );
                })}
                {rowActions && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const id = rowKey(row);
                const href = rowHref?.(row);
                return (
                  <TableRow
                    key={id}
                    data-state={selected.has(id) ? "selected" : undefined}
                    className={cn(href && "cursor-pointer")}
                    onClick={(e) => {
                      if (!href) return;
                      if ((e.target as HTMLElement).closest("a,button,input,[role=checkbox],[role=menuitem],[data-no-row-click]")) return;
                      if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
                      else router.push(href);
                    }}
                  >
                    {selectable && (
                      <TableCell className="w-10">
                        <Checkbox checked={selected.has(id)} onCheckedChange={(v) => toggleOne(id, v === true)} aria-label="Seleccionar fila" />
                      </TableCell>
                    )}
                    {columns.map((c) => (
                      <TableCell key={c.id} className={cn("py-3", c.align === "right" && "text-right", c.hideBelow && HIDE[c.hideBelow], c.className)}>
                        {c.cell(row)}
                      </TableCell>
                    ))}
                    {rowActions && (
                      <TableCell className="w-10 pr-3 text-right" data-no-row-click>
                        {rowActions(row)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Móvil: tarjetas */}
      <div className={cn("space-y-2.5 md:hidden", pending && "opacity-60")}>
        {rows.map((row) => (
          <div key={rowKey(row)}>{mobileCard(row)}</div>
        ))}
      </div>

      <Pagination page={page} lastPage={lastPage} total={total} from={from} to={to} pageSize={pageSize} onPage={(p) => update({ page: String(p) }, { resetPage: false })} onPageSize={(s) => update({ pageSize: String(s) })} />
    </div>
  );
}

export function Pagination({
  page,
  lastPage,
  total,
  from,
  to,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  lastPage: number;
  total: number;
  from: number;
  to: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
}) {
  const pages: Array<number | "…"> = [];
  const push = (p: number | "…") => pages[pages.length - 1] !== p && pages.push(p);
  for (let p = 1; p <= lastPage; p++) {
    if (p === 1 || p === lastPage || Math.abs(p - page) <= 1) push(p);
    else push("…");
  }
  return (
    <div className="flex flex-col items-center justify-between gap-3 px-1 text-sm text-muted-foreground sm:flex-row">
      <div className="flex items-center gap-3">
        <span className="tabular">
          {from}–{to} de {total.toLocaleString("en-US")}
        </span>
        {onPageSize && (
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger size="sm" className="w-[110px]" aria-label="Filas por página">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s} por página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft />
        </Button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1.5">
              …
            </span>
          ) : (
            <Button key={p} variant={p === page ? "default" : "ghost"} size="icon-sm" onClick={() => onPage(p)} className="tabular" aria-current={p === page ? "page" : undefined}>
              {p}
            </Button>
          ),
        )}
        <Button variant="outline" size="icon-sm" disabled={page >= lastPage} onClick={() => onPage(page + 1)} aria-label="Página siguiente">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
