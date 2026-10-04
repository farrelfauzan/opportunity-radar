import { and, arrayContains, asc, desc, eq, inArray, lte, min, sql as sqlTag } from "drizzle-orm";
import { wibDay } from "./articles.ts";
import { db } from "./client.ts";
import { lastSuccessfulRun } from "./job-runs.ts";
import {
  opportunities,
  opportunityArticles,
  opportunityScores,
  SECTORS,
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
  return db().transaction(async (tx) => {
    const { closedAt, ...rest } = input;
    const [row] = await tx
      .insert(opportunities)
      .values({ ...rest, closedAt, status: closedAt ? "closed" : "open", currentScore: firstScore.overall })
      .returning();
    await tx.insert(opportunityScores).values({ ...firstScore, opportunityId: row.id });
    if (articleIds.length > 0) {
      await tx
        .insert(opportunityArticles)
        .values([...new Set(articleIds)].map((articleId) => ({ opportunityId: row.id, articleId })));
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

/** Records that the opportunity cites these articles as evidence. Citing twice changes nothing. */
export async function citeArticles(opportunityId: number, articleIds: number[]): Promise<void> {
  if (articleIds.length === 0) return;
  await db()
    .insert(opportunityArticles)
    .values(articleIds.map((articleId) => ({ opportunityId, articleId })))
    .onConflictDoNothing();
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
 * today, with at least one cited article fetched on or after the day of that
 * score (new evidence; scoring-v1 §4). Until OR-50's cited_at exists this uses
 * the article's fetch time, which may re-score once too often but never misses
 * new evidence. Each comes with its cited articles, newest first (at most 30).
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
          and a.fetched_at >= (s.last_day::timestamp at time zone 'Asia/Jakarta'))
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
