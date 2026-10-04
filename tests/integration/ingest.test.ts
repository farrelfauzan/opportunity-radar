import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { deactivateSourcesExcept, listSources, sourceHealth } from "@/server/data";
import { db } from "@/server/data/client";
import { runJob, type Registry } from "@/server/jobs/runner";
import { FEEDS, type Feed } from "@/server/news/feeds";
import { ingestNews, USER_AGENT } from "@/server/news/ingest";
import { readFixture, readFixtureBytes } from "../fixtures";

const root = fileURLToPath(new URL("../../", import.meta.url));
const now = () => new Date("2026-10-04T02:00:00Z");

type Reply = { status?: number; body?: string | ArrayBuffer; headers?: Record<string, string> } | Error;

/** A stand-in for fetch: answers from a map of URL → reply and records every request. */
function fakeFetch(replies: Record<string, Reply>) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    requests.push({ url, headers: init?.headers as Record<string, string> });
    const reply = replies[url];
    if (!reply) throw new Error(`unexpected request to ${url}`);
    if (reply instanceof Error) throw reply;
    return new Response(reply.status === 304 ? null : (reply.body ?? ""), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  }) as typeof fetch;
  return { fetcher, requests };
}

const feed = (slug: string, overrides: Partial<Feed> = {}): Feed => ({
  slug,
  name: slug,
  feedUrl: `https://feeds.test/${slug}.xml`,
  region: "global",
  category: "business",
  ...overrides,
});

const recorded = (source: Feed): Reply => ({
  body: readFixtureBytes(`${source.slug}/feed-2026-10-04.xml`),
  headers: JSON.parse(readFixture(`${source.slug}/feed-2026-10-04.headers.json`)).headers,
});

const articleCount = async () => Number((await db().execute(sql`select count(*) as n from articles`))[0].n);

beforeEach(async () => {
  await db().execute(sql`truncate articles, sources, job_runs restart identity cascade`);
});

describe("conditional requests", () => {
  test("a 304 carries the stored validators, adds nothing and counts as a successful check", async () => {
    const feeds = [feed("a")];
    const first = fakeFetch({
      "https://feeds.test/a.xml": {
        body: readFixture("synthetic/atom.xml"),
        headers: { etag: '"v1"', "last-modified": "Sat, 03 Oct 2026 10:00:00 GMT" },
      },
    });
    await ingestNews({ feeds, fetch: first.fetcher, now });
    expect(first.requests[0].headers).not.toHaveProperty("If-None-Match");
    const stored = await articleCount();

    const second = fakeFetch({ "https://feeds.test/a.xml": { status: 304 } });
    const later = () => new Date("2026-10-04T02:30:00Z");
    const outcome = await ingestNews({ feeds, fetch: second.fetcher, now: later });

    expect(second.requests).toHaveLength(1);
    expect(second.requests[0].headers).toMatchObject({
      "If-None-Match": '"v1"',
      "If-Modified-Since": "Sat, 03 Oct 2026 10:00:00 GMT",
      "User-Agent": USER_AGENT,
    });
    expect(outcome).toMatchObject({ status: "ok", counts: { sources_ok: 1, stored: 0 } });
    expect(await articleCount()).toBe(stored);
    const [source] = await listSources();
    expect(source).toMatchObject({ lastStatus: "304", lastSuccessAt: later(), etag: '"v1"' });
  });

  test("the User-Agent names the app", () => {
    expect(USER_AGENT).toBe(
      "Mozilla/5.0 (compatible; OpportunityRadar/0.1; +https://github.com/farrelfauzan/opportunity-radar)",
    );
  });
});

