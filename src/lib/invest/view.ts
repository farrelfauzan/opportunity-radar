import { formatDateShortWib, formatNumber, formatRupiah, formatUsdPrice } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { marketState, type MarketKind } from "@/lib/market/hours";
import { changeView, sparklinePoints, type ChangeView } from "@/lib/market/view";
import { staleText } from "@/lib/radar/view";
import type { SignalTerm, SignalView, WatchlistRow } from "@/server/data";
import { riskClassOf, riskOf } from "./risk";

/** The jobs that feed the watchlist's prices: each row's last successful run decides whether it is stale. */
export const PRICE_JOBS = ["prices", "metals", "crypto"] as const;

/** The job that feeds an asset, by where its prices come from; null for a source this screen does not know. */
export function jobOf(assetSource: string): (typeof PRICE_JOBS)[number] | null {
  switch (assetSource) {
    case "yahoo":
    case "frankfurter":
      return "prices";
    case "gold-api":
      return "metals";
    case "binance":
    case "indodax":
      return "crypto";
    default:
      return null;
  }
}

/** The market-hours rule of a row (copy.md §2.3): silver follows gold; null for a market with no rule (no stale, no closed). */
export function hoursKind(row: Pick<WatchlistRow, "kind" | "exchange">): MarketKind | null {
  switch (row.kind) {
    case "index":
    case "stock":
      return row.exchange === "IDX" ? "idx" : row.exchange === "US" ? "us" : null;
    case "metal":
      return "gold";
    case "crypto":
      return "crypto";
    case "fx":
      return "fx";
  }
}

const NAME_KEY = {
  ihsg: "ihsg",
  bbca: "bbca",
  sp500: "sp500",
  gold: "gold",
  silver: "silver",
  bitcoin: "bitcoin",
  ethereum: "ethereum",
} as const;

/** The name of an asset (asset.name.*); an asset without a key (one added later) shows its symbol. */
export function assetName(row: Pick<WatchlistRow, "slug" | "symbol">, m: Messages): string {
  return row.slug in NAME_KEY ? m.asset.name[NAME_KEY[row.slug as keyof typeof NAME_KEY]] : row.symbol;
}

/** The kind line under the name (copy.md §8.1); null when copy.md has no line for it. */
export function kindLine(row: Pick<WatchlistRow, "kind" | "exchange" | "currency">, m: Messages): string | null {
  switch (row.kind) {
    case "index":
      return row.exchange ? fill(m.asset.kind.index, { exchange: row.exchange }) : null;
    case "stock":
      return row.exchange === "IDX" ? m.asset.kind.idx : null;
    case "metal":
      return m.asset.kind.metalShort;
    case "crypto":
      return row.currency === "USD" ? m.asset.kind.crypto : null;
    case "fx":
      return null;
  }
}

/** The price in the unit of the asset: an index or a rate as a plain number, rupiah for IDR, dollars for USD. */
export function watchlistPriceText(row: Pick<WatchlistRow, "kind" | "currency">, price: number, locale: Locale): string {
  if (row.kind === "index" || row.kind === "fx") return formatNumber(price, locale);
  return row.currency === "IDR" ? formatRupiah(price, locale) : row.currency === "USD" ? formatUsdPrice(price, locale) : formatNumber(price, locale);
}

export type SignalCell =
  | { kind: "verdict"; verdict: "BUY" | "HOLD" | "SELL"; word: string }
  | { kind: "none"; state: "none" | "stale" | "invalid" | "sample"; text: string };

const WORD = { BUY: "buy", HOLD: "hold", SELL: "sell" } as const;

/**
 * What the signal column shows for a term: the verdict as a word, or the no-verdict text of the state (copy.md §8.1).
 * `SAMPLE` is the view of a synthetic series (signalViews already lets a verdict through only with SHOW_SAMPLE_SIGNALS=1
 * outside production); a term with no stored signal reads as `signal.none`.
 */
