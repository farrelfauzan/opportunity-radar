import type { Messages } from "@/i18n/t";
import { fill } from "@/i18n/t";
import { RISK_CLASSES } from "@/lib/invest/risk";
import type { SignalTerm } from "@/server/data";

// The design's bar colours (Invest.dc.html): the higher the risk, the warmer; an empty bar is the divider colour.
// Colour only backs up the number and the label, which are text, and the count of filled bars.
const barColour = (risk: number) => (risk >= 4 ? "bg-[#FDBA74]" : risk === 3 ? "bg-[#FBBF24]" : "bg-[#2DD4BF]");

/** The six asset types: static, reviewed content (copy.md §7.1), shown the same whatever the data. */
export function RiskCards({ term, m }: { term: SignalTerm; m: Messages }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
      {RISK_CLASSES.map(({ key, risk }) => {
        const text = m.inv.classes.items[key];
        return (
          <li key={key} data-risk-card={key}>
            <article className="flex h-full flex-col gap-2.5 rounded-lg border border-glass-border bg-card px-5 py-4 shadow-glass backdrop-blur-[18px]">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold">{text.name}</h3>
                <span className="text-right text-xs text-muted-foreground">{text.eg}</span>
              </div>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" data-risk-bars={risk} className="flex gap-[3px]">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={`h-2 w-[18px] rounded-[2px] ${i <= risk ? barColour(risk) : "bg-[#4B3E75]"}`} />
                  ))}
                </span>
                <span className="font-semibold">{fill(m.inv.risk.label, { n: risk, label: m.inv.risk[String(risk) as "1" | "2" | "3" | "4" | "5"] })}</span>
              </div>
              <dl className="grid grid-cols-[96px_1fr] gap-x-2 gap-y-1 text-[13px]">
                <dt className="text-muted-foreground">{m.inv.drop}</dt>
                <dd>{text.drop}</dd>
                <dt className="text-muted-foreground">{term === "short" ? m.inv.term.shortLabel : m.inv.term.longLabel}</dt>
                <dd>{text[term]}</dd>
                <dt className="text-muted-foreground">{m.inv.mainRisks}</dt>
                <dd>{text.risks}</dd>
              </dl>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