describe("dedupe", () => {
  test("URLs differing by tracking parameters, fragment, host case, scheme or trailing slash are one article", async () => {
    const { fetcher } = fakeFetch({ "https://feeds.test/a.xml": { body: readFixture("synthetic/tracking-duplicates.xml") } });
    const outcome = await ingestNews({ feeds: [feed("a")], fetch: fetcher, now });

    expect(outcome.counts).toMatchObject({ stored: 2, duplicates: 6 });
    const rows = await db().execute(sql`select headline, link, canonical_url from articles order by id`);
    expect(rows).toEqual([
      {
        headline: "Same article, first", // the first stored wins; later headlines are ignored
        link: "https://example.com/story/one?utm_source=rss&utm_medium=feed",
        canonical_url: "https://example.com/story/one",
      },
      {
        headline: "Different article",
        link: "https://example.com/story/two?page=2&id=7",
        canonical_url: "https://example.com/story/two?id=7&page=2",
      },
    ]);
  });

  test("the same article in two feeds keeps the first feed's source and category, also on the next run", async () => {
    const feeds = [feed("first", { category: "markets" }), feed("second", { category: "tech-ai" })];
    const body = readFixture("synthetic/atom.xml");
    const replies = { "https://feeds.test/first.xml": { body }, "https://feeds.test/second.xml": { body } };

    await ingestNews({ feeds, fetch: fakeFetch(replies).fetcher, now });
    const again = await ingestNews({ feeds, fetch: fakeFetch(replies).fetcher, now });

    expect(again.counts).toMatchObject({ stored: 0, duplicates: 4 });
    const rows = await db().execute(
      sql`select distinct s.slug, a.category from articles a join sources s on s.id = a.source_id`,
    );
    expect(rows).toEqual([{ slug: "first", category: "markets" }]);
  });
});