export function signalCell(views: SignalView[], term: SignalTerm, m: Messages): SignalCell {
  const view = views.find((v) => v.term === term);
  const none = (state: "none" | "stale" | "invalid" | "sample"): SignalCell => ({ kind: "none", state, text: m.signal[state] });
  switch (view?.state) {
    case "BUY":
    case "HOLD":
    case "SELL":
      return { kind: "verdict", verdict: view.state, word: m.signal[WORD[view.state]] };
    case "STALE":
      return none("stale");
    case "INVALID_DATA":
      return none("invalid");
    case "SAMPLE":
      return none("sample");
    default:
      return none("none"); // INSUFFICIENT, or no row at all
  }
}

export type WatchlistRowView = {
  slug: string;
  name: string;
  kind: string | null;
  href: string;
  /** Null when the asset has no price at all yet. */
  price: string | null;
  synthetic: boolean;
  change: ChangeView | null;
  /** SVG polyline points of the 30 closes, null under 2 closes. */
  points: string | null;
  /** The visually hidden text of the sparkline: first and last close. */
  trend: string | null;
  /** state.marketClosed with the date of the last close, while the market is shut. */
  closedText: string | null;
  stale: boolean;
  signal: SignalCell;
  /** The risk level (1 to 5) of the asset's type; null for an asset with no risk card. */
  risk: number | null;
};

/**
 * The rows of the watchlist for a term, the stale line, and whether any price is sample data. `runs` holds the last
 * successful run of each job in PRICE_JOBS; a job that has never run falls back to the time the store last wrote the
 * row's price. The stale line names the OLDEST stale run; it is null while no row is stale.
 */
export function watchlistView(
  rows: WatchlistRow[],
  runs: Record<string, Date | null>,
  term: SignalTerm,
  now: Date,
  locale: Locale,
  m: Messages,
): { rows: WatchlistRowView[]; staleLine: string | null; anySynthetic: boolean } {
  const staleRuns: Date[] = [];
  const views = rows.map((row): WatchlistRowView => {
    const priced = row.price;
    const job = jobOf(row.assetSource);
    const kind = hoursKind(row);
    const lastRun = (job && runs[job]) || priced?.updatedAt || null;
    const { closed, stale } = priced && kind ? marketState(kind, lastRun, now) : { closed: false, stale: false };
    if (stale) staleRuns.push(lastRun!);
    const riskClass = riskClassOf(row);
    const level = riskClass && riskOf(riskClass);
    const first = priced?.closes.at(0);
    const last = priced?.closes.at(-1);
    return {
      slug: row.slug,
      name: assetName(row, m),
      kind: kindLine(row, m),
      href: `/${locale}/invest/${row.slug}`,
      price: priced && watchlistPriceText(row, priced.price, locale),
      synthetic: priced?.synthetic ?? false,
      change: priced && changeView(priced.price, priced.previousClose, locale, m.radar.market),
      points: priced && sparklinePoints(priced.closes),
      trend:
        priced && first !== undefined && last !== undefined && priced.closes.length >= 2
          ? `${m.inv.col.month}: ${watchlistPriceText(row, first, locale)} → ${watchlistPriceText(row, last, locale)}`
          : null,
      closedText: priced && closed ? fill(m.state.marketClosed, { date: formatDateShortWib(priced.asOf, locale) }) : null,
      stale,
      signal: signalCell(row.signals, term, m),
      risk: level,
    };
  });
  const oldest = staleRuns.length > 0 ? new Date(Math.min(...staleRuns.map((run) => run.getTime()))) : null;
  return {
    rows: views,
    staleLine: oldest ? staleText(oldest, now, locale, m.state.stale, "prices") : null,
    anySynthetic: views.some((v) => v.synthetic),
  };
}

/** Nothing has ever been ingested: no watchlist asset has a price. */
export const neverIngested = (rows: WatchlistRow[]) => rows.every((row) => row.price === null);
