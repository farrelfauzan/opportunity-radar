import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getSignal, listSignalHistory, signalHistoryView, signalViews, upsertAsset, upsertCandles } from "@/server/data";
import { db } from "@/server/data/client";
import { ingestPrices } from "@/server/prices/ingest";
import { computeSignals } from "@/server/signals/job";

// rising_noisy.csv ends on Friday 2026-10-02; the job runs that evening (WIB).
const FRIDAY = new Date("2026-10-02T11:00:00Z");
const day = (n: number) => new Date(FRIDAY.getTime() + n * 86_400_000);

const fixture = (name: string) =>
  readFileSync(new URL(`../../docs/signals/fixtures/${name}.csv`, import.meta.url), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [d, close] = line.split(",");
      return { day: d, open: Number(close), high: Number(close), low: Number(close), close: Number(close), volume: null };
    });

/** A real (not synthetic) stock with the given closes. */
async function stock(rows: ReturnType<typeof fixture>, source = "yahoo") {
  const asset = await upsertAsset({ slug: "test-stock", symbol: "TST", name: "Test", kind: "stock", exchange: "US", currency: "IDR", source: "yahoo" });
  await upsertCandles(asset.id, source, rows);
  return asset;
}

const historyRows = async () => (await db().execute(sql`select count(*)::int as n from signal_history`))[0].n as number;

beforeEach(async () => {
  await db().execute(sql`truncate assets restart identity cascade`);
  delete process.env.SHOW_SAMPLE_SIGNALS;
});
afterEach(() => {
  delete process.env.SHOW_SAMPLE_SIGNALS;
  (process.env as Record<string, string>).NODE_ENV = "test";
});

describe("signal job", () => {
  test("a real series: both terms stored with the rules version; the first verdicts are initial baselines", async () => {
    const asset = await stock(fixture("rising_noisy"));
    const outcome = await computeSignals({ now: () => FRIDAY });

    expect(outcome).toMatchObject({ status: "ok", counts: { assets: 1, changes: 2, initial: 2 } });
    for (const term of ["short", "long"] as const) {
      expect(await getSignal(asset.id, term)).toMatchObject({ state: "BUY", verdict: "BUY", since: "2026-10-02", rulesVersion: "rules v1", synthetic: false });
    }
    expect((await listSignalHistory(asset.id)).map((h) => [h.term, h.fromVerdict, h.toVerdict, h.trigger, h.initial])).toEqual(
      expect.arrayContaining([
        ["short", null, "BUY", "signal.trigger.initial", true],
        ["long", null, "BUY", "signal.trigger.initial", true],
      ]),
    );
  });

  test("running again on the same day, or the next day with the same verdict, adds no history row (AC2)", async () => {
    await stock(fixture("rising_noisy"));
    await computeSignals({ now: () => FRIDAY });
    await computeSignals({ now: () => FRIDAY });
    await computeSignals({ now: () => day(1) });
    expect(await historyRows()).toBe(2);
  });

  test("a verdict change writes one row with from, to, the trigger key and the close", async () => {
    const rows = fixture("rising_noisy");
    const asset = await stock(rows);
    await computeSignals({ now: () => FRIDAY });

    // Monday's close at 209.70 is below the 50-day average (rules-v1 §5: the flip price).
    await upsertCandles(asset.id, "yahoo", [{ ...rows.at(-1)!, day: "2026-10-05", open: 209.7, high: 209.7, low: 209.7, close: 209.7 }]);
    await computeSignals({ now: () => day(3) });

    const short = await listSignalHistory(asset.id, "short");
    expect(short[0]).toMatchObject({ day: "2026-10-05", fromVerdict: "BUY", toVerdict: "SELL", trigger: "signal.trigger.close50.below", close: 209.7, initial: false });
    expect(await getSignal(asset.id, "short")).toMatchObject({ verdict: "SELL", since: "2026-10-05" });
  });

  test("an RSI move outranks a close-vs-50 move in the short-term trigger", async () => {
    const rows = fixture("rising_noisy");
    const asset = await stock(rows);
    await computeSignals({ now: () => FRIDAY });
    // A close of 240 lifts RSI above 70 (the flip at 225.48 → HOLD).
    await upsertCandles(asset.id, "yahoo", [{ ...rows.at(-1)!, day: "2026-10-05", open: 240, high: 240, low: 240, close: 240 }]);
    await computeSignals({ now: () => day(3) });
    expect((await listSignalHistory(asset.id, "short"))[0]).toMatchObject({ toVerdict: "HOLD", trigger: "signal.trigger.rsiOut" });
  });

  test("120 days of history: the long-term signal is INSUFFICIENT, with no verdict and no history row (AC3)", async () => {
    const asset = await stock(fixture("rising_noisy").slice(-120));
    await computeSignals({ now: () => FRIDAY });
    expect(await getSignal(asset.id, "long")).toMatchObject({ state: "INSUFFICIENT", verdict: null });
    expect(await listSignalHistory(asset.id, "long")).toEqual([]);
  });

  test("a stale series keeps its last verdict and writes no row", async () => {
    const asset = await stock(fixture("rising_noisy"));
    await computeSignals({ now: () => FRIDAY });
    await computeSignals({ now: () => day(9) }); // 9 calendar days without a close (stocks allow 7)
    expect(await getSignal(asset.id, "short")).toMatchObject({ state: "STALE", verdict: "BUY", since: "2026-10-02" });
    expect(await historyRows()).toBe(2);
  });

  test("a close of zero rejects the series: INVALID_DATA, logged, no verdict", async () => {
    const asset = await stock(fixture("rising_noisy"));
    await db().execute(sql`alter table candles drop constraint candles_prices_check`);
    try {
      await db().execute(sql`update candles set close = 0, low = 0, open = 0, high = 0 where asset_id = ${asset.id} and day = '2026-06-01'`);
      const outcome = await computeSignals({ now: () => FRIDAY });
      expect(outcome.counts).toMatchObject({ invalid: 1 });
      expect(await getSignal(asset.id, "short")).toMatchObject({ state: "INVALID_DATA", verdict: null });
    } finally {
      await db().execute(sql`delete from candles where close <= 0`);
      await db().execute(sql`alter table candles add constraint candles_prices_check check (low > 0 and low <= open and low <= close and high >= open and high >= close)`);
    }
  });
});

