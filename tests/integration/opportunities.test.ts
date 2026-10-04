import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { migrate } from "../../scripts/db-admin.ts";
import { seedOpportunities } from "../../scripts/seed-data.ts";
import {
  addDays,
  citeArticles,
  getOpportunity,
  insertArticle,
  insertOpportunity,
  lastScoringRun,
  listOpportunities,
  listOpportunityEvidence,
  MAX_CITATIONS,
  MAX_LISTED,
  openOpportunitiesQuery,
  recordOpportunityScore,
  recordSuccessfulRun,
  SCORING_JOB,
  upsertSource,
  wibDay,
  type NewOpportunity,
  type NewScore,
} from "@/server/data";
import { databaseUrl, db } from "@/server/data/client";

// "Today" for every test: 4 Oct 2026, 12:00 WIB.
const now = new Date("2026-10-04T05:00:00Z");
const today = wibDay(now);
const dayOf = (daysAgo: number) => addDays(today, -daysAgo);

const score = (overall: number, daysAgo = 0): NewScore => ({
  day: dayOf(daysAgo),
  overall,
  demand: overall,
  timing: overall,
  competition: overall,
  capital: overall,
  regulatory: overall,
});

let counter = 0;
const base = (overrides: Partial<NewOpportunity> = {}): NewOpportunity => ({
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

/** An opportunity whose score history is `history`: [days ago, overall] pairs (the newest is the current one). */
async function make(overrides: Partial<NewOpportunity>, history: [number, number][]) {
  const rows = history.map(([ago, overall]) => score(overall, ago)).sort((a, b) => a.day.localeCompare(b.day));
  const row = await insertOpportunity(base(overrides), rows[0]);
  for (const later of rows.slice(1)) await recordOpportunityScore(row.id, later);
  return row;
}

const titles = async (filter = {}) => (await listOpportunities(filter, now)).map((o) => o.titleEn);

beforeEach(async () => {
  counter = 0;
  await db().execute(sql`truncate opportunities, articles, sources, job_runs restart identity cascade`);
});

describe("listOpportunities: order", () => {
  test("highest current score first, ties by id (oldest first)", async () => {
    await make({ titleEn: "A" }, [[0, 70]]);
    await make({ titleEn: "B" }, [[0, 80]]);
    await make({ titleEn: "C" }, [[0, 70]]);
    await make({ titleEn: "D" }, [[0, 80]]);
    await make({ titleEn: "E" }, [[0, 95]]);

    expect(await titles()).toEqual(["E", "B", "D", "A", "C"]);
  });

  test("the query orders by score and then by id, and is limited (read from the generated SQL)", () => {
    // The index (status, current_score desc, id) returns ties in id order by itself, so the
    // data alone cannot prove the explicit tie-break: the query text does.
    const query = openOpportunitiesQuery().toSQL();
    expect(query.sql).toMatch(/order by "opportunities"\."current_score" desc, "opportunities"\."id" asc/);
    expect(query.sql).toMatch(/limit \$\d+/);
    expect(query.params).toContain(MAX_LISTED);
  });

  test("each item carries its score and trend", async () => {
    await make({ titleEn: "A" }, [[0, 70]]);
    const [item] = await listOpportunities({}, now);
    expect(item).toMatchObject({ titleEn: "A", titleId: "Peluang 1", currentScore: 70, status: "open", trend: { kind: "new" } });
  });

  test("nothing stored gives an empty list", async () => {
    expect(await listOpportunities({}, now)).toEqual([]);
  });
});

describe("listOpportunities: filters", () => {
  beforeEach(async () => {
    await make({ titleEn: "ID logistics short low", region: "indonesia", sectors: ["logistics"], horizon: "0-6m", capitalLevel: "low" }, [[0, 90]]);
    await make({ titleEn: "ID logistics+agri mid medium", region: "indonesia", sectors: ["agri_food", "logistics"], horizon: "6-12m", capitalLevel: "medium" }, [[0, 80]]);
    await make({ titleEn: "ID fintech long high", region: "indonesia", sectors: ["fintech_finance"], horizon: "1-3y", capitalLevel: "high" }, [[0, 70]]);
    await make({ titleEn: "Global logistics short low", region: "global", sectors: ["logistics"], horizon: "0-6m", capitalLevel: "low" }, [[0, 60]]);
    await make({ titleEn: "Global ai long medium", region: "global", sectors: ["ai_software"], horizon: "1-3y", capitalLevel: "medium" }, [[0, 50]]);
  });

  test("no filter lists every open one", async () => {
    expect(await titles()).toHaveLength(5);
  });

  test("region", async () => {
    expect(await titles({ region: "indonesia" })).toEqual([
      "ID logistics short low",
      "ID logistics+agri mid medium",
      "ID fintech long high",
    ]);
    expect(await titles({ region: "global" })).toEqual(["Global logistics short low", "Global ai long medium"]);
  });

  test("sector matches any of the opportunity's sectors", async () => {
    expect(await titles({ sector: "logistics" })).toEqual([
      "ID logistics short low",
      "ID logistics+agri mid medium",
      "Global logistics short low",
    ]);
    expect(await titles({ sector: "agri_food" })).toEqual(["ID logistics+agri mid medium"]);
    expect(await titles({ sector: "education" })).toEqual([]);
  });

  test("horizon", async () => {
    expect(await titles({ horizon: "1-3y" })).toEqual(["ID fintech long high", "Global ai long medium"]);
    expect(await titles({ horizon: "6-12m" })).toEqual(["ID logistics+agri mid medium"]);
  });

  test("capital", async () => {
    expect(await titles({ capital: "low" })).toEqual(["ID logistics short low", "Global logistics short low"]);
    expect(await titles({ capital: "high" })).toEqual(["ID fintech long high"]);
  });

  test("combinations narrow the list", async () => {
    expect(await titles({ region: "indonesia", sector: "logistics" })).toEqual([
      "ID logistics short low",
      "ID logistics+agri mid medium",
    ]);
    expect(await titles({ region: "global", sector: "logistics", horizon: "0-6m", capital: "low" })).toEqual([
      "Global logistics short low",
    ]);
    expect(await titles({ region: "indonesia", horizon: "1-3y", capital: "medium" })).toEqual([]);
  });
});

describe("closed opportunities", () => {
  test("are never listed, but can be read by id with their status", async () => {
    await make({ titleEn: "Open" }, [[0, 60]]);
    const closed = await make({ titleEn: "Closed", closedAt: new Date("2026-10-01T00:00:00Z") }, [[0, 99]]);

    expect(await titles()).toEqual(["Open"]);
    expect(await titles({ region: "indonesia", sector: "agri_food" })).toEqual(["Open"]);
    expect(await getOpportunity(closed.id, now)).toMatchObject({ titleEn: "Closed", status: "closed" });
  });

  test("the database refuses a closed status without a close time, and the other way round", async () => {
    const row = await make({}, [[0, 60]]);
    await expect(db().execute(sql`update opportunities set status = 'closed' where id = ${row.id}`)).rejects.toThrow();
    await expect(db().execute(sql`update opportunities set closed_at = now() where id = ${row.id}`)).rejects.toThrow();
  });
});

describe("trend", () => {
  test("up, down and flat over a 45-day history, against the score 30 days ago", async () => {
    const history = (at30: number, now0: number): [number, number][] => [[45, 50], [31, 99], [30, at30], [29, 10], [0, now0]];
    await make({ titleEn: "Up" }, history(60, 72));
    await make({ titleEn: "Down" }, history(80, 71));
    await make({ titleEn: "Flat" }, history(70, 70));

    const byTitle = Object.fromEntries((await listOpportunities({}, now)).map((o) => [o.titleEn, o.trend]));
    expect(byTitle).toEqual({
      Up: { kind: "change", delta: 12 },
      Down: { kind: "change", delta: -9 },
      Flat: { kind: "change", delta: 0 },
    });
  });

  test("first scored 0, 3 and 29 days ago is new; 30 days ago shows the change", async () => {
    await make({ titleEn: "Day 0" }, [[0, 70]]);
    await make({ titleEn: "Day 3" }, [[3, 60], [0, 69]]);
    await make({ titleEn: "Day 29" }, [[29, 50], [0, 68]]);
    await make({ titleEn: "Day 30" }, [[30, 50], [0, 67]]);

    const byTitle = Object.fromEntries((await listOpportunities({}, now)).map((o) => [o.titleEn, o.trend]));
    expect(byTitle).toEqual({
      "Day 0": { kind: "new" },
      "Day 3": { kind: "new" },
      "Day 29": { kind: "new" },
      "Day 30": { kind: "change", delta: 17 },
    });
  });

  test("when no row exists exactly 30 days back, the nearest earlier row is used", async () => {
    // Rows at 40 and 33 days ago and then 10 days ago: the baseline is the 33-day row, not the 40-day one, and not the 10-day one.
    await make({ titleEn: "Gap" }, [[40, 40], [33, 55], [10, 65], [0, 70]]);
    expect((await listOpportunities({}, now))[0].trend).toEqual({ kind: "change", delta: 15 });
  });

  test("the trend moves with the day it is read on", async () => {
    await make({ titleEn: "Aging" }, [[29, 50], [0, 68]]);
    const tomorrow = new Date(now.getTime() + 24 * 3600_000);
    expect((await listOpportunities({}, now))[0].trend).toEqual({ kind: "new" });
    expect((await listOpportunities({}, tomorrow))[0].trend).toEqual({ kind: "change", delta: 18 });
  });

  test("getOpportunity returns the same trend as the list", async () => {
    const row = await make({}, [[45, 50], [30, 60], [0, 72]]);
    expect((await getOpportunity(row.id, now))!.trend).toEqual({ kind: "change", delta: 12 });
  });
});

describe("scores", () => {
  test("the current score is the newest row, whatever order the rows were written in", async () => {
    const row = await make({}, [[0, 77]]);
    await recordOpportunityScore(row.id, score(55, 5));
    await recordOpportunityScore(row.id, score(60, 2));

    const [item] = await listOpportunities({}, now);
    expect(item.currentScore).toBe(77);
    expect((await getOpportunity(row.id, now))!.latestScore).toMatchObject({ day: today, overall: 77 });
  });

  test("a newer day moves the current score; the same day is replaced, not duplicated", async () => {
    const row = await make({}, [[1, 50]]);
    await recordOpportunityScore(row.id, score(65, 0));
    await recordOpportunityScore(row.id, score(66, 0));

    expect((await getOpportunity(row.id, now))!.currentScore).toBe(66);
    const rows = await db().execute(sql`select count(*) as n from opportunity_scores where opportunity_id = ${row.id}`);
    expect(Number(rows[0].n)).toBe(2);
  });

  test("a score outside 0 to 100 is refused, and nothing is stored for it", async () => {
    const row = await make({}, [[0, 50]]);
    await expect(recordOpportunityScore(row.id, { ...score(50, 1), demand: 101 })).rejects.toThrow();
    await expect(recordOpportunityScore(row.id, { ...score(50, 1), regulatory: -1 })).rejects.toThrow();
    await expect(recordOpportunityScore(row.id, { ...score(101, 1) })).rejects.toThrow();
    const rows = await db().execute(sql`select count(*) as n from opportunity_scores`);
    expect(Number(rows[0].n)).toBe(1);
  });

  test("an unknown opportunity or a malformed day is refused", async () => {
    await expect(recordOpportunityScore(999, score(50))).rejects.toThrow();
    const row = await make({}, [[0, 50]]);
    await expect(recordOpportunityScore(row.id, { ...score(50), day: "4 Oct" })).rejects.toThrow("YYYY-MM-DD");
  });

  test("an unknown id has no opportunity", async () => {
    expect(await getOpportunity(12345, now)).toBeNull();
  });
});

describe("what the database refuses", () => {
  test("sectors: none, four, unknown or repeated", async () => {
    const first = score(50);
    await expect(insertOpportunity(base({ sectors: [] }), first)).rejects.toThrow();
    await expect(
      insertOpportunity(base({ sectors: ["agri_food", "logistics", "education", "ai_software"] }), first),
    ).rejects.toThrow();
    await expect(insertOpportunity(base({ sectors: ["agri_food", "agri_food"] }), first)).rejects.toThrow("repeat");
    await expect(insertOpportunity(base({ sectors: ["blockchain" as never] }), first)).rejects.toThrow("Unknown sector");
    // The database holds the same line when a writer does not.
    const row = await make({}, [[0, 50]]);
    await expect(db().execute(sql`update opportunities set sectors = array['blockchain'] where id = ${row.id}`)).rejects.toThrow();
  });

  test("fixed lists and text limits", async () => {
    const first = score(50);
    await expect(insertOpportunity(base({ region: "mars" as never }), first)).rejects.toThrow();
    await expect(insertOpportunity(base({ horizon: "2y" as never }), first)).rejects.toThrow();
    await expect(insertOpportunity(base({ capitalLevel: "huge" as never }), first)).rejects.toThrow();
    await expect(insertOpportunity(base({ titleEn: "x".repeat(91) }), first)).rejects.toThrow();
    await expect(insertOpportunity(base({ titleId: "   " }), first)).rejects.toThrow();
    await expect(insertOpportunity(base({ risksEn: ["only one"], risksId: ["hanya satu"] }), first)).rejects.toThrow();
    await expect(insertOpportunity(base({ risksId: ["Risiko satu"] }), first)).rejects.toThrow();
    await expect(insertOpportunity(base({ relatedExposureEn: "Only English" }), first)).rejects.toThrow();
  });

  test("nothing is stored when the first score is refused (one transaction)", async () => {
    await expect(insertOpportunity(base(), { ...score(50), timing: 200 })).rejects.toThrow();
    expect(await listOpportunities({}, now)).toEqual([]);
    const rows = await db().execute(sql`select count(*) as n from opportunities`);
    expect(Number(rows[0].n)).toBe(0);
  });
});

describe("citations and cascade", () => {
  test("citing an article twice keeps one citation; deleting the opportunity removes scores and citations only", async () => {
    const source = await upsertSource({
      slug: "antara",
      name: "Antara",
      feedUrl: "https://example.com/feed.xml",
      region: "indonesia",
      category: "business",
    });
    const { article } = await insertArticle({
      sourceId: source.id,
      link: "https://example.com/a",
      region: "indonesia",
      category: "business",
      headline: "A headline",
      publishedAt: new Date("2026-10-03T05:00:00Z"),
    });
    const row = await make({}, [[1, 50], [0, 60]]);
    await citeArticles(row.id, [article.id]);
    await citeArticles(row.id, [article.id]);
    const count = async (table: string) =>
      Number((await db().execute(sql.raw(`select count(*) as n from ${table}`)))[0].n);
    expect(await count("opportunity_articles")).toBe(1);

    await db().execute(sql`delete from opportunities where id = ${row.id}`);
    expect(await count("opportunity_scores")).toBe(0);
    expect(await count("opportunity_articles")).toBe(0);
    expect(await count("articles")).toBe(1);
  });

  test("insertOpportunity stores its citations in the same transaction, or nothing at all", async () => {
    const source = await upsertSource({
      slug: "antara",
      name: "Antara",
      feedUrl: "https://example.com/feed.xml",
      region: "indonesia",
      category: "business",
    });
    const cited = [1, 2].map((n) => ({
      sourceId: source.id,
      link: `https://example.com/cited-${n}`,
      region: "indonesia" as const,
      category: "business" as const,
      headline: `Cited ${n}`,
      publishedAt: new Date("2026-10-03T05:00:00Z"),
    }));
    const ids = [(await insertArticle(cited[0])).article.id, (await insertArticle(cited[1])).article.id];
    const count = async (table: string) =>
      Number((await db().execute(sql.raw(`select count(*) as n from ${table}`)))[0].n);

    const row = await insertOpportunity(base(), score(60), [...ids, ids[0]]); // a repeated id is stored once
    expect(await count("opportunity_articles")).toBe(2);
    expect((await getOpportunity(row.id))?.titleEn).toBe(row.titleEn);

    // An article that does not exist makes the whole insert fail: no opportunity, no score, no citations.
    await expect(insertOpportunity(base(), score(70), [ids[0], 999_999])).rejects.toThrow();
    expect(await count("opportunities")).toBe(1);
    expect(await count("opportunity_scores")).toBe(1);
    expect(await count("opportunity_articles")).toBe(2);
  });

  test("a cited article cannot be deleted while an opportunity cites it", async () => {
    const source = await upsertSource({
      slug: "antara",
      name: "Antara",
      feedUrl: "https://example.com/feed.xml",
      region: "indonesia",
      category: "business",
    });
    const { article } = await insertArticle({
      sourceId: source.id,
      link: "https://example.com/a",
      region: "indonesia",
      category: "business",
      headline: "A headline",
      publishedAt: new Date("2026-10-03T05:00:00Z"),
    });
    const row = await make({}, [[0, 60]]);
    await citeArticles(row.id, [article.id]);
    await expect(db().execute(sql`delete from articles where id = ${article.id}`)).rejects.toThrow();
  });
});

describe("evidence", () => {
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
        link: `https://example.com/evidence-${++articleCounter}`,
        region: "indonesia",
        category: "business",
        headline: `Evidence ${articleCounter}`,
        publishedAt: new Date(publishedAt),
      })
    ).article;
  const count = async () => Number((await db().execute(sql`select count(*) as n from opportunity_articles`))[0].n);

  test("is newest first, ties by newest article id, with the source name and slug", async () => {
    const source = await makeSource();
    const old = await makeArticle(source.id, "2026-10-01T05:00:00Z");
    const tieA = await makeArticle(source.id, "2026-10-03T05:00:00Z");
    const tieB = await makeArticle(source.id, "2026-10-03T05:00:00Z");
    const newest = await makeArticle(source.id, "2026-10-04T01:00:00Z");
    const row = await make({}, [[0, 60]]);
    await citeArticles(row.id, [tieA.id, old.id, newest.id, tieB.id]);
    const list = await listOpportunityEvidence(row.id);
    expect(list.map((a) => a.id)).toEqual([newest.id, tieB.id, tieA.id, old.id]);
    expect(list[0]).toMatchObject({ headline: newest.headline, link: newest.link, sourceName: source.name, sourceSlug: source.slug });
  });

  test("an article of a switched-off source is stored as a citation but absent from the list and from its count", async () => {
    const on = await makeSource();
    const off = await makeSource(false);
    const shown = await makeArticle(on.id, "2026-10-03T05:00:00Z");
    const hidden = await makeArticle(off.id, "2026-10-04T01:00:00Z");
    const row = await make({}, [[0, 60]]);
    await citeArticles(row.id, [shown.id, hidden.id]);
    expect(await count()).toBe(2); // stored
    const list = await listOpportunityEvidence(row.id);
    expect(list.map((a) => a.id)).toEqual([shown.id]);
    expect(list.length).toBe(1); // the count of the list

    // Switched on again, it shows again.
    await db().execute(sql`update sources set active = true where id = ${off.id}`);
    expect((await listOpportunityEvidence(row.id)).map((a) => a.id)).toEqual([hidden.id, shown.id]);
  });

  test("only this opportunity's citations are read; none cited is an empty list", async () => {
    const source = await makeSource();
    const a = await makeArticle(source.id, "2026-10-03T05:00:00Z");
    const b = await makeArticle(source.id, "2026-10-03T06:00:00Z");
    const first = await make({}, [[0, 60]]);
    const second = await make({}, [[0, 61]]);
    const third = await make({}, [[0, 62]]);
    await citeArticles(first.id, [a.id]);
    await citeArticles(second.id, [b.id]);
    expect((await listOpportunityEvidence(first.id)).map((x) => x.id)).toEqual([a.id]);
    expect((await listOpportunityEvidence(second.id)).map((x) => x.id)).toEqual([b.id]);
    expect(await listOpportunityEvidence(third.id)).toEqual([]);
    expect(await listOpportunityEvidence(999_999)).toEqual([]);
  });

  async function articlesOf(n: number) {
    const source = await makeSource();
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      // One minute apart, the newest last.
      ids.push((await makeArticle(source.id, new Date(Date.UTC(2026, 9, 3, 0, i)).toISOString())).id);
    }
    return ids;
  }

  test("the limit is 50 citations: insertOpportunity accepts 50 and rejects 51 (nothing stored)", async () => {
    expect(MAX_CITATIONS).toBe(50);
    const ids = await articlesOf(51);
    await expect(insertOpportunity(base(), score(60), ids)).rejects.toThrow(/at most 50/);
    expect(await count()).toBe(0);
    expect(Number((await db().execute(sql`select count(*) as n from opportunities`))[0].n)).toBe(0);

    // A repeated id is one citation: 51 ids with a repeat are 50 citations.
    const ok = await insertOpportunity(base(), score(60), [...ids.slice(0, 50), ids[0]]);
    expect(await count()).toBe(50);
    const list = await listOpportunityEvidence(ok.id);
    expect(list).toHaveLength(50);
    expect(list[0].id).toBe(ids[49]); // newest first
  });

  test("citeArticles never lets one opportunity exceed 50 in total (nothing of the call is stored)", async () => {
    const ids = await articlesOf(52);
    const row = await make({}, [[0, 60]]);
    await citeArticles(row.id, ids.slice(0, 49));
    await citeArticles(row.id, [ids[0], ids[1], ids[49]]); // one new: 50 in total
    expect(await count()).toBe(50);
    await expect(citeArticles(row.id, [ids[50]])).rejects.toThrow(/at most 50/);
    await expect(citeArticles(row.id, ids.slice(0, 51))).rejects.toThrow(/at most 50/);
    expect(await count()).toBe(50);
    // Another opportunity has its own 50.
    const other = await make({}, [[0, 61]]);
    await citeArticles(other.id, [ids[50]]);
    expect(await count()).toBe(51);
  });

  test("citeArticles refuses a closed opportunity and an unknown id, and stores nothing", async () => {
    const [article] = await articlesOf(1);
    const closed = await make({ closedAt: new Date("2026-10-03T00:00:00Z") }, [[0, 60]]);
    await expect(citeArticles(closed.id, [article])).rejects.toThrow(/open opportunity/);
    await expect(citeArticles(999_999, [article])).rejects.toThrow(/open opportunity/);
    expect(await count()).toBe(0);
  });

  test("concurrent citeArticles calls cannot pass the limit together", async () => {
    const ids = await articlesOf(60);
    const row = await make({}, [[0, 60]]);
    const results = await Promise.allSettled([
      citeArticles(row.id, ids.slice(0, 30)),
      citeArticles(row.id, ids.slice(30, 60)),
    ]);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await count()).toBe(30);
  });
});

