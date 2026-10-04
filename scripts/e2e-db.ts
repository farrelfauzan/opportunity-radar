// The browser tests' database (see playwright.config.ts). Usage:
//   node --conditions=react-server scripts/e2e-db.ts <command>
// It only ever touches opportunity_radar_e2e_<E2E_PORT>_test (e2eDatabaseUrl).
//   setup                                 create, empty and migrate the database
//   fixtures [--last-run=<minutes ago | ISO time | never>] [--no-articles]
//            [--scores-run=<minutes ago | ISO time | never>] [--brief-run=<minutes ago | ISO time | never>] [--no-opportunities] [--no-brief]
//            [--brief-day=<days from today, e.g. -1>] [--no-market]
//            [--prices-run=<...>] [--metals-run=<...>] [--crypto-run=<...>]   (the jobs behind the market snapshot, default 5)
//            [--real-prices]               store every quote, candle and signal as real data (the default has made-up Bitcoin and
//                                         Ethereum prices, and USD/IDR, so the Sample rules show)
//                                         empty the tables, then store the News fixtures, the
//                                         Opportunities fixtures, today's daily brief, the market snapshot's and the watchlist's
//                                         prices and the watchlist's signals
//                                         (default: a successful ingestion and a successful scoring run 5 minutes ago)
//   add <headline>                        store one more article, published now
//   break <table> | restore <table>       rename a table away and back (articles, opportunities, assets): the page's
//                                         queries fail like a store that is down, with no second server
//   deactivate <slug>                     switch a source off (its articles are hidden)
//   source-status <slug> <status>         set a source's status on the latest ingestion run (e.g. 403, 304)
// "fixtures" prints {"lastRun": <ISO time or null>, ..., "marketAsOf": <the as-of time of the timed quotes>}.
import {
  addDays,
  closeDb,
  insertArticle,
  insertOpportunity,
  recordOpportunityScore,
  recordSuccessfulRun,
  saveBrief,
  saveSignal,
  saveTriage,
  SCORING_JOB,
  setQuote,
  upsertAsset,
  upsertCandles,
  upsertSource,
  wibDay,
  type Sector,
  type Theme,
  type TriageResult,
} from "../src/server/data/index.ts";
import { sql } from "../src/server/data/client.ts";
import { detailOf, evidenceArticles, factorsOf, fixtureOpportunities } from "../e2e/opportunity-fixtures.ts";
import { fixtureArticles, fixtureSources, todayStats } from "../e2e/news-fixtures.ts";
import { fixtureMarket, fixtureSignals, type FixtureSignalState } from "../e2e/market-fixtures.ts";
import { fixtureBriefLines } from "../e2e/radar-fixtures.ts";
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

/** Stores the articles the opportunities cite (on days before today); returns their ids by fixture key. */
async function storeEvidence(sourceIds: Map<string, number>) {
  const ids = new Map<string, number>();
  const triage: TriageResult[] = [];
  for (const e of evidenceArticles) {
    const region = e.region ?? "indonesia";
    const category = e.category ?? "business";
    const { article } = await insertArticle({
      sourceId: sourceIds.get(e.source)!,
      link: `https://example.com/e2e/evidence/${e.key}`,
      region,
      category,
      headline: e.headline,
      snippet: e.snippet,
      publishedAt: new Date(Date.now() - e.ageDays * DAY_MS),
    });
    ids.set(e.key, article.id);
    if (e.why) {
      triage.push({
        articleId: article.id, status: "ok", category, region, relevance: 70, impact: "opportunity",
        whyEn: e.why.en, whyId: e.why.id, themes: ["other"], // never ranked in the News themes panel, so these rows do not change its counts
      });
    }
  }
  await saveTriage(triage);
  return ids;
}

