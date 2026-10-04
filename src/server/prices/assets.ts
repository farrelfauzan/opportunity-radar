import type { NewAsset } from "@/server/data";

// v1 watchlist (OR-26). OR-27 adds gold, silver and crypto; OR-44 lets the user add assets.
export const ASSETS: NewAsset[] = [
  { slug: "ihsg", symbol: "^JKSE", name: "IHSG", kind: "index", exchange: "IDX", currency: "IDR", source: "yahoo" },
  { slug: "bbca", symbol: "BBCA.JK", name: "BBCA", kind: "stock", exchange: "IDX", currency: "IDR", source: "yahoo" },
  { slug: "sp500", symbol: "^GSPC", name: "S&P 500", kind: "index", exchange: "US", currency: "USD", source: "yahoo" },
  // Not on the watchlist: used to convert USD prices to rupiah, and for the currency check (OR-29).
  { slug: "usd-idr", symbol: "USD/IDR", name: "USD/IDR", kind: "fx", exchange: null, currency: "IDR", source: "frankfurter", onWatchlist: false },
];
