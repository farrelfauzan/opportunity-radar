import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { getMarketSnapshot, setQuote, upsertAsset, upsertCandles, type Candle, type NewAsset } from "@/server/data";
import { db } from "@/server/data/client";

const IHSG: NewAsset = { slug: "ihsg", symbol: "^JKSE", name: "IHSG", kind: "index", exchange: "IDX", currency: "IDR", source: "yahoo" };
const USD_IDR: NewAsset = { slug: "usd-idr", symbol: "USD/IDR", name: "USD/IDR", kind: "fx", exchange: null, currency: "IDR", source: "frankfurter", onWatchlist: false };
const GOLD: NewAsset = { slug: "gold", symbol: "XAU", name: "Gold", kind: "metal", exchange: null, currency: "IDR", source: "gold-api" };
const BITCOIN: NewAsset = { slug: "bitcoin", symbol: "BTCUSDT", name: "Bitcoin", kind: "crypto", exchange: null, currency: "USD", source: "binance" };

const candle = (day: string, close: number): Candle => ({ day, open: close, high: close, low: close, close, volume: null });
/** n daily candles ending on `last` (a YYYY-MM-DD day), closes 100, 101, ... */
function series(last: string, count: number, firstClose = 100): Candle[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => candle(new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10), firstClose + i));
}

async function store(asset: NewAsset, opts: { quote?: { price: number; asOf: string; source: string }; candles?: Candle[]; candleSource?: string }) {
  const { id } = await upsertAsset(asset);
  if (opts.candles) await upsertCandles(id, opts.candleSource ?? asset.source, opts.candles);
  if (opts.quote) await setQuote(id, { price: opts.quote.price, asOf: new Date(opts.quote.asOf), source: opts.quote.source });
  return id;
}

beforeEach(async () => {
  await db().execute(sql`truncate assets restart identity cascade`);
});

