# Testing

| Command | What it runs |
|---|---|
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `next typegen`, then `tsc --noEmit` |
| `pnpm test` | Unit tests only (Vitest). Does not start a browser |
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
  "Network access is blocked in unit tests". Tests use recorded responses instead.
- Limit: unit tests cover plain modules (parsers, formatters, rules, calculators). `async` Server
  Components are not supported by Vitest; they are covered by the browser test.

## Fixtures

Recorded upstream responses live in `tests/fixtures/<source>/<name>.<ext>`, for example
`tests/fixtures/antara/feed-2026-10-03.xml` or `tests/fixtures/yahoo/bbca-1y.json`. Read them with
`readFixture("<source>/<name>.<ext>")` from `tests/fixtures.ts`. Keep each file small (a few items)
and never put a key or token in one.

## Browser smoke test (`pnpm test:e2e`)

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
