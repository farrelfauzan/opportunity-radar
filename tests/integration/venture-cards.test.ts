import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import {
  getVenture,
  getVentureView,
  insertArticle,
  listRelatedNews,
  listVentureCards,
  relatedNewsCounts,
  saveTriage,
  upsertSource,
  upsertVenture,
  ventureMarketSeries,
  wibDay,
} from "@/server/data";
import { db } from "@/server/data/client";
import { addDays } from "@/server/data/trend";
import { VENTURES } from "@/server/ventures/config";

const today = wibDay();
const DAY_MS = 86_400_000;

const factors = (v: number) => JSON.stringify({ demand: v, timing: v, competition: v, capital: v, regulatory: v });
const market = (ventureId: number, day: string, region: "indonesia" | "global", score: number | null) =>
  db().execute(sql`insert into venture_market (venture_id, day, region, score, factors, related_articles)
    values (${ventureId}, ${day}, ${region}, ${score}, ${score === null ? null : sql`${factors(score)}::jsonb`}, 0)`);

let counter = 0;
async function article(sourceSlug: string, publishedAt: Date, active = true): Promise<number> {
  const source = await upsertSource({ slug: sourceSlug, name: sourceSlug, feedUrl: `https://example.com/${sourceSlug}.xml`, region: "indonesia", category: "business" });
  if (!active) await db().execute(sql`update sources set active = false where id = ${source.id}`);
  const { article } = await insertArticle({
    sourceId: source.id, link: `https://example.com/cards/${++counter}`, region: "indonesia", category: "business",
    headline: `Headline ${counter}`, publishedAt,
  });
  return article.id;
}
const match = (ventureId: number, articleId: number, relevance: number) =>
  db().execute(sql`insert into venture_articles (venture_id, article_id, relevance) values (${ventureId}, ${articleId}, ${relevance})`);

let performa: number;
let meta: number;

beforeEach(async () => {
  await db().execute(sql`truncate articles, sources, ventures, venture_progress, venture_market, venture_winds, venture_articles restart identity cascade`);
  for (const v of VENTURES) await upsertVenture(v);
  performa = (await getVenture("performa-vision"))!.id;
  meta = (await getVenture("meta-klinik"))!.id;
});

describe("listVentureCards", () => {
  test("no ventures: no cards", async () => {
    await db().execute(sql`truncate ventures restart identity cascade`);
    expect(await listVentureCards()).toEqual([]);
  });

  test("one card per venture in the order of the ventures table, an unscored one with nothing", async () => {
    const cards = await listVentureCards();
    expect(cards.map((c) => c.venture.slug)).toEqual(["performa-vision", "meta-klinik"]);
    for (const card of cards) {
      expect(card).toMatchObject({ progress: null, winds: null, relatedNews: 0, market: { indonesia: null, global: null } });
    }
  });

  test("progress: the newest row of each venture, null for one without", async () => {
    await db().execute(sql`insert into venture_progress (venture_id, day, percent, sprint_delivered, sprint_next, tickets_in_qa) values
      (${performa}, ${addDays(today, -3)}, 50, 2, 3, 1), (${performa}, ${addDays(today, -1)}, 62, 3, 4, 4)`);
    const [first, second] = await listVentureCards();
    expect(first.progress).toMatchObject({ percent: 62, sprintDelivered: 3, sprintNext: 4, ticketsInQa: 4 });
    expect(second.progress).toBeNull();
  });

  test("market: the newest row per region with its change vs yesterday; no change without yesterday's row; a region without a score", async () => {
    await market(performa, addDays(today, -1), "indonesia", 70);
    await market(performa, today, "indonesia", 76);
    await market(performa, today, "global", 68); // no row yesterday
    await market(meta, today, "indonesia", 81);
    await market(meta, today, "global", null); // no related news
    const [first, second] = await listVentureCards();
    expect(first.market.indonesia).toMatchObject({ score: 76, delta: 6, day: today });
    expect(first.market.global).toMatchObject({ score: 68, delta: null });
    expect(second.market.indonesia).toMatchObject({ score: 81, delta: null });
    expect(second.market.global).toMatchObject({ score: null, delta: null });
  });

  test("market: an old row is returned however old it is", async () => {
    await market(performa, addDays(today, -9), "indonesia", 60);
    const [first] = await listVentureCards();
    expect(first.market.indonesia).toMatchObject({ score: 60, day: addDays(today, -9) });
    expect(first.market.global).toBeNull();
  });

  test("winds: the newest row on or before the day; a row with no sentences is still the newest; none gives null", async () => {
    const pair = (day: string, text: string) =>
      db().execute(sql`insert into venture_winds (venture_id, day, tailwind_en, tailwind_id, tailwind_article_ids)
        values (${performa}, ${day}, ${text}, ${`${text} (id)`}, '{1}'::bigint[])`);
    await pair(addDays(today, -2), "Older tailwind");
    await pair(addDays(today, -1), "Newer tailwind");
    await pair(addDays(today, 1), "Tomorrow's tailwind"); // after the day: not shown
    const [first, second] = await listVentureCards();
    expect(first.winds).toMatchObject({ tailwindEn: "Newer tailwind", tailwindId: "Newer tailwind (id)", headwindEn: null });
    expect(second.winds).toBeNull();

    await db().execute(sql`insert into venture_winds (venture_id, day) values (${performa}, ${today})`);
    expect((await listVentureCards())[0].winds).toMatchObject({ day: today, tailwindEn: null, headwindEn: null });
  });
});

