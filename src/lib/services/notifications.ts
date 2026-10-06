import type { Db } from "@/lib/db/types";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  return Number((await db.scalar<number>("select count(*) from public.notifications where user_id = $1 and read_at is null", [userId])) ?? 0);
}

export async function listNotifications(
  db: Db,
  userId: string,
  opts: { limit?: number; offset?: number; unreadOnly?: boolean; type?: string } = {},
): Promise<{ items: NotificationRow[]; total: number; unread: number }> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const params: Array<string | number> = [userId];
  let where = "user_id = $1";
  if (opts.unreadOnly) where += " and read_at is null";
  if (opts.type) {
    params.push(opts.type);
    where += ` and type = $${params.length}`;
  }
  const [items, total, unread] = await Promise.all([
    db.query<NotificationRow>(
      `select id, type, title, body, href, entity_type, entity_id, read_at, created_at
         from public.notifications where ${where} order by created_at desc limit ${limit} offset ${Math.max(0, opts.offset ?? 0)}`,
      params,
    ),
    db.scalar<number>(`select count(*) from public.notifications where ${where}`, params),
    unreadCount(db, userId),
  ]);
  return { items, total: Number(total ?? 0), unread };
}

export async function markNotificationsRead(db: Db, userId: string, input: { ids?: string[]; all?: boolean }): Promise<number> {
  if (input.all) {
    const rows = await db.query<{ id: string }>("update public.notifications set read_at = now() where user_id = $1 and read_at is null returning id", [userId]);
    return rows.length;
  }
  if (!input.ids?.length) return 0;
  const rows = await db.query<{ id: string }>(
    "update public.notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null returning id",
    [userId, input.ids],
  );
  return rows.length;
}

export async function deleteNotifications(db: Db, userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.query("delete from public.notifications where user_id = $1 and id = any($2::uuid[])", [userId, ids]);
}
