import { fill, type Messages } from "@/i18n/t";
import { deltaLabel, scoreChange } from "@/lib/ventures/view";
import { cn } from "@/lib/utils";

/**
 * The change of a market score vs yesterday: "▲ 5" / "▼ 2" / "— 0" for the eye (aria-hidden, never colour alone),
 * and "up 5 points vs yesterday" for the screen reader. `words` writes "▲ 5 vs yesterday" (the venture view).
 * Nothing when there is no change to say (the day before has no row).
 */
export function ScoreDelta({ delta, words, m }: { delta: number | null; words?: boolean; m: Messages }) {
  const change = scoreChange(delta, m.opp.trend);
  if (!change) return null;
  return (
    <>
      <span
        aria-hidden="true"
        data-trend={change.direction}
        className={cn(
          "text-xs font-semibold",
          change.direction === "up" && "text-primary",
          change.direction === "down" && "text-destructive",
          change.direction === "flat" && "text-muted-foreground",
        )}
      >
        {words ? fill(m.venture.market.vsYesterday, { change: change.text }) : change.text}
      </span>
      <span className="sr-only">{deltaLabel(delta!, m.radar.ventures)}</span>
    </>
  );
}
