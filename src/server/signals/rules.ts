// Signal rules v1 (OR-29), exactly as docs/signals/rules-v1.md: a pure,
// deterministic function of an asset's daily closes. No LLM and no news item
// changes a verdict. Every number is computed in full precision; rounding is
// for display only.

export const RULES_VERSION = "rules v1";

export type Verdict = "BUY" | "HOLD" | "SELL";
export type NoVerdict = "INSUFFICIENT" | "STALE" | "INVALID_DATA";
export type TermState = Verdict | NoVerdict;
export type Term = "short" | "long";
export type AssetClass = "stock" | "metal" | "crypto";
export type CheckVerdict = "supportsBuy" | "supportsSell" | "neutral";

export type Row = { day: string; close: number };
/** `counted`: whether the check counts toward "{n} of {m} checks agree" (Momentum is display only). */
export type Check = { check: "momentum" | "trend"; key: string; values: Record<string, number>; verdict: CheckVerdict; counted: boolean };
export type Reversal = { key: string; to: Verdict; stays: number | null; at: number | null };
export type TermResult = { state: TermState; checks: Check[]; agree: { n: number; m: number } | null; reversals: Reversal[] };
export type Indicators = { close: number; sma50: number | null; sma200: number | null; rsi: number | null };
export type Evaluation = {
  rows: number;
  lastDay: string | null;
  indicators: Indicators | null;
  short: TermResult;
  long: TermResult;
  /** USD/IDR over 30 days: context only, never moves a verdict (§3.3). */
  currency: { key: "signal.check.currency.weaker" | "signal.check.currency.stronger" | "signal.check.currency.flat"; pct: number } | null;
};

const SHORT_ROWS = 50;
const LONG_ROWS = 200;
const RSI_CLOSES = 15;
/** Latest close older than this many calendar days → STALE (equal is fine). */
const STALE_DAYS: Record<AssetClass, number> = { stock: 7, metal: 4, crypto: 3 };
/**
 * IDX's Lebaran closures (rules-v1 §4; Researcher's table, R-1 addendum R-6): from the last close
 * before the closure to the first close after it, IDX stocks use 12 days. Add each year when IDX
 * publishes its calendar (September); a year that is not here falls back to 7 days.
 */
export const IDX_LEBARAN: { lastClose: string; firstOpen: string }[] = [
  { lastClose: "2026-03-17", firstOpen: "2026-03-25" },
  { lastClose: "2027-03-05", firstOpen: "2027-03-16" },
];
const LEBARAN_DAYS = 12;
const SEARCH_DOWN = 0.1; // reversal prices: searched down to 10% of the latest close
const SEARCH_UP = 3; // and up to 3×

// --- Indicators ---------------------------------------------------------------

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Wilder averages of gains and losses over a series of closes (needs at least 15). */
function wilder(closes: number[]): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= 14; i++) {
    const c = closes[i] - closes[i - 1];
    if (c > 0) gain += c;
    else loss -= c;
  }
  gain /= 14;
  loss /= 14;
  for (let i = 15; i < closes.length; i++) {
    const c = closes[i] - closes[i - 1];
    gain = (gain * 13 + Math.max(c, 0)) / 14;
    loss = (loss * 13 + Math.max(-c, 0)) / 14;
  }
  return { gain, loss };
}

const rsiOf = ({ gain, loss }: { gain: number; loss: number }) =>
  gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : gain === 0 ? 0 : (100 * gain) / (gain + loss);

/** RSI14 (Wilder): flat → 50, only gains → 100, only losses → 0. Null with fewer than 15 closes. */
export function rsi14(closes: number[]): number | null {
  return closes.length < RSI_CLOSES ? null : rsiOf(wilder(closes));
}

/**
 * RSI14 as a function of a hypothetical last close x, all other closes fixed:
 * the averages up to the second-last close are computed once.
 */
