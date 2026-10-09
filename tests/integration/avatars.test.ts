import { describe, expect, it } from "vitest";
import { admin, count } from "./helpers";

describe("fotos de perfil de demostración", () => {
  it("todo el equipo tiene foto y no se repiten rostros entre asesores", async () => {
    const staff = await admin((db) => db.query<{ full_name: string; avatar_url: string | null }>("select full_name, avatar_url from public.users"));
    expect(staff.length).toBeGreaterThanOrEqual(8);
    expect(staff.every((u) => u.avatar_url?.startsWith("https://images.unsplash.com/photo-"))).toBe(true);
    expect(new Set(staff.map((u) => u.avatar_url)).size).toBe(staff.length);
  });

  it("los clientes con foto no repiten rostro y los casos de la historia la reciben primero", async () => {
    const withPhoto = await admin((db) => db.query<{ full_name: string; avatar_url: string }>("select full_name, avatar_url from public.clients where avatar_url is not null"));
    expect(withPhoto.length).toBeGreaterThanOrEqual(25);
    expect(new Set(withPhoto.map((c) => c.avatar_url)).size).toBe(withPhoto.length);

    const hero = await admin((db) => db.query<{ full_name: string; avatar_url: string | null }>("select full_name, avatar_url from public.leads where full_name in ('Carlos Mendoza', 'Andrea Salazar', 'Diego Ramírez', 'Valeria Torres', 'Luis Fernández')"));
    expect(hero.length).toBeGreaterThanOrEqual(4);
    expect(hero.every((l) => l.avatar_url)).toBe(true);
  });

  it("un lead convertido comparte la foto de su cliente", async () => {
    const mismatched = await admin((db) => count(db, "select count(*) from public.leads l join public.clients c on c.id = l.client_id where c.avatar_url is distinct from l.avatar_url"));
    expect(mismatched).toBe(0);
  });

  it("la foto coincide con el género del nombre (retratos de hombre solo a nombres masculinos)", async () => {
    const { MALE_NAMES, FEMALE_NAMES, strip } = await import("@/lib/seed/names");
    const { MEN_POOL, WOMEN_POOL } = await import("@/lib/seed/avatars");
    const rows = await admin((db) => db.query<{ full_name: string; avatar_url: string }>("select full_name, avatar_url from public.clients where avatar_url is not null"));
    const men = new Set(MEN_POOL);
    const women = new Set(WOMEN_POOL);
    const male = new Set(MALE_NAMES.map(strip));
    const female = new Set(FEMALE_NAMES.map(strip));
    for (const r of rows) {
      const id = /photo-([^?]+)/.exec(r.avatar_url)![1];
      const first = strip(r.full_name.split(" ")[0]);
      if (men.has(id)) expect(male.has(first), r.full_name).toBe(true);
      if (women.has(id)) expect(female.has(first), r.full_name).toBe(true);
    }
  });
});
