import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/lib/db/types";
import { AppError } from "@/lib/errors";

export interface DocumentRow {
  id: string;
  name: string;
  category: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploader: string | null;
  created_at: string;
}

export interface DocumentScope {
  ownerId?: string | null;
  clientId?: string | null;
  propertyId?: string | null;
  leadId?: string | null;
}

export async function listDocuments(db: Db, scope: DocumentScope): Promise<DocumentRow[]> {
  const conds: string[] = [];
  const params: string[] = [];
  const add = (col: string, v?: string | null) => {
    if (v) {
      params.push(v);
      conds.push(`d.${col} = $${params.length}::uuid`);
    }
  };
  add("owner_id", scope.ownerId);
  add("client_id", scope.clientId);
  add("property_id", scope.propertyId);
  add("lead_id", scope.leadId);
  if (!conds.length) return [];
  return db.query<DocumentRow>(
    `select d.id, d.name, d.category, d.mime_type, d.size_bytes, d.uploaded_by, u.full_name as uploader, d.created_at
       from public.documents d left join public.users u on u.id = d.uploaded_by
      where ${conds.join(" or ")} order by d.created_at desc`,
    params,
  );
}

export async function insertDocument(
  db: Db,
  session: SessionUser,
  input: { name: string; category: string; storagePath: string; mime: string; size: number } & DocumentScope,
): Promise<{ id: string }> {
  const row = await db.one<{ id: string }>(
    `insert into public.documents (name, category, storage_path, mime_type, size_bytes, owner_id, client_id, property_id, lead_id, uploaded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [input.name, input.category, input.storagePath, input.mime, input.size, input.ownerId ?? null, input.clientId ?? null, input.propertyId ?? null, input.leadId ?? null, session.id],
  );
  if (!row) throw new AppError("No se pudo registrar el documento.");
  return { id: row.id };
}

export async function removeDocument(db: Db, id: string): Promise<{ storagePath: string }> {
  const row = await db.one<{ storage_path: string }>("delete from public.documents where id = $1 returning storage_path", [id]);
  if (!row) throw new AppError("No tienes permiso para eliminar este documento.");
  return { storagePath: row.storage_path };
}
