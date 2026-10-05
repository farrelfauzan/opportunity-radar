import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { articleIsVisible, wibDay, type ArticleWithSource } from "./articles.ts";
import { db } from "./client.ts";
import { articles, articleTriage, sources, ventureArticles, ventureProgress, ventureWinds, type Impact, type Region } from "./schema.ts";
import { listVentures, ventureMarketSeries, ventureMarketView, type MarketPoint, type RegionView, type Venture } from "./ventures.ts";

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
/** ... of articles published in the last 30 days: a rolling 30 × 24 hours, the window the morning step (OR-38) looks at. */
export const RELATED_NEWS_DAYS = 30;

/**
 * The one rule for a venture's related news, used by the count on the Radar card and the list on the venture view:
 * matches in `venture_articles` with relevance >= 50, of articles of visible sources (`articleIsVisible`), published
 * in the rolling 30 × 24 hours before `now` (inclusive) and not after `now`. For queries that join
 * `venture_articles`, `articles` and `sources`.
 * Not `venture_market.related_articles`: that is what the last run looked at, while a match stays stored.
 */
export function relatedNewsWhere(now: Date) {
  const since = new Date(now.getTime() - RELATED_NEWS_DAYS * 24 * 60 * 60 * 1000);
  return and(
    articleIsVisible,
    gte(ventureArticles.relevance, RELATED_NEWS_MIN_RELEVANCE),
    gte(articles.publishedAt, since),
    lte(articles.publishedAt, now),
  );
}

/** Related news per venture id, by `relatedNewsWhere`. Ventures without a match are absent (count 0). */
export async function relatedNewsCounts(now: Date): Promise<Map<number, number>> {
  const rows = await db()
    .select({ ventureId: ventureArticles.ventureId, n: count() })
    .from(ventureArticles)
    .innerJoin(articles, eq(ventureArticles.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(relatedNewsWhere(now))
    .groupBy(ventureArticles.ventureId);
  return new Map(rows.map((row) => [row.ventureId, row.n]));
}

/** A related article with the AI's reading: `impact` and the why texts are null unless triage succeeded. */
export type RelatedArticle = ArticleWithSource & { impact: Impact | null; whyEn: string | null; whyId: string | null };

/** The first `limit` related news of a venture (`relatedNewsWhere`), newest first, ties by id (newest id first). */
export async function listRelatedNews(ventureId: number, now: Date, limit: number): Promise<RelatedArticle[]> {
  const rows = await db()
    .select({
      article: articles,
      sourceName: sources.name,
      sourceSlug: sources.slug,
      impact: articleTriage.impact,
      whyEn: articleTriage.whyEn,
      whyId: articleTriage.whyId,
    })
    .from(ventureArticles)
    .innerJoin(articles, eq(ventureArticles.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleTriage, and(eq(articleTriage.articleId, articles.id), eq(articleTriage.status, "ok")))
    .where(and(eq(ventureArticles.ventureId, ventureId), relatedNewsWhere(now)))
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(limit);
  return rows.map(({ article, ...rest }) => ({ ...article, ...rest }));
}

/** The visible articles among `ids` (a switched-off source's are left out), newest first. */
export async function listArticlesById(ids: number[]): Promise<ArticleWithSource[]> {
  if (ids.length === 0) return [];
  const rows = await db()
    .select({ article: articles, sourceName: sources.name, sourceSlug: sources.slug })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(and(articleIsVisible, inArray(articles.id, ids)))
    .orderBy(desc(articles.publishedAt), desc(articles.id));
  return rows.map((row) => ({ ...row.article, sourceName: row.sourceName, sourceSlug: row.sourceSlug }));
}

/**
 * One card per venture, in `ventures` order, for the Radar's "My ventures" (and the venture view): the
 * newest progress row, the market view of the WIB day of `now` (see `ventureMarketView`), the newest winds on or before
 * that day and the related news count (`relatedNewsWhere`). Progress and winds are read once for all ventures.
 */
export async function listVentureCards(now: Date = new Date()): Promise<VentureCard[]> {
  const day = wibDay(now);
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
    relatedNewsCounts(now),
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

export type VentureView = {
  card: VentureCard;
  /** The scored days of the last 30 days per region, oldest first. */
  series: Record<Region, MarketPoint[]>;
  /** The visible articles the winds cite, newest first, by id. */
  windArticles: Map<number, ArticleWithSource>;
  /** The first `shown` related news, newest first; `card.relatedNews` is the total. */
  news: RelatedArticle[];
};

/** Everything the venture view shows for the venture with this slug, or null when there is none (the view answers 404). */
export async function getVentureView(slug: string, shown: number, now: Date = new Date()): Promise<VentureView | null> {
  const card = (await listVentureCards(now)).find((c) => c.venture.slug === slug);
  if (!card) return null;
  const { winds } = card;
  const cited = winds ? [...new Set([...winds.tailwindArticleIds, ...winds.headwindArticleIds])] : [];
  const [series, windArticles, news] = await Promise.all([
    ventureMarketSeries(card.venture.id, wibDay(now)),
    listArticlesById(cited),
    listRelatedNews(card.venture.id, now, shown),
  ]);
  return { card, series, windArticles: new Map(windArticles.map((a) => [a.id, a])), news };
}