describe("getMarketSnapshot", () => {
  test("nothing stored: no rows", async () => {
    expect(await getMarketSnapshot()).toEqual([]);
  });

  test("the four rows come in the display order whatever the insertion order, other assets are not included", async () => {
    await store({ ...BITCOIN }, { quote: { price: 98400, asOf: "2026-10-04T05:00:00Z", source: "binance" } });
    await store({ slug: "sp500", symbol: "^GSPC", name: "S&P 500", kind: "index", exchange: "US", currency: "USD", source: "yahoo" }, { quote: { price: 5000, asOf: "2026-10-04T05:00:00Z", source: "yahoo" } });
    await store(GOLD, { quote: { price: 1935000, asOf: "2026-10-04T05:00:00Z", source: "gold-api" } });
    await store(USD_IDR, { quote: { price: 16240, asOf: "2026-10-02T00:00:00Z", source: "frankfurter" } });
    await store(IHSG, { quote: { price: 7412, asOf: "2026-10-02T09:00:00Z", source: "yahoo" } });

    expect((await getMarketSnapshot()).map((r) => r.slug)).toEqual(["ihsg", "usd-idr", "gold", "bitcoin"]);
  });

  test("the price is the quote's, with its as-of time and source; the closes are the last 10 daily closes, oldest first", async () => {
    await store(IHSG, {
      candles: series("2026-10-02", 30),
      quote: { price: 7500.5, asOf: "2026-10-05T03:00:00Z", source: "yahoo" },
    });
    const [row] = await getMarketSnapshot();
    expect(row).toMatchObject({ slug: "ihsg", price: 7500.5, source: "yahoo", synthetic: false, timed: true });
    expect(row.asOf).toEqual(new Date("2026-10-05T03:00:00Z"));
    expect(row.closes).toEqual([120, 121, 122, 123, 124, 125, 126, 127, 128, 129]); // days 23 Sep to 2 Oct of 30 closes 100..129
    expect(row.closes).toHaveLength(10);
  });

  test("a quote newer than the last candle: the last candle is the previous close", async () => {
    await store(IHSG, { candles: series("2026-10-02", 5), quote: { price: 110, asOf: "2026-10-05T03:00:00Z", source: "yahoo" } });
    expect((await getMarketSnapshot())[0].previousClose).toBe(104); // closes 100..104, the last is 2 Oct
  });

  test("the last candle is the quote's own day: it is the day in progress, so the candle before it is the previous close", async () => {
    await store(IHSG, { candles: series("2026-10-05", 5), quote: { price: 110, asOf: "2026-10-05T03:00:00Z", source: "yahoo" } });
    const [row] = await getMarketSnapshot();
    expect(row.previousClose).toBe(103);
    expect(row.closes).toEqual([100, 101, 102, 103, 104]);
  });

  test("a rate stored at 00:00 UTC of its day (USD/IDR) compares with the day before", async () => {
    await store(USD_IDR, { candles: [candle("2026-10-01", 16200), candle("2026-10-02", 16240)], candleSource: "frankfurter", quote: { price: 16240, asOf: "2026-10-02T00:00:00Z", source: "frankfurter" } });
    expect((await getMarketSnapshot())[0]).toMatchObject({ price: 16240, previousClose: 16200 });
  });

  test("no quote: the price is the last close, from the candle's day, with the candle's source and without a time", async () => {
    await store(GOLD, { candles: series("2026-10-02", 3, 1900000), candleSource: "synthetic" });
    const [row] = await getMarketSnapshot();
    expect(row).toMatchObject({ price: 1900002, previousClose: 1900001, timed: false, source: "synthetic", synthetic: true });
    expect(row.asOf).toEqual(new Date("2026-10-02T00:00:00Z"));
    expect(row.closes).toEqual([1900000, 1900001, 1900002]);
  });

  test("a quote with no candles: no previous close and no closes", async () => {
    await store(BITCOIN, { quote: { price: 98400, asOf: "2026-10-04T05:00:00Z", source: "binance" } });
    expect((await getMarketSnapshot())[0]).toMatchObject({ price: 98400, previousClose: null, closes: [] });
  });

  test("a single candle without a quote has no previous close", async () => {
    await store(BITCOIN, { candles: [candle("2026-10-03", 98000)] });
    expect((await getMarketSnapshot())[0]).toMatchObject({ price: 98000, previousClose: null, closes: [98000] });
  });

  test("synthetic follows the quote's source, not the candles'", async () => {
    await store(IHSG, { candles: series("2026-10-02", 5), candleSource: "synthetic", quote: { price: 7412, asOf: "2026-10-05T03:00:00Z", source: "yahoo" } });
    await store(BITCOIN, { candles: series("2026-10-02", 5), candleSource: "binance", quote: { price: 98400, asOf: "2026-10-05T03:00:00Z", source: "synthetic" } });
    const rows = await getMarketSnapshot();
    expect(rows.map((r) => [r.slug, r.synthetic])).toEqual([["ihsg", false], ["bitcoin", true]]);
  });

  test("an asset that is stored but has neither a quote nor a candle is left out; the others stay", async () => {
    await store(IHSG, {});
    await store(GOLD, { quote: { price: 1935000, asOf: "2026-10-04T05:00:00Z", source: "gold-api" } });
    expect((await getMarketSnapshot()).map((r) => r.slug)).toEqual(["gold"]);
  });

  test("each asset gets its own last 10 closes, not a share of one limit", async () => {
    await store(IHSG, { candles: series("2026-10-02", 20) });
    await store(GOLD, { candles: series("2026-10-02", 20, 2000) });
    await store(BITCOIN, { candles: series("2026-10-02", 4, 50000) });
    const rows = await getMarketSnapshot();
    expect(rows.map((r) => r.closes.length)).toEqual([10, 10, 4]);
    expect(rows[1].closes[0]).toBe(2010);
  });
});
