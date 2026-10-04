// The rupiah price of a crypto pair from Indodax's public API (OR-27), quote
// only. Shares the PRICES_CRYPTO switch with Binance (live by default).
import { cryptoMode, fetchTicker } from "./binance.ts";
import { getJson, positive } from "./http.ts";
import { PriceSourceError } from "./yahoo.ts";

/** The USDT pair whose made-up price backs a pair's fixtures reply. */
const USD_PAIR: Record<string, string> = { btcidr: "BTCUSDT", ethidr: "ETHUSDT" };

/** The last trade price and server time from an `/api/ticker/{pair}` reply. */
export function parseIdrTicker(body: unknown): { price: number; asOf: Date } {
  const t = (body as { ticker?: { last?: unknown; server_time?: unknown } } | null)?.ticker;
  if (!t) throw new PriceSourceError("not an Indodax ticker reply");
  const time = Number(t.server_time);
  if (!Number.isFinite(time) || time <= 0) throw new PriceSourceError("Indodax reply without a time");
  // The docs show seconds; accept milliseconds too.
  return { price: positive(t.last, "price"), asOf: new Date(time > 1e12 ? time : time * 1000) };
}

export async function fetchIdrPrice(
  pair: string,
  transport: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<{ price: number; asOf: Date; source: "indodax" | "synthetic" }> {
  if (cryptoMode() === "fixtures") {
    // Made up: the synthetic USD price at a fixed 16,000 rupiah. Not market data.
    const usd = await fetchTicker(USD_PAIR[pair] ?? "BTCUSDT", transport, now);
    return { ...parseIdrTicker({ ticker: { last: String(Math.round(usd * 16_000)), server_time: Math.floor(now.getTime() / 1000) } }), source: "synthetic" };
  }
  return { ...parseIdrTicker(await getJson(`https://indodax.com/api/ticker/${encodeURIComponent(pair)}`, transport)), source: "indodax" };
}