describe("failures", () => {
  const good = { body: readFixture("synthetic/atom.xml") };

  test("one feed returning 403: the others are stored, the run is partial, health shows the 403", async () => {
    const feeds = [feed("good"), feed("blocked"), feed("quiet")];
    const replies = {
      "https://feeds.test/good.xml": good,
      "https://feeds.test/blocked.xml": { status: 403, body: "Forbidden" },
      "https://feeds.test/quiet.xml": { body: readFixture("synthetic/empty.xml") },
    };
    // An earlier successful check of the source that is blocked now.
    const earlier = () => new Date("2026-10-04T01:30:00Z");
    await ingestNews({ feeds, fetch: fakeFetch({ ...replies, "https://feeds.test/blocked.xml": good }).fetcher, now: earlier });
    await db().execute(sql`truncate job_runs`);

    const registry: Registry = {
      "ingest-news": { timeoutSeconds: 30, run: () => ingestNews({ feeds, fetch: fakeFetch(replies).fetcher, now }) },
    };
    const run = await runJob("ingest-news", registry);

    expect(run).toMatchObject({
      status: "partial",
      counts: { sources_ok: 2, sources_failed: 1 },
      error: "1 of 3 sources failed: blocked (403)",
    });
    expect(await sourceHealth(new Date())).toEqual([
      // Both feeds carried the same two articles; the first feed ("good") owns them.
      { slug: "blocked", name: "blocked", lastSuccessAt: earlier(), lastStatus: "403", articles24h: 0 },
      { slug: "good", name: "good", lastSuccessAt: now(), lastStatus: "200", articles24h: 2 },
      { slug: "quiet", name: "quiet", lastSuccessAt: now(), lastStatus: "200", articles24h: 0 }, // an empty feed is ok
    ]);
  });

  test("every feed failing fails the run, each source with a readable status", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const dns = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    const feeds = ["timeout", "dns", "server", "malformed", "challenge", "loop", "refused"].map((slug) => feed(slug));
    const { fetcher, requests } = fakeFetch({
      "https://feeds.test/timeout.xml": timeout,
      "https://feeds.test/dns.xml": dns,
      "https://feeds.test/server.xml": { status: 503 },
      "https://feeds.test/malformed.xml": { body: readFixture("synthetic/malformed.xml") },
      "https://feeds.test/challenge.xml": { body: readFixture("synthetic/challenge.html"), headers: { "content-type": "text/html" } },
      "https://feeds.test/loop.xml": { status: 302, headers: { location: "https://feeds.test/loop.xml" } },
      "https://feeds.test/refused.xml": new TypeError("fetch failed"),
    });
    const registry: Registry = {
      "ingest-news": { timeoutSeconds: 30, run: () => ingestNews({ feeds, fetch: fetcher, now }) },
    };

    const run = await runJob("ingest-news", registry);

    expect(run.status).toBe("failed");
    expect(run.error).toContain("7 of 7 sources failed");
    const statuses = Object.fromEntries((await listSources()).map((s) => [s.slug, s.lastStatus]));
    expect(statuses).toEqual({
      timeout: "timeout",
      dns: "DNS error",
      server: "503",
      malformed: "malformed XML",
      challenge: "not a feed (HTML page)",
      loop: "too many redirects",
      refused: "network error",
    });
    expect((await listSources()).every((s) => s.lastSuccessAt === null)).toBe(true);
    expect(await articleCount()).toBe(0);
    // No retries: one request per feed, except the redirect loop (1 + 3 redirects).
    const perFeed = (slug: string) => requests.filter((r) => r.url.includes(slug)).length;
    expect(feeds.map((f) => perFeed(f.slug))).toEqual([1, 1, 1, 1, 1, 4, 1]);
  });

  test.each([
    ["http://localhost/feed.xml", "redirect to a private address"],
    ["http://127.0.0.1:5432/", "redirect to a private address"],
    ["http://169.254.169.254/latest/meta-data/", "redirect to a private address"],
    ["https://10.0.0.5/feed", "redirect to a private address"],
    ["https://192.168.1.1/feed", "redirect to a private address"],
    ["http://[::1]/feed", "redirect to a private address"],
    ["http://feeds.test/plain.xml", "redirect from https to http"],
    ["file:///etc/passwd", "redirect to a non-http address"],
  ])("a redirect to %s is refused", async (location, status) => {
    const { fetcher, requests } = fakeFetch({
      "https://feeds.test/a.xml": { status: 302, headers: { location } },
      "https://feeds.test/b.xml": good,
    });
    await ingestNews({ feeds: [feed("a"), feed("b")], fetch: fetcher, now });

    // The refused address is never requested.
    expect(requests.map((r) => r.url)).toEqual(["https://feeds.test/a.xml", "https://feeds.test/b.xml"]);
    expect((await listSources()).find((s) => s.slug === "a")!.lastStatus).toBe(status);
  });

  test("a response over 5 MB is cut off", async () => {
    const huge = "<rss version=\"2.0\"><channel>" + "x".repeat(5 * 1024 * 1024 + 1) + "</channel></rss>";
    await ingestNews({ feeds: [feed("big"), feed("b")], fetch: fakeFetch({
      "https://feeds.test/big.xml": { body: huge },
      "https://feeds.test/b.xml": good,
    }).fetcher, now });
    expect((await listSources()).find((s) => s.slug === "big")!.lastStatus).toBe("response too large");
  });

  test("an empty feed list is refused before anything is changed", async () => {
    await ingestNews({ feeds: [feed("a")], fetch: fakeFetch({ "https://feeds.test/a.xml": good }).fetcher, now });

    await expect(ingestNews({ feeds: [], fetch: fakeFetch({}).fetcher, now })).rejects.toThrow("No feeds configured");
    await expect(deactivateSourcesExcept([])).rejects.toThrow("at least one slug");
    expect((await listSources()).map((s) => s.active)).toEqual([true]);
  });

  test("a redirect is followed to the feed", async () => {
    const { fetcher } = fakeFetch({
      "https://feeds.test/moved.xml": { status: 301, headers: { location: "/new/feed.xml" } },
      "https://feeds.test/new/feed.xml": good,
    });
    const outcome = await ingestNews({ feeds: [feed("moved")], fetch: fetcher, now });
    expect(outcome).toMatchObject({ status: "ok", counts: { stored: 2 } });
  });
});

