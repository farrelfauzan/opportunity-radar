// Database commands (see README "Database"). Usage:
//   node --conditions=react-server scripts/db.ts <command> [--test] [args]
// --conditions=react-server lets Node load the server-only data module outside Next.js.
import { existsSync, writeFileSync } from "node:fs";
import {
  citeArticles,
  closeDb,
  insertArticle,
  insertOpportunity,
  recordOpportunityScore,
  recordSuccessfulRun,
  upsertSource,
  type Region,
} from "../src/server/data/index.ts";
import { databaseUrl, sql } from "../src/server/data/client.ts";
import { loadEnv, migrate, resetTestDatabase, testDatabaseUrl } from "./db-admin.ts";
import { seedArticles, seedOpportunities, seedSources } from "./seed-data.ts";

const args = process.argv.slice(2).filter((arg) => arg !== "--test");
const onTest = process.argv.includes("--test");
const [command, ...rest] = args;

/** Writes .env.local with the docker compose defaults (no password: see docker-compose.yml). */
function initEnv(): void {
  const file = new URL("../.env.local", import.meta.url);
  if (existsSync(file)) return;
  const base = "postgres://postgres@127.0.0.1:54329";
  writeFileSync(
    file,
    `DATABASE_URL=${base}/opportunity_radar\nTEST_DATABASE_URL=${base}/opportunity_radar_test\n`,
  );
  console.log("Wrote .env.local with the local database defaults.");
}

/** Points the data module at the chosen database and returns its URL. */
function selectDatabase(): string {
  const url = onTest ? testDatabaseUrl() : databaseUrl();
  process.env.DATABASE_URL = url;
  return url;
}

async function seed(): Promise<void> {
  const ids = new Map<string, number>();
  for (const source of seedSources) ids.set(source.slug, (await upsertSource(source)).id);
  let created = 0;
  const articles = seedArticles();
  const stored: { id: number; region: Region }[] = [];
  for (const article of articles) {
    const result = await insertArticle({
      sourceId: ids.get(article.source)!,
      link: `https://example.com/seed/${article.path}`,
      region: article.region,
      category: article.category,
      headline: article.headline,
      snippet: article.snippet,
      publishedAt: article.publishedAt,
    });
    if (result.created) created++;
    stored.push({ id: result.article.id, region: result.article.region });
  }
  const opportunities = await seedOpportunityRows(stored);
  console.log(
    `Seed: ${seedSources.length} sources, ${created} new articles (${articles.length - created} already present), ` +
      `${opportunities} new opportunities.`,
  );
}

/**
 * Opportunities with their score history and three cited articles of their own region.
 * One that is already there (same English title) is left as it is, so the seed can run again.
 */
async function seedOpportunityRows(articles: { id: number; region: Region }[]): Promise<number> {
  let added = 0;
  for (const [index, { opportunity, scores }] of seedOpportunities().entries()) {
    const [existing] = await sql()`select id from opportunities where title_en = ${opportunity.titleEn}`;
    if (existing) continue;
    const [first, ...rest] = scores;
    const row = await insertOpportunity(opportunity, first);
    for (const score of rest) await recordOpportunityScore(row.id, score);
    const same = articles.filter((a) => a.region === opportunity.region);
    await citeArticles(
      row.id,
      [0, 1, 2].map((k) => same[(index * 3 + k) % same.length].id),
    );
    added++;
  }
  return added;
}

async function setLastRun(job?: string, when?: string): Promise<void> {
  // <when> is an ISO time, or a number of minutes ago.
  const at = /^\d+$/.test(when ?? "") ? new Date(Date.now() - Number(when) * 60_000) : new Date(when ?? "");
  if (!job || Number.isNaN(at.getTime())) {
    throw new Error('Usage: pnpm db:set-last-run <job> <minutes ago | ISO time> [--test]');
  }
  await recordSuccessfulRun(job, at);
  console.log(`Last successful run of "${job}" set to ${at.toISOString()}.`);
}

const label = () => (onTest ? "test" : "development");

async function main(): Promise<void> {
  if (command === "setup") initEnv();
  loadEnv();
  switch (command) {
    case "setup":
      await migrate(databaseUrl());
      await migrate(testDatabaseUrl());
      selectDatabase();
      await seed();
      console.log("Database ready: development and test databases migrated, development seeded.");
      break;
    case "migrate":
      await migrate(selectDatabase());
      console.log(`Migrations applied to the ${label()} database.`);
      break;
    case "seed":
      selectDatabase();
      await seed();
      break;
    case "reset":
      await resetTestDatabase();
      console.log("Test database emptied and migrated.");
      break;
    case "set-last-run":
      selectDatabase();
      await setLastRun(rest[0], rest[1]);
      break;
    default:
      throw new Error("Commands: setup | migrate | seed | reset | set-last-run (add --test for the test database)");
  }
}

main()
  .catch((error) => {
    console.error(error.code === "ECONNREFUSED" ? 'Cannot reach the database. Is Docker running? Start it with "pnpm db:up".' : error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
