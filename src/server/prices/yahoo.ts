// Yahoo's chart endpoint (OR-26): stocks and indices, daily candles and the
// latest price. Off by default: PRICES_YAHOO unset or "fixtures" serves a
// synthetic response in Yahoo's shape and nothing goes to Yahoo. Yahoo's terms
// forbid automated collection (R-1 addendum); using it live is decision D9 (OR-53).
import type { Candle } from "@/server/data";

/** An upstream that failed or answered badly: that asset keeps its values and the run is partial. */
export class PriceSourceError extends Error {}
/** A wrong setting (e.g. an unknown PRICES_* value): the run fails. */
export class PriceConfigError extends Error {}

/** A PRICES_* switch: its value, the default when unset or empty, or a config error. */
export function priceMode<M extends string>(name: string, modes: readonly M[], fallback: M): M {
  const mode = process.env[name]?.trim() || fallback;
  if (!modes.includes(mode as M)) throw new PriceConfigError(`${name} must be ${modes.map((m) => `"${m}"`).join(" or ")}`);
  return mode as M;
}

/** "Holds live prices" guard: fixtures mode never writes made-up prices into a real series. */
export const HOLDS_REAL = "has real prices; fixtures mode writes nothing (is the live switch unset?)";

export type ChartResponse = {
  chart: {
    result:
      | {
          meta: { symbol: string; currency: string; gmtoffset: number; regularMarketPrice?: number; regularMarketTime?: number };
          timestamp?: number[];
          indicators: {
            quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[];
          };
        }[]
      | null;
    error: { code: string; description: string } | null;
  };
};

/** "synthetic" for made-up fixtures data, "yahoo" only for real Yahoo responses: stored with every value. */
export type ChartSource = "synthetic" | "yahoo";
export type Chart = { candles: Candle[]; quote: { price: number; asOf: Date } | null };

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Daily candles and the latest price from a chart response. Rows without a
 * close (Yahoo sends null rows) are skipped; a missing open, high or low takes
 * the close; the day is the exchange's calendar day; a day given twice keeps
 * the last row (the running day can appear twice). A close that is zero,
 * negative or not finite rejects the whole response (rules-v1 §4: INVALID_DATA),
 * so the asset keeps its previous values and the run is partial.
 */
export function parseChart(response: ChartResponse): Chart {
  const result = response.chart?.result?.[0];
  if (!result) throw new PriceSourceError(response.chart?.error?.description ?? "empty chart response");
  const { meta, timestamp = [] } = result;
  const q = result.indicators.quote[0] ?? { open: [], high: [], low: [], close: [], volume: [] };
  const byDay = new Map<string, Candle>();
  const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
  timestamp.forEach((t, i) => {
    const close = q.close[i];
    if (close === null || close === undefined) return; // Yahoo's null rows
    if (!valid(close)) throw new PriceSourceError(`invalid close ${close} in the response`);
    const pick = (v: number | null | undefined) => (valid(v) ? v : close);
    const open = pick(q.open[i]);
    const day = new Date((t + meta.gmtoffset) * 1000).toISOString().slice(0, 10);
    byDay.set(day, {
      day,
      open,
      high: Math.max(pick(q.high[i]), open, close),
      low: Math.min(pick(q.low[i]), open, close),
      close,
      volume: typeof q.volume[i] === "number" && Number.isFinite(q.volume[i]) && q.volume[i]! >= 0 ? Math.round(q.volume[i]!) : null,
    });
  });
  const candles = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  const quote =
    valid(meta.regularMarketPrice) && valid(meta.regularMarketTime)
      ? { price: meta.regularMarketPrice, asOf: new Date(meta.regularMarketTime * 1000) }
      : null;
  return { candles, quote };
}

// --- Synthetic responses (fixtures mode) -----------------------------------

type Profile = { start: number; drift: number; vol: number; gmtoffset: number; currency: string; openHour: number };
const PROFILES: Record<string, Profile> = {
  "^JKSE": { start: 5000, drift: 0.0002, vol: 0.009, gmtoffset: 7 * 3600, currency: "IDR", openHour: 9 },
  "BBCA.JK": { start: 6500, drift: 0.0002, vol: 0.013, gmtoffset: 7 * 3600, currency: "IDR", openHour: 9 },
  "^GSPC": { start: 3300, drift: 0.0003, vol: 0.011, gmtoffset: -4 * 3600, currency: "USD", openHour: 9 },
  // OR-27: COMEX gold and silver futures, USD per troy ounce.
  "GC=F": { start: 1500, drift: 0.0004, vol: 0.009, gmtoffset: -4 * 3600, currency: "USD", openHour: 9 },
  "SI=F": { start: 18, drift: 0.0003, vol: 0.016, gmtoffset: -4 * 3600, currency: "USD", openHour: 9 },
};
const DEFAULT_PROFILE: Profile = { start: 100, drift: 0.0001, vol: 0.01, gmtoffset: 0, currency: "USD", openHour: 9 };

