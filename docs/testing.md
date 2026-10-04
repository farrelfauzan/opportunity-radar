# Testing

| Command | What it runs |
|---|---|
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen`, then `tsc --noEmit` |
| `pnpm test` | Unit tests and database integration tests (Vitest). Needs the local database (`pnpm db:up`). Does not start a browser |
| `pnpm test:e2e` | Browser smoke test (Playwright, Chromium) against a production build |
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
  shares one database server.
- `client-import.test.ts` builds a temporary copy of the app (`.tmp-client-import-*`, removed
  afterwards) with a Client Component that imports `@/server/data`, and asserts that `next build`
  fails. It takes about 10 seconds.

## Fixtures

Recorded upstream responses live in `tests/fixtures/<source>/<name>.<ext>`, for example
`tests/fixtures/antara/feed-2026-10-03.xml` or `tests/fixtures/yahoo/bbca-1y.json`. Read them with
`readFixture("<source>/<name>.<ext>")` from `tests/fixtures.ts`. Keep each file small (a few items)
and never put a key or token in one.

## Browser smoke test (`pnpm test:e2e`)

- Needs the local database (`pnpm db:up`): the server checks its database connection when it
  starts.
- Builds the app and starts it with `next start` on its own port: **3210**, or `E2E_PORT=<port>`.
  The server is stopped when the run ends, pass or fail.
- If something already listens on that port, the run stops with "http://localhost:3210 is already
  used". Free the port or pick another with `E2E_PORT`.
- Runs every test at two widths: 1280 px and 390 px.
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
