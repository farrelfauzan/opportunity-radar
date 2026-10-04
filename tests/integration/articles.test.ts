import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { insertArticle, listArticles, upsertSource, wibDay, type NewArticle } from "@/server/data";
import { articlesQuery } from "@/server/data/articles";
import { db } from "@/server/data/client";

let sourceId: number;

const article = (overrides: Partial<NewArticle> = {}): NewArticle => ({
  sourceId,
  link: "https://example.com/news/a",
  region: "global",
  category: "tech-ai",
  headline: "A headline",
  snippet: "A snippet",
  publishedAt: new Date("2026-10-03T05:00:00Z"),
  ...overrides,
});

const count = async () =>
  Number((await db().execute(sql`select count(*) as n from articles`))[0].n);

beforeEach(async () => {
  await db().execute(sql`truncate articles, sources, job_runs restart identity cascade`);
  sourceId = (
    await upsertSource({
      slug: "techcrunch",
      name: "TechCrunch",
      feedUrl: "https://example.com/feed.xml",
      region: "global",
      category: "tech-ai",
    })
  ).id;
});

describe("insertArticle: one record per canonical URL", () => {
  test("the same URL twice gives one record and leaves every field unchanged", async () => {
    const first = await insertArticle(article());
    const second = await insertArticle(
      article({ headline: "A changed headline", snippet: "changed", publishedAt: new Date() }),
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.article).toEqual(first.article); // includes fetchedAt
    expect(await count()).toBe(1);
  });

  test("a URL that differs only by case in the host is the same article", async () => {
    const first = await insertArticle(article({ link: "https://Example.COM/news/a" }));
    const second = await insertArticle(article({ link: "https://example.com/news/a" }));

    expect(second.created).toBe(false);
    expect(second.article).toEqual(first.article);
    expect(first.article.link).toBe("https://Example.COM/news/a"); // the publisher's link is kept
    expect(await count()).toBe(1);
  });

  test("case in the path is significant", async () => {
    await insertArticle(article({ link: "https://example.com/news/a" }));
    const other = await insertArticle(article({ link: "https://example.com/news/A" }));
    expect(other.created).toBe(true);
  });

  test("concurrent inserts of the same URL give one record and no error", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => insertArticle(article())));

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.article.id)).size).toBe(1);
    expect(await count()).toBe(1);
  });

  test("a canonical URL given by the caller is the key", async () => {
    await insertArticle(
      article({ link: "https://example.com/a?utm_source=x", canonicalUrl: "https://example.com/a" }),
    );
    const again = await insertArticle(
      article({ link: "https://example.com/a?utm_source=y", canonicalUrl: "https://EXAMPLE.com/a" }),
    );
    expect(again.created).toBe(false);
    expect(again.article.link).toBe("https://example.com/a?utm_source=x");
  });
});

describe("insertArticle: validation", () => {
  test("a snippet longer than 500 characters is cut to 500, not rejected", async () => {
    const { article: stored } = await insertArticle(article({ snippet: "x".repeat(501) }));
    expect(stored.snippet).toHaveLength(500);
  });

  test("the cut counts characters, so an emoji is never split", async () => {
    const { article: stored } = await insertArticle(article({ snippet: "😀".repeat(501) }));
    expect(Array.from(stored.snippet)).toHaveLength(500);
  });

  test("a headline longer than 300 characters is cut to 300, ending in …", async () => {
    const { article: stored } = await insertArticle(article({ headline: "😀".repeat(301) }));
    expect(Array.from(stored.headline)).toHaveLength(300);
    expect(stored.headline.endsWith("😀…")).toBe(true);
  });

  test("an empty snippet is allowed", async () => {
    const { article: stored } = await insertArticle(article({ snippet: undefined }));
    expect(stored.snippet).toBe("");
  });

  test.each([
    ["an empty headline", { headline: "   " }, /headline/],
    ["a region outside Indonesia / Global", { region: "asia" as never }, /region/],
    ["an unknown category", { category: "sports" as never }, /category/],
    ["a javascript: link", { link: "javascript:alert(1)" }, /http\(s\)/],
    ["an ftp link", { link: "ftp://example.com/a" }, /http\(s\)/],
    ["a link that is not a URL", { link: "not a url" }, /http\(s\)/],
  ])("%s is rejected", async (_name, overrides, message) => {
    await expect(insertArticle(article(overrides))).rejects.toThrow(message);
    expect(await count()).toBe(0);
  });

  test("the database itself refuses invalid rows", async () => {
    const insert = (headline: string, region: string, link: string, snippet: string, category = "tech-ai") =>
      db().execute(sql`
        insert into articles (source_id, canonical_url, link, region, category, headline, snippet, published_at)
        values (${sourceId}, ${link}, ${link}, ${region}, ${category}, ${headline}, ${snippet}, now())`);

    await expect(insert("", "global", "https://example.com/1", "")).rejects.toThrow();
    await expect(insert("h", "asia", "https://example.com/2", "")).rejects.toThrow();
    await expect(insert("h", "global", "ftp://example.com/3", "")).rejects.toThrow();
    await expect(insert("h", "global", "https://example.com/4", "x".repeat(501))).rejects.toThrow();
    await expect(insert("h", "global", "https://example.com/5", "", "sports")).rejects.toThrow();
    await expect(insert("x".repeat(301), "global", "https://example.com/6", "")).rejects.toThrow();
    expect(await count()).toBe(0);
  });

  test("no column can hold an article body", async () => {
    const columns = await db().execute(
      sql`select column_name from information_schema.columns where table_name = 'articles' order by 1`,
    );
    expect(columns.map((c) => c.column_name)).toEqual([
      "canonical_url",
      "category",
      "fetched_at",
      "headline",
      "id",
      "link",
      "published_at",
      "published_at_estimated",
      "region",
      "snippet",
      "source_id",
    ]);
  });
});

