import type { Role } from "@/lib/domain/constants";

export interface CatalogItem {
  id: string;
  key: string;
  label: string;
  color: string | null;
  position: number;
  active: boolean;
}

export interface StageDef {
  key: string;
  label: string;
  position: number;
  kind: "open" | "won" | "lost";
  defaultProbability: number;
  color: string;
}

export interface TeamUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: "active" | "inactive";
  avatarUrl: string | null;
  phone: string | null;
  hiredAt: string;
}

export interface TagDef {
  id: string;
  name: string;
  color: string;
}

export interface TemplateDef {
  id: string;
  name: string;
  channel: "whatsapp" | "email";
  category: string;
  subject: string | null;
  body: string;
  active: boolean;
}

export interface CompanyInfo {
  name: string;
  legalName: string | null;
  taxId: string | null;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  currency: "PEN" | "USD";
  usdRate: number;
  alertLeadIdleDays: number;
  alertOpportunityDays: number;
  alertClientIdleDays: number;
  alertFirstResponseH: number;
  notifySettings: Record<string, boolean>;
}

export interface Catalogs {
  sources: CatalogItem[];
  lossReasons: CatalogItem[];
  propertyTypes: CatalogItem[];
  districts: CatalogItem[];
  stages: StageDef[];
  users: TeamUser[];
  tags: TagDef[];
  templates: TemplateDef[];
  company: CompanyInfo;
}

export interface Lookups {
  source: (key: string | null | undefined) => string;
  sourceColor: (key: string | null | undefined) => string;
  district: (key: string | null | undefined) => string;
  districts: (keys: string[] | null | undefined) => string;
  propertyType: (key: string | null | undefined) => string;
  lossReason: (key: string | null | undefined) => string;
  stage: (key: string | null | undefined) => StageDef | undefined;
  stageLabel: (key: string | null | undefined) => string;
  user: (id: string | null | undefined) => TeamUser | undefined;
  userName: (id: string | null | undefined) => string;
}

const find = (items: CatalogItem[], key: string | null | undefined) => (key ? items.find((i) => i.key === key) : undefined);

export function makeLookups(c: Catalogs): Lookups {
  return {
    source: (k) => (k ? (find(c.sources, k)?.label ?? k) : "—"),
    sourceColor: (k) => find(c.sources, k)?.color ?? "#9aa3b2",
    district: (k) => (k ? (find(c.districts, k)?.label ?? k) : "—"),
    districts: (ks) => (ks && ks.length ? ks.map((k) => find(c.districts, k)?.label ?? k).join(", ") : "—"),
    propertyType: (k) => (k ? (find(c.propertyTypes, k)?.label ?? k) : "—"),
    lossReason: (k) => (k ? (find(c.lossReasons, k)?.label ?? k) : "—"),
    stage: (k) => (k ? c.stages.find((s) => s.key === k) : undefined),
    stageLabel: (k) => (k ? (c.stages.find((s) => s.key === k)?.label ?? k) : "—"),
    user: (id) => (id ? c.users.find((u) => u.id === id) : undefined),
    userName: (id) => (id ? (c.users.find((u) => u.id === id)?.fullName ?? "—") : "Sin asignar"),
  };
}
