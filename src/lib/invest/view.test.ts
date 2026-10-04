import { describe, expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import type { SignalView, WatchlistRow } from "@/server/data";
import { assetName, hoursKind, jobOf, kindLine, neverIngested, signalCell, watchlistPriceText, watchlistView } from "./view";

const NBSP = " ";

// Tuesday 2026-10-06 11:00 WIB = 04:00Z = 00:00 in New York: IDX and gold are open, the US market is shut, crypto never is.
const NOW = new Date("2026-10-06T04:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

const verdict = (term: "short" | "long", state: "BUY" | "HOLD" | "SELL" | "INSUFFICIENT" | "STALE" | "INVALID_DATA"): SignalView =>
  ({ term, state, verdict: state === "BUY" || state === "HOLD" || state === "SELL" ? state : null, synthetic: false, rulesVersion: "rules v1" }) as SignalView;
const sample = (term: "short" | "long"): SignalView => ({ term, state: "SAMPLE", rulesVersion: "rules v1" });

type Price = NonNullable<WatchlistRow["price"]>;
const price = (over: Partial<Price> = {}): Price => ({
  price: 7412,
  asOf: minutesAgo(5),
  timed: true,
  updatedAt: minutesAgo(5),
  source: "yahoo",
  synthetic: false,
  previousClose: 7368,
  closes: [7250, 7290, 7368],
  ...over,
});
const row = (over: Partial<WatchlistRow> & Pick<WatchlistRow, "slug">): WatchlistRow => ({
  assetId: 1,
  symbol: over.slug.toUpperCase(),
  kind: "index",
  exchange: "IDX",
  currency: "IDR",
  assetSource: "yahoo",
  price: price(),
  signals: [],
  ...over,
});

const IHSG = row({ slug: "ihsg", symbol: "^JKSE" });
const BBCA = row({ slug: "bbca", symbol: "BBCA.JK", kind: "stock", price: price({ price: 9875, previousClose: 9900 }) });
const SP500 = row({ slug: "sp500", symbol: "^GSPC", exchange: "US", currency: "USD", price: price({ price: 6820, previousClose: 6820 }) });
const GOLD = row({ slug: "gold", symbol: "XAU", kind: "metal", exchange: null, assetSource: "gold-api", price: price({ price: 1935100, previousClose: 1935000 }) });
const SILVER = row({ slug: "silver", symbol: "XAG", kind: "metal", exchange: null, assetSource: "gold-api" });
const BITCOIN = row({ slug: "bitcoin", symbol: "BTCUSDT", kind: "crypto", exchange: null, currency: "USD", assetSource: "binance", price: price({ price: 98400, previousClose: 100700 }) });

describe("what feeds and times a row", () => {
  test("the job by price source, null for an unknown one", () => {
    expect([jobOf("yahoo"), jobOf("frankfurter"), jobOf("gold-api"), jobOf("binance"), jobOf("indodax"), jobOf("x")]).toEqual(["prices", "prices", "metals", "crypto", "crypto", null]);
  });

  test("the hours rule: IDX stocks and indices idx, US us, gold and silver gold, crypto crypto, unknown none", () => {
    expect([IHSG, BBCA, SP500, GOLD, SILVER, BITCOIN].map(hoursKind)).toEqual(["idx", "idx", "us", "gold", "gold", "crypto"]);
    expect(hoursKind({ kind: "stock", exchange: "LSE" })).toBeNull();
    expect(hoursKind({ kind: "fx", exchange: null })).toBe("fx");
  });
});

describe("names and kind lines", () => {
  test("asset.name.* by slug in both languages; an asset without a key shows its symbol", () => {
    expect([IHSG, BBCA, SP500, GOLD, SILVER, BITCOIN].map((r) => assetName(r, en))).toEqual(["IHSG", "BBCA", "S&P 500", "Gold", "Silver", "Bitcoin"]);
    expect(assetName(GOLD, id)).toBe("Emas");
    expect(assetName(SILVER, id)).toBe("Perak");
    expect(assetName(row({ slug: "tlkm", symbol: "TLKM.JK" }), en)).toBe("TLKM.JK");
  });

  test("the kind lines of copy.md §8.1", () => {
    expect([IHSG, BBCA, SP500, GOLD, SILVER, BITCOIN].map((r) => kindLine(r, en))).toEqual([
      "Index · IDX",
      "Stock · IDX",
      "Index · US",
      "IDR per gram",
      "IDR per gram",
      "Crypto · USD",
    ]);
    expect([IHSG, BBCA, SP500, BITCOIN].map((r) => kindLine(r, id))).toEqual(["Indeks · IDX", "Saham · BEI", "Indeks · US", "Kripto · USD"]);
  });

  test("no line where copy.md has none (a US stock, an IDR crypto pair)", () => {
    expect(kindLine({ kind: "stock", exchange: "US", currency: "USD" }, en)).toBeNull();
    expect(kindLine({ kind: "crypto", exchange: "Indodax", currency: "IDR" }, en)).toBeNull();
  });
});

describe("watchlistPriceText", () => {
  test("an index is a plain number, a stock or metal in rupiah, crypto in dollars; per locale", () => {
    expect(watchlistPriceText(IHSG, 7412.4, "en")).toBe("7,412");
    expect(watchlistPriceText(IHSG, 7412.4, "id")).toBe("7.412");
    expect(watchlistPriceText(SP500, 6820, "en")).toBe("6,820");
    expect(watchlistPriceText(BBCA, 9875, "en")).toBe(`Rp${NBSP}9,875`);
    expect(watchlistPriceText(GOLD, 1935100, "id")).toBe(`Rp${NBSP}1.935.100`);
    expect(watchlistPriceText(BITCOIN, 98400, "en")).toBe("$98,400");
    expect(watchlistPriceText(BITCOIN, 98400, "id")).toBe("US$98.400");
  });
});

describe("signalCell", () => {
  const both = [verdict("short", "BUY"), verdict("long", "SELL")];

  test("a verdict is a word for the selected term, in both languages", () => {
    expect(signalCell(both, "short", en)).toEqual({ kind: "verdict", verdict: "BUY", word: "BUY" });
    expect(signalCell(both, "long", en)).toEqual({ kind: "verdict", verdict: "SELL", word: "SELL" });
    expect(signalCell(both, "short", id)).toMatchObject({ verdict: "BUY", word: "BELI" });
    expect(signalCell(both, "long", id)).toMatchObject({ verdict: "SELL", word: "JUAL" });
    expect(signalCell([verdict("long", "HOLD")], "long", id)).toMatchObject({ verdict: "HOLD", word: "TAHAN" });
  });

  test("the states with no verdict map to their texts", () => {
    expect(signalCell([verdict("long", "INSUFFICIENT")], "long", en)).toEqual({ kind: "none", state: "none", text: "Not enough history" });
    expect(signalCell([verdict("long", "STALE")], "long", en)).toEqual({ kind: "none", state: "stale", text: "No signal: prices are out of date" });
    expect(signalCell([verdict("long", "INVALID_DATA")], "long", en)).toEqual({ kind: "none", state: "invalid", text: "No signal: the price data has errors" });
    expect(signalCell([sample("long")], "long", en)).toEqual({ kind: "none", state: "sample", text: "No signal: sample data" });
    expect(signalCell([sample("long")], "long", id)).toEqual({ kind: "none", state: "sample", text: "Tanpa sinyal: data contoh" });
  });

  test("a term with no signal row, or an asset with none at all, is signal.none", () => {
    expect(signalCell([verdict("short", "BUY")], "long", en)).toMatchObject({ state: "none", text: "Not enough history" });
    expect(signalCell([], "short", id)).toMatchObject({ state: "none", text: "Riwayat belum cukup" });
  });

  test("a stale signal keeps no verdict on show", () => {
    const stale = { ...verdict("long", "STALE"), verdict: "BUY" } as SignalView; // the last verdict is kept in the row
    expect(signalCell([stale], "long", en).kind).toBe("none");
  });
});

describe("watchlistView", () => {
  const runs = { prices: minutesAgo(5), metals: minutesAgo(5), crypto: minutesAgo(5) };
  const view = (rows: WatchlistRow[], over: Record<string, Date | null> = {}, locale: "en" | "id" = "en") =>
    watchlistView(rows, { ...runs, ...over }, "long", NOW, locale, locale === "en" ? en : id);

  test("one row per asset in the given order, with name, kind, link, price, change, sparkline, risk and signal", () => {
    const { rows } = view([{ ...IHSG, signals: [verdict("long", "HOLD"), verdict("short", "BUY")] }, BITCOIN]);
    expect(rows.map((r) => r.slug)).toEqual(["ihsg", "bitcoin"]);
    expect(rows[0]).toMatchObject({
      name: "IHSG",
      kind: "Index · IDX",
      href: "/en/invest/ihsg",
      price: "7,412",
      synthetic: false,
      change: { direction: "up", arrow: "▲", text: "0.6%", label: "up 0.6%" },
      risk: 4,
      signal: { kind: "verdict", verdict: "HOLD" },
      stale: false,
      closedText: null,
    });
    expect(rows[0].points).toMatch(/^0\.0,\d+\.\d 48\.0,\d+\.\d 96\.0,\d+\.\d$/);
    expect(rows[0].trend).toBe("30 days: 7,250 → 7,368");
    expect(rows[1]).toMatchObject({ href: "/en/invest/bitcoin", price: "$98,400", change: { direction: "down", arrow: "▼", text: "2.3%" }, risk: 5, signal: { state: "none" } });
  });

  test("a change that rounds to zero is flat, with the dash and 0.0%; no previous close gives no change", () => {
    const { rows } = view([GOLD, { ...BBCA, price: price({ previousClose: null }) }]);
    expect(rows[0].change).toMatchObject({ direction: "flat", arrow: "—", text: "0.0%" });
    expect(rows[1].change).toBeNull();
  });

  test("the selected term picks the signal", () => {
    const signals = [verdict("short", "SELL"), verdict("long", "BUY")];
    const shown = (term: "short" | "long") => watchlistView([{ ...GOLD, signals }], runs, term, NOW, "en", en).rows[0].signal;
    expect(shown("short")).toMatchObject({ verdict: "SELL" });
    expect(shown("long")).toMatchObject({ verdict: "BUY" });
  });

  test("a row with no price shows no price, change or sparkline, and is neither stale nor closed", () => {
    const { rows, staleLine } = view([{ ...IHSG, price: null }], { prices: minutesAgo(500) });
    expect(rows[0]).toMatchObject({ price: null, change: null, points: null, trend: null, stale: false, closedText: null, synthetic: false });
    expect(staleLine).toBeNull();
  });

  test("one closing close gives no sparkline and no trend text", () => {
    const { rows } = view([{ ...IHSG, price: price({ closes: [7368] }) }]);
    expect(rows[0].points).toBeNull();
    expect(rows[0].trend).toBeNull();
  });

  test("a stale price (job 2 hours ago, market open): the row is stale and the line names the oldest run", () => {
    const { rows, staleLine } = view([IHSG, BITCOIN, GOLD], { prices: minutesAgo(180), crypto: minutesAgo(120) });
    expect(rows.map((r) => r.stale)).toEqual([true, true, false]);
    expect(staleLine).toBe("Prices last updated 08:00 WIB"); // the prices job, 3 h ago, is the oldest
    expect(view([IHSG, BITCOIN], { prices: minutesAgo(180), crypto: minutesAgo(120) }, "id").staleLine).toBe("Harga terakhir diperbarui 08.00 WIB");
  });

  test("exactly one hour is fresh", () => {
    expect(view([BITCOIN], { crypto: minutesAgo(60) }).rows[0].stale).toBe(false);
    expect(view([BITCOIN], { crypto: minutesAgo(61) }).rows[0].stale).toBe(true);
  });

  test("outside its market hours a row shows the market-closed text, never stale, however old the run", () => {
    // S&P 500 at 00:00 New York.
    const { rows, staleLine } = view([SP500], { prices: minutesAgo(600) });
    expect(rows[0]).toMatchObject({ stale: false });
    expect(rows[0].closedText).toBe("Market closed · last close 6 Oct"); // the quote's as-of is 5 minutes ago (WIB date)
    expect(staleLine).toBeNull();
  });

  test("the S&P 500 is stale inside New York hours (Wednesday 14:00 Z = 10:00 EDT) and silver follows gold", () => {
    const wednesday = new Date("2026-10-07T14:00:00Z");
    const stale = watchlistView([SP500, SILVER], { prices: new Date("2026-10-07T12:00:00Z"), metals: new Date("2026-10-07T12:00:00Z") }, "long", wednesday, "en", en);
    expect(stale.rows.map((r) => r.stale)).toEqual([true, true]);
  });

  test("a job that never ran falls back to the time the price was stored", () => {
    expect(view([{ ...BITCOIN, price: price({ updatedAt: minutesAgo(200) }) }], { crypto: null }).rows[0].stale).toBe(true);
    expect(view([{ ...BITCOIN, price: price({ updatedAt: minutesAgo(10) }) }], { crypto: null }).rows[0].stale).toBe(false);
  });

  test("sample rows: the flag follows the price, and anySynthetic is set when any row is", () => {
    const synthetic = { ...BITCOIN, price: price({ price: 98400, synthetic: true, source: "synthetic" }), signals: [sample("long"), sample("short")] };
    const shown = view([IHSG, synthetic]);
    expect(shown.rows.map((r) => r.synthetic)).toEqual([false, true]);
    expect(shown.rows[1].signal).toMatchObject({ kind: "none", state: "sample" });
    expect(shown.anySynthetic).toBe(true);
    expect(view([IHSG, BITCOIN]).anySynthetic).toBe(false);
  });

  test("a rate and an unknown market have no risk and no hours rule", () => {
    const fx = row({ slug: "usd-idr", symbol: "USD/IDR", kind: "fx", exchange: null, assetSource: "frankfurter" });
    expect(view([fx]).rows[0]).toMatchObject({ risk: null, kind: null, price: "7,412" });
  });
});

describe("neverIngested", () => {
  test("true with no asset or no price at all, false once any row has a price", () => {
    expect(neverIngested([])).toBe(true);
    expect(neverIngested([{ ...IHSG, price: null }, { ...BITCOIN, price: null }])).toBe(true);
    expect(neverIngested([{ ...IHSG, price: null }, BITCOIN])).toBe(false);
  });
});
