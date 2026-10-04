# Data model v1

Status: **proposed in OR-6, waiting for the Tech Lead's review.** Only `sources`, `articles` and
`job_runs` exist in the database (migration `drizzle/0000_init.sql`). Every other entity is the
plan its ticket follows when it adds its own migration.

Storage is Postgres (local docker compose, see the README). The schema lives in
`src/server/data/schema.ts`; pages and jobs reach it only through `@/server/data`.

## Conventions

- **Keys**: every table has a generated integer `id`. The "natural key" column below is the unique
  constraint that stops duplicates.
- **Time**: every timestamp is `timestamptz`, stored in UTC. "Today" and every daily record use
  the **calendar day in WIB (UTC+7)**; daily records store that day as a `date`. The UI formats
  in WIB.
- **Two languages**: text written by the AI (thesis, why it matters, report, brief) is stored
  twice, in columns ending `_en` and `_id`. Headlines and snippets stay in the publisher's
  language and are stored once.
- **Fixed lists** (region, category, status, signal) are `text` with a `CHECK` constraint, not
  Postgres enums: adding a value is a one-line migration.
- **Money and prices** are `numeric`, with the currency on the asset. Scores are integers 0–100.
- **No article body anywhere**: headline, snippet (at most 500 characters) and link only (R-1).
- **Writes** come from jobs only (plus the user's own settings: shortlist, alert read state).
  Page views only read.

## Entities

| # | Entity | What one row is | Natural key | Main access patterns | Retention | Read by |
|---|--------|-----------------|-------------|----------------------|-----------|---------|
| 1 | `sources` | A news feed (publisher, feed URL, region, default category) | `slug` | All active feeds for an ingestion run; list by region for the Sources panel | Kept; switched off with `active = false` | News (Sources panel, "M sources"); Radar (brief source count) |
| 2 | `articles` | One news item: headline, snippet, link | `canonical_url` | A WIB day, filtered by region and category, newest first (`published_at desc, id desc`); count for a day; by id for citations | **180 days**, except articles cited by an opportunity, which are kept as long as the opportunity. Pruning job is a later ticket | News; Radar (key news); Opportunities (evidence) |
| 3 | `article_triage` | The AI's reading of one article: final category, theme, impact tag (Opportunity / Risk / Context), "why it matters" (EN, ID) | `article_id` | Joined to the News list; themes counted over 7 days (Trending themes); a day's untriaged articles | Deleted with its article | News; Radar (key news, daily brief input) |
| 4 | `opportunities` | One opportunity: title, thesis, region, sector, horizon, capital level and note, who buys, model, risks, first steps, related market exposure (texts in EN and ID), status (open / closed), current score | `id` (matching rule is OR-50's) | Open ones by score; filter by region, sector, horizon, capital; one by id | Kept; closed ones stay for history | Opportunities; Radar (top opportunities); News (linked opportunity) |
| 5 | `opportunity_articles` | A citation: this opportunity uses this article as evidence | (`opportunity_id`, `article_id`) | Evidence list of one opportunity, newest first; evidence count; the opportunity linked to an article | With the opportunity | Opportunities ("Why now", "Based on N news items"); News (linked opportunity) |
| 6 | `opportunity_scores` | One opportunity's score on one WIB day: overall and the five factors (demand, timing, competition, capital efficiency, regulatory risk) | (`opportunity_id`, `day`) | Latest score and breakdown; score 30 days ago for the trend | Kept (one small row per opportunity per day) | Opportunities (score, breakdown, 30-day trend); Radar |
| 7 | `assets` | Something with a price: symbol, name, kind (index, stock, metal, crypto, FX), asset type (for the risk card), currency, unit, data source, on the watchlist or not | `symbol` | Watchlist; one by symbol for the report; assets a price job must fetch | Kept | Investments (watchlist); Asset report; Radar (market snapshot) |
| 8 | `candles` | One asset's daily open, high, low, close, volume | (`asset_id`, `day`) | A range of days for one asset (chart, 30-day sparkline, averages, RSI) | Kept: 10 years of daily candles for ~20 assets is about 50,000 rows | Asset report (chart); Investments (30-day sparkline); Radar (sparkline); signal engine |
| 9 | `quotes` | The latest price of one asset, its 1-day change and when it was fetched | `asset_id` (one row per asset, overwritten) | Latest quote of every watchlist asset | Latest only | Investments; Asset report; Radar (market snapshot) |
| 10 | `signals` | The current signal of one asset for one term (short / long): Buy / Hold / Sell, since when, the checks and their verdicts, rules version, and the written report (EN, ID): summary, risks, what would reverse it | (`asset_id`, `term`) (one current row, overwritten) | Signals of the watchlist for one term; both terms of one asset | Current only; the past is in `signal_history` | Investments (watchlist); Asset report (signal cards, report, checks table); Radar (investment alerts) |
| 11 | `signal_history` | A change of signal: asset, term, day, new signal, the trigger, the price that day | (`asset_id`, `term`, `day`) | History of one asset, newest first; markers on the chart | Kept | Asset report (signal history, chart markers) |
| 12 | `alerts` | A message for the user about an asset: signal label, text (EN, ID), created at, read at, where it was sent | `id` (one per signal change or watch notice) | Newest first; unread count | Kept 1 year | Investments (alerts); header bell count; Radar (investment alerts) |
| 13 | `ventures` | One of the owner's ventures: name, description, where its progress comes from | `slug` | All ventures | Kept | Radar (My ventures) |
| 14 | `venture_snapshots` | One venture on one WIB day: progress %, board status line, opportunity score for Indonesia and worldwide, tailwind and headwind (EN, ID) | (`venture_id`, `day`) | Latest snapshot and the one before (for the score delta) | Kept | Radar (My ventures); venture view |
| 15 | `job_runs` | One run of a job: name, status (running / ok / partial / failed / skipped), started, finished, counts, error summary | `id` | Latest finished ok or partial run of a job ("updated …", stale banner); recent runs of a job | 90 days (pruning with the article pruning job) | Every screen's "updated" time and stale state; `pnpm sources:health` |
| 16 | `llm_usage` | One AI call: purpose, model, input and output tokens, cost, time | `id` | Total cost this month (budget cap); by purpose | Kept 1 year | No screen; the budget check in the LLM client |

### The three tables that exist

`sources`: `id`, `slug` (unique), `name`, `feed_url`, `region` (indonesia / global),
`category` (the feed's default category), `active`, `created_at`.

`articles`: `id`, `source_id` → sources, `canonical_url` (unique), `link` (the publisher's
original link), `region`, `category`, `headline`, `snippet`, `published_at`, `fetched_at`.
Database checks: region is indonesia or global, headline not empty, snippet at most 500
characters, link starts with `http://` or `https://`. Index on (`published_at desc`, `id desc`).
Region and category are copied onto the article so the News list is a single-table query, and so
triage (OR-14) can later re-categorise one article without touching its source.

`job_runs`: `id`, `job`, `status`, `started_at`, `finished_at`, `counts` (JSON, numbers by name),
`error`. A row is written when the run starts (`running`) and updated when it ends, so a crashed
job leaves a record. Index on (`job`, `finished_at desc`).

### Access patterns in code

| Pattern | Function in `@/server/data` | Query |
|---------|------------------------------|-------|
| **News list** | `listArticles({ day, region, category })` | Articles whose `published_at` is inside the WIB day (`day 00:00+07:00` up to the next day), optional region and category, joined to the source name, ordered `published_at desc, id desc` |
| Store an article | `insertArticle(article)` | `insert … on conflict (canonical_url) do nothing`; the existing row is returned unchanged when it was already there. The host is lower-cased before the comparison; OR-8 removes tracking parameters first |
| Sources | `upsertSource`, `listSources` | By `slug`; ordered by region, name |
| Job run log | `startJobRun`, `finishJobRun`, `recordSuccessfulRun` | Insert at start, update by `id` at the end |

Categories: `business`, `politics`, `tech-ai`, `markets`, `commodities` (shown as Business,
Politics & policy, Tech & AI, Markets, Commodities). Regions: `indonesia`, `global`.

## Screens and their entities

| Screen (DESIGN.md) | Part | Entities |
|--------------------|------|----------|
| 1 Radar | Date and "updated 07:00 WIB" | `job_runs` |
| | Daily brief | `daily_briefs` (see below), built from `articles`, `article_triage`, `opportunity_articles` |
| | My ventures | `ventures`, `venture_snapshots`, `venture_articles` (see below) |
| | Top opportunities | `opportunities`, `opportunity_scores`, `opportunity_articles` |
| | Investment alerts | `alerts`, `signals`, `assets` |
| | Market snapshot | `assets`, `quotes`, `candles` |
| | News that moves opportunities | `articles`, `article_triage`, `sources`, `opportunity_articles` |
| 2 Opportunities | List and filters | `opportunities`, `opportunity_scores` |
| | Detail: thesis, breakdown, quick facts, risks, first steps | `opportunities`, `opportunity_scores` |
| | Why now (evidence) | `opportunity_articles`, `articles`, `sources` |
| | Save to my shortlist | `shortlist` (see below) |
| 3 News | Header counts | `articles`, `sources` |
| | List | `articles`, `sources`, `article_triage`, `opportunity_articles`, `opportunities` |
| | Trending themes, 7 days | `article_triage` |
| | Sources panel | `sources` |
| | Stale banner | `job_runs` |
| 4 Investments | Asset types and their risk | Static content in the app (translated copy), not a table |
| | Watchlist | `assets`, `quotes`, `candles`, `signals` |
| | Alerts and "Send alerts to" | `alerts`, `settings` (see below) |
| 5 Asset report | Header, chart | `assets`, `quotes`, `candles`, `signal_history` |
| | Signal cards, report, checks | `signals` |
| | Signal history | `signal_history` |
| 6 Calculators | Everything | None: runs in the browser on the user's own inputs |
| Every screen | Header bell count | `alerts` |

## Records outside the 16 that the screens need

Named here so they are not forgotten; each is added by its own ticket.

| Record | Why | Ticket |
|--------|-----|--------|
| `daily_briefs` (one per WIB day: items with category, summary EN/ID, opportunities affected, article and source counts) | The Radar daily brief is AI text and must not be regenerated on a page view | OR-22 |
| `venture_articles` (venture, article, relevance) | "7 related news items" on a venture card | OR-36 |
| `shortlist` (opportunity, saved at) | "Save to my shortlist" | OR-41 |
| `settings` (alert channels on/off) | "Send alerts to: In the app / Telegram / Email" | The alert delivery ticket (D4 is still open) |

## For the Tech Lead's review

Choices that are hard to change later:

1. **Region and category are copied onto each article** (not read from the source), so triage can
   re-categorise an article and the News list stays a one-table query.
2. **`signals` and `quotes` hold only the current value**; history lives in `signal_history` and
   `candles`. Simple to read, and nothing grows without bound.
3. **Daily records use the WIB calendar day** (`opportunity_scores`, `venture_snapshots`,
   `candles`, `daily_briefs`). US-market candles are stored under the exchange's trading day.
4. **AI text is stored in both languages at write time** (`_en`, `_id` columns) rather than
   translated on a page view, so a page view never calls the AI.
5. **Retention**: articles 180 days (cited ones kept), job runs 90 days, alerts and AI usage
   1 year, everything else kept. Nothing is pruned until the pruning job exists.
6. **Asset-type risk cards are static content**, not data: they change with a code change.
7. **Single user**: no user table, no `user_id` on shortlist, alerts or settings. Adding a second
   user later would need a migration on those tables.