/** Holiday-like gaps: no row on these month-days in any year. */
const CLOSED = new Set(["01-01", "05-01", "08-17", "12-25"]);

export function rng(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const RANGE_DAYS: Record<string, number> = { "5d": 5, "1mo": 31, "1y": 366, "6y": 6 * 366 };

/**
 * A made-up chart response in Yahoo's exact shape, for development and tests.
 * Deterministic: the whole history is generated from the symbol (since
 * 2019-01-01, weekdays only, with holiday gaps and an occasional null row like
 * Yahoo's), and `range` cuts the last part of it. It is not market data.
 */
export function syntheticChart(symbol: string, range: string, now: Date = new Date()): ChartResponse {
  const p = PROFILES[symbol] ?? DEFAULT_PROFILE;
  const random = rng(symbol);
  const from = Math.floor(now.getTime() / 1000) - (RANGE_DAYS[range] ?? 31) * DAY_SECONDS;
  const timestamp: number[] = [];
  const quote = { open: [] as (number | null)[], high: [] as (number | null)[], low: [] as (number | null)[], close: [] as (number | null)[], volume: [] as (number | null)[] };
  let price = p.start;
  for (let day = Date.UTC(2019, 0, 1) / 1000; day <= now.getTime() / 1000; day += DAY_SECONDS) {
    const date = new Date(day * 1000);
    const weekday = date.getUTCDay();
    const r1 = random(), r2 = random(), r3 = random();
    if (weekday === 0 || weekday === 6 || CLOSED.has(date.toISOString().slice(5, 10))) continue;
    const open = price;
    price = Math.max(1, price * (1 + p.drift + p.vol * (r1 + r2 - 1) * 1.7));
    const t = day + p.openHour * 3600 - p.gmtoffset;
    if (t < from || t > now.getTime() / 1000) continue;
    timestamp.push(t);
    const nullRow = r3 < 0.006; // Yahoo sends a few rows without prices
    const round = (v: number) => Math.round(v * 100) / 100;
    quote.open.push(nullRow ? null : round(open));
    quote.close.push(nullRow ? null : round(price));
    quote.high.push(nullRow ? null : round(Math.max(open, price) * (1 + r3 * 0.004)));
    quote.low.push(nullRow ? null : round(Math.min(open, price) * (1 - r2 * 0.004)));
    quote.volume.push(nullRow ? null : Math.round(1e6 + r1 * 9e6));
  }
  const lastClose = [...quote.close].reverse().find((c) => c !== null) ?? p.start;
  return {
    chart: {
      result: [
        {
          meta: {
            symbol,
            currency: p.currency,
            gmtoffset: p.gmtoffset,
            regularMarketPrice: lastClose,
            regularMarketTime: timestamp.length ? timestamp[timestamp.length - 1] + 7 * 3600 : Math.floor(now.getTime() / 1000),
          },
          timestamp,
          indicators: { quote: [quote] },
        },
      ],
      error: null,
    },
  };
}

// --- Fetching ---------------------------------------------------------------

const USER_AGENT = "Mozilla/5.0 (compatible; OpportunityRadar/0.1; +https://github.com/farrelfauzan/opportunity-radar)";

/** PRICES_YAHOO: "fixtures" (default when unset) or "live". */
export function yahooMode(): "fixtures" | "live" {
  return priceMode("PRICES_YAHOO", ["fixtures", "live"], "fixtures");
}

/** The chart of one symbol for a range ("5d", "1mo", "1y", "6y"), with where it came from. */
export async function fetchChart(symbol: string, range: string, transport: typeof fetch = fetch): Promise<Chart & { source: ChartSource }> {
  if (yahooMode() === "fixtures") return { ...parseChart(syntheticChart(symbol, range)), source: "synthetic" };
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  let response: Response;
  try {
    response = await transport(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new PriceSourceError((error as { name?: string }).name === "TimeoutError" ? "timeout" : "network error");
  }
  if (!response.ok) throw new PriceSourceError(String(response.status));
  try {
    return { ...parseChart((await response.json()) as ChartResponse), source: "yahoo" };
  } catch (error) {
    if (error instanceof PriceSourceError) throw error;
    throw new PriceSourceError("not a chart response");
  }
}
