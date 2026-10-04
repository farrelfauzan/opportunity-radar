# Data model v1

Status: **proposed in OR-6, waiting for the Tech Lead's review.** Built so far: `sources`,
`articles`, `job_runs` (OR-6, OR-8), the venture tables (OR-36), `llm_usage` (OR-13),
`article_triage` (OR-14) and `opportunities`, `opportunity_articles` and `opportunity_scores`
(OR-17, because the Opportunities screen reads them; migration `0007_opportunities`). Every other
entity is the plan its ticket follows when it adds its own migration.

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
| 3 | `article_triage` | The AI's reading of one article (OR-14), written once: status (`ok` / `failed`), category, region, relevance 0–100, impact (opportunity / risk / context), "why it matters" (EN, ID, ≤ 30 words each), 1–3 themes from scoring-v1 §8. An ok row also sets the article's category and region; a failed one leaves the feed's | `article_id` | The triage queue: visible articles without a row; joined to the News list; themes counted over 7 days (Trending themes); opportunity candidates (ok, relevance ≥ `TRIAGE_MIN_RELEVANCE`, default 30) | Deleted with its article | News; Radar (key news, daily brief input); opportunities (OR-15) |
| 4 | `opportunities` | One opportunity: title, thesis, region, sector, horizon, capital level and note, who buys, model, risks, first steps, related market exposure (texts in EN and ID), status (open / closed), current score | `id` (matching rule is OR-50's) | Open ones by score; filter by region, sector, horizon, capital; one by id | Kept; closed ones stay for history | Opportunities; Radar (top opportunities); News (linked opportunity) |
| 5 | `opportunity_articles` | A citation: this opportunity uses this article as evidence | (`opportunity_id`, `article_id`) | Evidence list of one opportunity, newest first; evidence count; the opportunity linked to an article | With the opportunity | Opportunities ("Why now", "Based on N news items"); News (linked opportunity) |
| 6 | `opportunity_scores` | One opportunity's score on one WIB day: overall and the five factors (demand, timing, competition, capital efficiency, regulatory risk) | (`opportunity_id`, `day`) | Latest score and breakdown; score 30 days ago for the trend | Kept (one small row per opportunity per day) | Opportunities (score, breakdown, 30-day trend); Radar |
| 7 | `assets` | Something with a price: symbol, name, kind (index, stock, metal, crypto, FX), asset type (for the risk card), currency, unit, data source, on the watchlist or not | `symbol` | Watchlist; one by symbol for the report; assets a price job must fetch | Kept | Investments (watchlist); Asset report; Radar (market snapshot) |
| 8 | `candles` | One asset's daily open, high, low, close, volume | (`asset_id`, `day`) | A range of days for one asset (chart, 30-day sparkline, averages, RSI) | Kept: 10 years of daily candles for ~20 assets is about 50,000 rows | Asset report (chart); Investments (30-day sparkline); Radar (sparkline); signal engine |
| 9 | `quotes` | The latest price of one asset, its 1-day change and when it was fetched | `asset_id` (one row per asset, overwritten) | Latest quote of every watchlist asset | Latest only | Investments; Asset report; Radar (market snapshot) |
| 10 | `signals` | The current signal of one asset for one term (short / long): Buy / Hold / Sell, since when, the checks and their verdicts, rules version, and the written report (EN, ID): summary, risks, what would reverse it | (`asset_id`, `term`) (one current row, overwritten) | Signals of the watchlist for one term; both terms of one asset | Current only; the past is in `signal_history` | Investments (watchlist); Asset report (signal cards, report, checks table); Radar (investment alerts) |
| 11 | `signal_history` | A change of signal: asset, term, day, new signal, the trigger, the price that day | (`asset_id`, `term`, `day`) | History of one asset, newest first; markers on the chart | Kept | Asset report (signal history, chart markers) |
| 12 | `alerts` | A message for the user about an asset: signal label, text (EN, ID), created at, read at, where it was sent | `id` (one per signal change or watch notice) | Newest first; unread count | Kept 1 year | Investments (alerts); header bell count; Radar (investment alerts) |
| 13 | `ventures` | One of the owner's ventures: name, description (EN, ID), 1–3 sectors (scoring-v1 §7), news-matching keywords, progress goal (MVP / next release), progress source (Notion or not connected). Edited in `src/server/ventures/config.ts`, seeded. Removing a venture from the config leaves its row and history in the database (the seed only adds and updates) | `slug` | All ventures; one by slug (venture view) | Kept | Radar (My ventures); venture view |
| 14 | `venture_progress` · `venture_market` · `venture_winds` · `venture_articles` | Replace the single `venture_snapshots` (OR-36), so each job writes its own table with its own failure rule. **Progress** (OR-37): one row per venture per WIB day, only successful reads (%, sprint delivered, next sprint, tickets in QA; the sentence is built per language). **Market** (OR-38): one row per venture, day and region, score and five factors, or null when there is no related news (never invented). **Winds** (OR-38): one tailwind/headwind pair per venture per day (EN, ID), each citing article ids. **Articles** (OR-38): venture ↔ article matches with relevance | progress (`venture_id`, `day`); market (`venture_id`, `day`, `region`); winds (`venture_id`, `day`); articles (`venture_id`, `article_id`) | Latest progress row; latest market row per region and the one before (change vs yesterday, computed on read) and 30 days (trend line); latest winds; matched articles of the last 30 days, newest first, and their count | Progress, market, winds kept; a match is deleted with its article | Radar (My ventures); venture view |
| 15 | `job_runs` | One run of a job: name, status (running / ok / partial / failed / skipped), started, finished, counts, error summary | `id` | Latest finished ok or partial run of a job ("updated …", stale banner); recent runs of a job | 90 days (pruning with the article pruning job) | Every screen's "updated" time and stale state; `pnpm sources:health` |
| 16 | `llm_usage` | One LLM request (OR-13): job, role (triage / report), provider (mock / live), model, input and output tokens (estimated and flagged when the provider sends none), cost (null without prices), status (ok / invalid_output / error / budget_exhausted) | `id` | Live usage this WIB month (budget cap, checked before every live request); by job | Kept 1 year | No screen; the cap check in the LLM client |

### The three opportunity tables (OR-17)

`opportunities`: `id`, the texts in `_en` and `_id` columns (`title`, `thesis`, `capital_reason`,
`buyer`, `model`, optional `related_exposure`; `risks` and `first_steps` as two `text[]` columns of
the same length), `region` (indonesia / global; the LLM contract's `worldwide` is stored as
`global`), `theme`, `sectors` (1 to 3 ids of the fixed list, `text[]`), `horizon`, `capital_level`,
`status` (open / closed), `current_score`, `created_at`, `closed_at` (set exactly when closed).
Checks hold the fixed lists and the length limits of `docs/opportunities/output.schema.json`.
`current_score` is a cache of the newest `opportunity_scores` row so the list sorts one table: it
is written only together with that row (`insertOpportunity`, `recordOpportunityScore`), so it
cannot drift. Every opportunity has at least one score. Index on (`status`, `current_score desc`, `id`).

`opportunity_articles`: (`opportunity_id` → `opportunities`, cascade; `article_id` → `articles`,
no cascade: a cited article cannot be pruned). `opportunity_scores`: (`opportunity_id`, `day`) as
the key, `day` the WIB calendar day, `overall` and the five factors as integers 0 to 100 (checks).

The 30-day trend (`src/server/data/trend.ts`): today's WIB day minus 30 days is the baseline day;
the baseline is the nearest score row on or before it. The trend is `current_score` minus that
score, or "new" while the first score is fewer than 30 days old (day 0 to 29).
`listOpportunities` returns open ones by `current_score desc, id`; `lastScoringRun()` is the last
successful run of the `scores` pipeline step.

### The three tables that exist (news)

`sources`: `id`, `slug` (unique), `name`, `feed_url`, `region` (indonesia / global),
`category` (the feed's default category), `active`, `created_at`.

`articles`: `id`, `source_id` → sources, `canonical_url` (unique), `link` (the publisher's
original link), `region`, `category`, `headline`, `snippet`, `published_at`, `fetched_at`.
Database checks: region is indonesia or global, category is one of the five, headline not empty
and at most 300 characters (longer ones are cut, ending in "…"), snippet at most 500 characters,
link starts with `http://` or `https://`. `published_at_estimated` marks articles whose feed gave
no usable date (OR-8). `sources` also keeps the last check of its feed (ETag, Last-Modified, last
status, last success). Index on (`published_at desc`, `id desc`).
Region and category are copied onto the article so the News list is a single-table query, and so
triage (OR-14) can later re-categorise one article without touching its source.

`job_runs`: `id`, `job`, `status`, `started_at`, `finished_at`, `counts` (JSON, numbers by name),
`error`. A row is written when the run starts (`running`) and updated when it ends, so a crashed
job leaves a record. Index on (`job`, `finished_at desc`).

**Switched-off sources.** A source with `active = false` (its feed was removed or its terms do not
allow our use) keeps its articles in the database; deleting them is the Tech Lead's call. Those
articles are invisible: every read of articles for a screen, a count, the triage queue or
opportunity/venture matching applies `articleIsVisible` (the source is active) from
`src/server/data/articles.ts`.

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
| | My ventures | `ventures`, `venture_progress`, `venture_market`, `venture_winds`, `venture_articles` |
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
| 7 Venture view (`docs/design/venture-view.md`) | Header | `ventures` |
| | Build progress | `venture_progress` |
| | Market view, Indonesia and Worldwide | `venture_market` |
| | What helps and what hurts | `venture_winds`, `articles`, `sources` |
| | Related news, 30 days | `venture_articles`, `articles`, `article_triage`, `sources` |
| Every screen | Header bell count | `alerts` |

## Records outside the 16 that the screens need

Named here so they are not forgotten; each is added by its own ticket.

| Record | Why | Ticket |
|--------|-----|--------|
| `daily_briefs` (one per WIB day: items with category, summary EN/ID, opportunities affected, article and source counts) | The Radar daily brief is AI text and must not be regenerated on a page view | OR-22 |
| `shortlist` (opportunity, saved at) | "Save to my shortlist" | OR-41 |
| `settings` (alert channels on/off) | "Send alerts to: In the app / Telegram / Email" | The alert delivery ticket (D4 is still open) |

## For the Tech Lead's review

Choices that are hard to change later:

1. **Region and category are copied onto each article** (not read from the source), so triage can
   re-categorise an article and the News list stays a one-table query.
2. **`signals` and `quotes` hold only the current value**; history lives in `signal_history` and
   `candles`. Simple to read, and nothing grows without bound.
3. **Daily records use the WIB calendar day** (`opportunity_scores`, `venture_progress`, `venture_market`, `venture_winds`,
   `candles`, `daily_briefs`). US-market candles are stored under the exchange's trading day.
4. **AI text is stored in both languages at write time** (`_en`, `_id` columns) rather than
   translated on a page view, so a page view never calls the AI.
5. **Retention**: articles 180 days (cited ones kept), job runs 90 days, alerts and AI usage
   1 year, everything else kept. Nothing is pruned until the pruning job exists.
6. **Asset-type risk cards are static content**, not data: they change with a code change.
7. **Single user**: no user table, no `user_id` on shortlist, alerts or settings. Adding a second
   user later would need a migration on those tables.
