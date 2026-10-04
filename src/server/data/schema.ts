import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// See docs/data-model.md for the whole v1 model. Built so far: news records, opportunity records, ventures and LLM usage.

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

/** The five factors of docs/opportunities/scoring-v1.md, each an integer 0–100. */
export type FactorScores = { demand: number; timing: number; competition: number; capital: number; regulatory: number };
export const FACTOR_KEYS = ["demand", "timing", "competition", "capital", "regulatory"] as const;

/**
 * A jsonb column holding FactorScores: exactly the five keys, each an integer 0–100.
 * Wrapped in coalesce because a CHECK that evaluates to NULL (a missing key) would pass.
 */
const factorsShape = (column: unknown) => {
  const key = (k: string) => sql.raw(`'${k}'`);
  const each = FACTOR_KEYS.map(
    (k) =>
      sql`jsonb_typeof(${column}->${key(k)}) = 'number' and (${column}->>${key(k)}) ~ '^[0-9]{1,3}$' and (${column}->>${key(k)})::int <= 100`,
  );
  const keys = sql.raw(`array[${FACTOR_KEYS.map((k) => `'${k}'`).join(", ")}]::text[]`);
  return sql`${column} is null or coalesce(jsonb_typeof(${column}) = 'object' and ${column} - ${keys} = '{}'::jsonb and ${sql.join(each, sql` and `)}, false)`;
};

// The owner's ventures (OR-36). Edited in src/server/ventures/config.ts and seeded.
export const ventures = pgTable(
  "ventures",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    descriptionEn: text("description_en").notNull(),
    descriptionId: text("description_id").notNull(),
    sectors: text().array().$type<Sector[]>().notNull(),
    keywords: text().array().notNull(),
    // Which progress label the Radar card shows: "Progress to MVP" or "to next release".
    progressGoal: text("progress_goal").$type<"mvp" | "release">().notNull(),
    // Where progress is read from (OR-37); null = "Progress source not connected".
    progressSource: text("progress_source").$type<"notion" | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ventures_descriptions_check", sql`${t.descriptionEn} <> '' and ${t.descriptionId} <> ''`),
    check(
      "ventures_sectors_check",
      sql`cardinality(${t.sectors}) between 1 and 3 and ${t.sectors} <@ array[${sql.raw(SECTORS.map((s) => `'${s}'`).join(", "))}]::text[]`,
    ),
    check("ventures_progress_goal_check", sql`${t.progressGoal} in ('mvp', 'release')`),
    check("ventures_progress_source_check", sql`${t.progressSource} is null or ${t.progressSource} = 'notion'`),
  ],
);

// Build progress of a venture on one WIB day (written by OR-37). Only successful
// reads are stored; the newest row is shown, and an old one means stale. The
// sentence is built from the numbers in each language.
export const ventureProgress = pgTable(
  "venture_progress",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ventureId: integer("venture_id").notNull().references(() => ventures.id),
    day: date({ mode: "string" }).notNull(),
    percent: integer().notNull(),
    sprintDelivered: integer("sprint_delivered"),
    sprintNext: integer("sprint_next"),
    ticketsInQa: integer("tickets_in_qa"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("venture_progress_venture_day_unique").on(t.ventureId, t.day),
    check("venture_progress_percent_check", sql`${t.percent} between 0 and 100`),
    check(
      "venture_progress_counts_check",
      sql`${t.sprintDelivered} >= 0 and ${t.sprintNext} >= 0 and ${t.ticketsInQa} >= 0`,
    ),
  ],
);

// Market view of a venture for one region on one WIB day (written by OR-38).
// No related news in 30 days: score and factors are null, never invented.
// The change vs yesterday is computed on read from the previous day's row.
export const ventureMarket = pgTable(
  "venture_market",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ventureId: integer("venture_id").notNull().references(() => ventures.id),
    day: date({ mode: "string" }).notNull(),
    region: text().$type<Region>().notNull(),
    score: integer(),
    factors: jsonb().$type<FactorScores>(),
    relatedArticles: integer("related_articles").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("venture_market_venture_day_region_unique").on(t.ventureId, t.day, t.region),
    check("venture_market_region_check", regionCheck(t.region)),
    check("venture_market_score_check", sql`${t.score} between 0 and 100`),
    check("venture_market_score_factors_check", sql`(${t.score} is null) = (${t.factors} is null)`),
    check("venture_market_factors_check", factorsShape(t.factors)),
    check("venture_market_related_articles_check", sql`${t.relatedArticles} >= 0`),
  ],
);

// One tailwind and one headwind per venture per day, not per region (OR-35, OR-38),
// each citing article ids. Null texts: no related news that day.
export const ventureWinds = pgTable(
  "venture_winds",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ventureId: integer("venture_id").notNull().references(() => ventures.id),
    day: date({ mode: "string" }).notNull(),
    tailwindEn: text("tailwind_en"),
    tailwindId: text("tailwind_id"),
    tailwindArticleIds: bigint("tailwind_article_ids", { mode: "number" }).array().notNull().default(sql`'{}'`),
    headwindEn: text("headwind_en"),
    headwindId: text("headwind_id"),
    headwindArticleIds: bigint("headwind_article_ids", { mode: "number" }).array().notNull().default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("venture_winds_venture_day_unique").on(t.ventureId, t.day),
    // Both languages or neither, and a sentence always cites at least one article.
    // (Written with explicit "is not null": a CHECK that evaluates to NULL passes.)
    check(
      "venture_winds_tailwind_check",
      sql`(${t.tailwindEn} is null and ${t.tailwindId} is null) or (${t.tailwindEn} is not null and ${t.tailwindId} is not null and ${t.tailwindEn} <> '' and ${t.tailwindId} <> '' and cardinality(${t.tailwindArticleIds}) > 0)`,
    ),
    check(
      "venture_winds_headwind_check",
      sql`(${t.headwindEn} is null and ${t.headwindId} is null) or (${t.headwindEn} is not null and ${t.headwindId} is not null and ${t.headwindEn} <> '' and ${t.headwindId} <> '' and cardinality(${t.headwindArticleIds}) > 0)`,
    ),
  ],
);

