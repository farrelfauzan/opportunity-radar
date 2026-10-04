// Gold and silver spot prices from gold-api.com (OR-27), USD per troy ounce,
// real time only (its history needs a key, R-2 §3). Off by default:
// PRICES_GOLDAPI unset or "fixtures" serves a made-up reply and nothing goes
// to gold-api.com; "live" calls it (the live check is OR-54).
import { getJson, positive } from "./http.ts";
import { parseChart, priceMode, PriceSourceError, syntheticChart } from "./yahoo.ts";

/** The futures contract used for a metal's history and as the fallback quote (labelled futures, never spot). */
export const FUTURES: Record<string, string> = { XAU: "GC=F", XAG: "SI=F" };

export type Spot = { price: number; asOf: Date; source: "gold-api" | "synthetic" };

/** PRICES_GOLDAPI: "fixtures" (default when unset) or "live". */
export function goldApiMode(): "fixtures" | "live" {
  return priceMode("PRICES_GOLDAPI", ["fixtures", "live"], "fixtures");
}

/** The USD price and its time from a gold-api.com `/price/{symbol}` reply. */
export function parseSpot(body: unknown, symbol: string): { price: number; asOf: Date } {
  const b = body as { symbol?: unknown; price?: unknown; updatedAt?: unknown; currency?: unknown } | null;
  if (b?.symbol !== symbol || (b.currency !== undefined && b.currency !== "USD")) throw new PriceSourceError("not a gold-api.com price reply");
  const asOf = new Date(typeof b.updatedAt === "string" ? b.updatedAt : NaN);
  if (Number.isNaN(asOf.getTime())) throw new PriceSourceError("gold-api.com reply without a time");
  return { price: positive(b.price, "price"), asOf };
}

/** A made-up reply in gold-api.com's shape: just under the synthetic futures price. It is not market data. */
export function syntheticSpot(symbol: string, now: Date): unknown {
  const futures = parseChart(syntheticChart(FUTURES[symbol] ?? symbol, "5d", now)).candles.at(-1);
  return { currency: "USD", name: symbol, price: Math.round((futures?.close ?? 1) * 0.995 * 100) / 100, symbol, updatedAt: now.toISOString() };
}

export async function fetchSpot(symbol: string, transport: typeof fetch = fetch, now: Date = new Date()): Promise<Spot> {
  if (goldApiMode() === "fixtures") return { ...parseSpot(syntheticSpot(symbol, now), symbol), source: "synthetic" };
  const body = await getJson(`https://api.gold-api.com/price/${encodeURIComponent(symbol)}`, transport);
  return { ...parseSpot(body, symbol), source: "gold-api" };
}
