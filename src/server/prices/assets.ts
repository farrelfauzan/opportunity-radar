import type { NewAsset } from "@/server/data";

// v1 watchlist (OR-26). OR-27 adds gold, silver and crypto; OR-44 lets the user add assets.
export const ASSETS: NewAsset[] = [
  { slug: "ihsg", symbol: "^JKSE", name: "IHSG", kind: "index", exchange: "IDX", currency: "IDR", source: "yahoo" },
  { slug: "bbca", symbol: "BBCA.JK", name: "BBCA", kind: "stock", exchange: "IDX", currency: "IDR", source: "yahoo" },
  { slug: "sp500", symbol: "^GSPC", name: "S&P 500", kind: "index", exchange: "US", currency: "USD", source: "yahoo" },
  // Not on the watchlist: used to convert USD prices to rupiah, and for the currency check (OR-29).
  { slug: "usd-idr", symbol: "USD/IDR", name: "USD/IDR", kind: "fx", exchange: null, currency: "IDR", source: "frankfurter", onWatchlist: false },
];

// OR-27, the `metals` job: spot price converted to IDR per gram (D7); history from futures.
export const METALS: NewAsset[] = [
  { slug: "gold", symbol: "XAU", name: "Gold", kind: "metal", exchange: null, currency: "IDR", source: "gold-api" },
  { slug: "silver", symbol: "XAG", name: "Silver", kind: "metal", exchange: null, currency: "IDR", source: "gold-api" },
];

// OR-27, the `crypto` job: USD from Binance (USDT treated as USD); the rupiah price from Indodax (quote only).
export const CRYPTO: NewAsset[] = [
  { slug: "bitcoin", symbol: "BTCUSDT", name: "Bitcoin", kind: "crypto", exchange: null, currency: "USD", source: "binance" },
  { slug: "ethereum", symbol: "ETHUSDT", name: "Ethereum", kind: "crypto", exchange: null, currency: "USD", source: "binance" },
  { slug: "bitcoin-idr", symbol: "btcidr", name: "Bitcoin (IDR)", kind: "crypto", exchange: "Indodax", currency: "IDR", source: "indodax", onWatchlist: false },
  { slug: "ethereum-idr", symbol: "ethidr", name: "Ethereum (IDR)", kind: "crypto", exchange: "Indodax", currency: "IDR", source: "indodax", onWatchlist: false },
];
