import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getAssetBySlug, getQuote, listCandles } from "@/server/data";
import { db } from "@/server/data/client";
import { syntheticKlines } from "@/server/prices/binance";
import { ingestCrypto } from "@/server/prices/crypto";
import { ingestPrices } from "@/server/prices/ingest";
import { ingestMetals, perGram, rateLookup } from "@/server/prices/metals";
import { syntheticChart } from "@/server/prices/yahoo";

const NOW = new Date("2026-10-04T10:00:00Z"); // a Sunday: the ECB's latest rate is Friday's
const ENV = ["PRICES_YAHOO", "PRICES_GOLDAPI", "PRICES_CRYPTO"] as const;
const noWait = async () => {};

beforeEach(async () => {
  await db().execute(sql`truncate assets restart identity cascade`);
  for (const k of ENV) delete process.env[k];
  process.env.PRICES_CRYPTO = "fixtures";
});
afterEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.PRICES_CRYPTO = "fixtures";
  vi.restoreAllMocks();
});

const asset = async (slug: string) => (await getAssetBySlug(slug))!;
const candlesOf = async (slug: string) => listCandles((await asset(slug)).id, "1900-01-01", "2999-12-31");
const quoteOf = async (slug: string) => (await getQuote((await asset(slug)).id))!;
const sourcesOf = async (slug: string) =>
  (await db().execute(sql`select source, count(*)::int as n from candles where asset_id = ${(await asset(slug)).id} group by source order by source`)) as unknown as {
    source: string;
    n: number;
  }[];

/** A stand-in transport: answers by host, and records every URL requested. */
function stub(answer: (url: URL) => Response) {
  const urls: string[] = [];
  const transport = (async (input: string) => {
    urls.push(input);
    return answer(new URL(input));
  }) as unknown as typeof fetch;
  return { transport, urls };
}

