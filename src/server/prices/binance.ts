// Crypto from Binance's public market-data host (OR-27): daily klines and the
// latest price, USDT pairs treated as USD. Always `data-api.binance.vision`,
// never `api.binance.com` (R-1: that host failed from Indonesia). Live by
// default (no terms question); PRICES_CRYPTO=fixtures serves made-up replies.
import type { Candle } from "@/server/data";
import { getJson, positive } from "./http.ts";
import { priceMode, PriceSourceError, rng } from "./yahoo.ts";

export const BINANCE = "https://data-api.binance.vision";
export const KLINE_LIMIT = 1000; // Binance's maximum per call
const DAY_MS = 24 * 60 * 60 * 1000;

/** PRICES_CRYPTO (Binance and Indodax): "live" (default when unset) or "fixtures". */
export function cryptoMode(): "fixtures" | "live" {
  return priceMode("PRICES_CRYPTO", ["fixtures", "live"], "live");
}

/** Daily candles from a klines reply: [openTime, open, high, low, close, volume, ...]; the day is the UTC day. */
export function parseKlines(body: unknown): Candle[] {
  if (!Array.isArray(body)) throw new PriceSourceError("not a klines reply");
  const byDay = new Map<string, Candle>();
  for (const k of body as unknown[][]) {
    if (!Array.isArray(k) || !Number.isFinite(k[0])) throw new PriceSourceError("not a klines reply");
    const [open, high, low, close] = [k[1], k[2], k[3], k[4]].map((v, i) => positive(v, ["open", "high", "low", "close"][i]));
    const volume = Number(k[5]);
    const day = new Date(k[0] as number).toISOString().slice(0, 10);
    byDay.set(day, {
      day,
      open,
      close,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      volume: Number.isFinite(volume) && volume >= 0 ? Math.round(volume) : null,
    });
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** The price from a `/api/v3/ticker/price` reply. */
export function parseTicker(body: unknown, symbol: string): number {
  const b = body as { symbol?: unknown; price?: unknown } | null;
  if (b?.symbol !== symbol) throw new PriceSourceError("not a ticker reply");
  return positive(b.price, "price");
}

const PROFILES: Record<string, { start: number; vol: number }> = { BTCUSDT: { start: 3800, vol: 0.03 }, ETHUSDT: { start: 130, vol: 0.04 } };

/**
 * A made-up klines reply in Binance's exact shape, 24/7 daily from 2019-01-01,
 * deterministic per symbol, from `startTime` (at most KLINE_LIMIT rows). It is not market data.
 */
export function syntheticKlines(symbol: string, startTime: number, now: Date): unknown[][] {
  const p = PROFILES[symbol] ?? { start: 100, vol: 0.03 };
  const random = rng(symbol);
  const rows: unknown[][] = [];
  let price = p.start;
  for (let t = Date.UTC(2019, 0, 1); t <= now.getTime() && rows.length < KLINE_LIMIT; t += DAY_MS) {
    const r1 = random(), r2 = random(), r3 = random();
    const open = price;
    price = Math.max(1, price * (1 + 0.001 + p.vol * (r1 + r2 - 1) * 1.7));
    if (t < startTime) continue;
    const f = (v: number) => v.toFixed(2);
    rows.push([t, f(open), f(Math.max(open, price) * (1 + r3 * 0.01)), f(Math.min(open, price) * (1 - r2 * 0.01)), f(price), (1000 + r1 * 9000).toFixed(5), t + DAY_MS - 1, "0", 0, "0", "0", "0"]);
  }
  return rows;
}

export type CryptoSource = "binance" | "synthetic";

/** Up to KLINE_LIMIT daily candles from `startTime` (ms). */
export async function fetchKlines(symbol: string, startTime: number, transport: typeof fetch = fetch, now: Date = new Date()): Promise<Candle[]> {
  if (cryptoMode() === "fixtures") return parseKlines(syntheticKlines(symbol, startTime, now));
  const url = `${BINANCE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&startTime=${startTime}&limit=${KLINE_LIMIT}`;
  return parseKlines(await getJson(url, transport));
}

/** The latest price (USD for a USDT pair). */
export async function fetchTicker(symbol: string, transport: typeof fetch = fetch, now: Date = new Date()): Promise<number> {
  if (cryptoMode() === "fixtures") {
    const last = parseKlines(syntheticKlines(symbol, now.getTime() - 2 * DAY_MS, now)).at(-1);
    return parseTicker({ symbol, price: String(last?.close ?? 1) }, symbol);
  }
  return parseTicker(await getJson(`${BINANCE}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, transport), symbol);
}
