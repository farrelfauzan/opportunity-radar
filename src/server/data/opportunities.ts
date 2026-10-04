import { and, arrayContains, asc, count, desc, eq, inArray, lte, min, sql as sqlTag } from "drizzle-orm";
import { articleIsVisible, wibDay, type ArticleWithSource } from "./articles.ts";
import { db } from "./client.ts";
import { lastSuccessfulRun } from "./job-runs.ts";
import {
  articles,
  opportunities,
  opportunityArticles,
  opportunityScores,
  SECTORS,
  sources,
  type CapitalLevel,
  type Horizon,
  type Region,
  type Sector,
} from "./schema.ts";
import { addDays, computeTrend, TREND_DAYS, type Trend } from "./trend.ts";

export type Opportunity = typeof opportunities.$inferSelect;
export type OpportunityScore = typeof opportunityScores.$inferSelect;
export type ListedOpportunity = Opportunity & { trend: Trend };
export type OpportunityDetail = ListedOpportunity & { latestScore: OpportunityScore | null };

/** The pipeline step that writes the scores; its last successful run is "last scored". */
export const SCORING_JOB = "scores";

/** When the scores were last written (a UTC instant), or null if they never were. */
export function lastScoringRun(): Promise<Date | null> {
  return lastSuccessfulRun(SCORING_JOB);
}

export type OpportunityFilter = {
  region?: Region;
  sector?: Sector;
  horizon?: Horizon;
  capital?: CapitalLevel;
};

/**
 * Trends of the given opportunities, in two queries however many there are:
 * the first score day of each, and the nearest score on or before today - 30 days.
 */
async function trendsOf(rows: Opportunity[], today: string): Promise<Map<number, Trend>> {
  const trends = new Map<number, Trend>();
  if (rows.length === 0) return trends;
  const ids = rows.map((row) => row.id);
  const s = opportunityScores;
  const [firsts, baselines] = await Promise.all([
    db()
      .select({ id: s.opportunityId, day: min(s.day) })
      .from(s)
      .where(inArray(s.opportunityId, ids))
      .groupBy(s.opportunityId),
    db()
      .selectDistinctOn([s.opportunityId], { id: s.opportunityId, overall: s.overall })
      .from(s)
      .where(and(inArray(s.opportunityId, ids), lte(s.day, addDays(today, -TREND_DAYS))))
      .orderBy(s.opportunityId, desc(s.day)),
  ]);
  const firstDay = new Map(firsts.map((r) => [r.id, r.day]));
  const baseline = new Map(baselines.map((r) => [r.id, r.overall]));
  for (const row of rows) {
    trends.set(
      row.id,
      computeTrend({
        today,
        firstDay: firstDay.get(row.id) ?? null,
        latest: row.currentScore,
        baseline: baseline.get(row.id) ?? null,
      }),
    );
  }
  return trends;
}

/**
 * Open opportunities, highest current score first, ties by id (oldest first), each with its
 * 30-day trend. Access pattern "Open ones by score" in docs/data-model.md. Closed ones are
 * never listed. `now` is the instant "today" (the WIB day) is taken from.
 */
/** The list shows at most this many open opportunities (the model keeps a few dozen). */
export const MAX_LISTED = 200;

/** The list query: highest current score first, ties by id. Exported so a test can read its order. */
export function openOpportunitiesQuery(filter: OpportunityFilter = {}) {
  return db()
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.status, "open"),
        filter.region ? eq(opportunities.region, filter.region) : undefined,
        filter.sector ? arrayContains(opportunities.sectors, [filter.sector]) : undefined,
        filter.horizon ? eq(opportunities.horizon, filter.horizon) : undefined,
        filter.capital ? eq(opportunities.capitalLevel, filter.capital) : undefined,
      ),
    )
    .orderBy(desc(opportunities.currentScore), asc(opportunities.id))
    .limit(MAX_LISTED);
}