describe("metals job", () => {
  test("fixtures (the default): gold and silver in rupiah per gram, 6 years, all marked synthetic, no request anywhere", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const outcome = await ingestMetals({ now: () => NOW });

    expect(outcome).toMatchObject({ status: "ok", counts: { assets_ok: 2, assets_failed: 0, fallbacks: 0 } });
    expect(network).not.toHaveBeenCalled(); // AC3: PRICES_GOLDAPI unset → nothing goes to gold-api.com
    for (const slug of ["gold", "silver"]) {
      const candles = await candlesOf(slug);
      const days = candles.map((c) => c.day);
      expect(new Set(days).size).toBe(days.length);
      expect(days[0] <= "2020-10-10").toBe(true);
      expect(await sourcesOf(slug)).toEqual([{ source: "synthetic", n: candles.length }]); // AC5
      expect((await quoteOf(slug)).source).toBe("synthetic");
    }
  });

  test("each futures close is converted with the rate of its day, or the latest earlier one", async () => {
    await ingestMetals({ now: () => NOW });
    const fx = await listCandles((await asset("usd-idr")).id, "1900-01-01", "2999-12-31");
    const rateOn = rateLookup(fx);
    const futures = new Map(
      (await import("@/server/prices/yahoo")).parseChart(syntheticChart("GC=F", "6y", NOW)).candles.map((c) => [c.day, c.close]),
    );
    const gold = await candlesOf("gold");
    for (const c of gold.slice(-30)) expect(c.close).toBe(perGram(futures.get(c.day)!, rateOn(c.day)!));
  });

  test("gold-api.com live: the spot price converted at the latest rate on or before its day", async () => {
    process.env.PRICES_GOLDAPI = "live";
    const { transport, urls } = stub((url) =>
      Response.json({ currency: "USD", name: "x", price: 2000, symbol: url.pathname.split("/").pop(), updatedAt: "2026-10-04T09:59:00Z" }),
    );
    await ingestMetals({ transport, now: () => NOW, sleep: noWait });

    expect(urls.sort()).toEqual(["https://api.gold-api.com/price/XAG", "https://api.gold-api.com/price/XAU"]);
    const rate = rateLookup(await listCandles((await asset("usd-idr")).id, "1900-01-01", "2999-12-31"))("2026-10-04")!;
    expect(await quoteOf("gold")).toMatchObject({ price: perGram(2000, rate), source: "gold-api", asOf: new Date("2026-10-04T09:59:00Z") });
  });

  test("gold-api.com failing: the futures quote is used and the run's error names the fallback (AC2)", async () => {
    process.env.PRICES_GOLDAPI = "live";
    const { transport } = stub(() => new Response("unavailable", { status: 503 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outcome = await ingestMetals({ transport, now: () => NOW, sleep: noWait });

    expect(outcome).toMatchObject({ status: "partial", counts: { assets_ok: 2, fallbacks: 2 } });
    expect(outcome.error).toContain("gold (gold-api.com failed (503); quote from the synthetic (made-up) futures GC=F fallback)");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("gold-api.com failed (503)"));
    expect((await quoteOf("gold")).source).toBe("synthetic"); // the futures are made up while PRICES_YAHOO is unset
  });

  test("gold-api.com calls are at least 1.1 s apart (its terms ban multiple requests per second)", async () => {
    process.env.PRICES_GOLDAPI = "live";
    const events: string[] = [];
    const { transport } = stub((url) => {
      events.push(`GET ${url.pathname}`);
      return Response.json({ currency: "USD", name: "x", price: 2000, symbol: url.pathname.split("/").pop(), updatedAt: "2026-10-04T09:59:00Z" });
    });
    await ingestMetals({ transport, now: () => NOW, sleep: async (ms) => void events.push(`wait ${ms}`) });
    expect(events).toEqual(["GET /price/XAU", "wait 1100", "GET /price/XAG"]);
  });

  test("the real wait is used when none is injected", async () => {
    process.env.PRICES_GOLDAPI = "live";
    const times: number[] = [];
    const { transport } = stub((url) => {
      times.push(Date.now());
      return Response.json({ currency: "USD", name: "x", price: 2000, symbol: url.pathname.split("/").pop(), updatedAt: "2026-10-04T09:59:00Z" });
    });
    await ingestMetals({ transport, now: () => NOW });
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(1100);
  });

  test("the fallback is not reported as used when the guard kept a real gold-api quote", async () => {
    process.env.PRICES_GOLDAPI = "live";
    const ok = stub((url) => Response.json({ currency: "USD", name: "x", price: 2000, symbol: url.pathname.split("/").pop(), updatedAt: "2026-10-04T09:59:00Z" }));
    await ingestMetals({ transport: ok.transport, now: () => NOW, sleep: noWait });
    const real = await quoteOf("gold");

    const down = stub(() => new Response("unavailable", { status: 503 }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const outcome = await ingestMetals({ transport: down.transport, now: () => NOW, sleep: noWait });

    expect(outcome.error).toContain("gold (gold-api.com failed (503); the synthetic (made-up) futures GC=F fallback was not used over the stored real quote)");
    expect(await quoteOf("gold")).toMatchObject({ price: real.price, source: "gold-api" });
  });

  test("a futures quote more than 4 days old is not used as the fallback; the run fails with every metal down", async () => {
    // Fixtures futures end today (they are generated up to the real clock): 6 days later they are too old.
    process.env.PRICES_GOLDAPI = "live";
    const later = new Date(Date.now() + 6 * 86400_000);
    const { transport } = stub(() => new Response("unavailable", { status: 503 }));
    await expect(ingestMetals({ transport, now: () => later, sleep: noWait })).rejects.toThrow(
      "gold (gold-api.com failed (503); the futures quote is too old to use)",
    );
  });

  test("the metals job writes no made-up history over a real futures history (job check, not only the database)", async () => {
    process.env.PRICES_YAHOO = "live";
    const { transport } = stub((url) => Response.json(syntheticChart(decodeURIComponent(url.pathname.split("/").pop()!), "6y", NOW)));
    await ingestMetals({ transport, now: () => NOW });
    delete process.env.PRICES_YAHOO;

    // gold-api.com is on fixtures, so only the history is refused: the quotes are written, the run is partial.
    const outcome = await ingestMetals({ now: () => new Date(NOW.getTime() + 86400_000) }).catch((e: Error) => ({ error: e.message }));

    expect(outcome.error).toContain("gold (has real prices; fixtures mode writes nothing");
    expect((await sourcesOf("gold")).map((s) => s.source)).toEqual(["yahoo-futures"]);
  });

  test("futures history from live Yahoo is stored as yahoo-futures (never as spot) and replaces the made-up history", async () => {
    await ingestMetals({ now: () => NOW });
    process.env.PRICES_YAHOO = "live";
    const { transport, urls } = stub((url) => Response.json(syntheticChart(decodeURIComponent(url.pathname.split("/").pop()!), "6y", NOW)));
    await ingestMetals({ transport, now: () => NOW });

    expect(urls.every((u) => /^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\/(GC%3DF|SI%3DF)\?range=6y/.test(u))).toBe(true);
    expect((await sourcesOf("gold")).map((s) => s.source)).toEqual(["yahoo-futures"]);
  });

  test("no USD/IDR rate at all: the run fails (nothing can be converted)", async () => {
    process.env.PRICES_FRANKFURTER = "live";
    const { transport } = stub(() => new Response("down", { status: 500 }));
    await expect(ingestMetals({ transport, now: () => NOW })).rejects.toThrow("no USD/IDR rate stored");
    process.env.PRICES_FRANKFURTER = "fixtures";
  });
});

describe("crypto job", () => {
  const binanceStub = () =>
    stub((url) => {
      if (url.host === "indodax.com") return Response.json({ ticker: { last: "1999000000", server_time: 1759572000 } });
      const symbol = url.searchParams.get("symbol")!;
      if (url.pathname === "/api/v3/ticker/price") return Response.json({ symbol, price: "121800.5" });
      return Response.json(syntheticKlines(symbol, Number(url.searchParams.get("startTime")), NOW)); // shape only
    });

  test("fixtures: 6 years of daily candles including weekends, paged by 1000, all marked synthetic", async () => {
    const outcome = await ingestCrypto({ now: () => NOW });

    expect(outcome).toMatchObject({ status: "ok", counts: { assets_ok: 4, assets_failed: 0 } });
    const btc = await candlesOf("bitcoin");
    const days = btc.map((c) => c.day);
    expect(new Set(days).size).toBe(days.length);
    expect(btc.length).toBeGreaterThan(2150); // every day, more than the 1000 of one call
    expect(days.at(-1)).toBe("2026-10-04");
    expect(await sourcesOf("bitcoin")).toEqual([{ source: "synthetic", n: btc.length }]);
    for (const slug of ["bitcoin", "ethereum", "bitcoin-idr", "ethereum-idr"]) expect((await quoteOf(slug)).source).toBe("synthetic");
  });

  test("live: every request goes to data-api.binance.vision or indodax.com, never api.binance.com (AC4)", async () => {
    process.env.PRICES_CRYPTO = "live";
    const { transport, urls } = binanceStub();
    const outcome = await ingestCrypto({ transport, now: () => NOW });

    expect(outcome.status).toBe("ok");
    expect(new Set(urls.map((u) => new URL(u).host))).toEqual(new Set(["data-api.binance.vision", "indodax.com"]));
    expect(urls.some((u) => u.includes("api.binance.com"))).toBe(false);
    expect(urls.filter((u) => u.includes("/klines?symbol=BTCUSDT"))).toHaveLength(3); // 6 years in pages of 1000
    expect((await sourcesOf("bitcoin")).map((s) => s.source)).toEqual(["binance"]);
    expect(await quoteOf("bitcoin")).toMatchObject({ price: 121800.5, source: "binance", asOf: NOW });
    expect(await quoteOf("bitcoin-idr")).toMatchObject({ price: 1999000000, source: "indodax", asOf: new Date(1759572000 * 1000) });
  });

  test("the first live run replaces the made-up history; later runs fetch from the last day only", async () => {
    await ingestCrypto({ now: () => NOW });
    process.env.PRICES_CRYPTO = "live";
    await ingestCrypto({ transport: binanceStub().transport, now: () => NOW });
    expect((await sourcesOf("ethereum")).map((s) => s.source)).toEqual(["binance"]);

    const later = binanceStub();
    await ingestCrypto({ transport: later.transport, now: () => NOW });
    const klines = later.urls.filter((u) => u.includes("/klines?symbol=ETHUSDT"));
    expect(klines).toHaveLength(1);
    expect(new URL(klines[0]).searchParams.get("startTime")).toBe(String(Date.UTC(2026, 9, 4)));
  });

  test("a live first backfill shorter than 200 days is refused; the made-up history stays", async () => {
    await ingestCrypto({ now: () => NOW });
    const before = await candlesOf("bitcoin");
    process.env.PRICES_CRYPTO = "live";
    const { transport } = stub((url) => {
      if (url.host === "indodax.com") return Response.json({ ticker: { last: "1999000000", server_time: 1759572000 } });
      const symbol = url.searchParams.get("symbol")!;
      if (url.pathname === "/api/v3/ticker/price") return Response.json({ symbol, price: "1" });
      return Response.json(syntheticKlines(symbol, NOW.getTime() - 10 * 86400_000, NOW)); // 10 days only
    });

    const outcome = await ingestCrypto({ transport, now: () => NOW });

    expect(outcome.error).toContain("bitcoin (backfill returned 10 days (at least 200 needed))");
    expect(await candlesOf("bitcoin")).toHaveLength(before.length);
    expect((await sourcesOf("bitcoin")).map((s) => s.source)).toEqual(["synthetic"]);
  });

  test("Binance answering 429: the previous quote stays with its as-of time, and the run is partial", async () => {
    // (Every source failing fails the run, as in the prices job.)
    await ingestCrypto({ now: () => NOW });
    const before = await quoteOf("bitcoin");
    process.env.PRICES_CRYPTO = "live";
    const { transport } = stub((url) =>
      url.host === "indodax.com" ? Response.json({ ticker: { last: "1999000000", server_time: 1759572000 } }) : new Response("slow down", { status: 429 }),
    );
    const outcome = await ingestCrypto({ transport, now: () => NOW });

    expect(outcome).toMatchObject({ status: "partial", counts: { assets_ok: 2, assets_failed: 2 }, error: "2 of 4 assets failed: bitcoin (429), ethereum (429)" });
    expect((await quoteOf("bitcoin"))).toMatchObject({ price: before.price, asOf: before.asOf, source: "synthetic" });
  });
});

describe("made-up prices never replace real ones (QA, OR-26)", () => {
  test("a fixtures run after a live backfill writes nothing over the yahoo series and says so", async () => {
    process.env.PRICES_YAHOO = "live";
    const { transport } = stub((url) => Response.json(syntheticChart(decodeURIComponent(url.pathname.split("/").pop()!), "6y", NOW)));
    await ingestPrices({ transport, now: () => NOW }); // stand-in for a live backfill: stored as yahoo
    const before = await quoteOf("bbca");
    delete process.env.PRICES_YAHOO; // the switch is lost

    const outcome = await ingestPrices({ now: () => new Date(NOW.getTime() + 86400_000) });

    expect(outcome).toMatchObject({ status: "partial", counts: { assets_failed: 3 } });
    expect(outcome.error).toContain("bbca (has real prices; fixtures mode writes nothing");
    expect((await sourcesOf("bbca")).map((s) => s.source)).toEqual(["yahoo"]);
    expect(await quoteOf("bbca")).toMatchObject({ price: before.price, source: "yahoo" });
  });

  test("the database itself refuses a synthetic candle or quote over a real one", async () => {
    const { setQuote, upsertCandles } = await import("@/server/data");
    await ingestPrices({ now: () => NOW });
    const id = (await asset("bbca")).id;
    await db().execute(sql`update candles set source = 'yahoo' where asset_id = ${id} and day = '2026-10-02'`);
    await db().execute(sql`update quotes set source = 'yahoo', price = 1234 where asset_id = ${id}`);

    await upsertCandles(id, "synthetic", [{ day: "2026-10-02", open: 1, high: 1, low: 1, close: 1, volume: null }]);
    await setQuote(id, { price: 1, asOf: NOW, source: "synthetic" });

    const [row] = await listCandles(id, "2026-10-02", "2026-10-02");
    expect(row.close).not.toBe(1);
    expect(await quoteOf("bbca")).toMatchObject({ price: 1234, source: "yahoo" });
  });

  test("the first live backfill is atomic: a failing removal of the synthetic rows stores nothing", async () => {
    const { replaceWithLiveBackfill } = await import("@/server/data");
    await ingestPrices({ now: () => NOW });
    const id = (await asset("bbca")).id;
    const before = await sourcesOf("bbca");
    await db().execute(sql.raw(`create or replace function or27_refuse_delete() returns trigger language plpgsql as $$ begin raise exception 'delete refused'; end $$;
      create trigger or27_refuse_delete before delete on candles for each row execute function or27_refuse_delete();`));
    try {
      await expect(replaceWithLiveBackfill(id, [{ day: "2031-01-02", open: 1, high: 1, low: 1, close: 1, volume: null }])).rejects.toThrow();
    } finally {
      await db().execute(sql.raw(`drop trigger or27_refuse_delete on candles; drop function or27_refuse_delete();`));
    }
    expect(await sourcesOf("bbca")).toEqual(before);
  });
});

describe("switches", () => {
  test.each([
    ["PRICES_YAHOO", () => ingestPrices({ now: () => NOW })],
    ["PRICES_GOLDAPI", () => ingestMetals({ now: () => NOW })],
    ["PRICES_CRYPTO", () => ingestCrypto({ now: () => NOW })],
  ])("an unknown %s value fails the run as a config error (not partial)", async (name, run) => {
    process.env[name] = "yes";
    await expect(run()).rejects.toThrow(`${name} must be "fixtures" or "live"`);
  });

  test("a wrong PRICES_FRANKFURTER fails the prices run before anything is stored", async () => {
    process.env.PRICES_FRANKFURTER = "yes";
    try {
      await expect(ingestPrices({ now: () => NOW })).rejects.toThrow('PRICES_FRANKFURTER must be "fixtures" or "live"');
    } finally {
      process.env.PRICES_FRANKFURTER = "fixtures";
    }
    expect(await db().execute(sql`select * from candles`)).toEqual([]);
  });
});