describe("last scoring run", () => {
  test("is the last successful run of the scores step, or null", async () => {
    expect(SCORING_JOB).toBe("scores");
    expect(await lastScoringRun()).toBeNull();
    const at = new Date("2026-10-04T00:00:00Z");
    await recordSuccessfulRun("ingest-news", new Date("2026-10-04T04:00:00Z"));
    expect(await lastScoringRun()).toBeNull();
    await recordSuccessfulRun(SCORING_JOB, at);
    expect(await lastScoringRun()).toEqual(at);
  });
});

describe("the seed set", () => {
  test("stores 12 open opportunities, the closed one stays out, and the cache matches the newest score row", async () => {
    const records = seedOpportunities(now.getTime());
    for (const { opportunity, scores } of records) {
      const [first, ...rest] = scores;
      const row = await insertOpportunity(opportunity, first);
      for (const next of rest) await recordOpportunityScore(row.id, next);
    }

    const list = await listOpportunities({}, now);
    expect(records).toHaveLength(13);
    expect(list).toHaveLength(12);
    expect(list.map((o) => o.currentScore)).toEqual([...list.map((o) => o.currentScore)].sort((a, b) => b - a));

    const kinds = new Set(list.map((o) => (o.trend.kind === "new" ? "new" : Math.sign(o.trend.delta))));
    expect(kinds).toEqual(new Set(["new", 1, -1, 0]));

    const stale = await db().execute(sql`
      select o.id from opportunities o
      where o.current_score <> (select overall from opportunity_scores s where s.opportunity_id = o.id order by day desc limit 1)`);
    expect(stale).toHaveLength(0);
  });
});

describe("migrations", () => {
  test("running them again changes nothing and keeps the opportunities", async () => {
    await make({ titleEn: "Keep me" }, [[45, 50], [0, 70]]);
    const applied = async () => Number((await db().execute(sql`select count(*) as n from drizzle.__drizzle_migrations`))[0].n);
    const before = await applied();

    await migrate(databaseUrl());
    await migrate(databaseUrl());

    expect(await applied()).toBe(before);
    expect(await titles()).toEqual(["Keep me"]);
    const scores = await db().execute(sql`select count(*) as n from opportunity_scores`);
    expect(Number(scores[0].n)).toBe(2);
  });
});
