import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { currencyChange, dayIn, evaluate, longVerdict, marketZone, momentumCheck, rsi14, shortVerdict, type Row, type TermResult } from "./rules.ts";
import { triggerFor } from "./job.ts";

// The Researcher's fixtures and expected values (docs/signals/fixtures, generated with exact arithmetic).
const dir = new URL("../../../docs/signals/fixtures/", import.meta.url);
const expected = JSON.parse(readFileSync(new URL("expected.json", dir), "utf8")) as {
  rules: string;
  fixtures: Record<string, Fixture>;
  stale_cases: { file: string; asset_class: "stock" | "metal" | "crypto"; as_of: string; expected: string }[];
};
type Flip = { at: string; becomes: string; still_old_verdict_at: string } | null;
type Fixture = {
  rows: number;
  last_date?: string;
  last_close?: string;
  sma50?: string | null;
  sma200?: string | null;
  rsi14?: string | null;
  short: string;
  long: string;
  flips?: Record<"short" | "long", { down: Flip; up: Flip }>;
};

const rowsOf = (file: string): Row[] =>
  readFileSync(new URL(file, dir), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [day, close] = line.split(",");
      return { day, close: Number(close) };
    });

const two = (x: number | null | undefined) => (x === null || x === undefined ? null : x.toFixed(2));

describe("rules v1 on every fixture in docs/signals/fixtures (AC1)", () => {
  test("the fixtures are for rules v1", () => {
    expect(expected.rules).toBe("rules v1");
  });

  for (const [name, fx] of Object.entries(expected.fixtures)) {
    test(`${name}: rows, SMA50, SMA200, RSI14 and both verdicts`, () => {
      const rows = rowsOf(`${name}.csv`);
      const result = evaluate(rows, { asOf: fx.last_date ?? "2026-10-02", assetClass: "crypto" });
      expect(result.rows).toBe(fx.rows);
      expect(result.short.state).toBe(fx.short);
      expect(result.long.state).toBe(fx.long);
      if (fx.short === "INVALID_DATA") return;
      expect(two(result.indicators!.close)).toBe(fx.last_close);
      expect(two(result.indicators!.sma50)).toBe(fx.sma50 ?? null);
      expect(two(result.indicators!.sma200)).toBe(fx.sma200 ?? null);
      expect(two(result.indicators!.rsi)).toBe(fx.rsi14 ?? null);
    });

    if (!expected.fixtures[name].flips) continue;
    for (const term of ["short", "long"] as const) {
      test(`${name}: ${term}-term flip prices (rules-v1 §5)`, () => {
        const result = evaluate(rowsOf(`${name}.csv`), { asOf: fx.last_date!, assetClass: "crypto" });
        const r: TermResult = result[term];
        const close = result.indicators!.close;
        const down = r.reversals.find((x) => x.at !== null && x.at < close) ?? null;
        const up = r.reversals.find((x) => x.at !== null && x.at > close) ?? null;
        const flips = fx.flips![term];
        const view = (rev: typeof down) => (rev ? { at: two(rev.at), becomes: rev.to, still_old_verdict_at: two(rev.stays) } : null);
        expect(view(down)).toEqual(flips.down);
        expect(view(up)).toEqual(flips.up);
      });
    }
  }
});

describe("staleness (rules-v1 §4)", () => {
  test.each(expected.stale_cases)("$asset_class, as of $as_of: $expected", ({ file, asset_class, as_of, expected: want }) => {
    const result = evaluate(rowsOf(file), { asOf: as_of, assetClass: asset_class });
    const got = `${result.short.state}/${result.long.state}`;
    expect(got).toBe(want.startsWith("STALE") ? "STALE/STALE" : want);
  });
});