function rsiWithLast(closes: number[]): ((x: number) => number) | null {
  const n = closes.length;
  if (n < RSI_CLOSES) return null;
  const prev = closes[n - 2];
  if (n === RSI_CLOSES) {
    // The last change is the 14th of the first simple average.
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < n - 1; i++) {
      const c = closes[i] - closes[i - 1];
      if (c > 0) gain += c;
      else loss -= c;
    }
    return (x) => rsiOf({ gain: (gain + Math.max(x - prev, 0)) / 14, loss: (loss + Math.max(prev - x, 0)) / 14 });
  }
  const before = wilder(closes.slice(0, -1));
  return (x) =>
    rsiOf({ gain: (before.gain * 13 + Math.max(x - prev, 0)) / 14, loss: (before.loss * 13 + Math.max(prev - x, 0)) / 14 });
}

// --- Verdicts -----------------------------------------------------------------

// Equal values compare with a tiny relative tolerance: a mean of identical closes is not always
// bit-equal to the close (18.33 × 50 / 50 = 18.330000000000013), and equality is HOLD in the tables.
const EPS = 1e-9;
export function cmp(a: number, b: number): -1 | 0 | 1 {
  return Math.abs(a - b) <= EPS * Math.max(Math.abs(a), Math.abs(b), 1) ? 0 : a > b ? 1 : -1;
}
const stretched = (rsi: number) => cmp(rsi, 30) < 0 || cmp(rsi, 70) > 0;

/** Short-term table (§3.1). */
export function shortVerdict(close: number, sma50: number, rsi: number): Verdict {
  if (stretched(rsi)) return "HOLD";
  const c = cmp(close, sma50);
  return c > 0 ? "BUY" : c < 0 ? "SELL" : "HOLD";
}

/** Long-term table (§3.2). */
export function longVerdict(close: number, sma50: number, sma200: number): Verdict {
  if (cmp(sma50, sma200) > 0 && cmp(close, sma200) > 0) return "BUY";
  if (cmp(sma50, sma200) < 0 && cmp(close, sma200) < 0) return "SELL";
  return "HOLD";
}

const side = (a: number, b: number): CheckVerdict => (cmp(a, b) > 0 ? "supportsBuy" : cmp(a, b) < 0 ? "supportsSell" : "neutral");
const position = (a: number, b: number) => (cmp(a, b) > 0 ? "above" : cmp(a, b) < 0 ? "below" : "equal");

/**
 * Momentum check (Designer, rules-v1 §3.3; a display word only): RSI between 30 and 70 supports buy
 * above 50 and sell below 50, exactly 50 is neutral; a stretched RSI (the short-term HOLD rule) is neutral.
 */
function momentumCheck(rsi: number): Check {
  const key =
    rsi > 70 ? "signal.check.rsiHigh" : rsi < 30 ? "signal.check.rsiLow" : rsi > 50 ? "signal.check.rsiAbove50" : rsi < 50 ? "signal.check.rsiBelow50" : "signal.check.rsiInRange";
  return { check: "momentum", key, values: { rsi }, verdict: stretched(rsi) ? "neutral" : side(rsi, 50), counted: false };
}

/** "{n} of {m} checks agree" over the counted checks; none with fewer than two (the short term has one). */
function agreeWith(verdict: Verdict, checks: Check[]): { n: number; m: number } | null {
  const counted = checks.filter((c) => c.counted);
  if (counted.length < 2) return null;
  const word = verdict === "BUY" ? "supportsBuy" : verdict === "SELL" ? "supportsSell" : "neutral";
  return { n: counted.filter((c) => c.verdict === word).length, m: counted.length };
}

// --- Reversal prices (§5) --------------------------------------------------------

/**
 * The nearest prices on the 0.01 grid, up and down, at which the term's verdict differs when the
 * last close is replaced by that price. The verdict only changes at a few boundaries (where the
 * close meets an average, the averages cross, or RSI crosses 30 or 70), so only the grid points
 * next to them are evaluated.
 */
