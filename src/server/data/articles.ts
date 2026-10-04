import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "./client.ts";
import { articles, REGIONS, sources, type Category, type Region } from "./schema.ts";

export type Article = typeof articles.$inferSelect;
export type ArticleWithSource = Article & { sourceName: string };

export type NewArticle = {
  sourceId: number;
  /** The link as published in the feed. Must be http(s). */
  link: string;
  /** The URL articles are unique by; defaults to `link`. OR-8 strips tracking parameters first. */
  canonicalUrl?: string;
  region: Region;
  category: Category;
  headline: string;
  snippet?: string;
  publishedAt: Date;
};

const SNIPPET_MAX = 500;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, no daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;

function httpUrl(value: string, field: string): string {
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {}
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(`Article ${field} must be an http(s) URL`);
  }
  return url.href; // URL lower-cases the scheme and host
}

/**
 * Stores an article once per canonical URL. Storing the same URL again (also
 * concurrently, or with a different host case) changes nothing and returns
 * the existing record with `created: false`.
 */
export async function insertArticle(input: NewArticle): Promise<{ article: Article; created: boolean }> {
  const headline = input.headline.trim();
  if (!headline) throw new Error("Article headline must not be empty");
  if (!REGIONS.includes(input.region)) throw new Error("Article region must be indonesia or global");
  httpUrl(input.link, "link");
  const canonicalUrl = httpUrl(input.canonicalUrl ?? input.link, "canonical URL");
  // Cut by code point so a surrogate pair is never split.
  const snippet = Array.from((input.snippet ?? "").trim()).slice(0, SNIPPET_MAX).join("");

  const [created] = await db()
    .insert(articles)
    .values({
      sourceId: input.sourceId,
      canonicalUrl,
      link: input.link,
      region: input.region,
      category: input.category,
      headline,
      snippet,
      publishedAt: input.publishedAt,
    })
    .onConflictDoNothing({ target: articles.canonicalUrl })
    .returning();
  if (created) return { article: created, created: true };

  const [existing] = await db().select().from(articles).where(eq(articles.canonicalUrl, canonicalUrl));
  return { article: existing, created: false };
}

/** The calendar day in WIB (UTC+7) as YYYY-MM-DD. */
export function wibDay(at: Date = new Date()): string {
  return new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Articles published on one WIB calendar day, newest first, ties broken by id
 * (newest id first). Access pattern "News list" in docs/data-model.md.
 */
export async function listArticles(filter: {
  /** WIB calendar day, YYYY-MM-DD. Defaults to today. */
  day?: string;
  region?: Region;
  category?: Category;
}): Promise<ArticleWithSource[]> {
  const day = filter.day ?? wibDay();
  const start = new Date(`${day}T00:00:00+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(start.getTime())) {
    throw new Error("day must be YYYY-MM-DD");
  }
  const rows = await db()
    .select({ article: articles, sourceName: sources.name })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(
      and(
        gte(articles.publishedAt, start),
        lt(articles.publishedAt, new Date(start.getTime() + DAY_MS)),
        filter.region ? eq(articles.region, filter.region) : undefined,
        filter.category ? eq(articles.category, filter.category) : undefined,
      ),
    )
    .orderBy(desc(articles.publishedAt), desc(articles.id));
  return rows.map((row) => ({ ...row.article, sourceName: row.sourceName }));
}
