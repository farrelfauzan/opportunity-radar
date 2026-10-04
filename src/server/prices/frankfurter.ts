// USD/IDR from Frankfurter (ECB reference rates, OR-26). Live by default (its
// public API raises no terms question); PRICES_FRANKFURTER=fixtures reads the
// recorded history in ./fixtures, for tests.
import { readFileSync } from "node:fs";
import type { Candle } from "@/server/data";
import { priceMode, PriceSourceError } from "./yahoo.ts";

type Rates = { base: string; start_date?: string; end_date?: string; rates: Record<string, { IDR?: number }> };

/** PRICES_FRANKFURTER: "live" (default when unset) or "fixtures". */
export function frankfurterMode(): "fixtures" | "live" {
  return priceMode("PRICES_FRANKFURTER", ["fixtures", "live"], "live");
}

/** One daily "candle" per reference day: open, high, low and close are the day's rate. */
export function parseRates(body: Rates, since: string): Candle[] {
  if (body?.base !== "USD" || typeof body.rates !== "object") throw new PriceSourceError("not a Frankfurter response");
  return Object.entries(body.rates)
    .filter(([day, rate]) => day >= since && typeof rate?.IDR === "number" && rate.IDR > 0)
    .map(([day, rate]) => ({ day, open: rate.IDR!, high: rate.IDR!, low: rate.IDR!, close: rate.IDR!, volume: null }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** Daily USD/IDR rates from `since` (YYYY-MM-DD) to the latest reference day. */
export async function fetchUsdIdr(since: string, transport: typeof fetch = fetch): Promise<Candle[]> {
  if (frankfurterMode() === "fixtures") {
    const recorded = JSON.parse(readFileSync(new URL("./fixtures/frankfurter-usd-idr.json", import.meta.url), "utf8")) as Rates;
    return parseRates(recorded, since);
  }
  let response: Response;
  try {
    response = await transport(`https://api.frankfurter.dev/v1/${since}..?base=USD&symbols=IDR`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new PriceSourceError((error as { name?: string }).name === "TimeoutError" ? "timeout" : "network error");
  }
  if (!response.ok) throw new PriceSourceError(String(response.status));
  try {
    return parseRates((await response.json()) as Rates, since);
  } catch (error) {
    if (error instanceof PriceSourceError) throw error;
    throw new PriceSourceError("not a Frankfurter response");
  }
}