// Articles matched to a venture (OR-38): the "related news" list and count.
// Deleted with the article when articles are pruned.
export const ventureArticles = pgTable(
  "venture_articles",
  {
    ventureId: integer("venture_id").notNull().references(() => ventures.id),
    articleId: bigint("article_id", { mode: "number" })
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    relevance: integer().notNull(),
    matchedAt: timestamp("matched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ventureId, t.articleId] }),
    // Deleting (pruning) an article finds its matches without a full scan.
    index("venture_articles_article_idx").on(t.articleId),
    check("venture_articles_relevance_check", sql`${t.relevance} between 0 and 100`),
  ],
);

export const LLM_ROLES = ["triage", "report"] as const;
export type LlmRole = (typeof LLM_ROLES)[number];
export const LLM_CALL_STATUSES = ["ok", "invalid_output", "error", "budget_exhausted"] as const;
export type LlmCallStatus = (typeof LLM_CALL_STATUSES)[number];

// One row per LLM request (OR-13), mock or live; the budget cap counts live rows
// of the current WIB month. A budget_exhausted row records a call that was not made.
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    job: text().notNull(),
    role: text().$type<LlmRole>().notNull(),
    provider: text().$type<"mock" | "live">().notNull(),
    model: text().notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    // The provider sent no usage; tokens were estimated from the text length (about 4 characters a token).
    usageEstimated: boolean("usage_estimated").notNull().default(false),
    // Null when the prices for the model's role are not configured.
    costUsd: doublePrecision("cost_usd"),
    status: text().$type<LlmCallStatus>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("llm_usage_role_check", sql`${t.role} in ('triage', 'report')`),
    check("llm_usage_provider_check", sql`${t.provider} in ('mock', 'live')`),
    check("llm_usage_status_check", sql`${t.status} in ('ok', 'invalid_output', 'error', 'budget_exhausted')`),
    check("llm_usage_tokens_check", sql`${t.inputTokens} >= 0 and ${t.outputTokens} >= 0 and ${t.costUsd} >= 0`),
    // Month-to-date totals for the budget cap.
    index("llm_usage_provider_created_idx").on(t.provider, t.createdAt),
  ],
);

// Theme vocabulary, docs/opportunities/scoring-v1.md §8 (36 + other).
export const THEMES = [
  "ai_adoption", "ai_regulation", "data_centers", "semiconductors", "cybersecurity", "digital_payments",
  "digital_banking_lending", "interest_rates", "inflation_cost_living", "rupiah_fx", "trade_tariffs",
  "geopolitics_conflict", "indonesia_policy", "indonesia_budget_subsidy", "downstreaming_minerals", "ev_batteries",
  "renewable_energy", "oil_gas_coal", "food_security", "healthcare_access", "pharma_biotech", "ecommerce_social",
  "consumer_spending", "logistics_supply_chain", "infrastructure_construction", "property_housing", "tourism_travel",
  "education_skills", "startup_funding", "ipo_capital_markets", "halal_islamic_finance", "crypto_assets",
  "gold_commodities", "labour_wages_layoffs", "climate_disasters", "smes_msme", "other",
] as const;
export type Theme = (typeof THEMES)[number];

export const IMPACTS = ["opportunity", "risk", "context"] as const;
export type Impact = (typeof IMPACTS)[number];

// The AI's reading of one article (OR-14). One row per article, written once:
// "ok" with every field, or "failed" (the article keeps its feed category).
export const articleTriage = pgTable(
  "article_triage",
  {
    articleId: bigint("article_id", { mode: "number" })
      .primaryKey()
      .references(() => articles.id, { onDelete: "cascade" }),
    status: text().$type<"ok" | "failed">().notNull(),
    category: text().$type<Category>(),
    region: text().$type<Region>(),
    relevance: integer(),
    impact: text().$type<Impact>(),
    whyEn: text("why_en"),
    whyId: text("why_id"),
    themes: text().array().$type<Theme[]>().notNull().default(sql`'{}'`),
    error: text(),
    triagedAt: timestamp("triaged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("article_triage_status_check", sql`${t.status} in ('ok', 'failed')`),
    check(
      "article_triage_ok_check",
      sql`${t.status} <> 'ok' or (${t.category} is not null and ${t.region} is not null and ${t.relevance} is not null
        and ${t.impact} is not null and ${t.whyEn} is not null and ${t.whyId} is not null
        and ${t.whyEn} <> '' and ${t.whyId} <> '' and cardinality(${t.themes}) between 1 and 3)`,
    ),
    check("article_triage_why_length_check", sql`char_length(${t.whyEn}) <= 300 and char_length(${t.whyId}) <= 300`),
    check("article_triage_error_length_check", sql`char_length(${t.error}) <= 300`),
    check("article_triage_category_check", sql`${t.category} is null or ${categoryCheck(t.category)}`),
    check("article_triage_region_check", sql`${t.region} is null or ${regionCheck(t.region)}`),
    check("article_triage_relevance_check", sql`${t.relevance} between 0 and 100`),
    check("article_triage_impact_check", sql`${t.impact} in ('opportunity', 'risk', 'context')`),
    check(
      "article_triage_themes_check",
      sql`${t.themes} <@ array[${sql.raw(THEMES.map((x) => `'${x}'`).join(", "))}]::text[]`,
    ),
  ],
);
