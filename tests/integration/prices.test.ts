import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getAssetBySlug, getQuote, listCandles, setQuote, upsertAsset } from "@/server/data";
import { db } from "@/server/data/client";
import { ASSETS } from "@/server/prices/assets";
import { ingestPrices } from "@/server/prices/ingest";

const NOW = new Date("2026-10-04T10:00:00Z");

beforeEach(async () => {
  await db().execute(sql`truncate assets restart identity cascade`);
  process.env.PRICES_FRANKFURTER = "fixtures";
  delete process.env.PRICES_YAHOO;
});
afterEach(() => {
  delete process.env.PRICES_FRANKFURTER;
  delete process.env.PRICES_YAHOO;
  vi.restoreAllMocks();
});

const candleCount = async (slug: string) => {
  const asset = (await getAssetBySlug(slug))!;
  return listCandles(asset.id, "1900-01-01", "2999-12-31");
};

describe("prices job", () => {
  test("first run on an empty store: about 6 years of daily candles per asset, no duplicate dates", async () => {
    const outcome = await ingestPrices({ now: () => NOW });

    expect(outcome).toMatchObject({ status: "ok", counts: { assets_ok: 4, assets_failed: 0 } });
    for (const { slug } of ASSETS) {
      const candles = await candleCount(slug);
      const days = candles.map((c) => c.day);
      expect(new Set(days).size).toBe(days.length);
      expect(days[0] <= "2020-10-10").toBe(true); // about 6 years back
      expect(candles.length).toBeGreaterThan(1450);
    }
  });

  test("with PRICES_YAHOO unset no request goes to Yahoo (or anywhere, with Frankfurter on fixtures)", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    await ingestPrices({ now: () => NOW });
    expect(network).not.toHaveBeenCalled();
  });

  test("Yahoo answering 429: the previous quote stays with its as-of time, and the run is partial", async () => {
    await ingestPrices({ now: () => NOW });
    const ihsg = (await getAssetBySlug("ihsg"))!;
    const before = await getQuote(ihsg.id);

    process.env.PRICES_YAHOO = "live";
    const requests: string[] = [];
    const transport = (async (url: string) => {
      requests.push(url);
      return new Response("Too Many Requests", { status: 429 });
    }) as unknown as typeof fetch;
    const outcome = await ingestPrices({ transport, now: () => NOW });

    expect(requests.every((u) => u.startsWith("https://query1.finance.yahoo.com/v8/finance/chart/"))).toBe(true);
    expect(outcome).toMatchObject({
      status: "partial",
      counts: { assets_ok: 1, assets_failed: 3 },
      error: "3 of 4 assets failed: ihsg (429), bbca (429), sp500 (429)",
    });
    const after = await getQuote(ihsg.id);
    expect(after).toMatchObject({ price: before!.price, asOf: before!.asOf, source: "yahoo" });
  });

  test("every source failing fails the run", async () => {
    process.env.PRICES_YAHOO = "live";
    process.env.PRICES_FRANKFURTER = "live";
    const transport = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    await expect(ingestPrices({ transport, now: () => NOW })).rejects.toThrow("4 of 4 assets failed");
  });

  test("a stored quote carries its source and as-of time", async () => {
    await ingestPrices({ now: () => NOW });
    const usd = (await getQuote((await getAssetBySlug("usd-idr"))!.id))!;
    expect(usd).toMatchObject({ source: "frankfurter", asOf: new Date("2026-10-02T00:00:00Z") });
    expect(usd.price).toBeGreaterThan(10000);
    const bbca = (await getQuote((await getAssetBySlug("bbca"))!.id))!;
    expect(bbca.source).toBe("yahoo");
    expect(bbca.asOf).toBeInstanceOf(Date);
  });

  test("USD/IDR is fetched at most every 6 hours", async () => {
    await ingestPrices({ now: () => NOW });
    process.env.PRICES_FRANKFURTER = "live";
    const transport = vi.fn(async () => new Response("should not be called", { status: 500 })) as unknown as typeof fetch;
    const outcome = await ingestPrices({ transport, now: () => new Date(Date.now() + 60 * 60 * 1000) });
    expect(outcome.status).toBe("ok");
    expect(transport).not.toHaveBeenCalled();
  });

  test("later runs only fetch what is missing and do not duplicate days", async () => {
    await ingestPrices({ now: () => NOW });
    const first = (await candleCount("bbca")).length;
    await ingestPrices({ now: () => NOW });
    expect((await candleCount("bbca")).length).toBe(first);
  });

  test("the database refuses impossible candles and quotes", async () => {
    const asset = await upsertAsset({ slug: "x", symbol: "X", name: "X", kind: "stock", exchange: null, currency: "IDR", source: "yahoo" });
    await expect(
      db().execute(sql`insert into candles (asset_id, day, open, high, low, close, source) values (${asset.id}, '2026-10-01', 10, 9, 8, 10, 'yahoo')`),
    ).rejects.toThrow();
    await expect(setQuote(asset.id, { price: 0, asOf: new Date(), source: "yahoo" })).rejects.toThrow();
    await expect(upsertAsset({ slug: "Bad Slug", symbol: "X", name: "X", kind: "stock", exchange: null, currency: "IDR", source: "yahoo" })).rejects.toThrow();
  });
});
