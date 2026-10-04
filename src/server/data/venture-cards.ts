import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { articleIsVisible, wibDay } from "./articles.ts";
import { db } from "./client.ts";
import { articles, sources, ventureArticles, ventureProgress, ventureWinds, type Region } from "./schema.ts";
import { addDays } from "./trend.ts";
import { listVentures, ventureMarketView, type RegionView, type Venture } from "./ventures.ts";

export type VentureProgress = typeof ventureProgress.$inferSelect;
export type VentureWinds = typeof ventureWinds.$inferSelect;

export type VentureCard = {
  venture: Venture;
  /** The newest progress row, or null: no source connected, or never read. */
  progress: VentureProgress | null;
  market: Record<Region, RegionView | null>;
  /** The newest winds row on or before the day, or null. */
  winds: VentureWinds | null;
  /** Related news of the venture: see `relatedNewsCounts`. */
  relatedNews: number;
};

/** The related news of a venture are the matches rated at least this relevant ... */
export const RELATED_NEWS_MIN_RELEVANCE = 50;
/** ... of articles published in the last 30 days. */
export const RELATED_NEWS_DAYS = 30;

/**
 * Related news per venture id, by the one rule the venture's news list uses too: matches in `venture_articles`
 * with relevance >= 50, of articles of visible sources (`articleIsVisible`) published since the window start,
 * which is 30 days before 00:00 WIB of `day` (inclusive). Ventures without a match are absent (count 0).
 * Not `venture_market.related_articles`: that is what the last run looked at, while a match stays stored.
 */
export async function relatedNewsCounts(day: string): Promise<Map<number, number>> {
  const since = new Date(`${addDays(day, -RELATED_NEWS_DAYS)}T00:00:00+07:00`);
  const rows = await db()
    .select({ ventureId: ventureArticles.ventureId, n: count() })
    .from(ventureArticles)
    .innerJoin(articles, eq(ventureArticles.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(and(articleIsVisible, gte(articles.publishedAt, since), gte(ventureArticles.relevance, RELATED_NEWS_MIN_RELEVANCE)))
    .groupBy(ventureArticles.ventureId);
  return new Map(rows.map((row) => [row.ventureId, row.n]));
}

/**
 * One card per venture, in `ventures` order, for the Radar's "My ventures" (and the venture view): the
 * newest progress row, the market view of `day` (see `ventureMarketView`), the newest winds on or before
 * `day` and the related news count. Progress and winds are read once for all ventures.
 */
export async function listVentureCards(day: string = wibDay()): Promise<VentureCard[]> {
  const list = await listVentures();
  if (list.length === 0) return [];
  const [progressRows, windsRows, counts, markets] = await Promise.all([
    db()
      .selectDistinctOn([ventureProgress.ventureId])
      .from(ventureProgress)
      .orderBy(ventureProgress.ventureId, desc(ventureProgress.day)),
    db()
      .selectDistinctOn([ventureWinds.ventureId])
      .from(ventureWinds)
      .where(lte(ventureWinds.day, day))
      .orderBy(ventureWinds.ventureId, desc(ventureWinds.day)),
    relatedNewsCounts(day),
    Promise.all(list.map((venture) => ventureMarketView(venture.id, day))),
  ]);
  const progress = new Map(progressRows.map((row) => [row.ventureId, row]));
  const winds = new Map(windsRows.map((row) => [row.ventureId, row]));
  return list.map((venture, index) => ({
    venture,
    progress: progress.get(venture.id) ?? null,
    market: markets[index],
    winds: winds.get(venture.id) ?? null,
    relatedNews: counts.get(venture.id) ?? 0,
  }));
}
