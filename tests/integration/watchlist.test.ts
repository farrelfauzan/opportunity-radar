import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getWatchlist, saveSignal, setQuote, upsertAsset, upsertCandles, WATCHLIST_CLOSES, type Candle, type NewAsset, type SignalState, type SignalTerm } from "@/server/data";
import { db } from "@/server/data/client";

const IHSG: NewAsset = { slug: "ihsg", symbol: "^JKSE", name: "IHSG", kind: "index", exchange: "IDX", currency: "IDR", source: "yahoo" };
const BBCA: NewAsset = { slug: "bbca", symbol: "BBCA.JK", name: "BBCA", kind: "stock", exchange: "IDX", currency: "IDR", source: "yahoo" };
const SP500: NewAsset = { slug: "sp500", symbol: "^GSPC", name: "S&P 500", kind: "index", exchange: "US", currency: "USD", source: "yahoo" };
const USD_IDR: NewAsset = { slug: "usd-idr", symbol: "USD/IDR", name: "USD/IDR", kind: "fx", exchange: null, currency: "IDR", source: "frankfurter", onWatchlist: false };
const GOLD: NewAsset = { slug: "gold", symbol: "XAU", name: "Gold", kind: "metal", exchange: null, currency: "IDR", source: "gold-api" };
const SILVER: NewAsset = { slug: "silver", symbol: "XAG", name: "Silver", kind: "metal", exchange: null, currency: "IDR", source: "gold-api" };
const BITCOIN: NewAsset = { slug: "bitcoin", symbol: "BTCUSDT", name: "Bitcoin", kind: "crypto", exchange: null, currency: "USD", source: "binance" };
const ETHEREUM: NewAsset = { slug: "ethereum", symbol: "ETHUSDT", name: "Ethereum", kind: "crypto", exchange: null, currency: "USD", source: "binance" };
const BITCOIN_IDR: NewAsset = { slug: "bitcoin-idr", symbol: "btcidr", name: "Bitcoin (IDR)", kind: "crypto", exchange: "Indodax", currency: "IDR", source: "indodax", onWatchlist: false };

const candle = (day: string, close: number): Candle => ({ day, open: close, high: close, low: close, close, volume: null });
/** n daily candles ending on `last` (a YYYY-MM-DD day), closes first, first + 1, ... */
function series(last: string, count: number, first = 100): Candle[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => candle(new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10), first + i));
}

async function store(asset: NewAsset, opts: { quote?: { price: number; asOf: string; source: string }; candles?: Candle[]; candleSource?: string } = {}) {
  const { id } = await upsertAsset(asset);
  if (opts.candles) await upsertCandles(id, opts.candleSource ?? asset.source, opts.candles);
  if (opts.quote) await setQuote(id, { price: opts.quote.price, asOf: new Date(opts.quote.asOf), source: opts.quote.source });
  return id;
}

/** A stored signal; `synthetic` marks one computed on made-up prices. */
async function signal(assetId: number, term: SignalTerm, state: SignalState, synthetic = false) {
  const verdict = state === "BUY" || state === "HOLD" || state === "SELL" ? state : null;
  await saveSignal({ assetId, term, state, verdict, since: "2026-10-02", asOfDay: "2026-10-02", indicators: null, checks: [], agree: null, reversals: [], currency: null, rulesVersion: "rules v1", synthetic }, null);
}

const quote = (price: number, source = "yahoo") => ({ price, asOf: "2026-10-05T03:00:00Z", source });

beforeEach(async () => {
  await db().execute(sql`truncate assets restart identity cascade`);
});
afterEach(() => {
  delete process.env.SHOW_SAMPLE_SIGNALS;
});