function reversals(
  last: number,
  verdictAt: (x: number) => Verdict,
  boundaries: number[],
  keyFor: (x: number) => string,
): Reversal[] {
  const lastC = Math.round(last * 100);
  const lo = Math.round(last * SEARCH_DOWN * 100);
  const hi = Math.round(last * SEARCH_UP * 100);
  const current = verdictAt(lastC / 100);
  const candidates = new Set<number>();
  for (const b of boundaries) {
    if (!Number.isFinite(b)) continue;
    const c = Math.floor(b * 100);
    for (let d = -1; d <= 2; d++) if (c + d >= lo && c + d <= hi && c + d !== lastC) candidates.add(c + d);
  }
  const found: Reversal[] = [];
  for (const dir of [-1, 1]) {
    const ordered = [...candidates].filter((c) => (dir < 0 ? c < lastC : c > lastC)).sort((a, b) => (a - b) * dir);
    const flip = ordered.find((c) => verdictAt(c / 100) !== current);
    if (flip === undefined) continue;
    const to = verdictAt(flip / 100);
    found.push({ key: keyFor(flip / 100), to, stays: (flip - dir) / 100, at: flip / 100 });
  }
  return found;
}

/** The first cent in [lo, hi] where `pred` holds, for a predicate monotonic in the price (false then true). */
function firstCent(lo: number, hi: number, pred: (x: number) => boolean): number | null {
  if (!pred(hi / 100)) return null;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (pred(mid / 100)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// --- Evaluation -----------------------------------------------------------------

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** One close per date (the last row of a date wins), oldest first. */
export function normalize(rows: Row[]): Row[] {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, r.close);
  return [...byDay].map(([day, close]) => ({ day, close })).sort((a, b) => (a.day < b.day ? -1 : 1));
}

const none = (state: TermState): TermResult => ({ state, checks: [], agree: null, reversals: [] });

/** USD/IDR change over 30 days: the latest rate against the latest rate on or before 30 days earlier. */
export function currencyChange(usdIdr: Row[]): Evaluation["currency"] {
  const rates = normalize(usdIdr);
  const latest = rates.at(-1);
  if (!latest) return null;
  const cutoff = new Date(Date.parse(`${latest.day}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const then = [...rates].reverse().find((r) => r.day <= cutoff);
  if (!then) return null;
  const change = latest.close / then.close - 1;
  const pct = Math.abs(change) * 100;
  // A change that rounds to 0.0% is "flat"; a rise of USD/IDR is a weaker rupiah.
  const key = Math.round(pct * 10) === 0 ? "signal.check.currency.flat" : change > 0 ? "signal.check.currency.weaker" : "signal.check.currency.stronger";
  return { key, pct };
}

/**
 * Rules v1 on one asset's daily closes, as of a calendar day. `usdIdr` is given for the assets whose
 * report shows the currency context (gold, silver, USD-priced stocks); it never moves a verdict.
 */
export function evaluate(input: Row[], options: { asOf: string; assetClass: AssetClass; idx?: boolean; usdIdr?: Row[] }): Evaluation {
  const rows = normalize(input);
  const currency = options.usdIdr ? currencyChange(options.usdIdr) : null;
  const base = { rows: rows.length, lastDay: rows.at(-1)?.day ?? null, currency };
  if (rows.some((r) => !(r.close > 0) || !Number.isFinite(r.close))) {
    return { ...base, indicators: null, short: none("INVALID_DATA"), long: none("INVALID_DATA") };
  }
  const closes = rows.map((r) => r.close);
  const n = closes.length;
  if (n === 0) return { ...base, indicators: null, short: none("INSUFFICIENT"), long: none("INSUFFICIENT") };
  const close = closes[n - 1];
  const sma50 = n >= SHORT_ROWS ? mean(closes.slice(-SHORT_ROWS)) : null;
  const sma200 = n >= LONG_ROWS ? mean(closes.slice(-LONG_ROWS)) : null;
  const rsi = rsi14(closes);
  const indicators = { close, sma50, sma200, rsi };
  const lebaran = options.idx && IDX_LEBARAN.some((w) => base.lastDay! >= w.lastClose && options.asOf <= w.firstOpen);
  const stale = daysBetween(base.lastDay!, options.asOf) > (lebaran ? LEBARAN_DAYS : STALE_DAYS[options.assetClass]);

  // Short term, ≥ 50 rows.
  let short: TermResult;
  if (sma50 === null || rsi === null) short = none("INSUFFICIENT");
  else if (stale) short = none("STALE");
  else {
    const verdict = shortVerdict(close, sma50, rsi);
    const checks = [
      momentumCheck(rsi),
      { check: "trend" as const, key: `signal.check.close50.${position(close, sma50)}`, values: { price: close, sma: sma50 }, verdict: side(close, sma50), counted: true },
    ];
    const s49 = closes.slice(-SHORT_ROWS, -1).reduce((s, x) => s + x, 0);
    const rsiAt = rsiWithLast(closes)!;
    const verdictAt = (x: number) => shortVerdict(x, (s49 + x) / SHORT_ROWS, rsiAt(x));
    const lo = Math.round(close * SEARCH_DOWN * 100);
    const hi = Math.round(close * SEARCH_UP * 100);
    // RSI rises with the last close: the first cent above 70, and the last cent below 30.
    const above70 = firstCent(lo, hi, (x) => rsiAt(x) > 70);
    const notBelow30 = firstCent(lo, hi, (x) => rsiAt(x) >= 30);
    const bounds = [s49 / (SHORT_ROWS - 1)];
    if (above70 !== null) bounds.push(above70 / 100, (above70 - 1) / 100);
    if (notBelow30 !== null) bounds.push(notBelow30 / 100, (notBelow30 - 1) / 100);
    // Which boundary the flip crosses: RSI into 30-70 or out of it, else the 50-day average.
    // RSI coming back into range has its own keys (Designer, copy §8.1).
    const keyFor = (x: number) => {
      const r = rsiAt(x);
      if (stretched(r) !== stretched(rsi)) {
        if (r > 70) return "signal.reverse.rsiHigh";
        if (r < 30) return "signal.reverse.rsiLow";
        return rsi > 70 ? "signal.reverse.rsiBackBelow70" : "signal.reverse.rsiBackAbove30";
      }
      return x > close ? "signal.reverse.close50.above" : "signal.reverse.close50.below";
    };
    short = { state: verdict, checks, agree: agreeWith(verdict, checks), reversals: reversals(close, verdictAt, bounds, keyFor) };
  }

  // Long term, ≥ 200 rows.
  let long: TermResult;
  if (sma50 === null || sma200 === null) long = none("INSUFFICIENT");
  else if (stale) long = none("STALE");
  else {
    const verdict = longVerdict(close, sma50, sma200);
    const checks: Check[] = [
      { check: "trend", key: `signal.check.sma50vs200.${position(sma50, sma200)}`, values: { sma50, sma200 }, verdict: side(sma50, sma200), counted: true },
      { check: "trend", key: `signal.check.close200.${position(close, sma200)}`, values: { price: close, sma: sma200 }, verdict: side(close, sma200), counted: true },
    ];
    const s49 = closes.slice(-SHORT_ROWS, -1).reduce((s, x) => s + x, 0);
    const s199 = closes.slice(-LONG_ROWS, -1).reduce((s, x) => s + x, 0);
    const sma50At = (x: number) => (s49 + x) / SHORT_ROWS;
    const sma200At = (x: number) => (s199 + x) / LONG_ROWS;
    const verdictAt = (x: number) => longVerdict(x, sma50At(x), sma200At(x));
    // The close meets its 200-day average at s199/199; the averages cross where (s49+x)/50 = (s199+x)/200.
    const bounds = [s199 / (LONG_ROWS - 1), (SHORT_ROWS * s199 - LONG_ROWS * s49) / (LONG_ROWS - SHORT_ROWS)];
    const keyFor = (x: number) => {
      if (position(x, sma200At(x)) !== position(close, sma200)) return x > close ? "signal.reverse.close200.above" : "signal.reverse.close200.below";
      return sma50At(x) > sma200At(x) ? "signal.reverse.smaUp" : "signal.reverse.smaDown";
    };
    long = { state: verdict, checks, agree: agreeWith(verdict, checks), reversals: reversals(close, verdictAt, bounds, keyFor) };
  }
  return { ...base, indicators, short, long };
}
