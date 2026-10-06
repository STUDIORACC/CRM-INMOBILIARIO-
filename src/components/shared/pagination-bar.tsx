"use client";

import { Pagination } from "@/components/shared/data-table";
import { useUrlParams } from "@/hooks/use-url-params";

/** Paginación independiente para vistas que no usan DataTable (agenda, tarjetas). */
export function PaginationBar({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { update } = useUrlParams();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <Pagination
      page={page}
      lastPage={lastPage}
      total={total}
      from={(page - 1) * pageSize + 1}
      to={Math.min(total, page * pageSize)}
      pageSize={pageSize}
      onPage={(n) => update({ page: String(n) }, { resetPage: false })}
      onPageSize={(s) => update({ pageSize: String(s) })}
    />
  );
}
