import { describe, expect, test } from "vitest";
import { parseKlines, parseTicker, syntheticKlines } from "./binance.ts";
import { parseSpot } from "./goldapi.ts";
import { parseIdrTicker } from "./indodax.ts";
import { perGram, rateLookup } from "./metals.ts";

const candle = (day: string, close: number) => ({ day, open: close, high: close, low: close, close, volume: null });

describe("per-gram conversion", () => {
  test("XAU 2,000 USD/oz at 16,000 rupiah per dollar is Rp 1,028,823 per gram (AC1)", () => {
    expect(perGram(2000, 16000)).toBe(1028823);
  });

  test("a weekend or holiday uses the latest earlier rate; before the first rate there is none", () => {
    const rateOn = rateLookup([candle("2026-10-02", 16500), candle("2026-09-30", 16400), candle("2026-10-05", 16600)]);
    expect(rateOn("2026-10-03")).toBe(16500); // Saturday → Friday's rate
    expect(rateOn("2026-10-04")).toBe(16500);
    expect(rateOn("2026-10-05")).toBe(16600);
    expect(rateOn("2026-10-01")).toBe(16400);
    expect(rateOn("2026-09-29")).toBeNull();
  });
});

describe("gold-api.com reply", () => {
  const reply = { currency: "USD", currencySymbol: "$", exchangeRate: 1, name: "Gold", price: 4165.200195, symbol: "XAU", updatedAt: "2026-07-03T16:08:54Z", updatedAtReadable: "a few seconds ago" };

  test("price and time from the documented shape", () => {
    expect(parseSpot(reply, "XAU")).toEqual({ price: 4165.200195, asOf: new Date("2026-07-03T16:08:54Z") });
  });

  test.each([
    ["another symbol", { ...reply, symbol: "XAG" }],
    ["another currency", { ...reply, currency: "IDR" }],
    ["a zero price", { ...reply, price: 0 }],
    ["a text price", { ...reply, price: "abc" }],
    ["no time", { ...reply, updatedAt: undefined }],
    ["not an object", null],
  ])("%s is rejected", (_name, body) => {
    expect(() => parseSpot(body, "XAU")).toThrow();
  });
});

describe("Binance replies", () => {
  // The documented klines layout: [openTime, open, high, low, close, volume, closeTime, ...], prices as strings.
  const klines = [
    [1759449600000, "120000.10", "121500.00", "119000.00", "121000.50", "8123.456", 1759535999999, "982919999.6", 1000, "0", "0", "0"],
    [1759536000000, "121000.50", "122000.00", "120500.00", "121800.00", "4000.4", 1759622399999, "487248720.4", 900, "0", "0", "0"],
  ];

  test("daily candles by UTC day, numbers from strings, volume in USD (the quote volume)", () => {
    expect(parseKlines(klines)).toEqual([
      { day: "2025-10-03", open: 120000.1, high: 121500, low: 119000, close: 121000.5, volume: 982920000 },
      { day: "2025-10-04", open: 121000.5, high: 122000, low: 120500, close: 121800, volume: 487248720 },
    ]);
  });

  test("a zero or non-numeric price rejects the reply", () => {
    expect(() => parseKlines([[1759449600000, "0", "1", "1", "1", "1"]])).toThrow();
    expect(() => parseKlines([[1759449600000, "x", "1", "1", "1", "1"]])).toThrow();
    expect(() => parseKlines({ code: -1121, msg: "Invalid symbol." })).toThrow();
  });

  test("ticker price", () => {
    expect(parseTicker({ symbol: "BTCUSDT", price: "121800.01000000" }, "BTCUSDT")).toBe(121800.01);
    expect(() => parseTicker({ symbol: "ETHUSDT", price: "1" }, "BTCUSDT")).toThrow();
  });

  test("the made-up klines are deterministic, daily including weekends, at most 1000 per reply", () => {
    const now = new Date("2026-10-04T10:00:00Z");
    const a = syntheticKlines("BTCUSDT", Date.UTC(2026, 8, 25), now);
    expect(a).toEqual(syntheticKlines("BTCUSDT", Date.UTC(2026, 8, 25), now));
    expect(parseKlines(a).map((c) => c.day)).toEqual(["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(syntheticKlines("BTCUSDT", 0, now)).toHaveLength(1000);
  });
});

describe("Indodax reply", () => {
  // The documented shape: strings for prices, server_time in seconds.
  const reply = { ticker: { high: "2010000000", low: "1950000000", vol_btc: "50.1", vol_idr: "100000000000", last: "1999000000", buy: "1998000000", sell: "1999500000", server_time: 1759572000 } };

  test("last price and server time", () => {
    expect(parseIdrTicker(reply)).toEqual({ price: 1999000000, asOf: new Date(1759572000 * 1000) });
  });

  test("a missing ticker, price or time is rejected", () => {
    expect(() => parseIdrTicker({ error: "invalid_pair" })).toThrow();
    expect(() => parseIdrTicker({ ticker: { ...reply.ticker, last: "0" } })).toThrow();
    expect(() => parseIdrTicker({ ticker: { ...reply.ticker, server_time: undefined } })).toThrow();
  });
});

describe("getJson", () => {
  test("refuses redirects and a reply larger than 2 MB", async () => {
    const { getJson } = await import("./http.ts");
    let init: RequestInit | undefined;
    const ok = (async (_u: string, i?: RequestInit) => {
      init = i;
      return Response.json({ a: 1 });
    }) as unknown as typeof fetch;
    expect(await getJson("https://example.test/x", ok)).toEqual({ a: 1 });
    expect(init?.redirect).toBe("error");

    const huge = (async () => new Response("x".repeat(2 * 1024 * 1024 + 1))) as unknown as typeof fetch;
    await expect(getJson("https://example.test/x", huge)).rejects.toThrow("response larger than");
  });
});
