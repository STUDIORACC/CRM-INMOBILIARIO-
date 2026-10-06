import type { Rng } from "./rng";

export const MALE_NAMES = [
  "Carlos", "Luis", "Diego", "José", "Jorge", "Miguel", "Andrés", "Juan", "Pedro", "Ricardo", "Fernando", "Javier",
  "Eduardo", "Manuel", "Gustavo", "César", "Renato", "Álvaro", "Sergio", "Marco", "Alonso", "Daniel", "Hugo", "Raúl",
  "Víctor", "Óscar", "Rodrigo", "Mauricio", "Gonzalo", "Walter", "Cristian", "Henry", "Iván", "Julio", "Fabián",
];

export const FEMALE_NAMES = [
  "Andrea", "Valeria", "María", "Carmen", "Rosa", "Patricia", "Lucía", "Camila", "Sofía", "Daniela", "Claudia", "Gabriela",
  "Karla", "Diana", "Mónica", "Silvia", "Paola", "Fiorella", "Milagros", "Jimena", "Lorena", "Katherine", "Verónica",
  "Carolina", "Yesenia", "Rocío", "Teresa", "Alejandra", "Natalia", "Pilar", "Ximena", "Brenda", "Liliana", "Nataly",
];

export const SURNAMES = [
  "Mendoza", "Salazar", "Fernández", "Torres", "Ramírez", "Quispe", "Flores", "Rojas", "Chávez", "Vargas", "Castillo",
  "Ramos", "Huamán", "Gutiérrez", "Paredes", "Sánchez", "García", "López", "Díaz", "Rodríguez", "Morales", "Herrera",
  "Medina", "Cárdenas", "Vásquez", "Córdova", "Delgado", "Villanueva", "Zevallos", "Aguirre", "Palacios", "Ortiz",
  "Cabrera", "Espinoza", "Valdivia", "Benavides", "Cáceres", "Arana", "Bustamante", "Calderón", "Campos", "Carrasco",
  "Condori", "Cruz", "Esquivel", "Figueroa", "Guerrero", "Ibáñez", "Jiménez", "León", "Luna", "Maldonado", "Montalvo",
  "Navarro", "Núñez", "Olivera", "Peralta", "Prado", "Quiroz", "Ríos", "Salas", "Tapia", "Ugarte", "Valencia", "Zamora",
  "Rivera", "Soto", "Reyes", "Silva", "Pacheco", "Meza", "Lazo", "Arias", "Bravo", "Cano", "Dávila", "Estrada",
];

export const COMPANY_NAMES = [
  "Inversiones Pacífico S.A.C.",
  "Constructora Los Andes S.A.C.",
  "Grupo Inmobiliario Costa Verde S.A.",
  "Inversiones Santa Rosa E.I.R.L.",
  "Desarrollos Urbanos del Sur S.A.C.",
  "Corporación Mirador S.A.C.",
  "Inversiones y Servicios Valle Real S.A.C.",
  "Patrimonio Familiar Zevallos E.I.R.L.",
];

export const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface Person {
  firstName: string;
  lastName: string;
  fullName: string;
  female: boolean;
}

export function randomPerson(rng: Rng): Person {
  const female = rng.chance(0.5);
  const firstName = rng.pick(female ? FEMALE_NAMES : MALE_NAMES);
  const s1 = rng.pick(SURNAMES);
  let s2 = rng.pick(SURNAMES);
  if (s2 === s1) s2 = rng.pick(SURNAMES);
  const fullName = rng.chance(0.55) ? `${firstName} ${s1} ${s2}` : `${firstName} ${s1}`;
  return { firstName, lastName: s1, fullName, female };
}

const MAIL_DOMAINS = ["example.com", "example.org", "example.net"];

export function emailFor(rng: Rng, fullName: string): string {
  const [first, ...rest] = strip(fullName).toLowerCase().split(/\s+/);
  const last = rest[0] ?? "cliente";
  const sep = rng.pick([".", "_", ""]);
  const suffix = rng.chance(0.45) ? String(rng.int(70, 99)) : "";
  return `${first}${sep}${last}${suffix}@${rng.pick(MAIL_DOMAINS)}`;
}

/** Móviles ficticios con formato peruano (9 dígitos, empiezan en 9). */
export function phoneFor(rng: Rng, used: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const n = `9${rng.int(0, 99999999).toString().padStart(8, "0")}`;
    if (!used.has(n)) {
      used.add(n);
      return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
    }
  }
  throw new Error("No se pudo generar un teléfono único");
}

export function dniFor(rng: Rng): string {
  return String(rng.int(10000000, 78999999));
}

export function rucFor(rng: Rng): string {
  return `20${rng.int(100000000, 699999999)}`;
}