export async function listOpportunities(
  filter: OpportunityFilter = {},
  now: Date = new Date(),
): Promise<ListedOpportunity[]> {
  const rows = await openOpportunitiesQuery(filter);
  const trends = await trendsOf(rows, wibDay(now));
  return rows.map((row) => ({ ...row, trend: trends.get(row.id)! }));
}

/** One opportunity, open or closed, with its newest score row and trend; null when there is none. */
export async function getOpportunity(id: number, now: Date = new Date()): Promise<OpportunityDetail | null> {
  const [row] = await db().select().from(opportunities).where(eq(opportunities.id, id));
  if (!row) return null;
  const [[latestScore], trends] = await Promise.all([
    db()
      .select()
      .from(opportunityScores)
      .where(eq(opportunityScores.opportunityId, id))
      .orderBy(desc(opportunityScores.day))
      .limit(1),
    trendsOf([row], wibDay(now)),
  ]);
  return { ...row, trend: trends.get(id)!, latestScore: latestScore ?? null };
}

/** An opportunity cites at most this many articles, and the detail shows at most this many. */
export const MAX_CITATIONS = 50;

/**
 * The articles an opportunity cites that may be shown (the source is switched on, see
 * `articleIsVisible`), newest first, ties by article id (newest id first), at most MAX_CITATIONS.
 * A citation of a switched-off source is stored but never read here, so a count of this list
 * never includes it.
 */
export async function listOpportunityEvidence(opportunityId: number): Promise<ArticleWithSource[]> {
  const rows = await db()
    .select({ article: articles, sourceName: sources.name, sourceSlug: sources.slug })
    .from(opportunityArticles)
    .innerJoin(articles, eq(opportunityArticles.articleId, articles.id))
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(and(eq(opportunityArticles.opportunityId, opportunityId), articleIsVisible))
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(MAX_CITATIONS);
  return rows.map(({ article, sourceName, sourceSlug }) => ({ ...article, sourceName, sourceSlug }));
}

// ---- Writes: the seed, the tests and (later) the opportunity and scoring jobs ----------------

export type NewOpportunity = Omit<
  typeof opportunities.$inferInsert,
  "id" | "status" | "currentScore" | "createdAt" | "closedAt"
> & {
  /** Set for an opportunity that is already closed. */
  closedAt?: Date;
  createdAt?: Date;
};

export type NewScore = Omit<OpportunityScore, "opportunityId">;

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

function checkScore(score: NewScore): void {
  if (!dayPattern.test(score.day)) throw new Error("Score day must be YYYY-MM-DD (the WIB day)");
}

/**
 * Stores an opportunity together with its first score (an opportunity always has a score:
 * the contract in docs/opportunities/output.schema.json returns the factors with the text).
 */
export async function insertOpportunity(
  input: NewOpportunity,
  firstScore: NewScore,
  /** Articles the opportunity cites: stored in the same transaction, so it never exists without them. */
  articleIds: number[] = [],
): Promise<Opportunity> {
  checkScore(firstScore);
  if (new Set(input.sectors).size !== input.sectors.length) throw new Error("Opportunity sectors must not repeat");
  if (!input.sectors.every((sector) => SECTORS.includes(sector))) throw new Error("Unknown sector");
  const cited = [...new Set(articleIds)];
  if (cited.length > MAX_CITATIONS) throw new Error(`An opportunity cites at most ${MAX_CITATIONS} articles`);
  return db().transaction(async (tx) => {
    const { closedAt, ...rest } = input;
    const [row] = await tx
      .insert(opportunities)
      .values({ ...rest, closedAt, status: closedAt ? "closed" : "open", currentScore: firstScore.overall })
      .returning();
    await tx.insert(opportunityScores).values({ ...firstScore, opportunityId: row.id });
    if (cited.length > 0) {
      await tx.insert(opportunityArticles).values(cited.map((articleId) => ({ opportunityId: row.id, articleId })));
    }
    return row;
  });
}

/**
 * Stores one day's score (replacing that day's row if it exists) and brings the
 * opportunity's `current_score` in line with its newest row, in one transaction.
 * A score for an earlier day than the newest leaves the current score alone.
 */