describe("items", () => {
  test("a javascript: link, a missing link or a missing title is skipped and counted", async () => {
    const { fetcher } = fakeFetch({ "https://feeds.test/a.xml": { body: readFixture("synthetic/rss.xml") } });
    const outcome = await ingestNews({ feeds: [feed("a")], fetch: fetcher, now });

    expect(outcome.counts).toMatchObject({ stored: 5, skipped: 3, estimated_dates: 1 });
    const rows = await db().execute(sql`select link from articles where link not like 'http%' or headline = ''`);
    expect(rows).toEqual([]);
    const [flagged] = await db().execute(sql`select headline, published_at from articles where published_at_estimated`);
    expect(flagged.headline).toBe("No date on this item");
    expect(new Date(flagged.published_at as string)).toEqual(now());
  });
});

describe("the fixture run: all 12 recorded feeds plus the synthetic ones", () => {
  test("every stored article is complete and clean", async () => {
    const synthetic = ["rss.xml", "atom.xml", "tracking-duplicates.xml", "latin1.xml", "long-snippet.xml"].map((file) =>
      feed(`synthetic-${file}`),
    );
    const replies: Record<string, Reply> = {};
    for (const source of FEEDS) replies[source.feedUrl] = recorded(source);
    for (const source of synthetic) {
      replies[source.feedUrl] = { body: readFixtureBytes(`synthetic/${source.slug.replace("synthetic-", "")}`) };
    }

    const outcome = await ingestNews({ feeds: [...FEEDS, ...synthetic], fetch: fakeFetch(replies).fetcher, now });
    expect(outcome).toMatchObject({ status: "ok", counts: { sources_ok: 17, sources_failed: 0 } });
    expect(await articleCount()).toBeGreaterThanOrEqual(36);

    // The same query is in the README for QA: it must return no rows.
    const query = /```sql\n(select[\s\S]*?)```/.exec(readFileSync(`${root}README.md`, "utf8"))![1];
    expect(await db().execute(sql.raw(query))).toEqual([]);

    const sources = await db().execute(sql`select count(distinct source_id) as n from articles`);
    expect(Number(sources[0].n)).toBe(17);
    const latin = await db().execute(sql`select headline from articles where link = 'https://example.com/latin1'`);
    expect(latin[0].headline).toBe("Café société: crédit à la hausse");
  });
});

describe("removing a feed from the config", () => {
  test("switches its source off, keeps its articles, and health no longer lists it", async () => {
    const body = { body: readFixture("synthetic/atom.xml") };
    await ingestNews({ feeds: [feed("kept"), feed("dropped")], fetch: fakeFetch({
      "https://feeds.test/kept.xml": { body: readFixture("synthetic/rss.xml") },
      "https://feeds.test/dropped.xml": body,
    }).fetcher, now });

    await ingestNews({ feeds: [feed("kept")], fetch: fakeFetch({ "https://feeds.test/kept.xml": { status: 304 } }).fetcher, now });

    expect((await listSources()).map((s) => [s.slug, s.active])).toEqual([["dropped", false], ["kept", true]]);
    expect((await sourceHealth()).map((s) => s.slug)).toEqual(["kept"]);
    expect(await articleCount()).toBe(7);
  });
});

describe("pnpm sources:health", () => {
  test("prints one row per source from the test database", async () => {
    const feeds = [feed("good"), feed("blocked")];
    const { fetcher } = fakeFetch({
      "https://feeds.test/good.xml": { body: readFixture("synthetic/atom.xml") },
      "https://feeds.test/blocked.xml": { status: 403 },
    });
    await ingestNews({ feeds, fetch: fetcher }); // real time: the 24-hour count includes these

    const [node, ...args] = JSON.parse(readFileSync(`${root}package.json`, "utf8")).scripts["sources:health"].split(" ");
    const output = execFileSync(node, args, { cwd: root, encoding: "utf8" });

    expect(output).toMatch(/blocked.*never.*403.*0/);
    expect(output).toMatch(/good.*\d{4}-\d{2}-\d{2} \d{2}:\d{2}.*200.*2/);
  });
});
