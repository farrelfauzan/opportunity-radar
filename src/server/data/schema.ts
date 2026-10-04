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

// See docs/data-model.md for the whole v1 model. Built so far: news records and ventures.

export const REGIONS = ["indonesia", "global"] as const;
export type Region = (typeof REGIONS)[number];

export const CATEGORIES = ["business", "politics", "tech-ai", "markets", "commodities"] as const;
export type Category = (typeof CATEGORIES)[number];

export const JOB_STATUSES = ["running", "ok", "partial", "failed", "skipped"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

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

// Fixed sector list, docs/opportunities/scoring-v1.md §7.
export const SECTORS = [
  "agri_food", "fisheries_maritime", "energy_mining", "renewables_climate", "manufacturing",
  "logistics", "retail_ecommerce", "fintech_finance", "health_biotech", "education",
  "property_construction", "tourism_hospitality", "media_creative", "telecom_infra",
  "ai_software", "hardware_electronics", "govtech_public", "consumer_services",
] as const;
export type Sector = (typeof SECTORS)[number];

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