describe("related news count", () => {
  test("counts matches rated 50 or more of articles of visible sources, published in the rolling 30 × 24 hours up to now", async () => {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 30 * DAY_MS);
    const recent = new Date(now.getTime() - 3600_000);
    await match(performa, await article("on", recent), 50); // relevance 50: in
    await match(performa, await article("on", recent), 49); // relevance 49: out
    await match(performa, await article("on", recent), 100); // in
    await match(performa, await article("on", windowStart), 80); // exactly 30 × 24 hours ago: in
    await match(performa, await article("on", new Date(windowStart.getTime() - 1)), 80); // a millisecond before: out
    await match(performa, await article("off", recent, false), 90); // switched-off source: out
    await match(meta, await article("on", recent), 70); // another venture's match
    const [first, second] = await listVentureCards(now);
    expect(first.relatedNews).toBe(3);
    expect(second.relatedNews).toBe(1);
  });

  test("the window is the rolling 30 × 24 hours of the morning step, not 00:00 WIB of a day 30 days back", async () => {
    // 30 days and 5 hours ago: the old day-based window (from 00:00 WIB) counted it, the job's window does not look at it.
    const now = new Date("2026-10-04T10:00:00Z"); // 17:00 WIB
    await match(performa, await article("on", new Date(now.getTime() - 30 * DAY_MS - 5 * 3600_000)), 80);
    await match(performa, await article("on", new Date(now.getTime() - 30 * DAY_MS + 5 * 3600_000)), 80);
    expect((await listVentureCards(now))[0].relatedNews).toBe(1);
  });

  test("an article dated after now is not counted", async () => {
    const now = new Date();
    await match(performa, await article("on", new Date(now.getTime() - 1000)), 80);
    await match(performa, await article("on", now), 80); // exactly now: in
    await match(performa, await article("on", new Date(now.getTime() + 1)), 80); // a millisecond ahead: out
    await match(performa, await article("on", new Date(now.getTime() + DAY_MS)), 80); // a day ahead (a wrong feed date): out
    expect((await listVentureCards(now))[0].relatedNews).toBe(2);
  });

  test("a venture with no matches counts 0", async () => {
    await match(performa, await article("on", new Date()), 90);
    expect((await listVentureCards())[1].relatedNews).toBe(0);
    expect((await relatedNewsCounts(new Date())).has(meta)).toBe(false);
  });

  test("matches the latest run did not look at still count, whatever venture_market.related_articles says", async () => {
    await market(performa, today, "indonesia", 70);
    await db().execute(sql`update venture_market set related_articles = 1`);
    await match(performa, await article("on", new Date(Date.now() - 1000)), 80);
    await match(performa, await article("on", new Date(Date.now() - 1000)), 80);
    await match(performa, await article("on", new Date(Date.now() - 1000)), 80);
    expect((await listVentureCards())[0]).toMatchObject({ relatedNews: 3, market: { indonesia: { relatedArticles: 1 } } });
  });

  test("the window follows the given time", async () => {
    const now = new Date();
    await match(performa, await article("on", new Date(now.getTime() - 40 * DAY_MS)), 80);
    expect((await listVentureCards(now))[0].relatedNews).toBe(0);
    expect((await listVentureCards(new Date(now.getTime() - 20 * DAY_MS)))[0].relatedNews).toBe(1); // window: 50 to 20 days ago
  });
});

