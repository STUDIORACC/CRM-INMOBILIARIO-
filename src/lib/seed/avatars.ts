import type { Db } from "@/lib/db/types";
import { FEMALE_NAMES, MALE_NAMES, strip } from "./names";

/**
 * Retratos de demostración: fotografías de Unsplash (licencia Unsplash, hotlink a su CDN), recortadas al
 * rostro. Son personas reales ajenas al sistema que solo ilustran los perfiles ficticios; en una instalación
 * real los perfiles muestran las iniciales hasta que se carga la foto verdadera de cada persona.
 * La selección prioriza retratos de personas con aspecto latinoamericano; no es una verificación de origen.
 */
export const portraitUrl = (id: string, size = 256) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&crop=faces&w=${size}&h=${size}&q=75`;

/** Equipo: cada persona tiene un retrato acorde a su rol (gerente de más edad, asesores jóvenes, etc.). */
export const STAFF_PORTRAITS: Record<string, string> = {
  admin: "1573497019940-1c28c88b4f3e",
  manager: "1741455620227-3b1c51e01419",
  jose: "1625241152315-4a698f74ceb7",
  mafe: "1645107913783-cd8c59a1cf6f",
  luis: "1742518424517-ca7890ff9510",
  camila: "1617608587073-7ca62257c52d",
  sofia: "1621876844834-6edee3083b9c",
  assistant: "1594311418510-ee5485be4f73",
};

/** Clientes: de más a menos presentables; los primeros se asignan a los casos más visibles. */
export const MEN_POOL = [
  "1648833913359-6969f883e6c5",
  "1608549950158-6d1dc2022ccd",
  "1734830268394-6c4a1f165af1",
  "1605857840732-188f2f08cb31",
  "1654110455429-cf322b40a906",
  "1527980965255-d3b416303d12",
  "1696661019390-8056efb2c55b",
  "1734830203085-0ee14946f005",
  "1734830203158-f7e65ce914b3",
  "1752070339136-ee8d6559e698",
  "1667786119855-92c31bc7b75b",
  "1542909168-6296a31d7689",
  "1759701546655-d90ec831aa52",
  "1759701546662-b79f5d881124",
  "1558216144-fef86b75da36",
  "1598641795816-a84ac9eac40c",
  "1669572203205-4d0f1fd71aa2",
];

export const WOMEN_POOL = [
  "1681500920181-0aff411f8cab",
  "1645107914072-6f16b732f224",
  "1588897553576-4e9349cd1be5",
  "1669563306643-8bff78e48942",
  "1621876844845-43b190fa6f2f",
  "1687293233211-6b0cc3beba70",
  "1642836421686-d0365124b4cc",
  "1580643668142-265d03d70da2",
  "1687293233192-230bc0f6869e",
  "1612041714878-997e3fe9cd13",
  "1767045548414-b0285f16d24f",
  "1732562455496-4d175d841cb1",
  "1783953777286-6b0f98ff647c",
  "1547212371-eb5e6a4b590c",
];

const MALE = new Set(MALE_NAMES.map(strip));
const FEMALE = new Set(FEMALE_NAMES.map(strip));
const genderOf = (fullName: string): "m" | "f" | null => {
  const first = strip(fullName.split(" ")[0]);
  return MALE.has(first) ? "m" : FEMALE.has(first) ? "f" : null;
};

/** Casos de la historia de demostración: reciben foto antes que nadie. */
const HERO_NAMES = ["Carlos Mendoza", "Andrea Salazar", "Luis Fernández", "Valeria Torres", "Diego Ramírez"];

interface Person {
  kind: "client" | "lead";
  id: string;
  full_name: string;
  weight: number;
}

/**
 * Asigna fotos sin repetir rostros: primero los casos de historia, luego los clientes con más negocio y, si sobran
 * fotos, los leads más avanzados. Quien no alcanza foto conserva las iniciales (en un CRM real muchos contactos no tienen foto).
 * Un lead convertido en cliente hereda la foto del cliente.
 */
export async function assignPortraits(db: Db): Promise<number> {
  const people = await db.query<Person>(
    `select 'client' as kind, c.id, c.full_name,
            (case when c.full_name = any($1::text[]) then 1000 else 0 end
             + (select count(*) from public.opportunities o where o.client_id = c.id) * 20
             + (select count(*) from public.visits v where v.client_id = c.id) * 5)::int as weight
       from public.clients c
     union all
     select 'lead', l.id, l.full_name,
            (case when l.full_name = any($1::text[]) then 1000 else 0 end
             + (select count(*) from public.opportunities o where o.lead_id = l.id) * 12
             + (select count(*) from public.visits v where v.lead_id = l.id) * 4
             + l.score / 10)::int
       from public.leads l where l.client_id is null`,
    [HERO_NAMES],
  );
  // Casos de la historia primero; luego los clientes (por volumen de negocio) y al final los leads sin convertir
  const rank = (p: Person) => (p.weight >= 1000 ? 0 : p.kind === "client" ? 1 : 2);
  people.sort((a, b) => rank(a) - rank(b) || b.weight - a.weight || a.full_name.localeCompare(b.full_name));

  const men = [...MEN_POOL];
  const women = [...WOMEN_POOL];
  let assigned = 0;
  for (const p of people) {
    const g = genderOf(p.full_name);
    const id = g === "m" ? men.shift() : g === "f" ? women.shift() : undefined;
    if (!id) continue;
    const url = portraitUrl(id);
    if (p.kind === "client") {
      await db.query("update public.clients set avatar_url = $2 where id = $1", [p.id, url]);
      await db.query("update public.leads set avatar_url = $2 where client_id = $1", [p.id, url]);
    } else {
      await db.query("update public.leads set avatar_url = $2 where id = $1", [p.id, url]);
    }
    assigned++;
  }
  return assigned;
}
