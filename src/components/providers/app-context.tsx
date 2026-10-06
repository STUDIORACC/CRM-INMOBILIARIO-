"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Role } from "@/lib/domain/constants";
import { can, type Capability } from "@/lib/domain/permissions";
import { makeLookups, type Catalogs, type Lookups } from "@/lib/types/catalogs";

export interface ClientSession {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  phone: string | null;
}

interface AppContextValue {
  session: ClientSession;
  catalogs: Catalogs;
  lookups: Lookups;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ session, catalogs, children }: { session: ClientSession; catalogs: Catalogs; children: ReactNode }) {
  const value = useMemo(() => ({ session, catalogs, lookups: makeLookups(catalogs) }), [session, catalogs]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppProvider no está montado");
  return ctx;
}

export const useSession = () => useAppContext().session;
export const useCatalogs = () => useAppContext().catalogs;
export const useLookups = () => useAppContext().lookups;
export const useCan = (capability: Capability) => can(useAppContext().session.role, capability);