/** Stores the opportunities; returns their ids by fixture key. */
async function storeOpportunities(evidence: Map<string, number>) {
  const now = Date.now();
  const stored = new Map<string, number>();
  const today = wibDay(new Date(now));
  for (const f of fixtureOpportunities) {
    const rows = f.history
      .map(([ago, overall]) => ({ day: addDays(today, -ago), overall, ...factorsOf(overall) }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const text = detailOf(f);
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
        capitalReasonEn: text.capitalReason.en,
        capitalReasonId: text.capitalReason.id,
        buyerEn: text.buyer.en,
        buyerId: text.buyer.id,
        modelEn: text.model.en,
        modelId: text.model.id,
        risksEn: text.risks.en,
        risksId: text.risks.id,
        firstStepsEn: text.steps.en,
        firstStepsId: text.steps.id,
        relatedExposureEn: text.related?.en ?? null,
        relatedExposureId: text.related?.id ?? null,
        closedAt: f.closedDaysAgo === undefined ? undefined : new Date(now - f.closedDaysAgo * DAY_MS),
      },
      rows[0],
      (f.cites ?? []).flatMap((key) => evidence.get(key) ?? []),
    );
    for (const next of rows.slice(1)) await recordOpportunityScore(row.id, next);
    stored.set(f.key, row.id);
  }
  return stored;
}

/** The daily brief (today's, unless --brief-day moves it): its lines cite the stored opportunities and evidence articles by id. */
async function storeBrief(opportunityIds: Map<string, number>, evidence: Map<string, number>) {
  const stats = todayStats();
  await saveBrief({
    day: addDays(wibDay(), Number(option("brief-day") ?? 0)),
    lines: fixtureBriefLines.map((line) => ({
      label: line.label,
      en: line.en,
      id: line.id,
      opportunityIds: line.opportunities.flatMap((key) => opportunityIds.get(key) ?? []),
      articleIds: line.articles.flatMap((key) => evidence.get(key) ?? []),
    })),
    articleCount: stats.articles,
    sourceCount: stats.sources,
  });
}

/**
 * The market snapshot's and the watchlist's assets: 10 or 30 daily closes on the 10 days up to the day before the quotes (UTC) and a quote that is newer.
 * The quote of a timed asset is from 5 minutes ago; a daily rate (USD/IDR) is stored at 00:00 UTC of the same UTC day.
 * Returns the as-of time of the timed quotes.
 */
