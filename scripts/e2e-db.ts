// The browser tests' database (see playwright.config.ts). Usage:
//   node --conditions=react-server scripts/e2e-db.ts <command>
// It only ever touches opportunity_radar_e2e_<E2E_PORT>_test (e2eDatabaseUrl).
//   setup                                 create, empty and migrate the database
//   fixtures [--last-run=<minutes ago | ISO time | never>] [--no-articles]
//                                         empty the tables, then store the News fixtures
//                                         (default: a successful ingestion 5 minutes ago)
//   add <headline>                        store one more article, published now
// "fixtures" prints {"lastRun": <ISO time or null>}.
import { closeDb, insertArticle, recordSuccessfulRun, upsertSource } from "../src/server/data/index.ts";
import { sql } from "../src/server/data/client.ts";
import { fixtureArticles, fixtureSources } from "../e2e/news-fixtures.ts";
import { resetTestDatabase } from "./db-admin.ts";
import { e2eDatabaseUrl } from "./e2e-env.ts";

const url = e2eDatabaseUrl();
process.env.DATABASE_URL = url;

const [command, ...args] = process.argv.slice(2);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}`))?.split("=")[1];

async function storeSources() {
  const ids = new Map<string, number>();
  for (const s of fixtureSources) {
    // Placeholder feed addresses: nothing here is ever fetched.
    ids.set(s.slug, (await upsertSource({ ...s, feedUrl: `https://example.com/e2e-feeds/${s.slug}.xml`, category: "business" })).id);
  }
  return ids;
}

async function fixtures() {
  await sql()`truncate articles, sources, job_runs restart identity cascade`;
  const ids = await storeSources();
  if (!args.includes("--no-articles")) {
    for (const a of fixtureArticles()) {
      await insertArticle({
        sourceId: ids.get(a.source)!,
        link: `https://example.com/e2e/${a.path}`,
        region: a.region,
        category: a.category,
        headline: a.headline,
        snippet: a.snippet,
        publishedAt: a.publishedAt,
      });
    }
  }
  const when = option("last-run") ?? "5";
  const lastRun =
    when === "never" ? null : /^\d+$/.test(when) ? new Date(Date.now() - Number(when) * 60_000) : new Date(when);
  if (lastRun) await recordSuccessfulRun("ingest-news", lastRun);
  console.log(JSON.stringify({ lastRun: lastRun?.toISOString() ?? null }));
}

async function add(headline: string) {
  const [source] = await sql()`select id from sources where slug = 'antara'`;
  await insertArticle({
    sourceId: source.id,
    link: `https://example.com/e2e/added/${Date.now()}`,
    region: "indonesia",
    category: "business",
    headline,
    publishedAt: new Date(),
  });
}

async function main() {
  switch (command) {
    case "setup":
      await resetTestDatabase(url);
      break;
    case "fixtures":
      await fixtures();
      break;
    case "add":
      await add(args[0]);
      break;
    default:
      throw new Error("Commands: setup | fixtures | add <headline>");
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
