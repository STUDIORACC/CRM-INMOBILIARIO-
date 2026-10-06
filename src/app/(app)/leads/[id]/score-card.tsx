import { Flame } from "lucide-react";
import { TEMPERATURES, labelOf, toneOf, TONE_CLASSES } from "@/lib/domain/constants";
import type { ScoreResult } from "@/lib/domain/scoring";
import { cn } from "@/lib/utils";

const BAR: Record<string, string> = { cold: "bg-sky-500", warm: "bg-amber-500", hot: "bg-orange-500", very_hot: "bg-rose-500" };

/** Lead scoring explicado: qué suma y qué resta, con lógica comercial. */
export function ScoreCard({ result, score }: { result: ScoreResult | null; score: number }) {
  const temp = result?.temperature ?? "cold";
  const tone = toneOf(TEMPERATURES, temp);
  return (
    <section className="rounded-xl border bg-card p-4 shadow-card">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Flame className={cn("size-4", TONE_CLASSES[tone].text)} /> Lead scoring
        </h3>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", TONE_CLASSES[tone].badge)}>{labelOf(TEMPERATURES, temp)}</span>
      </header>
      <div className="flex items-end gap-2">
        <span className="text-4xl leading-none font-semibold tabular">{score}</span>
        <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-muted" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label="Puntaje del lead">
        <div className={cn("h-full rounded-full", BAR[temp])} style={{ width: `${score}%` }} />
        {[30, 60, 80].map((m) => (
          <span key={m} className="absolute top-0 h-2 w-px bg-background" style={{ left: `${m}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Frío 0–30</span>
        <span>Tibio 31–60</span>
        <span>Caliente 61–80</span>
        <span>Muy caliente</span>
      </div>
      {result && (
        <ul className="mt-4 space-y-2">
          {result.factors.map((f) => (
            <li key={f.key} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{f.label}</span>
                <span className={cn("tabular font-semibold", f.points < 0 ? "text-rose-600" : f.points === 0 ? "text-muted-foreground" : "text-foreground")}>
                  {f.points > 0 ? "+" : ""}
                  {f.points}
                  {f.max > 0 ? <span className="font-normal text-muted-foreground"> / {f.max}</span> : null}
                </span>
              </div>
              {f.max > 0 && (
                <div className="mt-1 h-1 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${(Math.max(0, f.points) / f.max) * 100}%` }} />
                </div>
              )}
              <div className="mt-0.5 text-muted-foreground">{f.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