async function storeMarket(): Promise<Date> {
  const now = Date.now();
  const timed = new Date(now - 5 * 60_000);
  // The UTC day of the quotes (not of "now", which can be the next day for a moment): the candles end the day before.
  const today = new Date(`${timed.toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  for (const f of fixtureMarket) {
    const { id } = await upsertAsset({ slug: f.slug, symbol: f.symbol, name: f.name, kind: f.kind, exchange: f.exchange, currency: f.currency, source: f.source, onWatchlist: f.onWatchlist ?? true });
    // --real-prices: no made-up data anywhere, so no Sample rule shows.
    const real = args.includes("--real-prices");
    const synthetic = !real && f.quoteSource === "synthetic";
    await upsertCandles(
      id,
      real ? f.source : (f.candleSource ?? f.source),
      f.closes.map((close, i) => {
        const day = new Date(today - (f.closes.length - i) * DAY_MS).toISOString().slice(0, 10);
        return { day, open: close, high: close, low: close, close, volume: null };
      }),
    );
    await setQuote(id, { price: f.price, asOf: f.daily ? new Date(today) : timed, source: real ? f.source : f.quoteSource });
    for (const [term, state] of Object.entries(fixtureSignals[f.slug] ?? {}) as ["short" | "long", FixtureSignalState][]) {
      const verdict = state === "BUY" || state === "HOLD" || state === "SELL" ? state : state === "STALE" ? "BUY" : null; // a stale signal keeps its last verdict
      await saveSignal(
        { assetId: id, term, state, verdict, since: wibDay(new Date(now)), asOfDay: wibDay(new Date(now)), indicators: null, checks: [], agree: null, reversals: [], currency: null, rulesVersion: "rules v1", synthetic },
        null,
      );
    }
  }
  return timed;
}

async function fixtures() {
  await sql()`truncate articles, sources, job_runs, opportunities, daily_briefs, assets restart identity cascade`;
  const ids = await storeSources();
  const evidence = new Map<string, number>();
  if (!args.includes("--no-articles")) {
    const triage: TriageResult[] = [];
    for (const a of fixtureArticles()) {
      const { article } = await insertArticle({
        sourceId: ids.get(a.source)!,
        link: `https://example.com/e2e/${a.path}`,
        region: a.region,
        category: a.category,
        headline: a.headline,
        snippet: a.snippet,
        publishedAt: a.publishedAt,
      });
      if (a.key) evidence.set(a.key, article.id); // opportunities cite News articles by this key too
      if (a.triage?.status === "ok") {
        triage.push({
          articleId: article.id,
          status: "ok",
          category: a.triage.category, // saveTriage moves the article to this category, as the triage job does
          region: a.region,
          relevance: 70,
          impact: a.triage.impact,
          whyEn: a.triage.whyEn,
          whyId: a.triage.whyId,
          themes: a.triage.themes as Theme[],
        });
      } else if (a.triage) {
        triage.push({ articleId: article.id, status: "failed", error: "Fixture: the reply was not valid" });
      }
    }
    await saveTriage(triage);
  }
  if (!args.includes("--no-articles")) for (const [key, id] of await storeEvidence(ids)) evidence.set(key, id);
  const opportunityIds = args.includes("--no-opportunities") ? new Map<string, number>() : await storeOpportunities(evidence);
  if (!args.includes("--no-brief")) await storeBrief(opportunityIds, evidence);
  const lastRun = timeOption("last-run", "5");
  if (lastRun) await recordSuccessfulRun("ingest-news", lastRun);
  const scoresRun = timeOption("scores-run", "5");
  if (scoresRun) await recordSuccessfulRun(SCORING_JOB, scoresRun);
  const briefRun = timeOption("brief-run", "5");
  if (briefRun) await recordSuccessfulRun("brief", briefRun);
  const marketAsOf = args.includes("--no-market") ? null : await storeMarket();
  const pricesRun = timeOption("prices-run", "5");
  if (pricesRun) await recordSuccessfulRun("prices", pricesRun);
  const metalsRun = timeOption("metals-run", "5");
  if (metalsRun) await recordSuccessfulRun("metals", metalsRun);
  const cryptoRun = timeOption("crypto-run", "5");
  if (cryptoRun) await recordSuccessfulRun("crypto", cryptoRun);
  console.log(
    JSON.stringify({
      marketAsOf: marketAsOf?.toISOString() ?? null,
      pricesRun: pricesRun?.toISOString() ?? null,
      metalsRun: metalsRun?.toISOString() ?? null,
      cryptoRun: cryptoRun?.toISOString() ?? null,
      lastRun: lastRun?.toISOString() ?? null,
      scoresRun: scoresRun?.toISOString() ?? null,
      briefRun: briefRun?.toISOString() ?? null,
    }),
  );
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

const BREAKABLE = ["articles", "opportunities", "assets"];

/** Renames the table away, so every query on it fails. The server keeps running and its connections stay up. */
async function breakTable(table: string) {
  if (!BREAKABLE.includes(table)) throw new Error(`Cannot break "${table}"; allowed: ${BREAKABLE.join(", ")}`);
  const q = sql();
  await q`alter table ${q(table)} rename to ${q(`${table}__off`)}`;
}

/** Renames it back. Safe to run when nothing is broken. */
async function restoreTable(table: string) {
  if (!BREAKABLE.includes(table)) throw new Error(`Cannot restore "${table}"; allowed: ${BREAKABLE.join(", ")}`);
  const q = sql();
  const [{ away }] = await q`select to_regclass(${`${table}__off`}) is not null as away`;
  if (away) await q`alter table ${q(`${table}__off`)} rename to ${q(table)}`;
}

async function main() {
  switch (command) {
    case "setup":
      await resetTestDatabase(url);
      break;
    case "fixtures":
      await fixtures();
      break;
    case "break":
      await breakTable(args[0]);
      break;
    case "restore":
      await restoreTable(args[0]);
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
