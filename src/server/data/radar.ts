import { and, desc, eq, exists, inArray, sql as sqlTag } from "drizzle-orm";
import { articleIsVisible, type ArticleWithSource } from "./articles.ts";
import { db } from "./client.ts";
import { articles, articleTriage, opportunities, opportunityArticles, sources } from "./schema.ts";

export type LinkedNews = ArticleWithSource & {
  /** "Why it matters" in each language; null unless the article has an ok triage. */
  whyEn: string | null;
  whyId: string | null;
};

/**
 * The newest articles cited by an open opportunity, for the Radar's "News that moves
 * opportunities": visible sources only (`articleIsVisible`), newest first (ties: newest id
 * first), one entry per article however many opportunities cite it, at most `limit`.
 * The triage comes in the same query; a failed or missing triage gives no "why".
 */
export async function recentLinkedNews(limit: number): Promise<LinkedNews[]> {
  const citedByOpen = db()
    .select({ one: sqlTag`1` })
    .from(opportunityArticles)
    .innerJoin(opportunities, eq(opportunities.id, opportunityArticles.opportunityId))
    .where(and(eq(opportunityArticles.articleId, articles.id), eq(opportunities.status, "open")));
  const rows = await db()
    .select({ article: articles, sourceName: sources.name, sourceSlug: sources.slug, whyEn: articleTriage.whyEn, whyId: articleTriage.whyId })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleTriage, and(eq(articleTriage.articleId, articles.id), eq(articleTriage.status, "ok")))
    .where(and(articleIsVisible, exists(citedByOpen)))
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(limit);
  return rows.map(({ article, sourceName, sourceSlug, whyEn, whyId }) => ({ ...article, sourceName, sourceSlug, whyEn, whyId }));
}

/**
 * How many articles each of the given opportunities cites that may be shown (the source is
 * switched on: the same rule as the evidence list of the detail), in one query. An id
 * without such citations counts 0.
 */
export async function citationCounts(opportunityIds: number[]): Promise<Map<number, number>> {
  const counts = new Map(opportunityIds.map((id) => [id, 0]));
  if (opportunityIds.length === 0) return counts;
  const rows = await db()
    .select({ id: opportunityArticles.opportunityId, n: sqlTag<number>`count(*)::int` })
    .from(opportunityArticles)
    .innerJoin(articles, eq(opportunityArticles.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(and(inArray(opportunityArticles.opportunityId, opportunityIds), articleIsVisible))
    .groupBy(opportunityArticles.opportunityId);
  for (const { id, n } of rows) counts.set(id, n);
  return counts;
}
