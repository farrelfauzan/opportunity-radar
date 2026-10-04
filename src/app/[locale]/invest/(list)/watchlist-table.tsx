import Link from "next/link";
import { focusRing } from "@/components/focus-ring";
import { SampleBadge } from "@/components/sample-badge";
import type { Messages } from "@/i18n/t";
import type { SignalCell, WatchlistRowView } from "@/lib/invest/view";
import { cn } from "@/lib/utils";

// The signal is a word first. The outline is a second, colour-free cue (solid thick, solid thin, double); the dashed
// outline is reserved for the Sample badge. Colours are the design's (Invest.dc.html).
const chipStyle = {
  BUY: "border-2 border-solid border-[#5EEAD4] bg-[#1D4B48] text-[#5EEAD4]",
  HOLD: "border border-solid border-[#E2DDF0] bg-[#4B3E75] text-[#E2DDF0]",
  SELL: "border-[3px] border-double border-[#FDBA74] bg-[#5A3320] text-[#FDBA74]",
} as const;

function Signal({ cell }: { cell: SignalCell }) {
  if (cell.kind === "none") {
    return (
      <span data-signal={cell.state} className="text-xs text-muted-foreground">
        {cell.text}
      </span>
    );
  }
  return (
    <span
      data-signal={cell.verdict}
      className={cn("inline-block min-w-11 rounded-full px-2 py-0.5 text-center text-xs font-bold", chipStyle[cell.verdict])}
    >
      {cell.word}
    </span>
  );
}

const th = "px-2 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "px-2 py-3 align-middle";

/**
 * The watchlist: a table on a wide screen, a list of cards on a narrow one (below 768 px; the phone layout of
 * copy.md §11). It is one table in both: the cells only change where they sit, so there is a single copy of every text.
 */
export function WatchlistTable({ rows, titleId, describedBy, m }: { rows: WatchlistRowView[]; titleId: string; describedBy?: string; m: Messages }) {
  return (
    // The roles are spelled out because a table whose display is changed (the card layout) loses them in some browsers.
    <table role="table" aria-labelledby={titleId} aria-describedby={describedBy} className="w-full border-collapse max-md:block">
      <thead role="rowgroup" className="max-md:sr-only">
        <tr role="row">
          <th scope="col" role="columnheader" className={cn(th, "pl-0")}>
            {m.inv.col.asset}
          </th>
          <th scope="col" role="columnheader" className={cn(th, "text-right")}>
            {m.inv.col.price}
          </th>
          <th scope="col" role="columnheader" className={cn(th, "text-right")}>
            {m.inv.col.day}
          </th>
          <th scope="col" role="columnheader" className={th}>
            {m.inv.col.month}
          </th>
          <th scope="col" role="columnheader" className={th}>
            {m.inv.col.signal}
          </th>
          <th scope="col" role="columnheader" className={cn(th, "pr-0")}>
            {m.inv.col.risk}
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup" className="max-md:flex max-md:flex-col max-md:gap-3">
        {rows.map((row) => (
          <Row key={row.slug} row={row} m={m} />
        ))}
      </tbody>
    </table>
  );
}

function Row({ row, m }: { row: WatchlistRowView; m: Messages }) {
  const change = row.change;
  const tone = change?.direction === "up" ? "text-primary" : change?.direction === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <tr
      role="row"
      data-watch-row={row.slug}
      className="border-t border-[#4B3E75] max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:rounded-lg max-md:border max-md:border-glass-border max-md:bg-white/8 max-md:p-3"
    >
      <th scope="row" role="rowheader" className={cn(td, "pl-0 text-left font-normal max-md:col-start-1 max-md:row-start-1 max-md:p-0")}>
        <Link href={row.href} className={cn("inline-flex min-h-11 items-center font-semibold [overflow-wrap:anywhere]", focusRing)}>
          {row.name}
        </Link>
        {row.kind && <span className="block text-xs text-muted-foreground">{row.kind}</span>}
      </th>
      <td role="cell" className={cn(td, "text-right max-md:col-start-1 max-md:row-start-2 max-md:p-0 max-md:text-left")}>
        <span className="flex flex-col items-end gap-1 max-md:items-start">
          <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 max-md:justify-start">
            <span data-watch-price className="font-mono text-[13px]">
              {row.price ?? "—"}
            </span>
            {row.synthetic && <SampleBadge label={m.sample.badge} />}
          </span>
          {row.closedText && <span className="text-xs text-muted-foreground">{row.closedText}</span>}
          {row.stale && <span className="text-xs font-semibold text-foreground">{m.radar.market.stale}</span>}
        </span>
      </td>
      <td
        role="cell"
        data-watch-change={change?.direction ?? "none"}
        className={cn(td, "text-right font-mono text-[13px] font-medium max-md:col-start-2 max-md:row-start-2 max-md:p-0", tone)}
      >
        {/* The arrow and number are for the eye; the screen reader gets "up 1.2%" instead. */}
        {change ? (
          <>
            <span aria-hidden="true">
              {change.arrow} {change.text}
            </span>
            <span className="sr-only">{change.label}</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">{m.radar.market.noChange}</span>
          </>
        )}
      </td>
      <td role="cell" className={cn(td, "max-md:col-start-1 max-md:row-start-3 max-md:p-0")}>
        {row.points && (
          <>
            <svg viewBox="0 0 96 28" aria-hidden="true" data-watch-spark className="block h-7 w-24">
              <polyline points={row.points} fill="none" strokeWidth={1.5} className={cn("stroke-current", tone)} />
            </svg>
            {row.trend && <span className="sr-only">{row.trend}</span>}
          </>
        )}
      </td>
      <td role="cell" className={cn(td, "max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end max-md:p-0")}>
        <Signal cell={row.signal} />
      </td>
      <td role="cell" data-watch-risk={row.risk ?? "none"} className={cn(td, "pr-0 text-[13px] max-md:col-start-2 max-md:row-start-3 max-md:justify-self-end max-md:p-0")}>
        {row.risk ? (
          <>
            <span className="text-muted-foreground md:hidden">{m.inv.col.risk} </span>
            {row.risk}/5
          </>
        ) : (
          <span aria-hidden="true">—</span>
        )}
      </td>
    </tr>
  );
}
