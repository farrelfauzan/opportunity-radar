import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import {
  addDays,
  citeArticles,
  insertArticle,
  insertOpportunity,
  newsEnrichment,
  saveTriage,
  trendingThemes,
  upsertSource,
  wibDay,
  type NewOpportunity,
  type Theme,
} from "@/server/data";
import { db } from "@/server/data/client";

// "Now" for every test: 4 Oct 2026, 12:00 WIB.
const now = new Date("2026-10-04T05:00:00Z");
const today = wibDay(now);
const at = (daysAgo: number, time = "12:00:00") => new Date(`${addDays(today, -daysAgo)}T${time}+07:00`);

let sourceId: number;
let counter = 0;

const addArticle = async (publishedAt: Date = now, source = sourceId) =>
  (
    await insertArticle({
      sourceId: source,
      link: `https://example.com/n/${++counter}`,
      region: "global",
      category: "business",
      headline: `Headline ${counter}`,
      publishedAt,
    })
  ).article.id;

const triageOk = (articleId: number, themes: Theme[], impact: "opportunity" | "risk" | "context" = "context") =>
  saveTriage([
    {
      articleId,
      status: "ok",
      category: "markets",
      region: "indonesia",
      relevance: 70,
      impact,
      whyEn: `Why EN ${articleId}`,
      whyId: `Why ID ${articleId}`,
      themes,
    },
  ]);

const opportunity = (overrides: Partial<NewOpportunity> = {}): NewOpportunity => ({
  titleEn: `Opportunity ${++counter}`,
  titleId: `Peluang ${counter}`,
  thesisEn: "A thesis.",
  thesisId: "Sebuah tesis.",
  region: "indonesia",
  theme: "food_security",
  sectors: ["agri_food"],
  horizon: "6-12m",
  capitalLevel: "medium",
  capitalReasonEn: "A reason.",
  capitalReasonId: "Sebuah alasan.",
  buyerEn: "Buyers",
  buyerId: "Pembeli",
  modelEn: "Subscription",
  modelId: "Langganan",
  risksEn: ["Risk one", "Risk two"],
  risksId: ["Risiko satu", "Risiko dua"],
  firstStepsEn: ["Step one"],
  firstStepsId: ["Langkah satu"],
  ...overrides,
});

/** An opportunity with the given current score that cites the articles; closed ones are closed. */
const cite = (score: number, articleIds: number[], extra: Partial<NewOpportunity> = {}) =>
  insertOpportunity(
    opportunity(extra),
    { day: today, overall: score, demand: score, timing: score, competition: score, capital: score, regulatory: score },
    articleIds,
  );

beforeEach(async () => {
  counter = 0;
  await db().execute(sql`truncate opportunities, articles, sources, article_triage restart identity cascade`);
  sourceId = (
    await upsertSource({ slug: "s", name: "Source", feedUrl: "https://example.com/f.xml", region: "global", category: "business" })
  ).id;
});

describe("newsEnrichment", () => {
  test("an empty list gives an empty map", async () => {
    expect((await newsEnrichment([])).size).toBe(0);
  });

  test("triage is read only when it succeeded; a failed or missing triage has no entry", async () => {
    const [ok, failed, none] = [await addArticle(), await addArticle(), await addArticle()];
    await triageOk(ok, ["data_centers"], "opportunity");
    await saveTriage([{ articleId: failed, status: "failed", error: "bad reply" }]);

    const map = await newsEnrichment([ok, failed, none]);
    expect(map.get(ok)).toEqual({
      triage: { impact: "opportunity", whyEn: `Why EN ${ok}`, whyId: `Why ID ${ok}` },
      linked: null,
    });
    expect(map.has(failed)).toBe(false);
    expect(map.has(none)).toBe(false);
  });

  test("the linked opportunity is the open one with the highest current score", async () => {
    const article = await addArticle();
    const low = await cite(40, [article]);
    const high = await cite(80, [article]);
    await cite(60, [article]);

    const entry = (await newsEnrichment([article])).get(article)!;
    expect(entry.linked).toEqual({ id: high.id, titleEn: high.titleEn, titleId: high.titleId });
    expect(entry.linked!.id).not.toBe(low.id);
    expect(entry.triage).toBeNull(); // cited but not triaged: still linked
  });

  test("equal scores: the lowest id, whatever order they cite in", async () => {
    const article = await addArticle();
    const first = await cite(70, []);
    const second = await cite(70, []);
    await citeArticles(second.id, [article]);
    await citeArticles(first.id, [article]);

    expect((await newsEnrichment([article])).get(article)!.linked!.id).toBe(first.id);
  });

  test("a closed opportunity never links, even with the highest score", async () => {
    const [both, closedOnly] = [await addArticle(), await addArticle()];
    const closed = await cite(99, [both, closedOnly], { closedAt: new Date() });
    const open = await cite(10, [both]);

    const map = await newsEnrichment([both, closedOnly]);
    expect(map.get(both)!.linked!.id).toBe(open.id);
    expect(map.get(both)!.linked!.id).not.toBe(closed.id);
    expect(map.has(closedOnly)).toBe(false);
  });

  test("triage and the link come together for the same article", async () => {
    const article = await addArticle();
    await triageOk(article, ["rupiah_fx"], "risk");
    const open = await cite(50, [article]);
    expect((await newsEnrichment([article])).get(article)).toEqual({
      triage: { impact: "risk", whyEn: `Why EN ${article}`, whyId: `Why ID ${article}` },
      linked: { id: open.id, titleEn: open.titleEn, titleId: open.titleId },
    });
  });

  test("articles of a switched-off source are not returned", async () => {
    const off = (
      await upsertSource({ slug: "off", name: "Off", feedUrl: "https://example.com/off.xml", region: "global", category: "business" })
    ).id;
    const [shown, hidden] = [await addArticle(), await addArticle(now, off)];
    await triageOk(shown, ["data_centers"]);
    await triageOk(hidden, ["data_centers"]);
    await cite(50, [shown, hidden]);
    await db().execute(sql`update sources set active = false where id = ${off}`);

    const map = await newsEnrichment([shown, hidden]);
    expect([...map.keys()]).toEqual([shown]);
  });
});