describe("crypto's running day", () => {
  test("today's UTC-day row is not a final close and is left out", async () => {
    const rows = fixture("rising_noisy");
    const coin = await upsertAsset({ slug: "test-coin", symbol: "TSTUSDT", name: "Coin", kind: "crypto", exchange: null, currency: "USD", source: "binance" });
    await upsertCandles(coin.id, "binance", [...rows, { ...rows.at(-1)!, day: "2026-10-03", open: 1, high: 1, low: 1, close: 1 }]);
    await computeSignals({ now: () => new Date("2026-10-03T08:00:00Z") });
    expect(await getSignal(coin.id, "short")).toMatchObject({ asOfDay: "2026-10-02", state: "BUY" });
  });
});

describe("sample data (synthetic series, AC5-AC7)", () => {
  test("synthetic prices: verdicts are computed and stored with synthetic = true on the signal and every history row", async () => {
    await ingestPrices({ now: () => FRIDAY }); // fixtures: IHSG, BBCA, S&P 500 synthetic; USD/IDR real (ECB)
    const outcome = await computeSignals({ now: () => FRIDAY });

    expect(outcome.counts).toMatchObject({ assets: 3, synthetic: 3 });
    const all = await db().execute(sql`select synthetic, rules_version from signals`);
    expect(all.length).toBe(6);
    expect(all.every((s) => s.synthetic === true && s.rules_version === "rules v1")).toBe(true);
    const history = await db().execute(sql`select synthetic, initial from signal_history`);
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((h) => h.synthetic === true && h.initial === true)).toBe(true);
  });

  test("by default the screens get signal.sample instead of the verdict, and no history", async () => {
    await ingestPrices({ now: () => FRIDAY });
    await computeSignals({ now: () => FRIDAY });
    const bbca = (await db().execute(sql`select id from assets where slug = 'bbca'`))[0].id as number;

    expect((await signalViews(bbca)).map((v) => v.state)).toEqual(["SAMPLE", "SAMPLE"]);
    expect(await signalHistoryView(bbca)).toEqual([]);
  });

  test("SHOW_SAMPLE_SIGNALS=1 (development and QA) shows the verdicts, flagged synthetic", async () => {
    await ingestPrices({ now: () => FRIDAY });
    await computeSignals({ now: () => FRIDAY });
    const bbca = (await db().execute(sql`select id from assets where slug = 'bbca'`))[0].id as number;
    process.env.SHOW_SAMPLE_SIGNALS = "1";

    const views = await signalViews(bbca);
    expect(views.every((v) => v.state !== "SAMPLE" && "synthetic" in v && v.synthetic)).toBe(true);
    expect((await signalHistoryView(bbca)).length).toBeGreaterThan(0);
  });

  test("under NODE_ENV=production the switch is ignored: still signal.sample", async () => {
    await ingestPrices({ now: () => FRIDAY });
    await computeSignals({ now: () => FRIDAY });
    const bbca = (await db().execute(sql`select id from assets where slug = 'bbca'`))[0].id as number;
    process.env.SHOW_SAMPLE_SIGNALS = "1";
    (process.env as Record<string, string>).NODE_ENV = "production";

    expect((await signalViews(bbca)).map((v) => v.state)).toEqual(["SAMPLE", "SAMPLE"]);
    expect(await signalHistoryView(bbca)).toEqual([]);
  });

  test("a real series reads as it is", async () => {
    const asset = await stock(fixture("rising_noisy"));
    await computeSignals({ now: () => FRIDAY });
    expect((await signalViews(asset.id)).map((v) => v.state)).toEqual(["BUY", "BUY"]);
  });
});

describe("tables", () => {
  test("the database refuses an unknown term, state or verdict, and a history row whose from equals its to", async () => {
    const asset = await stock(fixture("rising_noisy"));
    await expect(db().execute(sql`insert into signals (asset_id, term, state, verdict, checks, reversals, rules_version) values (${asset.id}, 'medium', 'BUY', 'BUY', '[]', '[]', 'rules v1')`)).rejects.toThrow();
    await expect(db().execute(sql`insert into signals (asset_id, term, state, verdict, checks, reversals, rules_version) values (${asset.id}, 'short', 'MAYBE', null, '[]', '[]', 'rules v1')`)).rejects.toThrow();
    await expect(
      db().execute(sql`insert into signal_history (asset_id, term, day, from_verdict, to_verdict, trigger, close, close_day, initial, rules_version)
        values (${asset.id}, 'short', '2026-10-02', 'BUY', 'BUY', 'signal.trigger.close50.above', 1, '2026-10-02', false, 'rules v1')`),
    ).rejects.toThrow();
  });
});
