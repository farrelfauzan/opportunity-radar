import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import {
  citationCounts,
  insertArticle,
  insertOpportunity,
  recentLinkedNews,
  saveTriage,
  upsertSource,
  type NewOpportunity,
} from "@/server/data";
import { db } from "@/server/data/client";

let counter = 0;
const opportunity = (): NewOpportunity => ({
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
});
const firstScore = { day: "2026-10-04", overall: 60, demand: 60, timing: 60, competition: 60, capital: 60, regulatory: 60 };
const make = (articleIds: number[] = [], closed = false) =>
  insertOpportunity({ ...opportunity(), ...(closed ? { closedAt: new Date("2026-10-03T00:00:00Z") } : {}) }, firstScore, articleIds);

let sourceCounter = 0;
const makeSource = (active = true) =>
  upsertSource({
    slug: `source-${++sourceCounter}`,
    name: `Source ${sourceCounter}`,
    feedUrl: `https://example.com/feed-${sourceCounter}.xml`,
    region: "indonesia",
    category: "business",
    active,
  });
let articleCounter = 0;
const makeArticle = async (sourceId: number, publishedAt: string) =>
  (
    await insertArticle({
      sourceId,
      link: `https://example.com/radar-${++articleCounter}`,
      region: "indonesia",
      category: "business",
      headline: `Article ${articleCounter}`,
      publishedAt: new Date(publishedAt),
    })
  ).article;

beforeEach(async () => {
  counter = sourceCounter = articleCounter = 0;
  await db().execute(sql`truncate opportunities, articles, sources, job_runs restart identity cascade`);
});

describe("recentLinkedNews", () => {
  test("is limited, newest first, ties by newest id, with the source name and slug", async () => {
    const source = await makeSource();
    const day = (d: number) => `2026-10-0${d}T05:00:00Z`;
    const a = await makeArticle(source.id, day(1));
    const tieA = await makeArticle(source.id, day(2));
    const tieB = await makeArticle(source.id, day(2));
    const c = await makeArticle(source.id, day(3));
    const d = await makeArticle(source.id, day(4));
    const e = await makeArticle(source.id, day(5));
    await make([a.id, tieA.id, tieB.id, c.id, d.id, e.id]);

    const list = await recentLinkedNews(5);
    expect(list.map((n) => n.id)).toEqual([e.id, d.id, c.id, tieB.id, tieA.id]);
    expect(list[0]).toMatchObject({ headline: e.headline, link: e.link, sourceName: source.name, sourceSlug: source.slug });
    expect((await recentLinkedNews(2)).map((n) => n.id)).toEqual([e.id, d.id]);
  });

  test("lists only articles cited by an open opportunity", async () => {
    const source = await makeSource();
    const cited = await makeArticle(source.id, "2026-10-03T05:00:00Z");
    const onlyClosed = await makeArticle(source.id, "2026-10-04T05:00:00Z");
    const uncited = await makeArticle(source.id, "2026-10-04T06:00:00Z");
    await make([cited.id]);
    await make([onlyClosed.id], true);

    const list = await recentLinkedNews(5);
    expect(list.map((n) => n.id)).toEqual([cited.id]);
    expect(list.map((n) => n.id)).not.toContain(uncited.id);
  });

  test("an article cited by a closed and an open opportunity is listed", async () => {
    const source = await makeSource();
    const article = await makeArticle(source.id, "2026-10-03T05:00:00Z");
    await make([article.id], true);
    await make([article.id]);
    expect((await recentLinkedNews(5)).map((n) => n.id)).toEqual([article.id]);
  });

  test("an article of a switched-off source is not listed", async () => {
    const on = await makeSource();
    const off = await makeSource(false);
    const shown = await makeArticle(on.id, "2026-10-03T05:00:00Z");
    const hidden = await makeArticle(off.id, "2026-10-04T05:00:00Z");
    await make([shown.id, hidden.id]);
    expect((await recentLinkedNews(5)).map((n) => n.id)).toEqual([shown.id]);
  });

  test("an article cited by two opportunities is listed once", async () => {
    const source = await makeSource();
    const article = await makeArticle(source.id, "2026-10-03T05:00:00Z");
    const other = await makeArticle(source.id, "2026-10-02T05:00:00Z");
    await make([article.id, other.id]);
    await make([article.id]);
    await make([article.id, other.id]);
    expect((await recentLinkedNews(5)).map((n) => n.id)).toEqual([article.id, other.id]);
  });

  test("the why (both languages) comes only with an ok triage", async () => {
    const source = await makeSource();
    const ok = await makeArticle(source.id, "2026-10-04T05:00:00Z");
    const failed = await makeArticle(source.id, "2026-10-03T05:00:00Z");
    const untriaged = await makeArticle(source.id, "2026-10-02T05:00:00Z");
    await make([ok.id, failed.id, untriaged.id]);
    await saveTriage([
      {
        articleId: ok.id, status: "ok", category: "markets", region: "indonesia", relevance: 70, impact: "opportunity",
        whyEn: "Why in English.", whyId: "Mengapa dalam bahasa Indonesia.", themes: ["food_security"],
      },
      { articleId: failed.id, status: "failed", error: "bad reply" },
    ]);

    const byId = new Map((await recentLinkedNews(5)).map((n) => [n.id, n]));
    expect(byId.get(ok.id)).toMatchObject({ whyEn: "Why in English.", whyId: "Mengapa dalam bahasa Indonesia.", category: "markets" });
    expect(byId.get(failed.id)).toMatchObject({ whyEn: null, whyId: null });
    expect(byId.get(untriaged.id)).toMatchObject({ whyEn: null, whyId: null });
  });

  test("nothing cited gives an empty list", async () => {
    const source = await makeSource();
    await makeArticle(source.id, "2026-10-03T05:00:00Z");
    await make();
    expect(await recentLinkedNews(5)).toEqual([]);
  });
});

describe("citationCounts", () => {
  test("counts the visible citations of each id; ids without citations count 0", async () => {
    const on = await makeSource();
    const off = await makeSource(false);
    const one = await makeArticle(on.id, "2026-10-03T05:00:00Z");
    const two = await makeArticle(on.id, "2026-10-03T06:00:00Z");
    const hidden = await makeArticle(off.id, "2026-10-03T07:00:00Z");
    const three = await make([one.id, two.id, hidden.id]);
    const single = await make([one.id]);
    const none = await make();

    const counts = await citationCounts([three.id, single.id, none.id, 999_999]);
    expect(Object.fromEntries(counts)).toEqual({ [three.id]: 2, [single.id]: 1, [none.id]: 0, 999999: 0 });
  });

  test("only the asked ids are counted, and no ids is an empty answer", async () => {
    const source = await makeSource();
    const article = await makeArticle(source.id, "2026-10-03T05:00:00Z");
    const asked = await make([article.id]);
    await make([article.id]);
    expect([...(await citationCounts([asked.id])).keys()]).toEqual([asked.id]);
    expect((await citationCounts([])).size).toBe(0);
  });
});