describe("trendingThemes", () => {
  /** A triaged article published at `publishedAt`. */
  const themed = async (themes: Theme[], publishedAt: Date = now, source = sourceId) => {
    const id = await addArticle(publishedAt, source);
    await triageOk(id, themes);
    return id;
  };

  test("nothing counted gives an empty list", async () => {
    expect(await trendingThemes(now)).toEqual([]);
  });

  test("the window is the last 7 WIB days: the start of the 7th day is in, the minute before is out", async () => {
    await themed(["food_security"], at(6, "00:00:00"));
    await themed(["ai_adoption"], at(7, "23:59:59"));
    await themed(["data_centers"], at(7));
    await themed(["gold_commodities"], at(6));
    expect(await trendingThemes(now)).toEqual([
      { theme: "food_security", count: 1 },
      { theme: "gold_commodities", count: 1 },
    ]);
  });

  test("today counts to the end of the WIB day; tomorrow does not", async () => {
    await themed(["food_security"], at(0, "23:59:59"));
    await themed(["ai_adoption"], at(-1, "00:00:00"));
    expect(await trendingThemes(now)).toEqual([{ theme: "food_security", count: 1 }]);
  });

  test("an article counts once per theme, however often its row lists it", async () => {
    await themed(["data_centers", "ai_adoption"]);
    const duplicated = await addArticle();
    // The row check allows repeats; the count must not.
    await db().execute(
      sql`insert into article_triage (article_id, status, category, region, relevance, impact, why_en, why_id, themes)
        values (${duplicated}, 'ok', 'markets', 'global', 70, 'risk', 'w', 'w', array['data_centers','data_centers','ai_adoption'])`,
    );
    expect(await trendingThemes(now)).toEqual([
      { theme: "ai_adoption", count: 2 },
      { theme: "data_centers", count: 2 },
    ]);
  });

  test("the theme other is never counted", async () => {
    await themed(["other", "data_centers"]);
    await themed(["other"]);
    await themed(["other", "ai_adoption"]);
    expect(await trendingThemes(now)).toEqual([
      { theme: "ai_adoption", count: 1 },
      { theme: "data_centers", count: 1 },
    ]);
  });

  test("most articles first, ties by theme id; at most the limit (6 by default)", async () => {
    const counts: [Theme, number][] = [
      ["trade_tariffs", 3],
      ["rupiah_fx", 3],
      ["data_centers", 5],
      ["gold_commodities", 2],
      ["food_security", 2],
      ["ai_adoption", 4],
      ["interest_rates", 1],
    ];
    for (const [theme, n] of counts) for (let i = 0; i < n; i++) await themed([theme]);

    const top = await trendingThemes(now);
    expect(top.map((t) => `${t.theme}:${t.count}`)).toEqual([
      "data_centers:5",
      "ai_adoption:4",
      "rupiah_fx:3",
      "trade_tariffs:3",
      "food_security:2",
      "gold_commodities:2",
    ]);
    expect(await trendingThemes(now, 2)).toEqual(top.slice(0, 2));
    expect(await trendingThemes(now, 100)).toHaveLength(7);
  });

  test("only triage that succeeded and only visible sources count", async () => {
    const off = (
      await upsertSource({ slug: "off", name: "Off", feedUrl: "https://example.com/off.xml", region: "global", category: "business" })
    ).id;
    await themed(["data_centers"]);
    await themed(["rupiah_fx"], now, off);
    const failed = await addArticle();
    await saveTriage([{ articleId: failed, status: "failed", error: "bad reply" }]);
    // A failed row never carries themes by design, but the count must not depend on that.
    await db().execute(sql`update article_triage set themes = array['ai_adoption'] where article_id = ${failed}`);
    await addArticle(); // no triage at all
    await db().execute(sql`update sources set active = false where id = ${off}`);

    expect(await trendingThemes(now)).toEqual([{ theme: "data_centers", count: 1 }]);
  });
});
