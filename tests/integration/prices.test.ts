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
    expect(after).toMatchObject({ price: before!.price, asOf: before!.asOf, source: "synthetic" });
  });

  test("live mode labels what it stores as yahoo", async () => {
    process.env.PRICES_YAHOO = "live";
    const { syntheticChart } = await import("@/server/prices/yahoo");
    const transport = (async (url: string) => {
      const symbol = decodeURIComponent(/chart\/([^?]+)/.exec(url)![1]);
      return Response.json(syntheticChart(symbol, "6y", NOW)); // shape only: a stand-in for Yahoo's reply
    }) as unknown as typeof fetch;
    await ingestPrices({ transport, now: () => NOW });
    const bbca = (await getQuote((await getAssetBySlug("bbca"))!.id))!;
    expect(bbca.source).toBe("yahoo");
  });

  /** A live stub: Yahoo-shaped replies built per URL by `make` (not Yahoo data). */
  const liveStub = (make: (symbol: string) => unknown) => {
    const ranges: string[] = [];
    const transport = (async (url: string) => {
      ranges.push(/range=([^&]+)/.exec(url)![1]);
      return Response.json(make(decodeURIComponent(/chart\/([^?]+)/.exec(url)![1])));
    }) as unknown as typeof fetch;
    return { transport, ranges };
  };
  const syntheticCount = async (slug: string) =>
    Number((await db().execute(sql`select count(*) as n from candles c join assets a on a.id = c.asset_id where a.slug = ${slug} and c.source = 'synthetic'`))[0].n);

  test("the first live run backfills 6 years and replaces the synthetic history, also on days the live data lacks", async () => {
    await ingestPrices({ now: () => NOW }); // fixtures: synthetic history
    process.env.PRICES_YAHOO = "live";
    const { syntheticChart } = await import("@/server/prices/yahoo");
    // Different trading days from the synthetic history: every other day only.
    const { transport, ranges } = liveStub((symbol) => {
      const chart = syntheticChart(symbol, "6y", NOW);
      const r = chart.chart.result![0];
      const keep = r.timestamp!.map((_, i) => i % 2 === 0);
      r.timestamp = r.timestamp!.filter((_, i) => keep[i]);
      for (const k of ["open", "high", "low", "close", "volume"] as const) {
        r.indicators.quote[0][k] = r.indicators.quote[0][k].filter((_, i) => keep[i]);
      }
      return chart;
    });

    await ingestPrices({ transport, now: () => NOW });

    expect(ranges).toEqual(["6y", "6y", "6y"]);
    for (const slug of ["ihsg", "bbca", "sp500"]) expect(await syntheticCount(slug)).toBe(0);
    const sources = await db().execute(sql`select distinct c.source from candles c join assets a on a.id = c.asset_id where a.source = 'yahoo'`);
    expect(sources).toEqual([{ source: "yahoo" }]);
  });

  test.each([
    ["an empty series", (chart: { chart: { result: { timestamp?: number[]; indicators: { quote: Record<string, unknown[]>[] } }[] | null } }) => {
      const r = chart.chart.result![0];
      r.timestamp = [];
      for (const k of Object.keys(r.indicators.quote[0])) r.indicators.quote[0][k] = [];
    }],
    ["all-null rows", (chart: { chart: { result: { timestamp?: number[]; indicators: { quote: Record<string, unknown[]>[] } }[] | null } }) => {
      const q = chart.chart.result![0].indicators.quote[0];
      for (const k of Object.keys(q)) q[k] = q[k].map(() => null);
    }],
    ["a one-day series", (chart: { chart: { result: { timestamp?: number[]; indicators: { quote: Record<string, unknown[]>[] } }[] | null } }) => {
      const r = chart.chart.result![0];
      r.timestamp = r.timestamp!.slice(-1);
      for (const k of Object.keys(r.indicators.quote[0])) r.indicators.quote[0][k] = r.indicators.quote[0][k].slice(-1);
    }],
  ])("a live backfill with %s fails that asset and keeps its synthetic history", async (_name, damage) => {
    await ingestPrices({ now: () => NOW });
    const before = await syntheticCount("bbca");
    process.env.PRICES_YAHOO = "live";
    const { syntheticChart } = await import("@/server/prices/yahoo");
    const { transport } = liveStub((symbol) => {
      const chart = syntheticChart(symbol, "6y", NOW);
      damage(chart as never);
      return chart;
    });

    const outcome = await ingestPrices({ transport, now: () => NOW });

    expect(outcome).toMatchObject({ status: "partial", counts: { assets_failed: 3 } });
    expect(outcome.error).toContain("backfill returned");
    expect(await syntheticCount("bbca")).toBe(before);
  });

  test("the database refuses an unknown price source", async () => {
    const asset = await upsertAsset({ slug: "y", symbol: "Y", name: "Y", kind: "stock", exchange: null, currency: "IDR", source: "yahoo" });
    await expect(setQuote(asset.id, { price: 1, asOf: new Date(), source: "made-up" })).rejects.toThrow();
  });

  test("a response with a zero close: that asset fails and keeps its previous quote, the run is partial", async () => {
    await ingestPrices({ now: () => NOW });
    const bbca = (await getAssetBySlug("bbca"))!;
    const before = await getQuote(bbca.id);
    process.env.PRICES_YAHOO = "live";
    const { syntheticChart } = await import("@/server/prices/yahoo");
    const transport = (async (url: string) => {
      const chart = syntheticChart(decodeURIComponent(/chart\/([^?]+)/.exec(url)![1]), "6y", NOW);
      if (url.includes("BBCA")) chart.chart.result![0].indicators.quote[0].close[5] = 0;
      return Response.json(chart);
    }) as unknown as typeof fetch;

    const outcome = await ingestPrices({ transport, now: () => NOW });

    expect(outcome).toMatchObject({ status: "partial", counts: { assets_failed: 1 } });
    expect(outcome.error).toContain("bbca (invalid close 0 in the response)");
    expect(await getQuote(bbca.id)).toMatchObject({ price: before!.price, asOf: before!.asOf });
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
    expect(bbca.source).toBe("synthetic"); // fixtures mode: never labelled as Yahoo
    expect(bbca.asOf).toBeInstanceOf(Date);
    const candles = await db().execute(sql`select distinct c.source from candles c join assets a on a.id = c.asset_id where a.source = 'yahoo'`);
    expect(candles).toEqual([{ source: "synthetic" }]);
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
