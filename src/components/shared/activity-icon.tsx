import {
  ArrowRightLeft,
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckSquare,
  CircleCheck,
  CircleX,
  GitMerge,
  Handshake,
  Home,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Repeat,
  RotateCcw,
  Send,
  StickyNote,
  Tag,
  Target,
  TrendingDown,
  Trophy,
  UserCheck,
  UserPlus,
  UserRoundCheck,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface ActivityVisual {
  icon: LucideIcon;
  /** Clases de fondo/texto del círculo del icono. */
  tone: string;
}

const T = {
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  indigo: "bg-indigo-50 text-indigo-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  slate: "bg-slate-100 text-slate-600",
  pink: "bg-pink-50 text-pink-600",
  teal: "bg-teal-50 text-teal-600",
  rose: "bg-rose-50 text-rose-600",
  orange: "bg-orange-50 text-orange-600",
};

const BY_TYPE: Record<string, ActivityVisual> = {
  call: { icon: Phone, tone: T.blue },
  whatsapp: { icon: MessageCircle, tone: T.emerald },
  email: { icon: Mail, tone: T.indigo },
  meeting: { icon: Users, tone: T.violet },
  visit: { icon: MapPin, tone: T.amber },
  note: { icon: StickyNote, tone: T.slate },
  follow_up: { icon: Repeat, tone: T.pink },
  task: { icon: CheckSquare, tone: T.teal },
};

const BY_EVENT: Record<string, ActivityVisual> = {
  lead_created: { icon: UserPlus, tone: T.indigo },
  assigned: { icon: UserCheck, tone: T.violet },
  stage_changed: { icon: ArrowRightLeft, tone: T.slate },
  qualified: { icon: BadgeCheck, tone: T.indigo },
  property_sent: { icon: Send, tone: T.blue },
  visit_scheduled: { icon: CalendarPlus, tone: T.amber },
  visit_confirmed: { icon: CalendarCheck, tone: T.emerald },
  visit_completed: { icon: MapPin, tone: T.amber },
  visit_cancelled: { icon: CalendarX, tone: T.rose },
  visit_no_show: { icon: UserX, tone: T.orange },
  visit_rescheduled: { icon: CalendarClock, tone: T.violet },
  opportunity_created: { icon: Target, tone: T.violet },
  opportunity_stage: { icon: ArrowRightLeft, tone: T.slate },
  negotiation_started: { icon: Handshake, tone: T.pink },
  reserved: { icon: Lock, tone: T.teal },
  won: { icon: Trophy, tone: T.emerald },
  lost: { icon: CircleX, tone: T.rose },
  reactivated: { icon: RotateCcw, tone: T.blue },
  converted: { icon: UserRoundCheck, tone: T.emerald },
  client_created: { icon: UserRoundCheck, tone: T.blue },
  merged: { icon: GitMerge, tone: T.slate },
  tags_changed: { icon: Tag, tone: T.slate },
  property_listed: { icon: Home, tone: T.teal },
  price_changed: { icon: TrendingDown, tone: T.amber },
  property_status: { icon: Home, tone: T.slate },
  task_completed: { icon: CircleCheck, tone: T.teal },
};

export function activityVisual(type: string, event?: string | null): ActivityVisual {
  if (type === "system" && event && BY_EVENT[event]) return BY_EVENT[event];
  return BY_TYPE[type] ?? { icon: StickyNote, tone: T.slate };
}

export function ActivityIcon({ type, event, size = "md" }: { type: string; event?: string | null; size?: "sm" | "md" }) {
  const v = activityVisual(type, event);
  const Icon = v.icon;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${v.tone} ${size === "sm" ? "size-7" : "size-8"}`}>
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </span>
  );
}
