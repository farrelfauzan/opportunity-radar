import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { getVenture, insertArticle, listVentureCards, relatedNewsCounts, upsertSource, upsertVenture, wibDay } from "@/server/data";
import { db } from "@/server/data/client";
import { addDays } from "@/server/data/trend";
import { VENTURES } from "@/server/ventures/config";

const today = wibDay();
const windowStart = new Date(`${addDays(today, -30)}T00:00:00+07:00`);

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
    expect(await listVentureCards(today)).toEqual([]);
  });

  test("one card per venture in the order of the ventures table, an unscored one with nothing", async () => {
    const cards = await listVentureCards(today);
    expect(cards.map((c) => c.venture.slug)).toEqual(["performa-vision", "meta-klinik"]);
    for (const card of cards) {
      expect(card).toMatchObject({ progress: null, winds: null, relatedNews: 0, market: { indonesia: null, global: null } });
    }
  });

  test("progress: the newest row of each venture, null for one without", async () => {
    await db().execute(sql`insert into venture_progress (venture_id, day, percent, sprint_delivered, sprint_next, tickets_in_qa) values
      (${performa}, ${addDays(today, -3)}, 50, 2, 3, 1), (${performa}, ${addDays(today, -1)}, 62, 3, 4, 4)`);
    const [first, second] = await listVentureCards(today);
    expect(first.progress).toMatchObject({ percent: 62, sprintDelivered: 3, sprintNext: 4, ticketsInQa: 4 });
    expect(second.progress).toBeNull();
  });

  test("market: the newest row per region with its change vs yesterday; no change without yesterday's row; a region without a score", async () => {
    await market(performa, addDays(today, -1), "indonesia", 70);
    await market(performa, today, "indonesia", 76);
    await market(performa, today, "global", 68); // no row yesterday
    await market(meta, today, "indonesia", 81);
    await market(meta, today, "global", null); // no related news
    const [first, second] = await listVentureCards(today);
    expect(first.market.indonesia).toMatchObject({ score: 76, delta: 6, day: today });
    expect(first.market.global).toMatchObject({ score: 68, delta: null });
    expect(second.market.indonesia).toMatchObject({ score: 81, delta: null });
    expect(second.market.global).toMatchObject({ score: null, delta: null });
  });

  test("market: an old row is returned however old it is", async () => {
    await market(performa, addDays(today, -9), "indonesia", 60);
    const [first] = await listVentureCards(today);
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
    const [first, second] = await listVentureCards(today);
    expect(first.winds).toMatchObject({ tailwindEn: "Newer tailwind", tailwindId: "Newer tailwind (id)", headwindEn: null });
    expect(second.winds).toBeNull();

    await db().execute(sql`insert into venture_winds (venture_id, day) values (${performa}, ${today})`);
    expect((await listVentureCards(today))[0].winds).toMatchObject({ day: today, tailwindEn: null, headwindEn: null });
  });
});

describe("related news count", () => {
  test("counts matches rated 50 or more of articles of visible sources, published since 30 days before today 00:00 WIB", async () => {
    const recent = new Date(Date.now() - 3600_000);
    await match(performa, await article("on", recent), 50); // relevance 50: in
    await match(performa, await article("on", recent), 49); // relevance 49: out
    await match(performa, await article("on", recent), 100); // in
    await match(performa, await article("on", windowStart), 80); // exactly at the window start: in
    await match(performa, await article("on", new Date(windowStart.getTime() - 1)), 80); // a millisecond before: out
    await match(performa, await article("off", recent, false), 90); // switched-off source: out
    await match(meta, await article("on", recent), 70); // another venture's match
    const [first, second] = await listVentureCards(today);
    expect(first.relatedNews).toBe(3);
    expect(second.relatedNews).toBe(1);
  });

  test("a venture with no matches counts 0", async () => {
    await match(performa, await article("on", new Date()), 90);
    expect((await listVentureCards(today))[1].relatedNews).toBe(0);
    expect((await relatedNewsCounts(today)).has(meta)).toBe(false);
  });

  test("matches the latest run did not look at still count, whatever venture_market.related_articles says", async () => {
    await market(performa, today, "indonesia", 70);
    await db().execute(sql`update venture_market set related_articles = 1`);
    await match(performa, await article("on", new Date()), 80);
    await match(performa, await article("on", new Date()), 80);
    await match(performa, await article("on", new Date()), 80);
    expect((await listVentureCards(today))[0]).toMatchObject({ relatedNews: 3, market: { indonesia: { relatedArticles: 1 } } });
  });

  test("the window follows the given day", async () => {
    const old = new Date(`${addDays(today, -40)}T12:00:00+07:00`);
    await match(performa, await article("on", old), 80);
    expect((await listVentureCards(today))[0].relatedNews).toBe(0);
    expect((await listVentureCards(addDays(today, -20)))[0].relatedNews).toBe(1); // window: 50 to 20 days ago
  });
});
