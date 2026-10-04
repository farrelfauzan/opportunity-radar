import { describe, expect, test } from "vitest";
import { rangeFor } from "./ingest";
import { parseChart, syntheticChart, type ChartResponse } from "./yahoo";

// Hand-made responses in Yahoo's chart shape (not recorded Yahoo data).
const response = (rows: [number, number | null, number | null, number | null, number | null, number | null][], meta = {}): ChartResponse => ({
  chart: {
    result: [
      {
        meta: { symbol: "TEST.JK", currency: "IDR", gmtoffset: 7 * 3600, regularMarketPrice: 105, regularMarketTime: 1791100000, ...meta },
        timestamp: rows.map((r) => r[0]),
        indicators: {
          quote: [
            { open: rows.map((r) => r[1]), high: rows.map((r) => r[2]), low: rows.map((r) => r[3]), close: rows.map((r) => r[4]), volume: rows.map((r) => r[5]) },
          ],
        },
      },
    ],
    error: null,
  },
});
// 09:00 WIB on Thu 1, Fri 2, Mon 5 and Wed 7 October 2026 (Tue 6 is a holiday gap).
const at = (day: string) => Date.parse(`${day}T09:00:00+07:00`) / 1000;
const T = { thu: at("2026-10-01"), fri: at("2026-10-02"), mon: at("2026-10-05"), wed: at("2026-10-07") };

describe("parseChart", () => {
  test("normal rows become candles on the exchange's calendar day, oldest first", () => {
    const chart = parseChart(response([[T.thu, 100, 102, 99, 101, 5000], [T.fri, 101, 104, 100, 103, 6000]]));
    expect(chart.candles).toEqual([
      { day: "2026-10-01", open: 100, high: 102, low: 99, close: 101, volume: 5000 },
      { day: "2026-10-02", open: 101, high: 104, low: 100, close: 103, volume: 6000 },
    ]);
    expect(chart.quote).toEqual({ price: 105, asOf: new Date(1791100000 * 1000) });
  });

  test("a holiday gap stays a gap; no candle is invented", () => {
    const days = parseChart(response([[T.mon, 1, 1, 1, 1, 1], [T.wed, 2, 2, 2, 2, 2]])).candles.map((c) => c.day);
    expect(days).toHaveLength(2);
    expect(new Date(days[1]).getTime() - new Date(days[0]).getTime()).toBe(2 * 86400 * 1000);
  });

  test("null rows are skipped; a missing open, high or low takes the close", () => {
    const chart = parseChart(response([[T.thu, null, null, null, null, null], [T.fri, null, null, null, 50, null]]));
    expect(chart.candles).toEqual([{ day: "2026-10-02", open: 50, high: 50, low: 50, close: 50, volume: null }]);
  });

  test("a day given twice keeps the last row", () => {
    const chart = parseChart(response([[T.fri, 1, 1, 1, 1, 1], [T.fri + 3600, 2, 2, 2, 2, 2]]));
    expect(chart.candles).toEqual([{ day: "2026-10-02", open: 2, high: 2, low: 2, close: 2, volume: 2 }]);
  });

  test("an error response is a source error", () => {
    expect(() => parseChart({ chart: { result: null, error: { code: "Not Found", description: "No data found" } } })).toThrow("No data found");
  });
});

describe("syntheticChart (fixtures mode)", () => {
  const now = new Date("2026-10-04T10:00:00Z");

  test("is deterministic and in Yahoo's shape", () => {
    expect(syntheticChart("^JKSE", "1mo", now)).toEqual(syntheticChart("^JKSE", "1mo", now));
    const parsed = parseChart(syntheticChart("^JKSE", "6y", now));
    expect(parsed.candles.length).toBeGreaterThan(1450);
    expect(parsed.quote?.price).toBeGreaterThan(0);
  });

  test("weekdays only, with holiday gaps, about 6 years, no duplicate days", () => {
    const days = parseChart(syntheticChart("BBCA.JK", "6y", now)).candles.map((c) => c.day);
    expect(new Set(days).size).toBe(days.length);
    expect(days.every((d) => ![0, 6].includes(new Date(d).getUTCDay()))).toBe(true);
    expect(days).not.toContain("2025-12-25");
    expect(days[0] <= "2020-10-10").toBe(true);
    expect(days[days.length - 1] >= "2026-10-01").toBe(true);
  });

  test("a shorter range is the end of the same history", () => {
    const long = parseChart(syntheticChart("^GSPC", "1y", now)).candles;
    const short = parseChart(syntheticChart("^GSPC", "5d", now)).candles;
    expect(long.slice(-short.length)).toEqual(short);
  });
});

describe("rangeFor", () => {
  const now = new Date("2026-10-04T10:00:00Z");
  test.each([
    [null, "6y"],
    ["2026-10-02", "5d"],
    ["2026-09-15", "1mo"],
    ["2026-03-01", "1y"],
    ["2024-01-01", "6y"],
  ])("last stored day %s → %s", (last, range) => {
    expect(rangeFor(last, now)).toBe(range);
  });
});
