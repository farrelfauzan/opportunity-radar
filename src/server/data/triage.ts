import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { articleIsVisible } from "./articles.ts";
import { db } from "./client.ts";
import { articles, articleTriage, sources, type Category, type Impact, type Region, type Theme } from "./schema.ts";

export type TriageInput = {
  id: number;
  headline: string;
  snippet: string;
  source: string;
  region: Region;
  feedCategory: Category;
};

export type TriageResult =
  | {
      articleId: number;
      status: "ok";
      category: Category;
      region: Region;
      relevance: number;
      impact: Impact;
      whyEn: string;
      whyId: string;
      themes: Theme[];
    }
  | { articleId: number; status: "failed"; error: string };

/** Visible articles that have no triage row yet, oldest first (the triage queue). */
export async function untriagedArticles(limit: number): Promise<TriageInput[]> {
  return db()
    .select({
      id: articles.id,
      headline: articles.headline,
      snippet: articles.snippet,
      source: sources.name,
      region: articles.region,
      feedCategory: articles.category,
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .leftJoin(articleTriage, eq(articleTriage.articleId, articles.id))
    .where(and(articleIsVisible, isNull(articleTriage.articleId)))
    .orderBy(asc(articles.id))
    .limit(limit);
}

/**
 * Stores triage results. An ok result also sets the article's category and
 * region to the AI's reading (the feed category was only a default); a failed
 * one leaves the article as it is. A result for an article that already has a
 * row is ignored, so triage is written once.
 */
export async function saveTriage(results: TriageResult[]): Promise<void> {
  await db().transaction(async (tx) => {
    for (const result of results) {
      const [row] = await tx
        .insert(articleTriage)
        .values(result.status === "ok" ? result : { articleId: result.articleId, status: "failed", error: result.error })
        .onConflictDoNothing()
        .returning({ articleId: articleTriage.articleId });
      if (row && result.status === "ok") {
        await tx
          .update(articles)
          .set({ category: result.category, region: result.region })
          .where(eq(articles.id, result.articleId));
      }
    }
  });
}

/** Articles below this relevance are kept but never used for opportunities (env TRIAGE_MIN_RELEVANCE). */
export function minRelevance(): number {
  const value = Number(process.env.TRIAGE_MIN_RELEVANCE ?? 30);
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : 30;
}

/** Triaged, visible articles relevant enough for opportunity generation (OR-15), newest first. */
export async function opportunityCandidates(since: Date) {
  return db()
    .select({ article: articles, triage: articleTriage })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .innerJoin(articleTriage, eq(articleTriage.articleId, articles.id))
    .where(
      and(
        articleIsVisible,
        eq(articleTriage.status, "ok"),
        gte(articleTriage.relevance, minRelevance()),
        gte(articles.publishedAt, since),
      ),
    )
    .orderBy(desc(articles.publishedAt), desc(articles.id));
}
