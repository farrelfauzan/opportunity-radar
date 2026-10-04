import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "./client.ts";
import { candles, signalHistory, signals, type SignalState, type SignalTerm, type SignalVerdict } from "./schema.ts";

export type Signal = typeof signals.$inferSelect;
export type NewSignal = Omit<typeof signals.$inferInsert, "computedAt">;
export type SignalHistoryRow = typeof signalHistory.$inferSelect;

/** Every stored daily close of an asset, oldest first, with its source (for the `synthetic` flag). */
export async function closesForSignals(assetId: number): Promise<{ day: string; close: number; source: string }[]> {
  return db()
    .select({ day: candles.day, close: candles.close, source: candles.source })
    .from(candles)
    .where(eq(candles.assetId, assetId))
    .orderBy(asc(candles.day));
}

export async function getSignal(assetId: number, term: SignalTerm): Promise<Signal | null> {
  const [row] = await db().select().from(signals).where(and(eq(signals.assetId, assetId), eq(signals.term, term)));
  return row ?? null;
}

/**
 * Stores the current signal of an asset and term and, when its verdict changed, the history row,
 * in one transaction. A second change on the same day rewrites that day's row; a change back to
 * the day's starting verdict removes it, so a same-day rerun never leaves a change that did not stick.
 */
export async function saveSignal(
  signal: NewSignal,
  change: Omit<typeof signalHistory.$inferInsert, "assetId" | "term" | "rulesVersion" | "synthetic"> | null,
): Promise<void> {
  await db().transaction(async (tx) => {
    if (change) {
      const key = and(eq(signalHistory.assetId, signal.assetId), eq(signalHistory.term, signal.term), eq(signalHistory.day, change.day));
      const [today] = await tx.select().from(signalHistory).where(key);
      if (today && !today.initial && today.fromVerdict === change.toVerdict) {
        await tx.delete(signalHistory).where(key); // back to where the day started: no change today
      } else if (today) {
        await tx
          .update(signalHistory)
          .set({ toVerdict: change.toVerdict, trigger: change.trigger, close: change.close, closeDay: change.closeDay, synthetic: signal.synthetic })
          .where(key);
      } else {
        await tx
          .insert(signalHistory)
          .values({ ...change, assetId: signal.assetId, term: signal.term, rulesVersion: signal.rulesVersion, synthetic: signal.synthetic ?? false });
      }
    }
    await tx
      .insert(signals)
      .values(signal)
      .onConflictDoUpdate({ target: [signals.assetId, signals.term], set: { ...signal, computedAt: new Date() } });
  });
}

export async function listSignalHistory(assetId: number, term?: SignalTerm): Promise<SignalHistoryRow[]> {
  return db()
    .select()
    .from(signalHistory)
    .where(and(eq(signalHistory.assetId, assetId), term ? eq(signalHistory.term, term) : undefined))
    .orderBy(desc(signalHistory.day));
}

// --- Reading for the screens (OR-30/31/32) -----------------------------------------

/**
 * Sample-data verdicts are shown only with SHOW_SAMPLE_SIGNALS=1 outside production (development
 * and QA); under NODE_ENV=production the switch is ignored, like STUB_FAIL (rules-v1 §6).
 */
export function showSampleSignals(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SHOW_SAMPLE_SIGNALS === "1";
}

/** What a screen shows for one term: `SAMPLE` (`signal.sample`) hides a verdict built on made-up prices. */
export type SignalView =
  | { term: SignalTerm; state: "SAMPLE"; rulesVersion: string }
  | (Omit<Signal, "state"> & { state: SignalState; verdict: SignalVerdict | null });

export function toView(signal: Signal): SignalView {
  if (signal.synthetic && !showSampleSignals()) return { term: signal.term, state: "SAMPLE", rulesVersion: signal.rulesVersion };
  return signal;
}

/** Both terms of one asset, as the screens show them. */
export async function signalViews(assetId: number): Promise<SignalView[]> {
  const rows = await db().select().from(signals).where(eq(signals.assetId, assetId)).orderBy(asc(signals.term));
  return rows.map(toView);
}

/** The history the screens show: none for a synthetic series unless sample signals are shown; never the `initial` baseline as a marker (that is the caller's choice via `initial`). */
export async function signalHistoryView(assetId: number, term?: SignalTerm): Promise<SignalHistoryRow[]> {
  const rows = await listSignalHistory(assetId, term);
  return showSampleSignals() ? rows : rows.filter((r) => !r.synthetic);
}
