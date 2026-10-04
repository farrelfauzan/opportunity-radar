import { defineConfig } from "@playwright/test";

// The smoke test builds and starts its own production server on its own port,
// so it never collides with a dev server on 3000. Override with E2E_PORT.
const port = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  use: { baseURL, browserName: "chromium" },
  projects: [
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
    { name: "phone-390", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${port}`,
    url: baseURL,
    // Turns on /[locale]/dev/error, which is a 404 in a normal production run.
    env: { ENABLE_TEST_ROUTES: "1" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