describe("getWatchlist: which assets, in which order", () => {
  test("nothing stored: no rows", async () => {
    expect(await getWatchlist()).toEqual([]);
  });

  test("only assets on the watchlist: USD/IDR and the IDR crypto pairs are left out", async () => {
    await store(IHSG, { quote: quote(7412) });
    await store(USD_IDR, { quote: quote(16240, "frankfurter") });
    await store(BITCOIN_IDR, { quote: quote(1_600_000_000, "indodax") });
    await store(BITCOIN, { quote: quote(98400, "binance") });
    expect((await getWatchlist()).map((r) => r.slug)).toEqual(["ihsg", "bitcoin"]);
  });

  test("the display order is IHSG, BBCA, S&P 500, Gold, Silver, Bitcoin, Ethereum whatever the insertion order; added assets follow by id", async () => {
    const added: NewAsset = { slug: "tlkm", symbol: "TLKM.JK", name: "TLKM.JK", kind: "stock", exchange: "IDX", currency: "IDR", source: "yahoo" };
    for (const asset of [ETHEREUM, added, BITCOIN, SILVER, GOLD, SP500, BBCA, IHSG]) await store(asset, { quote: quote(100) });
    expect((await getWatchlist()).map((r) => r.slug)).toEqual(["ihsg", "bbca", "sp500", "gold", "silver", "bitcoin", "ethereum", "tlkm"]);
  });

  test("an asset with neither a quote nor a candle stays, with no price", async () => {
    await store(IHSG);
    await store(GOLD, { quote: quote(1935000, "gold-api") });
    const rows = await getWatchlist();
    expect(rows.map((r) => [r.slug, r.price === null])).toEqual([["ihsg", true], ["gold", false]]);
    expect(rows[0].signals).toEqual([]);
  });

  test("the asset's own fields come with the row", async () => {
    await store(SP500, { quote: quote(6820) });
    expect((await getWatchlist())[0]).toMatchObject({ slug: "sp500", symbol: "^GSPC", kind: "index", exchange: "US", currency: "USD", assetSource: "yahoo" });
  });
});

describe("getWatchlist: price, change and closes", () => {
  test("the price is the quote's, else the last close; the closes are the last 30, oldest first", async () => {
    await store(IHSG, { candles: series("2026-10-02", 40), quote: quote(7500.5) });
    await store(GOLD, { candles: series("2026-10-02", 3, 1900000), candleSource: "gold-api" });
    const [ihsg, gold] = await getWatchlist();
    expect(WATCHLIST_CLOSES).toBe(30);
    expect(ihsg.price).toMatchObject({ price: 7500.5, source: "yahoo", synthetic: false, timed: true, previousClose: 139 });
    expect(ihsg.price!.closes).toHaveLength(30);
    expect(ihsg.price!.closes.slice(0, 3)).toEqual([110, 111, 112]); // 40 closes 100..139: the 30 newest start at 110
    expect(ihsg.price!.closes.at(-1)).toBe(139);
    expect(gold.price).toMatchObject({ price: 1900002, previousClose: 1900001, timed: false });
  });

  test("each asset gets its own 30 closes, not a share of one limit", async () => {
    await store(IHSG, { candles: series("2026-10-02", 45) });
    await store(GOLD, { candles: series("2026-10-02", 12, 2000) });
    const rows = await getWatchlist();
    expect(rows.map((r) => r.price!.closes.length)).toEqual([30, 12]);
    expect(rows[1].price!.closes[0]).toBe(2000);
  });

  test("a quote newer than the last candle: the last candle is the previous close; on the quote's own day it is the one before", async () => {
    await store(IHSG, { candles: series("2026-10-02", 5), quote: quote(110) });
    await store(BBCA, { candles: series("2026-10-05", 5), quote: quote(110) });
    const rows = await getWatchlist();
    expect(rows.map((r) => r.price!.previousClose)).toEqual([104, 103]);
  });

  test("a quote with no candles has no previous close and no closes", async () => {
    await store(BITCOIN, { quote: quote(98400, "binance") });
    expect((await getWatchlist())[0].price).toMatchObject({ previousClose: null, closes: [] });
  });
});

