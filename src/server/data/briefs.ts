import { and, desc, eq, gte, sql } from "drizzle-orm";
import { articleIsVisible } from "./articles.ts";
import { db } from "./client.ts";
import { articles, articleTriage, dailyBriefs, opportunities, opportunityScores, sources, type BriefLine } from "./schema.ts";
import { minRelevance } from "./triage.ts";

export type DailyBrief = typeof dailyBriefs.$inferSelect;

/** Ok-triaged, visible articles relevant enough (TRIAGE_MIN_RELEVANCE), fetched since `since`; newest first. */
export async function briefArticles(since: Date) {
  return db()
    .select({ id: articles.id, headline: articles.headline, category: articles.category, why: articleTriage.whyEn, sourceId: articles.sourceId })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .innerJoin(articleTriage, eq(articleTriage.articleId, articles.id))
    .where(and(articleIsVisible, eq(articleTriage.status, "ok"), gte(articleTriage.relevance, minRelevance()), gte(articles.fetchedAt, since)))
    .orderBy(desc(articles.publishedAt), desc(articles.id));
}

/** The day's opportunity changes: open opportunities with a score row on `day`, with the score before it (if any). */
export async function opportunityChanges(day: string): Promise<{ id: number; title: string; score: number; previous: number | null }[]> {
  const rows = await db()
    .select({
      id: opportunities.id,
      title: opportunities.titleEn,
      score: opportunityScores.overall,
      previous: sql<number | null>`(select s2.overall from opportunity_scores s2 where s2.opportunity_id = ${opportunities.id} and s2.day < ${day} order by s2.day desc limit 1)`,
    })
    .from(opportunities)
    .innerJoin(opportunityScores, and(eq(opportunityScores.opportunityId, opportunities.id), eq(opportunityScores.day, day)))
    .where(eq(opportunities.status, "open"))
    .orderBy(opportunities.id);
  return rows.map((r) => ({ ...r, previous: r.previous === null ? null : Number(r.previous) }));
}

/** Stores the day's brief, replacing an earlier one for the same day. */
export async function saveBrief(brief: { day: string; lines: BriefLine[]; articleCount: number; sourceCount: number }): Promise<void> {
  await db()
    .insert(dailyBriefs)
    .values(brief)
    .onConflictDoUpdate({ target: dailyBriefs.day, set: { ...brief, generatedAt: sql`now()` } });
}

/** The brief of a WIB day, or null (the Radar then shows "Not enough news yet today"). */
export async function getBrief(day: string): Promise<DailyBrief | null> {
  const [row] = await db().select().from(dailyBriefs).where(eq(dailyBriefs.day, day));
  return row ?? null;
}
