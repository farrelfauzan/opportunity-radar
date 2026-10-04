// The daily signal job (OR-29): rules v1 on every asset with stored closes, after
// the price jobs. Writes the current signal per asset and term, and a history
// row only when a verdict changes. Creates no alert (OR-34 reads the history and
// must skip `initial` and `synthetic` rows).
import { closesForSignals, getAssetBySlug, getSignal, listAssets, saveSignal, wibDay, type Asset, type Signal } from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { evaluate, RULES_VERSION, type AssetClass, type Evaluation, type Term, type TermResult, type Verdict } from "./rules.ts";

const VERDICTS = new Set(["BUY", "HOLD", "SELL"]);
const isVerdict = (state: string): state is Verdict => VERDICTS.has(state);
const stretched = (rsi: number | null | undefined) => rsi != null && (rsi < 30 || rsi > 70);
const position = (a: number, b: number) => (a > b ? "above" : a < b ? "below" : "equal");

const classOf = (asset: Asset): AssetClass | null =>
  asset.kind === "metal" ? "metal" : asset.kind === "crypto" ? "crypto" : asset.kind === "stock" || asset.kind === "index" ? "stock" : null;

/**
 * The trigger key for a verdict change (copy §8.1): the first verdict is `initial`; short term, an
 * RSI move into or out of 30-70 outranks a close-vs-50-day move; long term, by the new verdict.
 */
export function triggerFor(term: Term, previous: Signal | null, evaluation: Evaluation, to: Verdict): string {
  if (!previous?.verdict) return "signal.trigger.initial";
  const now = evaluation.indicators!;
  if (term === "short") {
    if (stretched(previous.indicators?.rsi) !== stretched(now.rsi)) return stretched(now.rsi) ? "signal.trigger.rsiOut" : "signal.trigger.rsiBack";
    return `signal.trigger.close50.${position(now.close, now.sma50!)}`;
  }
  return to === "BUY" ? "signal.trigger.longBuy" : to === "SELL" ? "signal.trigger.longSell" : "signal.trigger.longMixed";
}

export async function computeSignals(options: { now?: () => Date } = {}): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  const day = wibDay(now);
  const counts = { assets: 0, changes: 0, initial: 0, no_verdict: 0, synthetic: 0, invalid: 0 };
  const usdIdrAsset = await getAssetBySlug("usd-idr");
  const usdIdr = usdIdrAsset ? (await closesForSignals(usdIdrAsset.id)).map(({ day, close }) => ({ day, close })) : [];

  for (const asset of await listAssets()) {
    const assetClass = classOf(asset);
    if (!assetClass) continue; // USD/IDR is context, not a signal
    let rows = await closesForSignals(asset.id);
    // Crypto's running UTC day is not a final close (it is fetched again on the next run).
    if (assetClass === "crypto") rows = rows.filter((r) => r.day < now.toISOString().slice(0, 10));
    if (rows.length === 0) continue; // a quote-only asset (Indodax IDR prices)
    counts.assets++;
    const synthetic = rows.some((r) => r.source === "synthetic");
    if (synthetic) counts.synthetic++;
    const withCurrency = assetClass === "metal" || (assetClass === "stock" && asset.currency === "USD");
    const evaluation = evaluate(rows, { asOf: day, assetClass, idx: asset.exchange === "IDX", usdIdr: withCurrency ? usdIdr : undefined });
    if (evaluation.short.state === "INVALID_DATA") {
      counts.invalid++;
      console.warn(`signals: ${asset.slug}: a close of zero or less in the series; no verdict (INVALID_DATA)`);
    }

    for (const term of ["short", "long"] as const) {
      const result: TermResult = evaluation[term];
      const previous = await getSignal(asset.id, term);
      const changed = isVerdict(result.state) && previous?.verdict !== result.state;
      if (!isVerdict(result.state)) counts.no_verdict++;
      if (changed) {
        counts.changes++;
        if (!previous?.verdict) counts.initial++;
      }
      const verdict = isVerdict(result.state) ? result.state : (previous?.verdict ?? null);
      await saveSignal(
        {
          assetId: asset.id,
          term,
          state: result.state,
          verdict,
          since: changed ? day : (previous?.since ?? null),
          asOfDay: evaluation.lastDay,
          indicators: evaluation.indicators,
          checks: result.checks,
          agree: result.agree,
          reversals: result.reversals,
          currency: evaluation.currency,
          rulesVersion: RULES_VERSION,
          synthetic,
        },
        changed
          ? {
              day,
              fromVerdict: previous?.verdict ?? null,
              toVerdict: result.state as Verdict,
              trigger: triggerFor(term, previous, evaluation, result.state as Verdict),
              close: evaluation.indicators!.close,
              closeDay: evaluation.lastDay!,
              initial: !previous?.verdict,
            }
          : null,
      );
    }
  }
  return { status: "ok", counts };
}