describe("listArticles: a WIB calendar day, newest first", () => {
  const at = (iso: string, path: string, overrides: Partial<NewArticle> = {}) =>
    insertArticle(
      article({ link: `https://example.com/${path}`, headline: path, publishedAt: new Date(iso), ...overrides }),
    );

  test("the day runs from 00:00:00 to 23:59:59 WIB (stored in UTC)", async () => {
    // 3 October 2026 in WIB is 2026-10-02T17:00:00Z up to 2026-10-03T17:00:00Z.
    await at("2026-10-02T16:59:59Z", "before-midnight"); // 2 Oct 23:59:59 WIB
    await at("2026-10-02T17:00:00Z", "first-second"); // 3 Oct 00:00:00 WIB
    await at("2026-10-03T16:59:59Z", "last-second"); // 3 Oct 23:59:59 WIB
    await at("2026-10-03T17:00:00Z", "next-midnight"); // 4 Oct 00:00:00 WIB

    const names = async (day: string) => (await listArticles({ day })).map((a) => a.headline);
    expect(await names("2026-10-03")).toEqual(["last-second", "first-second"]);
    expect(await names("2026-10-02")).toEqual(["before-midnight"]);
    expect(await names("2026-10-04")).toEqual(["next-midnight"]);
  });

  test("filters by region and category, and returns the source name", async () => {
    await at("2026-10-03T03:00:00Z", "global-tech");
    await at("2026-10-03T04:00:00Z", "global-business", { category: "business" });
    await at("2026-10-03T05:00:00Z", "indonesia-tech", { region: "indonesia" });

    const list = await listArticles({ day: "2026-10-03", region: "global", category: "tech-ai" });
    expect(list.map((a) => a.headline)).toEqual(["global-tech"]);
    expect(list[0].sourceName).toBe("TechCrunch");
    expect(list[0].sourceSlug).toBe("techcrunch");

    const global = await listArticles({ day: "2026-10-03", region: "global" });
    expect(global.map((a) => a.headline)).toEqual(["global-business", "global-tech"]);
    expect(await listArticles({ day: "2026-10-03" })).toHaveLength(3);
  });

  test("equal publish times are ordered by id, newest id first", async () => {
    const ids = [];
    for (const path of ["one", "two", "three"]) {
      ids.push((await at("2026-10-03T03:00:00Z", path)).article.id);
    }
    const list = await listArticles({ day: "2026-10-03" });
    expect(list.map((a) => a.id)).toEqual([...ids].reverse());

    // The index and the join can return ties in id order by themselves, which
    // would hide a missing tie-break, so the query itself is checked too.
    expect(articlesQuery({ day: "2026-10-03" }).toSQL().sql).toMatch(
      /order by "articles"\."published_at" desc, "articles"\."id" desc$/,
    );
  });

  test("articles of a switched-off source are kept but not listed; switching it on shows them again", async () => {
    await at("2026-10-03T03:00:00Z", "from-active");
    const off = {
      slug: "switched-off",
      name: "Switched off",
      feedUrl: "https://example.com/off.xml",
      region: "global",
      category: "tech-ai",
    } as const;
    const other = await upsertSource(off);
    await at("2026-10-03T04:00:00Z", "from-inactive", { sourceId: other.id });

    await upsertSource({ ...off, active: false });
    expect((await listArticles({ day: "2026-10-03" })).map((a) => a.headline)).toEqual(["from-active"]);
    expect(await count()).toBe(2); // kept in the database

    await upsertSource({ ...off, active: true });
    expect((await listArticles({ day: "2026-10-03" })).map((a) => a.headline)).toEqual(["from-inactive", "from-active"]);
  });

  test("an invalid day is rejected", async () => {
    await expect(listArticles({ day: "03-10-2026" })).rejects.toThrow("YYYY-MM-DD");
    await expect(listArticles({ day: "2026-13-40" })).rejects.toThrow("YYYY-MM-DD");
    await expect(listArticles({ day: "2026-02-30" })).rejects.toThrow("YYYY-MM-DD");
    await expect(listArticles({ day: "0000-01-01" })).rejects.toThrow("day must be YYYY-MM-DD");
    await expect(listArticles({ day: "1969-12-31" })).rejects.toThrow("day must be YYYY-MM-DD");
    await expect(listArticles({ day: "1970-01-01" })).resolves.toEqual([]);
    await expect(listArticles({ day: "2026-04-31" })).rejects.toThrow("YYYY-MM-DD");
    await expect(listArticles({ day: "2028-02-29" })).resolves.toEqual([]); // a leap day exists
  });

  test("wibDay gives the WIB calendar day of an instant", () => {
    expect(wibDay(new Date("2026-10-02T16:59:59Z"))).toBe("2026-10-02");
    expect(wibDay(new Date("2026-10-02T17:00:00Z"))).toBe("2026-10-03");
  });
});
