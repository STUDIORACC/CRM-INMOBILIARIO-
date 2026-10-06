import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  Calendar,
  CheckSquare,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Settings,
  Target,
  Trophy,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Capability } from "@/lib/domain/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  capability?: Capability;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Comercial",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/opportunities", label: "Oportunidades", icon: Target, capability: "opportunities.access" },
      { href: "/clients", label: "Clientes", icon: UserCheck },
    ],
  },
  {
    label: "Inventario",
    items: [
      { href: "/properties", label: "Propiedades", icon: Building2 },
      { href: "/owners", label: "Propietarios", icon: KeyRound, capability: "owners.access" },
    ],
  },
  {
    label: "Agenda",
    items: [
      { href: "/visits", label: "Visitas", icon: MapPin },
      { href: "/calendar", label: "Calendario", icon: Calendar },
      { href: "/tasks", label: "Tareas", icon: CheckSquare },
      { href: "/activities", label: "Actividades", icon: Activity },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/team", label: "Vendedores", icon: Trophy, capability: "team.view" },
      { href: "/reports", label: "Reportes", icon: BarChart3, capability: "reports.view" },
      { href: "/notifications", label: "Notificaciones", icon: Bell },
      { href: "/settings", label: "Configuración", icon: Settings },
    ],
  },
];
