import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// See docs/data-model.md for the whole v1 model. The news records and the opportunity records exist so far.

export const REGIONS = ["indonesia", "global"] as const;
export type Region = (typeof REGIONS)[number];

export const CATEGORIES = ["business", "politics", "tech-ai", "markets", "commodities"] as const;
export type Category = (typeof CATEGORIES)[number];

export const JOB_STATUSES = ["running", "ok", "partial", "failed", "skipped"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// The fixed sector list of docs/opportunities/scoring-v1.md section 7 (labels live in the dictionaries).
export const SECTORS = [
  "agri_food",
  "fisheries_maritime",
  "energy_mining",
  "renewables_climate",
  "manufacturing",
  "logistics",
  "retail_ecommerce",
  "fintech_finance",
  "health_biotech",
  "education",
  "property_construction",
  "tourism_hospitality",
  "media_creative",
  "telecom_infra",
  "ai_software",
  "hardware_electronics",
  "govtech_public",
  "consumer_services",
] as const;
export type Sector = (typeof SECTORS)[number];

export const HORIZONS = ["0-6m", "6-12m", "1-3y"] as const;
export type Horizon = (typeof HORIZONS)[number];

export const CAPITAL_LEVELS = ["low", "medium", "high"] as const;
export type CapitalLevel = (typeof CAPITAL_LEVELS)[number];

export const OPPORTUNITY_STATUSES = ["open", "closed"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

const regionCheck = (column: unknown) => sql`${column} in ('indonesia', 'global')`;
const categoryCheck = (column: unknown) =>
  sql`${column} in ('business', 'politics', 'tech-ai', 'markets', 'commodities')`;

export const sources = pgTable(
  "sources",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    feedUrl: text("feed_url").notNull(),
    region: text().$type<Region>().notNull(),
    category: text().$type<Category>().notNull(),
    active: boolean().notNull().default(true),
    // Last check by the ingestion job (OR-8). ETag / Last-Modified feed the next conditional GET.
    etag: text(),
    lastModified: text("last_modified"),
    lastStatus: text("last_status"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("sources_region_check", regionCheck(t.region)),
    check("sources_category_check", categoryCheck(t.category)),
  ],
);

// Headline, snippet and link only (R-1): there is deliberately no body column.
export const articles = pgTable(
  "articles",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    canonicalUrl: text("canonical_url").notNull().unique(),
    link: text().notNull(),
    region: text().$type<Region>().notNull(),
    category: text().$type<Category>().notNull(),
    headline: text().notNull(),
    snippet: text().notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    // True when the feed gave no usable date and the fetch time was used instead.
    publishedAtEstimated: boolean("published_at_estimated").notNull().default(false),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("articles_region_check", regionCheck(t.region)),
    check("articles_category_check", categoryCheck(t.category)),
    check("articles_headline_check", sql`${t.headline} <> '' and char_length(${t.headline}) <= 300`),
    check("articles_snippet_check", sql`char_length(${t.snippet}) <= 500`),
    check("articles_link_check", sql`${t.link} ~* '^https?://'`),
    // News list: a day's articles, newest first, ties broken by id.
    index("articles_published_idx").on(t.publishedAt.desc(), t.id.desc()),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    job: text().notNull(),
    status: text().$type<JobStatus>().notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    counts: jsonb().$type<Record<string, number>>(),
    error: text(),
  },
  (t) => [
    check(
      "job_runs_status_check",
      sql`${t.status} in ('running', 'ok', 'partial', 'failed', 'skipped')`,
    ),
    // Last successful run of a job.
    index("job_runs_job_finished_idx").on(t.job, t.finishedAt.desc()),
  ],
);

const inList = (column: unknown, values: readonly string[]) =>
  sql`${column} in (${sql.join(values.map((v) => sql.raw(`'${v}'`)), sql.raw(", "))})`;
// A text that is not empty after trimming and at most `max` characters (the limits of output.schema.json).
const textCheck = (column: unknown, max: number) =>
  sql`btrim(${column}) <> '' and char_length(${column}) <= ${sql.raw(String(max))}`;
// A list of texts kept as two arrays of the same length (EN and ID), `min` to `max` items.
const listCheck = (en: unknown, id: unknown, min: number, max: number) =>
  sql`cardinality(${en}) between ${sql.raw(String(min))} and ${sql.raw(String(max))} and cardinality(${en}) = cardinality(${id})`;

/**
 * One opportunity (docs/data-model.md row 4). The AI text is stored twice (_en, _id).
 * `currentScore` is a cache of the newest `opportunity_scores` row, so the list sorts
 * and filters on one table: it is written together with that row (recordOpportunityScore),
 * never on its own.
 */
export const opportunities = pgTable(
  "opportunities",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    titleEn: text("title_en").notNull(),
    titleId: text("title_id").notNull(),
    thesisEn: text("thesis_en").notNull(),
    thesisId: text("thesis_id").notNull(),
    region: text().$type<Region>().notNull(),
    // Theme id from docs/opportunities/scoring-v1.md section 8; the matching rule (OR-50) compares it.
    theme: text().notNull(),
    // 1 to 3 ids of the fixed sector list, no repeats (the writer checks that).
    sectors: text().array().$type<Sector[]>().notNull(),
    horizon: text().$type<Horizon>().notNull(),
    capitalLevel: text("capital_level").$type<CapitalLevel>().notNull(),
    capitalReasonEn: text("capital_reason_en").notNull(),
    capitalReasonId: text("capital_reason_id").notNull(),
    buyerEn: text("buyer_en").notNull(),
    buyerId: text("buyer_id").notNull(),
    modelEn: text("model_en").notNull(),
    modelId: text("model_id").notNull(),
    risksEn: text("risks_en").array().notNull(),
    risksId: text("risks_id").array().notNull(),
    firstStepsEn: text("first_steps_en").array().notNull(),
    firstStepsId: text("first_steps_id").array().notNull(),
    // Optional market exposure line (EN and ID together, or neither).
    relatedExposureEn: text("related_exposure_en"),
    relatedExposureId: text("related_exposure_id"),
    status: text().$type<OpportunityStatus>().notNull().default("open"),
    currentScore: integer("current_score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    check("opportunities_title_check", sql`${textCheck(t.titleEn, 90)} and ${textCheck(t.titleId, 90)}`),
    check("opportunities_thesis_check", sql`${textCheck(t.thesisEn, 400)} and ${textCheck(t.thesisId, 400)}`),
    check("opportunities_region_check", regionCheck(t.region)),
    check("opportunities_theme_check", sql`${t.theme} ~ '^[a-z_]+$'`),
    check(
      "opportunities_sectors_check",
      sql`cardinality(${t.sectors}) between 1 and 3 and ${t.sectors} <@ array[${sql.join(
        SECTORS.map((s) => sql.raw(`'${s}'`)),
        sql.raw(", "),
      )}]::text[]`,
    ),
    check("opportunities_horizon_check", inList(t.horizon, HORIZONS)),
    check("opportunities_capital_level_check", inList(t.capitalLevel, CAPITAL_LEVELS)),
    check(
      "opportunities_capital_reason_check",
      sql`${textCheck(t.capitalReasonEn, 120)} and ${textCheck(t.capitalReasonId, 120)}`,
    ),
    check("opportunities_buyer_check", sql`${textCheck(t.buyerEn, 120)} and ${textCheck(t.buyerId, 120)}`),
    check("opportunities_model_check", sql`${textCheck(t.modelEn, 120)} and ${textCheck(t.modelId, 120)}`),
    check("opportunities_risks_check", listCheck(t.risksEn, t.risksId, 2, 5)),
    check("opportunities_first_steps_check", listCheck(t.firstStepsEn, t.firstStepsId, 1, 5)),
    check(
      "opportunities_exposure_check",
      sql`(${t.relatedExposureEn} is null) = (${t.relatedExposureId} is null)`,
    ),
    check("opportunities_status_check", inList(t.status, OPPORTUNITY_STATUSES)),
    check("opportunities_current_score_check", sql`${t.currentScore} between 0 and 100`),
    // Open means not closed: closed_at is set exactly when the status is closed.
    check("opportunities_closed_check", sql`(${t.status} = 'closed') = (${t.closedAt} is not null)`),
    // The list: open ones by score, ties by id.
    index("opportunities_list_idx").on(t.status, t.currentScore.desc(), t.id),
  ],
);

/** A citation: this opportunity uses this article as evidence (docs/data-model.md row 5). */
export const opportunityArticles = pgTable(
  "opportunity_articles",
  {
    opportunityId: integer("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    articleId: bigint("article_id", { mode: "number" })
      .notNull()
      .references(() => articles.id),
  },
  (t) => [
    primaryKey({ columns: [t.opportunityId, t.articleId] }),
    // "The opportunity linked to an article" (News).
    index("opportunity_articles_article_idx").on(t.articleId),
  ],
);

/**
 * One opportunity's score on one WIB calendar day (docs/data-model.md row 6): the overall
 * score and the five factors, integers 0 to 100, higher is better on each.
 */
export const opportunityScores = pgTable(
  "opportunity_scores",
  {
    opportunityId: integer("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    // The WIB day, as YYYY-MM-DD (drizzle returns a date as text in this mode).
    day: date({ mode: "string" }).notNull(),
    overall: integer().notNull(),
    demand: integer().notNull(),
    timing: integer().notNull(),
    competition: integer().notNull(),
    capital: integer().notNull(),
    regulatory: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.opportunityId, t.day] }),
    ...(["overall", "demand", "timing", "competition", "capital", "regulatory"] as const).map((name) =>
      check(`opportunity_scores_${name}_check`, sql`${t[name]} between 0 and 100`),
    ),
  ],
);
