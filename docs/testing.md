# Testing

| Command | What it runs |
|---|---|
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen`, then `tsc --noEmit` |
| `pnpm test` | Unit tests and database integration tests (Vitest). Needs the local database (`pnpm db:up`). Does not start a browser |
| `pnpm test:e2e` | Browser tests (Playwright, Chromium) against a production build and its own database |
| `pnpm build` | Production build |

One-time setup for the browser test, after `pnpm install`:

```bash
pnpm exec playwright install chromium
```

## Unit tests (`pnpm test`)

- Files: `src/**/*.test.ts` next to the code, or `tests/unit/**/*.test.ts`.
- They run in Node, with the `@/` alias pointing at `src/`.
- **The network is blocked** (`tests/setup.ts`): any `fetch`, `http` or `https` call fails with
  "Network access is blocked in unit tests". Tests use recorded responses instead. This includes
  `localhost`: a test that needs a local mock server would need an opt-out added to the setup first.
- Limit: unit tests cover plain modules (parsers, formatters, rules, calculators). `async` Server
  Components are not supported by Vitest; they are covered by the browser test.

## Integration tests (`pnpm test`, project `integration`)

- Files: `tests/integration/**/*.test.ts`. Run only these with `pnpm test --project integration`,
  only the unit tests with `pnpm test --project unit` (no database needed).
- They need Docker running and the database set up once (`pnpm db:setup`).
- They use the **test database** (`TEST_DATABASE_URL`) and nothing else: the run starts by
  emptying and migrating it, and refuses a database whose name does not end in `_test` or that
  equals `DATABASE_URL`. Development data is never read or changed.
- The network block of the unit tests does not apply here.
- Two runs on this machine wait for each other (a Postgres advisory lock), because every worktree
  shares one database server. A run empties the test database, so data seeded there by someone
  else is lost: each session should use its own `TEST_DATABASE_URL` (see the README).
- `client-import.test.ts` builds a temporary copy of the app (`.tmp-client-import-*`, removed
  afterwards) with a Client Component that imports `@/server/data`, and asserts that `next build`
  fails. It takes about 10 seconds.

## Fixtures

Recorded upstream responses live in `tests/fixtures/<source>/<name>.<ext>`, for example
`tests/fixtures/antara/feed-2026-10-03.xml` or `tests/fixtures/yahoo/bbca-1y.json`. Read them with
`readFixture("<source>/<name>.<ext>")` from `tests/fixtures.ts`. Keep each file small (a few items)
and never put a key or token in one.

## Browser tests (`pnpm test:e2e`)

- Needs the local database (`pnpm db:up`).
- Builds the app and starts it with `next start` on its own port: **3210**, or `E2E_PORT=<port>`.
  The server is stopped when the run ends, pass or fail. Other sessions share this machine, so
  pass your own port: `E2E_PORT=3319 pnpm test:e2e`.
- If something already listens on that port, the run stops with "http://localhost:3210 is already
  used". Free the port or pick another with `E2E_PORT`.
- **The server uses its own database**, never the development one: `opportunity_radar_e2e_<E2E_PORT>_test`
  on the server of `TEST_DATABASE_URL` (the name always ends in `_test`). The web server command
  creates and migrates it (`scripts/e2e-db.ts setup`) before the build, because the app refuses to
  start without its database. The global setup (`e2e/global-setup.ts`) then empties the tables and
  stores the News fixtures (`e2e/news-fixtures.ts`) and the Opportunities fixtures
  (`e2e/opportunity-fixtures.ts`: score history relative to today, one closed opportunity) with
  times relative to that moment, and a successful `ingest-news` run and a successful `scores` run
  5 minutes ago. The database stays after the run; drop it when you
  no longer need it.
- Runs every test at two widths: 1280 px and 390 px, **with one worker**, one project after the
  other: tests that change the shared database (stale banner, a new article, "never ingested")
  reset it to the fixtures when they end.
- Tests change the data with `runDb(...)` from `e2e/db.ts` (`scripts/e2e-db.ts`: `fixtures
  --last-run=<minutes ago | ISO time | never> --no-articles --scores-run=<minutes ago | ISO time | never>
  --no-opportunities`, `add <headline>`).
- Fixtures depend on "today" (the WIB day). A run started in the first minutes after WIB midnight
  (00:00 to about 02:00) can miss "today" fixtures: times before midnight are moved to 00:01, so
  the order of the news items is then by id, and the stale test (3 hours ago) can fall on
  yesterday (the test expects the date form then).
- The "store unreachable" tests (`e2e/news.spec.ts`, `e2e/opportunities.spec.ts`) start nothing: the
  test renames the table the page reads (`runDb("break", "articles")` / `"opportunities"`) in its own
  e2e database, so the page's query fails the way it does when the store is down, and renames it back
  (`runDb("restore", ...)`, in a `finally`). Earlier they started a second server behind a TCP proxy,
  which was too slow and fragile on a busy machine.
- The skeleton tests use `expectSkeletonOnNavigation` (`e2e/skeleton.ts`): it repeats the whole
  sequence (fresh page, wait for the header link's prefetch, hold the data request, click) until the
  skeleton shows or 50 s are up. Without a `loading.tsx` it never shows, so the test still fails.
  A test that waits for a condition is robust under load; a fixed pause is not.
- **Seeing the error state by hand.** A server whose database is unreachable at start exits by design
  (`src/instrumentation.ts`), so pointing `DATABASE_URL` at a dead address no longer works. Point it at
  a database that is up but has none of the tables instead: `DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres
  pnpm exec next start -p <your port>` (the shared server's own `postgres` database), then open
  `/en/news`: the server starts, the page's queries fail, and the page shows the error state with
  no host, port or password in it. Never stop the shared Postgres container for this.
- The per-port e2e databases (`opportunity_radar_e2e_<port>_test`) are not dropped after a run. List
  them with `psql postgres://postgres@127.0.0.1:54329/postgres -c '\l'` and drop your own when you
  are done: `... -c 'drop database opportunity_radar_e2e_3329_test'`. `E2E_PORT` must be a whole number
  from 1 to 65000 (it names the database).
- Source status in the browser tests: `runDb("source-status", "<slug>", "403")` sets a source's status
  on the latest ingestion run (200 and 304 count as updated, anything else as not updated).
- Tests import `test` from `e2e/fixtures.ts`. That makes a test fail when the page logs a
  `console.error`, throws an uncaught error, or a request to the app's own origin fails or answers
  4xx/5xx.
- `e2e/smoke.spec.ts` contains one test that logs a console error on purpose and is expected to
  fail, so a normal run stays green. To see the real failure and a non-zero exit:
  `E2E_SHOW_FAILURE=1 pnpm test:e2e`.

### Test-only routes

`/en/dev/error` and `/id/dev/error` throw on purpose, so the error page can be checked. They work
under `pnpm dev`. In a production build they return 404 unless the server is started with
`ENABLE_TEST_ROUTES=1`; `pnpm test:e2e` sets that for its own server only. Never set it on a
deployed server.

### Upper-case locale (OR-55)

`e2e/locale-case.spec.ts` redirects `/EN`, `/Id/news`, `/%45N` (percent-encoded) and `/EN/` to the
lowercase path. Its restart test (a second server on `E2E_PORT + 3` gets those requests, is restarted,
and `/en`, `/id` must still answer 200) only proves something on a **case-insensitive file system**
such as macOS's default, where the cache file for `/EN` is the same file as the one for `/en`. On
Linux it passes trivially; the redirect tests do not depend on the file system.