describe("getWatchlist: sample data and mixed provenance", () => {
  test("synthetic follows the quote's source, and a synthetic series with a synthetic quote keeps its change and closes", async () => {
    await store(IHSG, { candles: series("2026-10-02", 5), candleSource: "synthetic", quote: quote(7412, "synthetic") });
    await store(GOLD, { candles: series("2026-10-02", 5), candleSource: "gold-api", quote: quote(1935000, "gold-api") });
    const rows = await getWatchlist();
    expect(rows.map((r) => r.price!.synthetic)).toEqual([true, false]);
    expect(rows[0].price).toMatchObject({ previousClose: 104, closes: [100, 101, 102, 103, 104] });
  });

  test("a real price over synthetic candles (a live backfill still to come) gives no change and no sparkline", async () => {
    await store(IHSG, { candles: series("2026-10-02", 5), candleSource: "synthetic", quote: quote(7412) });
    expect((await getWatchlist())[0].price).toMatchObject({ synthetic: false, price: 7412, previousClose: null, closes: [] });
  });

  test("a synthetic price over real candles gives no change and no sparkline either", async () => {
    await store(BITCOIN, { candles: series("2026-10-02", 5), candleSource: "binance", quote: quote(98400, "synthetic") });
    expect((await getWatchlist())[0].price).toMatchObject({ synthetic: true, previousClose: null, closes: [] });
  });

  test("candles of the other kind than the price are ignored (the last close synthetic, earlier ones real): the change uses the real ones", async () => {
    const id = await store(IHSG, { candles: series("2026-10-01", 4), quote: quote(7412) });
    await upsertCandles(id, "synthetic", [candle("2026-10-02", 104)]);
    expect((await getWatchlist())[0].price).toMatchObject({ synthetic: false, previousClose: 103, closes: [100, 101, 102, 103] });
  });
});

describe("getWatchlist: signals", () => {
  test("both terms come as the screens show them, per asset; an asset with none has an empty list", async () => {
    const ihsg = await store(IHSG, { quote: quote(7412) });
    await store(GOLD, { quote: quote(1935000, "gold-api") });
    const bbca = await store(BBCA, { quote: quote(9875) });
    await signal(ihsg, "short", "BUY");
    await signal(ihsg, "long", "HOLD");
    await signal(bbca, "long", "INSUFFICIENT");
    await signal(bbca, "short", "STALE");

    const rows = await getWatchlist();
    const byTerm = (slug: string) => Object.fromEntries(rows.find((r) => r.slug === slug)!.signals.map((s) => [s.term, s.state]));
    expect(byTerm("ihsg")).toEqual({ short: "BUY", long: "HOLD" });
    expect(byTerm("bbca")).toEqual({ short: "STALE", long: "INSUFFICIENT" });
    expect(rows.find((r) => r.slug === "gold")!.signals).toEqual([]);
  });

  test("a signal computed on synthetic prices reads as SAMPLE, with no verdict, in both terms", async () => {
    const id = await store(IHSG, { candles: series("2026-10-02", 5), candleSource: "synthetic", quote: quote(7412, "synthetic") });
    await signal(id, "short", "BUY", true);
    await signal(id, "long", "SELL", true);
    const [row] = await getWatchlist();
    expect(row.signals.map((s) => [s.term, s.state])).toEqual([["long", "SAMPLE"], ["short", "SAMPLE"]]);
    expect(row.signals.every((s) => !("verdict" in s))).toBe(true);
  });

  test("with SHOW_SAMPLE_SIGNALS=1 outside production the verdicts show; a real signal is unaffected", async () => {
    const synthetic = await store(IHSG, { quote: quote(7412, "synthetic") });
    const real = await store(GOLD, { quote: quote(1935000, "gold-api") });
    await signal(synthetic, "long", "SELL", true);
    await signal(real, "long", "BUY");
    process.env.SHOW_SAMPLE_SIGNALS = "1";
    const rows = await getWatchlist();
    expect(rows.map((r) => r.signals[0].state)).toEqual(["SELL", "BUY"]);
  });
});
