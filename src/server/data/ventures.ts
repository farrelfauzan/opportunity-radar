import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { articleIsVisible } from "./articles.ts";
import { db } from "./client.ts";
import {
  articles,
  articleTriage,
  sources,
  ventureArticles,
  ventureMarket,
  ventures,
  ventureWinds,
  type FactorScores,
  type Region,
} from "./schema.ts";

export type Venture = typeof ventures.$inferSelect;
export type NewVenture = Omit<typeof ventures.$inferInsert, "id" | "createdAt">;

/** Creates the venture, or updates it when the slug already exists. */
export async function upsertVenture(input: NewVenture): Promise<Venture> {
  const [row] = await db()
    .insert(ventures)
    .values(input)
    .onConflictDoUpdate({ target: ventures.slug, set: input })
    .returning();
  return row;
}

export async function listVentures(): Promise<Venture[]> {
  return db().select().from(ventures).orderBy(asc(ventures.id));
}

/** The venture with this slug, or null (the venture view answers 404). */
export async function getVenture(slug: string): Promise<Venture | null> {
  const [row] = await db().select().from(ventures).where(eq(ventures.slug, slug));
  return row ?? null;
}

// ---- Market view (OR-38) ----------------------------------------------------------------

export type VentureMarketInput = {
  articles: { id: number; relevance: number }[];
  /** Per region: the overall score and factors, or null when there is no related news. */
  markets: Record<Region, { score: number; factors: FactorScores } | null>;
  relatedArticles: number;
  winds: {
    tailwind: { en: string; id: string; articleIds: number[] } | null;
    headwind: { en: string; id: string; articleIds: number[] } | null;
  };
};

/** Visible, ok-triaged articles fetched since `since`, for keyword matching. */
export async function ventureNewsCandidates(since: Date) {
  return db()
    .select({ id: articles.id, headline: articles.headline, snippet: articles.snippet, region: articles.region, why: articleTriage.whyEn })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .innerJoin(articleTriage, and(eq(articleTriage.articleId, articles.id), eq(articleTriage.status, "ok")))
    .where(and(articleIsVisible, gte(articles.fetchedAt, since)))
    .orderBy(desc(articles.publishedAt), desc(articles.id));
}

/**
 * Stores one venture's market view for a WIB day in one transaction: the
 * article matches, a market row per region and the tailwind/headwind pair. A
 * second run on the same day replaces that day's rows.
 */
export async function saveVentureView(ventureId: number, day: string, view: VentureMarketInput): Promise<void> {
  await db().transaction(async (tx) => {
    if (view.articles.length) {
      await tx
        .insert(ventureArticles)
        .values(view.articles.map((a) => ({ ventureId, articleId: a.id, relevance: a.relevance })))
        .onConflictDoUpdate({ target: [ventureArticles.ventureId, ventureArticles.articleId], set: { relevance: sql`excluded.relevance` } });
    }
    for (const region of ["indonesia", "global"] as const) {
      const market = view.markets[region];
      const row = { ventureId, day, region, score: market?.score ?? null, factors: market?.factors ?? null, relatedArticles: view.relatedArticles };
      await tx
        .insert(ventureMarket)
        .values(row)
        .onConflictDoUpdate({
          target: [ventureMarket.ventureId, ventureMarket.day, ventureMarket.region],
          set: { score: row.score, factors: row.factors, relatedArticles: row.relatedArticles },
        });
    }
    const { tailwind, headwind } = view.winds;
    const winds = {
      ventureId,
      day,
      tailwindEn: tailwind?.en ?? null,
      tailwindId: tailwind?.id ?? null,
      tailwindArticleIds: tailwind?.articleIds ?? [],
      headwindEn: headwind?.en ?? null,
      headwindId: headwind?.id ?? null,
      headwindArticleIds: headwind?.articleIds ?? [],
    };
    const { ventureId: _v, day: _d, ...set } = winds;
    void [_v, _d];
    await tx.insert(ventureWinds).values(winds).onConflictDoUpdate({ target: [ventureWinds.ventureId, ventureWinds.day], set });
  });
}

export type RegionView = { score: number | null; factors: FactorScores | null; relatedArticles: number; delta: number | null; day: string };

/**
 * The newest market row per region on or before `day`, with the change vs the
 * row of the day before it (null when either score is missing).
 */
export async function ventureMarketView(ventureId: number, day: string): Promise<Record<Region, RegionView | null>> {
  const rows = await db()
    .select()
    .from(ventureMarket)
    .where(and(eq(ventureMarket.ventureId, ventureId), lte(ventureMarket.day, day)))
    .orderBy(desc(ventureMarket.day));
  const view = { indonesia: null, global: null } as Record<Region, RegionView | null>;
  for (const region of ["indonesia", "global"] as const) {
    const [latest, previous] = rows.filter((r) => r.region === region);
    if (!latest) continue;
    const delta = latest.score !== null && previous?.score != null ? latest.score - previous.score : null;
    view[region] = { score: latest.score, factors: latest.factors, relatedArticles: latest.relatedArticles, delta, day: latest.day };
  }
  return view;
}