describe("IDX Lebaran closures: 12 days from the last close before to the first close after (rules-v1 §4)", () => {
  // rising_noisy shifted so its last close is 2027-03-05, the last close before the 2027 closure.
  const shifted = (lastDay: string) => {
    const rows = rowsOf("rising_noisy.csv");
    const shift = Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${rows.at(-1)!.day}T00:00:00Z`);
    return rows.map((r) => ({ day: new Date(Date.parse(`${r.day}T00:00:00Z`) + shift).toISOString().slice(0, 10), close: r.close }));
  };

  test("2027: 11 days old on the first open day is not stale for an IDX stock", () => {
    expect(evaluate(shifted("2027-03-05"), { asOf: "2027-03-16", assetClass: "stock", idx: true }).short.state).toBe("BUY");
  });

  test("the same age outside a closure, or for a non-IDX stock, is stale", () => {
    expect(evaluate(shifted("2027-03-05"), { asOf: "2027-03-16", assetClass: "stock" }).short.state).toBe("STALE");
    expect(evaluate(shifted("2027-06-04"), { asOf: "2027-06-15", assetClass: "stock", idx: true }).short.state).toBe("STALE");
  });

  test("after the first open day the normal limit applies again; a year not in the table uses 7 days", () => {
    expect(evaluate(shifted("2027-03-05"), { asOf: "2027-03-17", assetClass: "stock", idx: true }).short.state).toBe("STALE");
    expect(evaluate(shifted("2028-02-18"), { asOf: "2028-02-28", assetClass: "stock", idx: true }).short.state).toBe("STALE");
  });
});

describe("indicators by hand", () => {
  test("RSI14: flat is 50, only gains 100, only losses 0, fewer than 15 closes none", () => {
    expect(rsi14(Array(15).fill(100))).toBe(50);
    expect(rsi14(Array.from({ length: 15 }, (_, i) => 100 + i))).toBe(100);
    expect(rsi14(Array.from({ length: 15 }, (_, i) => 100 - i))).toBe(0);
    expect(rsi14(Array(14).fill(100))).toBeNull();
  });

  test("RSI14 against a hand calculation (Wilder smoothing after the first 14 changes)", () => {
    // 14 changes of +1 then one of −2: first averages gain 1, loss 0; then gain 13/14, loss 2/14.
    const closes = [...Array.from({ length: 15 }, (_, i) => 100 + i), 112];
    expect(rsi14(closes)).toBeCloseTo((100 * (13 / 14)) / (13 / 14 + 2 / 14), 10);
  });

  test("checks carry their keys, numbers and verdict words; n of m agree", () => {
    const result = evaluate(rowsOf("rising_noisy.csv"), { asOf: "2026-10-02", assetClass: "stock" });
    expect(result.long.checks.map((c) => [c.key, c.verdict])).toEqual([
      ["signal.check.sma50vs200.above", "supportsBuy"],
      ["signal.check.close200.above", "supportsBuy"],
    ]);
    expect(result.long.agree).toEqual({ n: 2, m: 2 });
    expect(result.short.checks.map((c) => [c.key, c.verdict])).toEqual([
      ["signal.check.rsiAbove50", "supportsBuy"], // RSI 55.80
      ["signal.check.close50.above", "supportsBuy"],
    ]);
    expect(result.short.checks[1].values).toEqual({ price: 219.08, sma: result.indicators!.sma50 });
    // Momentum is display only: it is not counted, so the short term has no "n of m agree" (one counted check).
    expect(result.short.checks.map((c) => c.counted)).toEqual([false, true]);
    expect(result.short.agree).toBeNull();
  });

  test("momentum words: exactly 50 is neutral (rsiInRange); a stretched RSI is neutral", () => {
    const flat = evaluate(rowsOf("flat.csv"), { asOf: "2026-10-02", assetClass: "crypto" });
    expect(flat.short.checks[0]).toMatchObject({ key: "signal.check.rsiInRange", verdict: "neutral" });
    const gain = evaluate(rowsOf("all_gain.csv"), { asOf: "2026-10-02", assetClass: "crypto" });
    expect(gain.short.checks[0]).toMatchObject({ key: "signal.check.rsiHigh", verdict: "neutral" });
    const falling = evaluate(rowsOf("falling_noisy.csv"), { asOf: "2026-10-02", assetClass: "crypto" });
    expect(falling.short.checks[0]).toMatchObject({ key: "signal.check.rsiBelow50", verdict: "supportsSell" });
  });

  test("RSI coming back into range has its own reversal key", () => {
    const gain = evaluate(rowsOf("all_gain.csv"), { asOf: "2026-10-02", assetClass: "crypto" });
    expect(gain.short.reversals.map((r) => [r.key, r.to])).toEqual([["signal.reverse.rsiBackBelow70", "BUY"]]);
    const loss = evaluate(rowsOf("all_loss.csv"), { asOf: "2026-10-02", assetClass: "crypto" });
    expect(loss.short.reversals.map((r) => [r.key, r.to])).toEqual([["signal.reverse.rsiBackAbove30", "SELL"]]);
  });

  test("reversal keys name the boundary that is crossed", () => {
    const result = evaluate(rowsOf("rising_noisy.csv"), { asOf: "2026-10-02", assetClass: "stock" });
    expect(result.short.reversals.map((r) => [r.key, r.to])).toEqual([
      ["signal.reverse.close50.below", "SELL"],
      ["signal.reverse.rsiHigh", "HOLD"],
    ]);
    expect(result.long.reversals.map((r) => [r.key, r.to])).toEqual([["signal.reverse.close200.below", "HOLD"]]);
  });
});

describe("currency context (never moves a verdict)", () => {
  const rate = (day: string, close: number) => ({ day, close });

  test("a rise of USD/IDR is a weaker rupiah; the latest rate on or before 30 days earlier is the base", () => {
    expect(currencyChange([rate("2026-08-31", 16000), rate("2026-09-02", 16100), rate("2026-10-02", 16400)])).toEqual({
      key: "signal.check.currency.weaker",
      pct: expect.closeTo((16400 / 16100 - 1) * 100, 10), // the base is 2 September, exactly 30 days earlier
    });
    expect(currencyChange([rate("2026-09-01", 16400), rate("2026-10-02", 16000)])!.key).toBe("signal.check.currency.stronger");
    expect(currencyChange([rate("2026-09-01", 16000), rate("2026-10-02", 16004)])!.key).toBe("signal.check.currency.flat");
    expect(currencyChange([rate("2026-10-01", 16000)])).toBeNull();
  });

  test("the verdict is the same with or without the currency context", () => {
    const rows = rowsOf("rising_noisy.csv");
    const usdIdr = [rate("2026-09-01", 15000), rate("2026-10-02", 17000)];
    const a = evaluate(rows, { asOf: "2026-10-02", assetClass: "metal" });
    const b = evaluate(rows, { asOf: "2026-10-02", assetClass: "metal", usdIdr });
    expect([b.short.state, b.long.state]).toEqual([a.short.state, a.long.state]);
    expect(b.currency?.key).toBe("signal.check.currency.weaker");
  });
});

describe("every row of the decision tables, including each boundary (100% coverage)", () => {
  test.each([
    // [RSI, close, SMA50, verdict]  §3.1
    [29.99, 120, 100, "HOLD"], // RSI < 30: stretched
    [70.01, 120, 100, "HOLD"], // RSI > 70: stretched
    [30, 120, 100, "BUY"], // exactly 30 is not stretched
    [70, 80, 100, "SELL"], // exactly 70 is not stretched
    [50, 100.01, 100, "BUY"],
    [50, 99.99, 100, "SELL"],
    [50, 100, 100, "HOLD"], // close = SMA50
  ] as const)("short: RSI %d, close %d vs SMA50 %d → %s", (rsi, close, sma50, verdict) => {
    expect(shortVerdict(close, sma50, rsi)).toBe(verdict);
  });

  test.each([
    // [close, SMA50, SMA200, verdict]  §3.2
    [130, 120, 100, "BUY"],
    [80, 90, 100, "SELL"],
    [90, 120, 100, "HOLD"], // SMA50 above, close below
    [110, 90, 100, "HOLD"], // SMA50 below, close above
    [110, 100, 100, "HOLD"], // SMA50 = SMA200
    [90, 100, 100, "HOLD"],
    [100, 120, 100, "HOLD"], // close = SMA200
    [100, 80, 100, "HOLD"],
  ] as const)("long: close %d, SMA50 %d, SMA200 %d → %s", (close, sma50, sma200, verdict) => {
    expect(longVerdict(close, sma50, sma200)).toBe(verdict);
  });
});

describe("ties compare as equal (Reviewer, PR 80)", () => {
  test("a flat series of 18.33 is HOLD on both terms (the mean is not bit-equal to the close)", () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ day: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), close: 18.33 }));
    const r = evaluate(rows, { asOf: rows.at(-1)!.day, assetClass: "crypto" });
    expect([r.short.state, r.long.state]).toEqual(["HOLD", "HOLD"]);
  });

  test("an RSI of exactly 70 (gains 7u, losses 3u) is not stretched", () => {
    expect(shortVerdict(101, 100, 100 * 0.7 / (0.7 + 0.3))).toBe("BUY");
  });
});

describe("staleness in the market's own time zone (rules-v1 §4, PR 87)", () => {
  // rising_noisy ends on Friday 2026-10-02 (the trading date).
  const at = (wib: string) => new Date(`${wib}+07:00`);
  const stateFor = (assetClass: "stock" | "metal" | "crypto", idx: boolean, wib: string) => {
    const asOf = dayIn(marketZone(assetClass, idx), at(wib));
    return evaluate(rowsOf("rising_noisy.csv"), { asOf, assetClass, idx }).short.state;
  };

  test("zones: IDX Jakarta, US stocks and metals New York, crypto UTC", () => {
    expect(marketZone("stock", true)).toBe("Asia/Jakarta");
    expect(marketZone("stock", false)).toBe("America/New_York");
    expect(marketZone("metal", false)).toBe("America/New_York");
    expect(marketZone("crypto", false)).toBe("UTC");
  });

  test("a US close exactly 7 days old in New York is not STALE at 07:00 WIB (the previous evening there)", () => {
    expect(dayIn("America/New_York", at("2026-10-10T07:00:00"))).toBe("2026-10-09");
    expect(stateFor("stock", false, "2026-10-10T07:00:00")).toBe("BUY");
    // Counted by the WIB date it would be 8 days: the IDX stock with the same close is stale.
    expect(stateFor("stock", true, "2026-10-10T07:00:00")).toBe("STALE");
  });

  test("gold's week (Mon 05:00 to Sat 04:00 WIB): Friday's COMEX close stays fresh until New York's Tuesday", () => {
    expect(stateFor("metal", false, "2026-10-07T07:00:00")).toBe("BUY"); // Tue 6 Oct in New York: 4 days
    expect(stateFor("metal", false, "2026-10-08T07:00:00")).toBe("STALE"); // Wed 7 Oct in New York: 5 days
  });

  test("crypto counts UTC days", () => {
    expect(dayIn("UTC", at("2026-10-05T06:00:00"))).toBe("2026-10-04");
    expect(stateFor("crypto", false, "2026-10-06T06:00:00")).toBe("BUY"); // 5 Oct UTC: 3 days
  });
});

describe("RSI of exactly 70 through evaluate (Reviewer, PR 80)", () => {
  test("15 closes with gains of 7 and losses of 3 units, then flat: RSI 70 is not stretched", () => {
    // The first 14 changes: 7 gains of +7 and 7 losses of −3 (sum of gains 49, of losses 21: RSI 70);
    // flat after that keeps both averages' ratio, so RSI stays exactly 70 in exact arithmetic.
    // From 18.33 in steps of +0.21 / −0.09 (7 and 3 units of 0.03, 2-decimal closes) the float RSI
    // ends at 70.00000000000007: only the tolerant comparison keeps it "not stretched".
    const changes = [0.21, -0.09, 0.21, -0.09, 0.21, -0.09, 0.21, -0.09, 0.21, -0.09, 0.21, -0.09, 0.21, -0.09];
    const closes = [18.33];
    for (const c of changes) closes.push(Math.round((closes.at(-1)! + c) * 100) / 100);
    while (closes.length < 49) closes.push(closes.at(-1)!);
    closes.push(closes.at(-1)! + 0); // last close equals the previous: RSI unchanged at 70
    const rows = closes.map((close, i) => ({ day: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10), close }));
    const result = evaluate(rows, { asOf: rows.at(-1)!.day, assetClass: "crypto" });
    expect(result.indicators!.rsi).toBeCloseTo(70, 9);
    expect(result.indicators!.rsi).toBeGreaterThan(70); // the float noise this test is about
    expect(result.short.checks[0].key).not.toBe("signal.check.rsiHigh");
    expect(result.short.state).not.toBe("HOLD"); // close is above the 50-day average, RSI is in range
  });
});

describe("the exact bounds everywhere: momentum key and trigger key (Reviewer, PR 90)", () => {
  test("momentum words at 30, 50 and 70 with float noise", () => {
    expect(momentumCheck(29.999999999998877)).toMatchObject({ key: "signal.check.rsiBelow50", verdict: "supportsSell" }); // exactly 30: in range
    expect(momentumCheck(70.00000000000007)).toMatchObject({ key: "signal.check.rsiAbove50", verdict: "supportsBuy" }); // exactly 70: in range
    expect(momentumCheck(50.00000000000001)).toMatchObject({ key: "signal.check.rsiInRange", verdict: "neutral" }); // exactly 50
    expect(momentumCheck(29.9)).toMatchObject({ key: "signal.check.rsiLow", verdict: "neutral" });
    expect(momentumCheck(50.1)).toMatchObject({ key: "signal.check.rsiAbove50" });
  });

  test("a change caused by the 50-day average at RSI exactly 30 is close50, not rsiOut", () => {
    const previous = { verdict: "BUY", indicators: { close: 110, sma50: 100, sma200: null, rsi: 45 } } as never;
    const evaluation = { indicators: { close: 90, sma50: 100, sma200: null, rsi: 29.999999999998877 } } as never;
    expect(triggerFor("short", previous, evaluation, "SELL")).toBe("signal.trigger.close50.below");
  });
});
