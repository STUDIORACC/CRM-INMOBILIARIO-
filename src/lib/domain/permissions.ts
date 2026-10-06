import type { Role } from "./constants";

/**
 * Matriz de capacidades por rol. La autorización de datos la impone RLS en la base;
 * esta matriz gobierna navegación, botones y validaciones previas con mensajes claros.
 */
export type Capability =
  | "dashboard.global"
  | "leads.delete"
  | "leads.assign_any"
  | "leads.export"
  | "leads.import"
  | "clients.delete"
  | "clients.export"
  | "opportunities.access"
  | "opportunities.delete"
  | "opportunities.reassign"
  | "opportunities.export"
  | "properties.create"
  | "properties.edit_any"
  | "properties.delete"
  | "properties.financials"
  | "properties.export"
  | "owners.access"
  | "owners.delete"
  | "visits.reassign"
  | "visits.export"
  | "team.view"
  | "reports.view"
  | "reports.global"
  | "audit.view"
  | "settings.manage"
  | "templates.manage"
  | "tags.manage";

const ALL: Capability[] = [
  "dashboard.global",
  "leads.delete",
  "leads.assign_any",
  "leads.export",
  "leads.import",
  "clients.delete",
  "clients.export",
  "opportunities.access",
  "opportunities.delete",
  "opportunities.reassign",
  "opportunities.export",
  "properties.create",
  "properties.edit_any",
  "properties.delete",
  "properties.financials",
  "properties.export",
  "owners.access",
  "owners.delete",
  "visits.reassign",
  "visits.export",
  "team.view",
  "reports.view",
  "reports.global",
  "audit.view",
  "settings.manage",
  "templates.manage",
  "tags.manage",
];

export const CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  admin: new Set(ALL),
  manager: new Set(ALL.filter((c) => c !== "settings.manage")),
  advisor: new Set<Capability>([
    "opportunities.access",
    "properties.create",
    "properties.financials",
    "owners.access",
    "reports.view",
  ]),
  assistant: new Set<Capability>(["leads.assign_any", "leads.import", "visits.reassign"]),
};

export function can(role: Role | null | undefined, capability: Capability): boolean {
  return role ? CAPABILITIES[role].has(capability) : false;
}

export function isManagerRole(role: Role | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

/** Descripción legible de la matriz para la pantalla de configuración. */
export const PERMISSION_MATRIX: Array<{ area: string; admin: string; manager: string; advisor: string; assistant: string }> = [
  { area: "Dashboard", admin: "Global", manager: "Global", advisor: "Personal", assistant: "Personal" },
  { area: "Leads", admin: "Todos · eliminar", manager: "Todos · eliminar", advisor: "Propios y sin asignar", assistant: "Todos · registrar y editar" },
  { area: "Clientes", admin: "Todos · eliminar", manager: "Todos · eliminar", advisor: "Propios y sin asignar", assistant: "Todos · registrar y editar" },
  { area: "Oportunidades", admin: "Todas", manager: "Todas", advisor: "Propias", assistant: "Sin acceso" },
  { area: "Propiedades", admin: "Todas · eliminar", manager: "Todas · eliminar", advisor: "Ver todas · editar propias", assistant: "Solo lectura (sin comisiones)" },
  { area: "Propietarios", admin: "Todos", manager: "Todos", advisor: "Los de sus propiedades", assistant: "Sin acceso" },
  { area: "Visitas", admin: "Todas", manager: "Todas", advisor: "Propias", assistant: "Todas · agendar" },
  { area: "Tareas", admin: "Todas", manager: "Todas", advisor: "Propias", assistant: "Todas · asignar" },
  { area: "Equipo y ranking", admin: "Sí", manager: "Sí", advisor: "No", assistant: "No" },
  { area: "Reportes", admin: "Globales", manager: "Globales", advisor: "Solo propios", assistant: "No" },
  { area: "Auditoría", admin: "Sí", manager: "Sí", advisor: "No", assistant: "No" },
  { area: "Configuración y usuarios", admin: "Sí", manager: "No", advisor: "No", assistant: "No" },
];
