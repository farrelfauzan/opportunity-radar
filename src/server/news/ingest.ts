import {
  deactivateSourcesExcept,
  insertArticle,
  recordSourceCheck,
  upsertSource,
  type NewArticle,
  type Source,
} from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { canonicalUrl, cleanText, cutSnippet } from "./clean.ts";
import { FEEDS, type Feed } from "./feeds.ts";
import { decodeFeed, FeedError, parseFeed, type FeedItem } from "./parse.ts";

export const USER_AGENT =
  "Mozilla/5.0 (compatible; OpportunityRadar/0.1; +https://github.com/farrelfauzan/opportunity-radar)";
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

type Fetched =
  | { status: "304" }
  | { status: "200"; items: FeedItem[]; etag: string | null; lastModified: string | null };

/** One conditional GET per feed: 10 s in total, at most 3 redirects, no retry. */
async function fetchFeed(source: Source, fetcher: typeof fetch): Promise<Fetched> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
  };
  if (source.etag) headers["If-None-Match"] = source.etag;
  if (source.lastModified) headers["If-Modified-Since"] = source.lastModified;

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = source.feedUrl;
  try {
    for (let redirects = 0; ; redirects++) {
      const response = await fetcher(url, { headers, signal, redirect: "manual" });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && response.status !== 304 && location) {
        if (redirects === MAX_REDIRECTS) throw new FeedError("too many redirects");
        url = new URL(location, url).href;
        if (!/^https?:/.test(url)) throw new FeedError("redirect to a non-http address");
        continue;
      }
      if (response.status === 304) return { status: "304" };
      if (response.status !== 200) throw new FeedError(String(response.status));
      const xml = decodeFeed(await response.arrayBuffer(), response.headers.get("content-type"));
      return {
        status: "200",
        items: parseFeed(xml),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    }
  } catch (error) {
    if (error instanceof FeedError) throw error;
    const { name, cause } = error as { name?: string; cause?: { code?: string } };
    if (name === "TimeoutError" || name === "AbortError") throw new FeedError("timeout");
    if (cause?.code === "ENOTFOUND" || cause?.code === "EAI_AGAIN") throw new FeedError("DNS error");
    throw new FeedError("network error");
  }
}

type FeedArticle = NewArticle & { canonicalUrl: string; snippet: string; publishedAtEstimated: boolean };

/** A storable article from a raw feed item, or null when the item must be skipped. */
export function toArticle(item: FeedItem, feed: Feed, sourceId: number, fetchedAt: Date): FeedArticle | null {
  const headline = cleanText(item.title);
  const canonical = canonicalUrl(item.link);
  if (!headline || !canonical) return null; // no title, no link, or a link that is not http(s)

  const published = new Date(item.date);
  const estimated = !item.date.trim() || Number.isNaN(published.getTime());
  return {
    sourceId,
    link: item.link.trim(),
    canonicalUrl: canonical,
    region: feed.region,
    category: feed.category,
    headline,
    snippet: cutSnippet(cleanText(item.description)),
    // No usable date: the fetch time, flagged. A future date is clamped to the fetch time.
    publishedAt: estimated || published > fetchedAt ? fetchedAt : published,
    publishedAtEstimated: estimated,
  };
}

/**
 * The ingest-news job: fetches every feed once and stores new articles.
 * One failing feed never stops the others (the run is then "partial"); when
 * every feed fails the run fails.
 */
export async function ingestNews(
  options: { feeds?: Feed[]; fetch?: typeof fetch; now?: () => Date } = {},
): Promise<JobOutcome> {
  const { feeds = FEEDS, fetch: fetcher = fetch, now = () => new Date() } = options;
  const counts = { sources_ok: 0, sources_failed: 0, stored: 0, duplicates: 0, skipped: 0, estimated_dates: 0 };
  const failures: string[] = [];

  const sources = [];
  for (const feed of feeds) sources.push(await upsertSource({ ...feed, active: true }));
  // A feed removed from the config stops showing in source health; its articles stay.
  await deactivateSourcesExcept(feeds.map((feed) => feed.slug));
  const results = await Promise.allSettled(sources.map((source) => fetchFeed(source, fetcher)));

  // Stored in feed order, so when two feeds carry the same article the first feed wins.
  for (const [index, result] of results.entries()) {
    const source = sources[index];
    const at = now();
    if (result.status === "rejected") {
      const status = (result.reason as Error).message;
      await recordSourceCheck(source.id, { status, ok: false, at });
      counts.sources_failed++;
      failures.push(`${source.slug} (${status})`);
      continue;
    }
    counts.sources_ok++;
    if (result.value.status === "304") {
      await recordSourceCheck(source.id, { status: "304", ok: true, at });
      continue;
    }
    for (const item of result.value.items) {
      const article = toArticle(item, feeds[index], source.id, at);
      if (!article) {
        counts.skipped++;
        continue;
      }
      const { created } = await insertArticle(article);
      counts[created ? "stored" : "duplicates"]++;
      if (created && article.publishedAtEstimated) counts.estimated_dates++;
    }
    const { etag, lastModified } = result.value;
    await recordSourceCheck(source.id, { status: "200", ok: true, at, etag, lastModified });
  }

  const summary = `${failures.length} of ${sources.length} sources failed: ${failures.join(", ")}`;
  if (failures.length === sources.length) throw new Error(summary);
  for (const failure of failures) console.warn(`ingest-news: source failed: ${failure}`);
  return failures.length ? { status: "partial", counts, error: summary } : { status: "ok", counts };
}
