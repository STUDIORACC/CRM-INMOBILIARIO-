"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlParams } from "@/hooks/use-url-params";

/** Filtro de vendedor del dashboard (gerencia). */
export function AdvisorSelect({ advisors, value }: { advisors: Array<{ id: string; name: string }>; value: string }) {
  const { update, pending } = useUrlParams();
  return (
    <Select value={value || "__all__"} onValueChange={(v) => update({ advisor: v === "__all__" ? null : v })}>
      <SelectTrigger className={pending ? "w-52 opacity-70" : "w-52"} aria-label="Filtrar por vendedor">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todos los vendedores</SelectItem>
        {advisors.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
