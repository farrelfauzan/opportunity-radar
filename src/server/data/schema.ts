import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// See docs/data-model.md for the whole v1 model. Only the news records exist so far.

export const REGIONS = ["indonesia", "global"] as const;
export type Region = (typeof REGIONS)[number];

export const CATEGORIES = ["business", "politics", "tech-ai", "markets", "commodities"] as const;
export type Category = (typeof CATEGORIES)[number];

export const JOB_STATUSES = ["running", "ok", "partial", "failed", "skipped"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

const regionCheck = (column: unknown) => sql`${column} in ('indonesia', 'global')`;

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("sources_region_check", regionCheck(t.region))],
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
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("articles_region_check", regionCheck(t.region)),
    check("articles_headline_check", sql`${t.headline} <> ''`),
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
