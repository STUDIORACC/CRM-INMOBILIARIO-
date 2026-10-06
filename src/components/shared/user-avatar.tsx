"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLookups } from "@/components/providers/app-context";
import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-pink-100 text-pink-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-rose-100 text-rose-700",
];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const SIZES = { xs: "size-5 text-[9px]", sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-20 text-xl" } as const;

export function UserAvatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Avatar className={cn(SIZES[size], "shrink-0", className)}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback className={cn("font-semibold", colorFor(name))}>{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}

/** Avatar + nombre de un usuario del equipo a partir de su id. */
export function UserChip({ userId, size = "sm", className, showRole = false }: { userId: string | null | undefined; size?: "xs" | "sm" | "md"; className?: string; showRole?: boolean }) {
  const { user } = useLookups();
  if (!userId) return <span className="text-sm text-muted-foreground">Sin asignar</span>;
  const u = user(userId);
  if (!u) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <UserAvatar name={u.fullName} src={u.avatarUrl} size={size} />
      <span className="min-w-0 truncate text-sm">{u.fullName}</span>
      {showRole && <span className="text-xs text-muted-foreground">{u.role}</span>}
    </span>
  );
}