export async function recordOpportunityScore(opportunityId: number, score: NewScore): Promise<void> {
  checkScore(score);
  await db().transaction(async (tx) => {
    await tx
      .insert(opportunityScores)
      .values({ ...score, opportunityId })
      .onConflictDoUpdate({
        target: [opportunityScores.opportunityId, opportunityScores.day],
        set: {
          overall: score.overall,
          demand: score.demand,
          timing: score.timing,
          competition: score.competition,
          capital: score.capital,
          regulatory: score.regulatory,
        },
      });
    await tx
      .update(opportunities)
      .set({
        currentScore: sqlTag`(select overall from opportunity_scores where opportunity_id = ${opportunityId} order by day desc limit 1)`,
      })
      .where(eq(opportunities.id, opportunityId));
  });
}

/**
 * Records that the opportunity cites these articles as evidence. Citing twice changes nothing.
 * An opportunity never exceeds MAX_CITATIONS citations in total: otherwise nothing is stored.
 */
export async function citeArticles(opportunityId: number, articleIds: number[]): Promise<void> {
  const ids = [...new Set(articleIds)];
  if (ids.length === 0) return;
  if (ids.length > MAX_CITATIONS) throw new Error(`An opportunity cites at most ${MAX_CITATIONS} articles`);
  await db().transaction(async (tx) => {
    // The row lock makes two concurrent writers take turns, so both cannot pass the count.
    const [row] = await tx
      .select({ status: opportunities.status })
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId))
      .for("update");
    // A closed opportunity is history: the daily runs only cite for open ones (OR-50 closes, it never cites again).
    if (!row || row.status !== "open") throw new Error("Only an open opportunity can cite articles");
    await tx
      .insert(opportunityArticles)
      .values(ids.map((articleId) => ({ opportunityId, articleId })))
      .onConflictDoNothing();
    const [{ total }] = await tx
      .select({ total: count() })
      .from(opportunityArticles)
      .where(eq(opportunityArticles.opportunityId, opportunityId));
    if (total > MAX_CITATIONS) throw new Error(`An opportunity cites at most ${MAX_CITATIONS} articles`);
  });
}

/** Open opportunities with what matching compares (theme, region, sectors, cited article ids). */
export async function listOpenForMatching(): Promise<{ id: number; theme: string; region: string; sectors: string[]; citations: number[] }[]> {
  const rows = await db()
    .select({
      id: opportunities.id,
      theme: opportunities.theme,
      region: opportunities.region,
      sectors: opportunities.sectors,
      citations: sqlTag<number[]>`coalesce(array_agg(${opportunityArticles.articleId}) filter (where ${opportunityArticles.articleId} is not null), '{}')`,
    })
    .from(opportunities)
    .leftJoin(opportunityArticles, eq(opportunityArticles.opportunityId, opportunities.id))
    .where(eq(opportunities.status, "open"))
    .groupBy(opportunities.id)
    .orderBy(asc(opportunities.id));
  return rows.map((r) => ({ ...r, citations: r.citations.map(Number) }));
}

/** Text fields an update refreshes; theme, region and sectors stay (they are what the match was on). */
export type RefreshedFields = Omit<NewOpportunity, "theme" | "region" | "sectors" | "createdAt" | "closedAt">;

/**
 * A matched opportunity keeps its id: its text fields are refreshed and the new
 * citations added (an article already cited keeps its first citation time), in
 * one transaction. An opportunity never exceeds MAX_CITATIONS citations: new
 * ones beyond the limit are left out (in the order given, most relevant first)
 * and counted as skipped.
 */
