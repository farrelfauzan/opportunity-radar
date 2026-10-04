// The browser tests' database (see playwright.config.ts). Usage:
//   node --conditions=react-server scripts/e2e-db.ts <command>
// It only ever touches opportunity_radar_e2e_<E2E_PORT>_test (e2eDatabaseUrl).
//   setup                                 create, empty and migrate the database
//   fixtures [--last-run=<minutes ago | ISO time | never>] [--no-articles]
//            [--scores-run=<minutes ago | ISO time | never>] [--no-opportunities]
//                                         empty the tables, then store the News fixtures and the
//                                         Opportunities fixtures (default: a successful ingestion and a
//                                         successful scoring run 5 minutes ago)
//   add <headline>                        store one more article, published now
//   deactivate <slug>                     switch a source off (its articles are hidden)
//   source-status <slug> <status>         set a source's status on the latest ingestion run (e.g. 403, 304)
// "fixtures" prints {"lastRun": <ISO time or null>}.
import {
  addDays,
  closeDb,
  insertArticle,
  insertOpportunity,
  recordOpportunityScore,
  recordSuccessfulRun,
  SCORING_JOB,
  upsertSource,
  wibDay,
  type Sector,
} from "../src/server/data/index.ts";
import { sql } from "../src/server/data/client.ts";
import { fixtureOpportunities } from "../e2e/opportunity-fixtures.ts";
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

/** A time option: minutes ago, an ISO time, or "never" (null). */
function timeOption(name: string, fallback: string): Date | null {
  const when = option(name) ?? fallback;
  return when === "never" ? null : /^\d+$/.test(when) ? new Date(Date.now() - Number(when) * 60_000) : new Date(when);
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function storeOpportunities() {
  const now = Date.now();
  const today = wibDay(new Date(now));
  for (const f of fixtureOpportunities) {
    const rows = f.history
      .map(([ago, overall]) => ({ day: addDays(today, -ago), overall, demand: overall, timing: overall, competition: overall, capital: overall, regulatory: overall }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const row = await insertOpportunity(
      {
        titleEn: f.title.en,
        titleId: f.title.id,
        thesisEn: f.thesis.en,
        thesisId: f.thesis.id,
        region: f.region,
        theme: "food_security",
        sectors: f.sectors as Sector[],
        horizon: f.horizon,
        capitalLevel: f.capital,
        capitalReasonEn: "Reason",
        capitalReasonId: "Alasan",
        buyerEn: "Buyers",
        buyerId: "Pembeli",
        modelEn: "Model",
        modelId: "Model",
        risksEn: ["Risk one", "Risk two"],
        risksId: ["Risiko satu", "Risiko dua"],
        firstStepsEn: ["Step one"],
        firstStepsId: ["Langkah satu"],
        closedAt: f.closedDaysAgo === undefined ? undefined : new Date(now - f.closedDaysAgo * DAY_MS),
      },
      rows[0],
    );
    for (const next of rows.slice(1)) await recordOpportunityScore(row.id, next);
  }
}

async function fixtures() {
  await sql()`truncate articles, sources, job_runs, opportunities restart identity cascade`;
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
  if (!args.includes("--no-opportunities")) await storeOpportunities();
  const lastRun = timeOption("last-run", "5");
  if (lastRun) await recordSuccessfulRun("ingest-news", lastRun);
  const scoresRun = timeOption("scores-run", "5");
  if (scoresRun) await recordSuccessfulRun(SCORING_JOB, scoresRun);
  console.log(JSON.stringify({ lastRun: lastRun?.toISOString() ?? null, scoresRun: scoresRun?.toISOString() ?? null }));
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

async function deactivate(slug: string) {
  const rows = await sql()`update sources set active = false where slug = ${slug} returning id`;
  if (rows.length === 0) throw new Error(`No source with slug ${slug}`);
}

async function sourceStatus(slug: string, status: string) {
  const rows = await sql()`update sources set last_status = ${status} where slug = ${slug} returning id`;
  if (rows.length === 0) throw new Error(`No source with slug ${slug}`);
}

async function main() {
  switch (command) {
    case "setup":
      await resetTestDatabase(url);
      break;
    case "fixtures":
      await fixtures();
      break;
    case "source-status":
      await sourceStatus(args[0], args[1]);
      break;
    case "deactivate":
      await deactivate(args[0]);
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
