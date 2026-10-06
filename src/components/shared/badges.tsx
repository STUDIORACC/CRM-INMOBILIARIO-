import { Flame, Snowflake, Thermometer } from "lucide-react";
import {
  LEAD_STAGES,
  PRIORITIES,
  PROPERTY_STATUSES,
  TASK_STATUSES,
  TEMPERATURES,
  TONE_CLASSES,
  VISIT_STATUSES,
  labelOf,
  toneOf,
  type Opt,
  type Tone,
} from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

export function ToneBadge({
  tone = "slate",
  children,
  dot = false,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_CLASSES[tone].badge,
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", TONE_CLASSES[tone].dot)} />}
      {children}
    </span>
  );
}

export function OptBadge<T extends string>({ list, value, dot = true, className }: { list: ReadonlyArray<Opt<T>>; value: string | null | undefined; dot?: boolean; className?: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <ToneBadge tone={toneOf(list, value)} dot={dot} className={className}>
      {labelOf(list, value)}
    </ToneBadge>
  );
}

export const LeadStageBadge = ({ value }: { value: string }) => <OptBadge list={LEAD_STAGES} value={value} />;
export const PriorityBadge = ({ value }: { value: string | null }) => <OptBadge list={PRIORITIES} value={value} />;
export const PropertyStatusBadge = ({ value }: { value: string }) => <OptBadge list={PROPERTY_STATUSES} value={value} />;
export const VisitStatusBadge = ({ value }: { value: string }) => <OptBadge list={VISIT_STATUSES} value={value} />;
export const TaskStatusBadge = ({ value }: { value: string }) => <OptBadge list={TASK_STATUSES} value={value} />;

/** Chip de color arbitrario (etapas del pipeline, etiquetas). */
export function ColorChip({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", className)}
      style={{ backgroundColor: `${color}1a`, color: shade(color), boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

/** Texto legible sobre el tinte del color: oscurece el hex. */
function shade(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * 0.62);
  const g = Math.round(((n >> 8) & 255) * 0.62);
  const b = Math.round((n & 255) * 0.62);
  return `rgb(${r}, ${g}, ${b})`;
}

export function TagChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}1f`, color: shade(color) }}
    >
      {name}
    </span>
  );
}

export function TemperatureBadge({ score, temperature, showScore = true }: { score: number; temperature: string; showScore?: boolean }) {
  const tone = toneOf(TEMPERATURES, temperature);
  const Icon = temperature === "cold" ? Snowflake : temperature === "warm" ? Thermometer : Flame;
  return (
    <ToneBadge tone={tone} className="tabular">
      <Icon className="size-3" />
      {labelOf(TEMPERATURES, temperature)}
      {showScore && <span className="opacity-70">· {score}</span>}
    </ToneBadge>
  );
}
