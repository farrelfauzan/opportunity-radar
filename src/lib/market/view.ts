import { formatChange, formatDateShortWib, formatNumber, formatRupiah, formatTimeWib, formatUsdPrice } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { staleText } from "@/lib/radar/view";
import type { MarketRow, MarketSlug } from "@/server/data";
import { marketState, sameWibDay, type MarketKind } from "./hours";

export const MARKET_KIND: Record<MarketSlug, MarketKind> = { ihsg: "idx", "usd-idr": "fx", gold: "gold", bitcoin: "crypto" };

/** The job that feeds each row: its last successful run decides whether the row is stale. */
export const MARKET_JOB: Record<MarketSlug, string> = { ihsg: "prices", "usd-idr": "prices", gold: "metals", bitcoin: "crypto" };

const nameKey = { ihsg: "ihsg", "usd-idr": "usdidr", gold: "goldGram", bitcoin: "bitcoin" } as const;

const SPARK_WIDTH = 96;
const SPARK_HEIGHT = 28;
const SPARK_PAD = 3; // the line keeps 3 units from the top and bottom edge, as in the design

/**
 * The points of a 96 × 28 polyline for the closes (oldest first), scaled to their own minimum and maximum;
 * a flat series is a straight line through the middle. Null under 2 points: nothing to draw.
 */
export function sparklinePoints(closes: number[]): string | null {
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  return closes
    .map((close, index) => {
      const x = (index * SPARK_WIDTH) / (closes.length - 1);
      const y = max === min ? SPARK_HEIGHT / 2 : SPARK_HEIGHT - SPARK_PAD - ((close - min) / (max - min)) * (SPARK_HEIGHT - 2 * SPARK_PAD);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** The latest price in the unit of the asset: IHSG and USD/IDR plain (whole numbers), gold in rupiah, Bitcoin in dollars. */
export function priceText(slug: MarketSlug, price: number, locale: Locale): string {
  switch (slug) {
    case "gold":
      return formatRupiah(price, locale);
    case "bitcoin":
      return formatUsdPrice(price, locale);
    default:
      return formatNumber(price, locale);
  }
}

export type ChangeView = { direction: "up" | "down" | "flat"; arrow: string; text: string; label: string };

const arrows = { up: "▲", down: "▼", flat: "—" } as const;

/**
 * The 1-day change of the price against the previous close: an arrow (▲ ▼, a dash when unchanged), the unsigned
 * percent with one decimal, and the spoken label ("up 1.2%"). Null without a previous close.
 */
export function changeView(price: number, previousClose: number | null, locale: Locale, strings: Messages["radar"]["market"]): ChangeView | null {
  if (previousClose === null || previousClose <= 0) return null;
  const change = formatChange((price - previousClose) / previousClose, locale);
  if (!change) return null;
  return { ...change, arrow: arrows[change.direction], label: change.direction === "flat" ? strings.flat : fill(strings[change.direction], { pct: change.text }) };
}

/**
 * The as-of line of a row: the market-closed text (last close date) while its market is shut; "As of {date}" for
 * a daily rate (USD/IDR) or a last close without a quote; otherwise "As of {time} WIB" for today (WIB) and
 * "As of {date}, {time} WIB" for an earlier day.
 */
export function asOfText(row: MarketRow, closed: boolean, now: Date, locale: Locale, m: Messages): string {
  const date = formatDateShortWib(row.asOf, locale);
  if (closed) return fill(m.state.marketClosed, { date });
  if (row.slug === "usd-idr" || !row.timed) return fill(m.radar.market.asOfDate, { date });
  const time = formatTimeWib(row.asOf, locale);
  return sameWibDay(row.asOf, now) ? fill(m.radar.market.asOf, { time }) : fill(m.radar.market.asOfEarlier, { date, time });
}

export type MarketRowView = {
  slug: MarketSlug;
  name: string;
  price: string;
  synthetic: boolean;
  change: ChangeView | null;
  /** SVG polyline points, null when there are fewer than 2 closes. */
  points: string | null;
  /** The spoken summary of the sparkline ("Last 10 closes: from … to …"), null with it. */
  trend: string | null;
  asOf: string;
  stale: boolean;
};

/**
 * The rows and the stale line of the market snapshot. `runs` holds the last successful run of each feeding job
 * (MARKET_JOB); a job that has never run falls back to the time the store last wrote the row's price.
 * The line names the OLDEST stale run; it is null while no row is stale.
 */
export function marketView(
  rows: MarketRow[],
  runs: Record<string, Date | null>,
  now: Date,
  locale: Locale,
  m: Messages,
): { rows: MarketRowView[]; staleLine: string | null } {
  const staleRuns: Date[] = [];
  const views = rows.map((row): MarketRowView => {
    const lastRun = runs[MARKET_JOB[row.slug]] ?? row.updatedAt;
    const { closed, stale } = marketState(MARKET_KIND[row.slug], lastRun, now);
    if (stale) staleRuns.push(lastRun);
    return {
      slug: row.slug,
      name: m.asset.name[nameKey[row.slug]],
      price: priceText(row.slug, row.price, locale),
      synthetic: row.synthetic,
      change: changeView(row.price, row.previousClose, locale, m.radar.market),
      points: sparklinePoints(row.closes),
      trend:
        row.closes.length >= 2
          ? fill(m.radar.market.trend, {
              first: priceText(row.slug, row.closes[0], locale),
              last: priceText(row.slug, row.closes[row.closes.length - 1], locale),
            })
          : null,
      asOf: asOfText(row, closed, now, locale, m),
      stale,
    };
  });
  const oldest = staleRuns.length > 0 ? new Date(Math.min(...staleRuns.map((run) => run.getTime()))) : null;
  return { rows: views, staleLine: oldest ? staleText(oldest, now, locale, m.state.stale, "prices") : null };
}
