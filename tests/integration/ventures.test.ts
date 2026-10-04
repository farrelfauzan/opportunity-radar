import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vitest";
import { getVenture, insertArticle, listVentures, upsertSource } from "@/server/data";
import { db } from "@/server/data/client";
import { VENTURES } from "@/server/ventures/config";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Runs `pnpm db:seed --test` for real (plain Node, outside Next.js). */
function seedCommand(): string {
  const [node, ...args] = JSON.parse(readFileSync(`${root}package.json`, "utf8")).scripts["db:seed"].split(" ");
  // Inside tests DATABASE_URL points at the test database (setup.ts); the command's
  // guard rightly refuses that, so the child reads both URLs from .env.local instead.
  const env = { ...process.env };
  delete env.DATABASE_URL;
  return execFileSync(node, [...args, "--test"], { cwd: root, encoding: "utf8", env });
}

describe("seeding the ventures", () => {
  test("running the seed twice gives exactly two ventures with EN and ID descriptions", async () => {
    expect(seedCommand()).toContain("2 ventures");
    seedCommand();

    const ventures = await listVentures();
    expect(ventures.map((v) => v.slug)).toEqual(["performa-vision", "meta-klinik"]);
    for (const venture of ventures) {
      const config = VENTURES.find((v) => v.slug === venture.slug)!;
      expect(venture).toMatchObject(config);
      expect(venture.descriptionEn).not.toBe("");
      expect(venture.descriptionId).not.toBe("");
    }
  }, 60_000);

  test("a venture is found by slug; an unknown slug is null", async () => {
    expect((await getVenture("meta-klinik"))?.name).toBe("Meta Klinik");
    expect(await getVenture("nope")).toBeNull();
  });
});

