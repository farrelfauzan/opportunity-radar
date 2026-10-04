# Opportunity Radar

## Run it locally

Needs **Node.js 22.18 or newer** (it runs the TypeScript scripts directly) and pnpm.
**Docker Desktop must be running** for development, QA and the browser tests: the app stores its
data in a local Postgres started with docker compose.

One line, from a clean checkout:

```bash
pnpm install && pnpm db:setup && pnpm dev
```

`pnpm db:setup` starts Postgres on port **54329** (loopback only, data in the named volume
`opportunity-radar_or_pgdata`), writes `.env.local` with the local connection settings if the file
does not exist, creates and migrates the development and test databases, and seeds the
development database with sample news. It is safe to run again.

## Database

| Command | What it does |
|---|---|
| `pnpm db:setup` | Everything above, in one step |
| `pnpm db:up` / `pnpm db:down` | Start / stop Postgres (stopping keeps the data; use it to see the app's error states) |
| `pnpm db:migrate` | Apply pending migrations. Running it twice changes nothing |
| `pnpm db:seed` | Add the sample sources, 66 articles and 13 opportunities (one closed) with 45 days of score history, with times relative to now. Running it again adds nothing |
| `pnpm db:set-last-run <job> <minutes ago \| ISO time>` | Record a successful run of a job at that time (stale-data states) |
| `pnpm db:reset` | Empty the **test** database and migrate it. Refuses any database whose name does not end in `_test` |
| `pnpm db:generate` | After changing `src/server/data/schema.ts`: write the next migration into `drizzle/` |

`migrate`, `seed` and `set-last-run` work on the development database; add `--test` for the test
database, for example `pnpm db:seed --test`. `pnpm db:reset` always works on the test database.

There are two databases on the one server, chosen by env vars in `.env.local` (names in
`.env.example`): `DATABASE_URL` (development) and `TEST_DATABASE_URL` (used by `pnpm test` and by
QA). Tests never touch development data. The test database must be on this machine and its name
must end in `_test`; anything else is refused.

**Several sessions on one machine:** every `pnpm test` empties the test database first, so give
each session (and QA) its own, for example
`TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/opportunity_radar_qa_test pnpm test`.
It is created on first use. Use the same variable for the `--test` commands. To run the app on the test database:
`DATABASE_URL="$TEST_DATABASE_URL" pnpm dev` after `set -a; source .env.local; set +a`.

Every worktree on this machine shares the same Postgres container and volume. The local database
has no password: its port is published on 127.0.0.1 only.

## Jobs

Jobs (news ingestion, the morning pipeline, later prices and signals) start from the command line
only; there is no HTTP entry point.

```bash
pnpm job <name> [arguments] [--timeout <seconds>] [--test]
```

- `pnpm job nope` (any unknown name) lists the valid jobs.
- Every run is recorded in `job_runs` when it starts and updated when it ends. Exit code 0 for
  `ok`, `partial` and `skipped`; non-zero for `failed`.
- A job that is already running is not started twice: the second start is recorded as `skipped`.
- `pnpm job news` is the command to run every 30 minutes: `ingest-news`, then `triage` (the AI
  reads each new article once: category, region, relevance, impact, "why it matters" in EN and ID,
  themes). `pnpm job triage` alone triages whatever is waiting. With `LLM_PROVIDER` unset the LLM
  is a local mock: its replies say "[mock]" and nothing leaves the machine.
- Every AI-written text (triage "why", opportunity texts and factor reasons, venture winds, the daily
  brief) is checked against one list of advice wording in `src/server/llm/wording.ts` ("describe,
  never instruct", rules-v1 §7.4): a hit is a contract violation, retried once, then not stored.
  Text is normalised first (full-width letters, hidden characters, tags, markdown, hyphens). Forecasts
  ("will", "would", "is set to", "akan", "bakal" + rise/fall/…, with filler words allowed) are
  rejected unless they report announced policy (a tax, tariff, rule … in the same clause) or an
  expectation attributed in the same sentence ("is expected to …, according to …"). "must invest /
  buy / sell" passes only with an authority word nearby ("under the new rule"). Each run counts
  `wording_rejected` and, per list entry, `wording:<entry>`; logs name the entry, not the text.
- `pnpm job prices` stores daily candles and the latest quote of IHSG, BBCA and the S&P 500, and
  USD/IDR (ECB reference rates from Frankfurter, fetched at most every 6 hours). The first run
  backfills 6 years. Yahoo is **off** unless `PRICES_YAHOO=live` (Yahoo's terms are decision D9):
  by default a synthetic history in Yahoo's response shape is used, which is not market data.
  `PRICES_FRANKFURTER=fixtures` uses a recorded USD/IDR history instead of the live API.
- `pnpm job metals` (every 10 minutes) stores gold and silver in rupiah per gram: USD per troy
  ounce ÷ 31.1034768 × USD/IDR, using the latest ECB rate on or before that day. The quote is spot from
  gold-api.com, **off** unless `PRICES_GOLDAPI=live`; the daily history is COMEX futures (GC=F / SI=F),
  stored as `yahoo-futures` (never as spot) and only with `PRICES_YAHOO=live`. If gold-api.com fails,
  the futures price (at most 4 days old) is used and the run is `partial`, naming the fallback.
  gold-api.com bans an IP for several requests per second, so every live call waits 1.1 s first.
- `pnpm job crypto` (every 15 minutes) stores Bitcoin and Ethereum daily candles and price in USD from
  Binance's public market-data host `data-api.binance.vision` (USDT treated as USD), and their rupiah
  price from Indodax. **Off** unless `PRICES_CRYPTO=live` (their terms are not read yet): by default
  made-up replies in each API's shape are used, stored as `synthetic`.
  Crypto volume is stored in USD; the running UTC day is stored too and is not a final close.
- `pnpm job signals` (after the price jobs) applies the published rules v1 (`docs/signals/rules-v1.md`)
  to every asset's daily closes: a short-term and a long-term verdict (BUY / HOLD / SELL, or no
  verdict when the history is too short, out of date or broken), the checks behind it and the prices
  that would change it. A history row is written only when a verdict changes; the first one is an
  `initial` baseline. Signals on made-up prices are stored with `synthetic = true` and the screens
  show "No signal: sample data" instead, unless `SHOW_SAMPLE_SIGNALS=1` (development and QA only;
  ignored in production). No alert comes from them.
- `pnpm job explanations` (after `signals`) writes the report behind each changed signal (and
  weekly for the rest): an explanation of what the rules see, the risks, and a news check (this
  week's matching articles read as supportive or against), in EN and ID. The verdict always comes
  from the rules; a reply that names another verdict, a price that is not one of the rules'
  reversal prices, or advice is rejected (one retry, then nothing is stored). A report on sample
  prices starts with "Signal computed on sample data, not on real prices." and is shown only
  with `SHOW_SAMPLE_SIGNALS=1`.
- Made-up prices are stored with `source = synthetic` and are never written over real ones: a run in
  fixtures mode on an asset that already has real prices writes nothing for it and is `partial`. An
  unknown `PRICES_*` value fails the run.
- `pnpm job opportunities` (also the second step of `morning`) asks the LLM to group the last 7
  days of relevant, triaged news into opportunities. Each one is checked against the OR-11 contract
  (`docs/opportunities/scoring-v1.md`); one that breaks it is rejected and logged, and nothing is
  stored for it. Valid ones are stored with their citations and first score. A theme that matches
  an open opportunity (same theme, region and a shared sector, or 2 shared citations) updates it
  instead: same id, new citations (at most 50 in total), fresh texts. An opportunity without a new
  citation for 30 days (a duration of 30 × 24 hours) is closed and stays readable; a closed one is
  never matched again. Closing only happens on a run that had news to judge by, so a stopped
  ingestion or a machine that was off never closes anything.
- `pnpm job morning` runs triage → opportunities → scores → brief and stops at the first failing
  step; later steps are recorded as `skipped`.
- `--test` runs against the test database; `--timeout <seconds>` overrides the job's own time
  limit (a value that is not a positive number exits with code 2 and runs nothing).
- `pnpm job ingest-news` fetches each active news feed once (meant to run every 30 minutes; the
  feed list and each feed's terms are in `src/server/news/feeds.ts`) and stores
  new articles: headline, snippet and link only. `pnpm sources:health` prints, per source, the
  last successful check, the last status (`200`, `304`, `403`, `timeout`, …) and the number of
  articles stored in the last 24 hours.
- For testing only (not available with `NODE_ENV=production`): `pnpm job noop`,
  `pnpm job sleep <seconds>`, `pnpm job fail [message]`, and `STUB_FAIL=<step> pnpm job morning`
  to make one pipeline step fail.

To check that every stored article is complete and clean, run this in
`docker compose exec db psql -U postgres opportunity_radar` (or `opportunity_radar_test`). It
lists the offending articles and must return no rows (seeded sample articles are left out):

```sql
select id, headline from articles
where link not like 'https://example.com/seed/%' -- seed articles carry markup on purpose (OR-9)
  and (source_id is null or headline = '' or char_length(snippet) > 500
   or region not in ('indonesia', 'global') or category = ''
   or link !~* '^https?://' or published_at is null
   or headline ~* '</?[a-z][^>]*>' or snippet ~* '</?[a-z][^>]*>'
   or headline ~* '&(#[0-9]+|#x[0-9a-f]+|[a-z]+);' or snippet ~* '&(#[0-9]+|#x[0-9a-f]+|[a-z]+);')
```

The data model is described in [docs/data-model.md](docs/data-model.md); tests in
[docs/testing.md](docs/testing.md).

## Next.js

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