describe("related news list", () => {
  const triage = (articleId: number, status: "ok" | "failed" = "ok") =>
    saveTriage([
      status === "ok"
        ? { articleId, status, category: "business", region: "indonesia", relevance: 70, impact: "risk", whyEn: "Why en.", whyId: "Mengapa id.", themes: ["other"] }
        : { articleId, status, error: "bad reply" },
    ]);

  test("newest first (ties by id, newest id first), by the same rule as the count: relevance, visible source, window, not in the future", async () => {
    const now = new Date();
    const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
    const older = await article("on", at(30));
    const tieA = await article("on", at(10));
    const tieB = await article("on", at(10));
    const newest = await article("on", at(1));
    for (const id of [older, tieA, tieB, newest]) await match(performa, id, 60);
    await match(performa, await article("on", at(5)), 49); // relevance too low
    await match(performa, await article("off", at(5), false), 90); // switched-off source
    await match(performa, await article("on", new Date(now.getTime() + 3600_000)), 90); // future-dated
    await match(performa, await article("on", new Date(now.getTime() - 31 * DAY_MS)), 90); // outside the window
    await match(meta, await article("on", at(2)), 90); // another venture's match

    const list = await listRelatedNews(performa, now, 20);
    expect(list.map((a) => a.id)).toEqual([newest, tieB, tieA, older]);
    const [card] = await listVentureCards(now);
    expect(card.relatedNews).toBe(list.length); // the card's count and the view's list agree
  });

  test("the first `limit` items; a list longer than a page keeps the same order when asked for more", async () => {
    const now = new Date();
    const ids: number[] = [];
    for (let i = 0; i < 25; i++) {
      const id = await article("on", new Date(now.getTime() - (i + 1) * 60_000));
      await match(performa, id, 70);
      ids.push(id); // newest first already
    }
    expect((await listRelatedNews(performa, now, 20)).map((a) => a.id)).toEqual(ids.slice(0, 20));
    expect((await listRelatedNews(performa, now, 40)).map((a) => a.id)).toEqual(ids);
    expect((await listVentureCards(now))[0].relatedNews).toBe(25);
  });

  test("carries the source and, when triage succeeded, the impact and the why texts; a failed or missing triage has none", async () => {
    const now = new Date();
    const ok = await article("on", new Date(now.getTime() - 60_000));
    const failed = await article("on", new Date(now.getTime() - 120_000));
    const none = await article("on", new Date(now.getTime() - 180_000));
    for (const id of [ok, failed, none]) await match(performa, id, 80);
    await triage(ok);
    await triage(failed, "failed");
    const [a, b, c] = await listRelatedNews(performa, now, 20);
    expect(a).toMatchObject({ id: ok, sourceSlug: "on", sourceName: "on", impact: "risk", whyEn: "Why en.", whyId: "Mengapa id." });
    expect(b).toMatchObject({ id: failed, impact: null, whyEn: null, whyId: null });
    expect(c).toMatchObject({ id: none, impact: null, whyEn: null, whyId: null });
  });

  test("a venture with no matches has an empty list", async () => {
    expect(await listRelatedNews(meta, new Date(), 20)).toEqual([]);
  });
});

describe("ventureMarketSeries", () => {
  test("the scored rows of the last 30 days per region, oldest first; a gap and a row without a score are left out", async () => {
    await market(performa, addDays(today, -29), "indonesia", 60); // the first day of the window
    await market(performa, addDays(today, -10), "indonesia", 66);
    await market(performa, addDays(today, -9), "indonesia", null); // no related news that day: no point
    await market(performa, today, "indonesia", 70);
    await market(performa, addDays(today, -5), "global", 50);
    await market(performa, addDays(today, -4), "global", 52);
    await market(meta, addDays(today, -1), "indonesia", 90); // another venture
    expect(await ventureMarketSeries(performa, today)).toEqual({
      indonesia: [
        { day: addDays(today, -29), score: 60 },
        { day: addDays(today, -10), score: 66 },
        { day: today, score: 70 },
      ],
      global: [
        { day: addDays(today, -5), score: 50 },
        { day: addDays(today, -4), score: 52 },
      ],
    });
  });

  test("a row older than the window is not in the series; an old newest row is, with its own day; a venture with none has empty series", async () => {
    await market(performa, addDays(today, -30), "indonesia", 40); // one day too old
    await market(performa, addDays(today, -9), "global", 55); // the newest row of that region is 9 days old
    expect(await ventureMarketSeries(performa, today)).toEqual({ indonesia: [], global: [{ day: addDays(today, -9), score: 55 }] });
    expect(await ventureMarketSeries(meta, today)).toEqual({ indonesia: [], global: [] });
  });

  test("a row after the day is not in the series", async () => {
    await market(performa, addDays(today, 1), "indonesia", 80);
    expect((await ventureMarketSeries(performa, today)).indonesia).toEqual([]);
  });
});

describe("getVentureView", () => {
  test("an unknown slug is null", async () => {
    expect(await getVentureView("nope", 20)).toBeNull();
  });

  test("the card, the series, the first page of related news, and the articles the winds cite without those of a switched-off source", async () => {
    const now = new Date();
    const shown = await article("on", new Date(now.getTime() - 60_000));
    const hidden = await article("off", new Date(now.getTime() - 120_000), false);
    await match(performa, shown, 70);
    await market(performa, today, "indonesia", 76);
    await db().execute(sql`insert into venture_winds (venture_id, day, tailwind_en, tailwind_id, tailwind_article_ids, headwind_en, headwind_id, headwind_article_ids)
      values (${performa}, ${today}, 'Up', 'Naik', ${`{${shown},${hidden}}`}::bigint[], 'Down', 'Turun', ${`{${hidden}}`}::bigint[])`);
    const view = (await getVentureView("performa-vision", 20, now))!;
    expect(view.card).toMatchObject({ venture: { slug: "performa-vision" }, relatedNews: 1, market: { indonesia: { score: 76 } } });
    expect(view.series.indonesia).toEqual([{ day: today, score: 76 }]);
    expect(view.news.map((a) => a.id)).toEqual([shown]);
    // The hidden article is not in the map; the headwind then has no evidence left to show.
    expect([...view.windArticles.keys()]).toEqual([shown]);
    expect(view.card.winds).toMatchObject({ tailwindArticleIds: [shown, hidden], headwindArticleIds: [hidden] });
  });
});
