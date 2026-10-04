// Deterministic market data for the Radar's market snapshot in the browser tests. Pure data (no database
// access): scripts/e2e-db.ts stores it, e2e/radar.spec.ts reads the expectations from it.
// Each asset has 10 daily closes on the 10 days up to yesterday (UTC); the last close is the previous close the
// 1-day change is measured against, and the quote is newer than every candle.

export type FixtureMarket = {
  slug: "ihsg" | "usd-idr" | "gold" | "bitcoin";
  symbol: string;
  name: string;
  kind: "index" | "fx" | "metal" | "crypto";
  exchange: string | null;
  currency: string;
  source: string;
  /** The quote's source: "synthetic" rows get the Sample badge. */
  quoteSource: string;
  price: number;
  /** Daily closes, oldest first. */
  closes: number[];
  /** A daily rate with no time of day: stored at 00:00 UTC of today, shown as "As of {date}". */
  daily?: true;
};

export const fixtureMarket: FixtureMarket[] = [
  // Real, up 0.6% (7,412 against 7,368).
  { slug: "ihsg", symbol: "^JKSE", name: "IHSG", kind: "index", exchange: "IDX", currency: "IDR", source: "yahoo", quoteSource: "yahoo", price: 7412, closes: [7250, 7290, 7270, 7310, 7340, 7330, 7355, 7380, 7360, 7368] },
  // Synthetic, down 0.2% (16,240 against 16,273).
  { slug: "usd-idr", symbol: "USD/IDR", name: "USD/IDR", kind: "fx", exchange: null, currency: "IDR", source: "frankfurter", quoteSource: "synthetic", price: 16240, closes: [16300, 16300, 16310, 16280, 16290, 16260, 16275, 16265, 16250, 16273], daily: true },
  // Real, unchanged: +0.005% rounds to 0.0%.
  { slug: "gold", symbol: "XAU", name: "Gold", kind: "metal", exchange: null, currency: "IDR", source: "gold-api", quoteSource: "gold-api", price: 1935100, closes: [1890000, 1900000, 1905000, 1910000, 1912000, 1920000, 1918000, 1925000, 1930000, 1935000] },
  // Synthetic, down 2.3% ($98,400 against $100,700).
  { slug: "bitcoin", symbol: "BTCUSDT", name: "Bitcoin", kind: "crypto", exchange: null, currency: "USD", source: "binance", quoteSource: "synthetic", price: 98400, closes: [104000, 105500, 103000, 104200, 102000, 103100, 101500, 100200, 101000, 100700] },
];
