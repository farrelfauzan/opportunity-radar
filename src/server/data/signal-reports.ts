import { and, eq, gte, sql } from "drizzle-orm";
import { articleIsVisible } from "./articles.ts";
import { db } from "./client.ts";
import { articles, articleTriage, signalReports, signals, sources, type SignalTerm } from "./schema.ts";
import { showSampleSignals, type Signal } from "./signals.ts";

export type SignalReport = typeof signalReports.$inferSelect;
export type NewSignalReport = Omit<typeof signalReports.$inferInsert, "generatedAt"> & { generatedAt: Date };

/**
 * The signals that need an explanation (OR-33): a verdict (BUY / HOLD / SELL) with no report yet, a
 * report on another verdict (it changed) or on the other kind of prices, or one written before
 * `staleBefore` (weekly). No-verdict states (STALE, INSUFFICIENT, INVALID_DATA) get none.
 */
export async function signalsToExplain(staleBefore: Date): Promise<Signal[]> {
  const rows = await db()
    .select({ signal: signals })
    .from(signals)
    .leftJoin(signalReports, and(eq(signalReports.assetId, signals.assetId), eq(signalReports.term, signals.term)))
    .where(
      and(
        sql`${signals.state} in ('BUY', 'HOLD', 'SELL')`,
        // A changed verdict shows as a report on another verdict; a switch from sample to real prices as
        // a report with the other synthetic flag. A same-day rerun after writing finds nothing due.
        sql`(${signalReports.assetId} is null
          or ${signalReports.generatedAt} < ${staleBefore.toISOString()}
          or ${signalReports.verdict} <> ${signals.state}
          or ${signalReports.synthetic} <> ${signals.synthetic})`,
      ),
    )
    .orderBy(signals.assetId, signals.term);
  return rows.map((r) => r.signal);
}

/** Visible, ok-triaged articles published since `since`: the candidates for a news check. */
export async function articlesForSignals(since: Date) {
  return db()
    .select({ id: articles.id, headline: articles.headline, why: articleTriage.whyEn, themes: articleTriage.themes, impact: articleTriage.impact })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .innerJoin(articleTriage, eq(articleTriage.articleId, articles.id))
    .where(and(articleIsVisible, eq(articleTriage.status, "ok"), gte(articles.publishedAt, since)));
}

/** Stores the report of an asset and term, replacing the previous one. `generatedAt` is the job's clock. */
export async function saveSignalReport(report: NewSignalReport): Promise<void> {
  await db()
    .insert(signalReports)
    .values(report)
    .onConflictDoUpdate({ target: [signalReports.assetId, signalReports.term], set: report });
}

export async function getSignalReport(assetId: number, term: SignalTerm): Promise<SignalReport | null> {
  const [row] = await db().select().from(signalReports).where(and(eq(signalReports.assetId, assetId), eq(signalReports.term, term)));
  return row ?? null;
}

/**
 * The reports the screens show (OR-32): a report on sample (synthetic) prices only with
 * SHOW_SAMPLE_SIGNALS=1 outside production, like the signals themselves.
 */
export async function signalReportViews(assetId: number): Promise<SignalReport[]> {
  const rows = await db().select().from(signalReports).where(eq(signalReports.assetId, assetId)).orderBy(signalReports.term);
  return showSampleSignals() ? rows : rows.filter((r) => !r.synthetic);
}