describe("database checks on the venture tables", () => {
  let ventureId: number;
  let articleId: number;

  beforeAll(async () => {
    await db().execute(sql`truncate venture_progress, venture_market, venture_winds, venture_articles`);
    ventureId = (await listVentures())[0].id;
    const source = await upsertSource({
      slug: "venture-test",
      name: "Venture test",
      feedUrl: "https://example.com/feed.xml",
      region: "indonesia",
      category: "business",
    });
    articleId = (
      await insertArticle({
        sourceId: source.id,
        link: "https://example.com/k3",
        region: "indonesia",
        category: "business",
        headline: "Stricter workplace-safety enforcement",
        publishedAt: new Date("2026-10-03T00:00:00Z"),
      })
    ).article.id;
  });

  const fails = (query: ReturnType<typeof sql>) => expect(db().execute(query)).rejects.toThrow();

  test("ventures: sectors must come from the fixed list, 1 to 3 of them", async () => {
    await fails(sql`update ventures set sectors = '{space_tourism}' where id = ${ventureId}`);
    await fails(sql`update ventures set sectors = '{}' where id = ${ventureId}`);
    await fails(sql`update ventures set sectors = '{ai_software,manufacturing,energy_mining,logistics}' where id = ${ventureId}`);
    await fails(sql`update ventures set progress_goal = 'ipo' where id = ${ventureId}`);
  });

  test("venture_market: one row per venture, day and region; a score always has its factors", async () => {
    const factors = JSON.stringify({ demand: 80, timing: 70, competition: 60, capital: 50, regulatory: 90 });
    await db().execute(sql`insert into venture_market (venture_id, day, region, score, factors, related_articles)
      values (${ventureId}, '2026-10-03', 'indonesia', 70, ${factors}::jsonb, 7),
             (${ventureId}, '2026-10-03', 'global', null, null, 0)`);

    await fails(sql`insert into venture_market (venture_id, day, region, score, factors)
      values (${ventureId}, '2026-10-03', 'indonesia', 71, ${factors}::jsonb)`);
    await fails(sql`insert into venture_market (venture_id, day, region, score) values (${ventureId}, '2026-10-04', 'indonesia', 70)`);
    await fails(sql`insert into venture_market (venture_id, day, region, score, factors)
      values (${ventureId}, '2026-10-04', 'indonesia', 101, ${factors}::jsonb)`);
    await fails(sql`insert into venture_market (venture_id, day, region) values (${ventureId}, '2026-10-04', 'asia')`);
  });

  test("venture_market: factors are exactly the five keys, each an integer 0–100", async () => {
    const valid = { demand: 80, timing: 70, competition: 60, capital: 50, regulatory: 90 };
    const insert = (day: string, factors: unknown) =>
      sql`insert into venture_market (venture_id, day, region, score, factors)
        values (${ventureId}, ${day}, 'global', 70, ${JSON.stringify(factors)}::jsonb)`;

    await db().execute(insert("2026-09-01", valid));
    const { regulatory: _, ...missing } = valid;
    void _;
    await fails(insert("2026-09-02", missing));
    await fails(insert("2026-09-03", { ...valid, extra: 1 }));
    await fails(insert("2026-09-04", { ...valid, demand: 101 }));
    await fails(insert("2026-09-05", { ...valid, demand: -1 }));
    await fails(insert("2026-09-06", { ...valid, demand: 50.5 }));
    await fails(insert("2026-09-07", { ...valid, demand: "50" }));
    await fails(insert("2026-09-08", [1, 2, 3, 4, 5]));
    await fails(sql`insert into venture_market (venture_id, day, region, related_articles)
      values (${ventureId}, '2026-09-09', 'global', -1)`);
  });

  test("venture_progress: counts are never negative (they may be unknown)", async () => {
    await db().execute(sql`insert into venture_progress (venture_id, day, percent) values (${ventureId}, '2026-09-01', 10)`);
    await fails(sql`insert into venture_progress (venture_id, day, percent, tickets_in_qa) values (${ventureId}, '2026-09-02', 10, -1)`);
    await fails(sql`insert into venture_progress (venture_id, day, percent, sprint_next) values (${ventureId}, '2026-09-03', 10, -2)`);
  });

  test("venture_articles has an index on article_id (pruning)", async () => {
    const rows = await db().execute(sql`select indexname from pg_indexes where tablename = 'venture_articles'`);
    expect(rows.map((r) => r.indexname)).toContain("venture_articles_article_idx");
  });

  test("venture_winds: one pair per venture per day, both languages, at least one citation", async () => {
    await db().execute(sql`insert into venture_winds (venture_id, day, tailwind_en, tailwind_id, tailwind_article_ids)
      values (${ventureId}, '2026-10-03', 'Stricter enforcement.', 'Penegakan makin ketat.', ${`{${articleId}}`}::bigint[])`);

    await fails(sql`insert into venture_winds (venture_id, day) values (${ventureId}, '2026-10-03')`);
    await fails(sql`insert into venture_winds (venture_id, day, tailwind_en, tailwind_article_ids)
      values (${ventureId}, '2026-10-04', 'English only.', ${`{${articleId}}`}::bigint[])`);
    await fails(sql`insert into venture_winds (venture_id, day, headwind_en, headwind_id)
      values (${ventureId}, '2026-10-05', 'No citation.', 'Tanpa kutipan.')`);
    // No related news that day: no sentences at all is allowed.
    await db().execute(sql`insert into venture_winds (venture_id, day) values (${ventureId}, '2026-10-06')`);
  });

  test("venture_progress: one row per venture per day, percent 0–100", async () => {
    await db().execute(sql`insert into venture_progress (venture_id, day, percent, sprint_delivered, sprint_next, tickets_in_qa)
      values (${ventureId}, '2026-10-03', 62, 3, 4, 4)`);
    await fails(sql`insert into venture_progress (venture_id, day, percent) values (${ventureId}, '2026-10-03', 63)`);
    await fails(sql`insert into venture_progress (venture_id, day, percent) values (${ventureId}, '2026-10-04', 101)`);
  });

  test("venture_articles: a match is unique and is deleted with its article", async () => {
    await db().execute(sql`insert into venture_articles (venture_id, article_id, relevance) values (${ventureId}, ${articleId}, 80)`);
    await fails(sql`insert into venture_articles (venture_id, article_id, relevance) values (${ventureId}, ${articleId}, 90)`);
    await fails(sql`insert into venture_articles (venture_id, article_id, relevance) values (${ventureId + 1}, ${articleId}, 101)`);

    await db().execute(sql`delete from articles where id = ${articleId}`);
    expect(await db().execute(sql`select * from venture_articles`)).toEqual([]);
  });
});
