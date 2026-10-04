import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { addDays } from "./trend.ts";
import { articleIsVisible, wibDay } from "./articles.ts";
import { db } from "./client.ts";
import { articles, articleTriage, opportunities, opportunityArticles, sources, type Impact, type Theme } from "./schema.ts";

/** What the News list adds to an article (OR-21). */
export type NewsEnrichment = {
  /** The AI's reading; null unless triage succeeded. */
  triage: { impact: Impact; whyEn: string; whyId: string } | null;
  /** The open opportunity that cites the article (the highest current score, ties: lowest id), or null. */
  linked: { id: number; titleEn: string; titleId: string } | null;
};

/**
 * Triage and linked opportunity of the given articles, in two queries however many there are.
 * Only visible articles (`articleIsVisible`) are read. An article with neither a successful
 * triage nor an open opportunity citing it has no entry, so the map holds only what there is to show.
 */
export async function newsEnrichment(articleIds: number[]): Promise<Map<number, NewsEnrichment>> {
  const result = new Map<number, NewsEnrichment>();
  if (articleIds.length === 0) return result;
  const entry = (id: number) => {
    let found = result.get(id);
    if (!found) result.set(id, (found = { triage: null, linked: null }));
    return found;
  };

  const [triaged, linked] = await Promise.all([
    db()
      .select({ id: articleTriage.articleId, impact: articleTriage.impact, whyEn: articleTriage.whyEn, whyId: articleTriage.whyId })
      .from(articleTriage)
      .innerJoin(articles, eq(articleTriage.articleId, articles.id))
      .innerJoin(sources, eq(articles.sourceId, sources.id))
      .where(and(articleIsVisible, eq(articleTriage.status, "ok"), inArray(articleTriage.articleId, articleIds))),
    // One row per article: the first of the order below. A closed opportunity never links.
    db()
      .selectDistinctOn([opportunityArticles.articleId], {
        articleId: opportunityArticles.articleId,
        id: opportunities.id,
        titleEn: opportunities.titleEn,
        titleId: opportunities.titleId,
      })
      .from(opportunityArticles)
      .innerJoin(opportunities, and(eq(opportunityArticles.opportunityId, opportunities.id), eq(opportunities.status, "open")))
      .innerJoin(articles, eq(opportunityArticles.articleId, articles.id))
      .innerJoin(sources, eq(articles.sourceId, sources.id))
      .where(and(articleIsVisible, inArray(opportunityArticles.articleId, articleIds)))
      .orderBy(opportunityArticles.articleId, desc(opportunities.currentScore), asc(opportunities.id)),
  ]);

  for (const row of triaged) {
    // The "ok" check constraint guarantees these are set.
    entry(row.id).triage = { impact: row.impact!, whyEn: row.whyEn!, whyId: row.whyId! };
  }
  for (const row of linked) entry(row.articleId).linked = { id: row.id, titleEn: row.titleEn, titleId: row.titleId };
  return result;
}

/**
 * The most written-about themes of the last 7 days, for the News side panel. The rules:
 * - Window: the last 7 WIB calendar days including today (by `articles.published_at`).
 * - Only visible articles (`articleIsVisible`) with a successful triage; failed or missing triage counts nothing.
 * - An article counts once per theme, however often its row lists it.
 * - The theme `other` is left out: it says nothing about what is trending.
 * - Most articles first, ties by theme id.
 */
export async function trendingThemes(now: Date, limit = 6): Promise<{ theme: Theme; count: number }[]> {
  const today = wibDay(now);
  const from = new Date(`${addDays(today, -6)}T00:00:00+07:00`);
  const to = new Date(`${addDays(today, 1)}T00:00:00+07:00`);
  const rows = (await db().execute(sql`
    select theme, count(distinct t.article_id)::int as count
    from article_triage t
    join articles on articles.id = t.article_id
    join sources on sources.id = articles.source_id
    cross join lateral unnest(t.themes) as theme
    where ${articleIsVisible}
      and t.status = 'ok'
      and theme <> 'other'
      and articles.published_at >= ${from.toISOString()}::timestamptz
      and articles.published_at < ${to.toISOString()}::timestamptz
    group by theme
    order by count desc, theme asc
    limit ${limit}`)) as unknown as { theme: Theme; count: number }[];
  return rows.map((row) => ({ theme: row.theme, count: row.count }));
}
