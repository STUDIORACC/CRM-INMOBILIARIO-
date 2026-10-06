import "server-only";
import { cache } from "react";
import { requireSession } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { loadCatalogs } from "@/lib/services/catalogs";
import { makeLookups } from "@/lib/types/catalogs";

/** Catálogos de la empresa (una consulta por request, compartida entre layout y páginas). */
export const getCatalogs = cache(async () => {
  const session = await requireSession();
  return withUser({ id: session.id, email: session.email }, (db) => loadCatalogs(db));
});

export const getLookups = cache(async () => makeLookups(await getCatalogs()));