export async function refreshOpportunity(
  id: number,
  /** New text fields, or null to add citations only (scoring-v1 §4: the text is refreshed only on a same-theme match sharing an article). */
  fields: RefreshedFields | null,
  articleIds: number[],
): Promise<{ added: number; skipped: number }> {
  return db().transaction(async (tx) => {
    const open = and(eq(opportunities.id, id), eq(opportunities.status, "open"));
    const [row] = fields
      ? await tx.update(opportunities).set(fields).where(open).returning({ id: opportunities.id })
      : await tx.select({ id: opportunities.id }).from(opportunities).where(open).for("update");
    if (!row) throw new Error(`Opportunity ${id} is not open`);
    const cited = new Set(
      (await tx.select({ articleId: opportunityArticles.articleId }).from(opportunityArticles).where(eq(opportunityArticles.opportunityId, id))).map(
        (r) => r.articleId,
      ),
    );
    const fresh = [...new Set(articleIds)].filter((a) => !cited.has(a));
    const room = Math.max(0, MAX_CITATIONS - cited.size);
    const toAdd = fresh.slice(0, room);
    if (toAdd.length) {
      await tx.insert(opportunityArticles).values(toAdd.map((articleId) => ({ opportunityId: id, articleId })));
    }
    return { added: toAdd.length, skipped: fresh.length - toAdd.length };
  });
}

/**
 * Closes every open opportunity whose newest citation is older than `days`
 * (scoring-v1 §4: 30). A closed one stays readable and is never matched again.
 */
export async function closeStaleOpportunities(now: Date, days = 30): Promise<number[]> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await db().execute(sqlTag`
    update opportunities o set status = 'closed', closed_at = ${now.toISOString()}
    where o.status = 'open'
      and coalesce((select max(oa.cited_at) from opportunity_articles oa where oa.opportunity_id = o.id), o.created_at) < ${cutoff.toISOString()}
    returning o.id`);
  return rows.map((r) => Number(r.id));
}

export type RescoreInput = {
  id: number;
  titleEn: string;
  thesisEn: string;
  theme: string;
  region: string;
  sectors: string[];
  horizon: string;
  capitalLevel: string;
  articles: { id: number; headline: string; snippet: string; why: string | null }[];
};

/**
 * Open opportunities to re-score on `today` (a WIB day): last scored before
 * today, with at least one article of an active source cited on or after the
 * day of that score (new evidence; scoring-v1 §4). Each comes with its cited
 * articles, newest first (at most 30).
 */
export async function opportunitiesToRescore(today: string, limit: number): Promise<RescoreInput[]> {
  const rows = (await db().execute(sqlTag`
    select o.id, o.title_en, o.thesis_en, o.theme, o.region, o.sectors, o.horizon, o.capital_level,
      (select coalesce(json_agg(x order by x.published_at desc), '[]') from (
         select a.id, a.headline, a.snippet, t.why_en as why, a.published_at
         from opportunity_articles oa
         join articles a on a.id = oa.article_id
         join sources s on s.id = a.source_id and s.active
         left join article_triage t on t.article_id = a.id and t.status = 'ok'
         where oa.opportunity_id = o.id
         order by a.published_at desc limit 30) x) as articles
    from opportunities o
    join lateral (select max(day) as last_day from opportunity_scores where opportunity_id = o.id) s on true
    where o.status = 'open'
      and s.last_day < ${today}::date
      and exists (
        -- Only articles of active sources count (articleIsVisible), here as in the evidence list.
        select 1 from opportunity_articles oa
        join articles a on a.id = oa.article_id
        join sources src on src.id = a.source_id and src.active
        where oa.opportunity_id = o.id
          and oa.cited_at >= (s.last_day::timestamp at time zone 'Asia/Jakarta')
          -- The citations it was created with were scored at creation: not new evidence.
          and oa.cited_at > o.created_at)
    order by o.id
    limit ${limit}`)) as unknown as {
    id: number; title_en: string; thesis_en: string; theme: string; region: string; sectors: string[];
    horizon: string; capital_level: string; articles: RescoreInput["articles"];
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    titleEn: r.title_en,
    thesisEn: r.thesis_en,
    theme: r.theme,
    region: r.region,
    sectors: r.sectors,
    horizon: r.horizon,
    capitalLevel: r.capital_level,
    articles: r.articles.map((a) => ({ ...a, id: Number(a.id) })),
  }));
}
