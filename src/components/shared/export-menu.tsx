"use client";

import { useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Exporta la vista actual (con sus filtros) a CSV o Excel. */
export function ExportMenu({ entity, extra }: { entity: string; extra?: Record<string, string> }) {
  const sp = useSearchParams();
  const href = (format: "csv" | "xlsx") => {
    const p = new URLSearchParams(sp.toString());
    p.delete("page");
    p.set("entity", entity);
    p.set("format", format);
    for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
    return `/api/export?${p.toString()}`;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download />
          <span className="hidden sm:inline">Exportar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={href("csv")} download>
            <FileText /> CSV (UTF-8)
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={href("xlsx")} download>
            <FileSpreadsheet /> Excel (.xlsx)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
