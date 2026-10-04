import { defineConfig } from "@playwright/test";
import { e2eDatabaseUrl, e2ePort } from "./scripts/e2e-env.ts";

// The browser tests build and start their own production server on its own port,
// so it never collides with a dev server on 3000. Override with E2E_PORT.
const port = e2ePort();
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  reporter: "list",
  // Many sessions share this machine and its load average can pass 20: a test that starts a
  // second server (the "store unreachable" ones) then takes over 30 s, Playwright's default.
  timeout: 60_000,
  // One worker: tests that change the shared test database (stale banner, new article, and the
  // "store unreachable" tests that rename a table with `runDb("break", ...)`) must not run beside
  // others, and the two viewport projects run one after the other.
  workers: 1,
  use: { baseURL, browserName: "chromium" },
  projects: [
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
    { name: "phone-390", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    // The server starts only when its database exists (see src/instrumentation.ts), so it is created first.
    command: `node --conditions=react-server --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/e2e-db.ts setup && pnpm exec next build && pnpm exec next start -p ${port}`,
    url: baseURL,
    env: {
      // Turns on /[locale]/dev/error, which is a 404 in a normal production run.
      ENABLE_TEST_ROUTES: "1",
      // The server uses its own database, never the development one.
      DATABASE_URL: e2eDatabaseUrl(port),
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
