import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

// TEST_DATABASE_URL for the integration tests; variables already set win.
if (existsSync(path("./.env.local"))) process.loadEnvFile(path("./.env.local"));

const alias = {
  "@/": path("./src/"),
  // Outside the Next.js bundler "server-only" throws on import; tests run on the server side.
  "server-only": path("./tests/server-only.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
          setupFiles: ["./tests/setup.ts"],
          alias,
        },
      },
      {
        // Needs the local database (pnpm db:up). Uses the test database only.
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["./tests/integration/global-setup.ts"],
          setupFiles: ["./tests/integration/setup.ts"],
          fileParallelism: false,
          // Many sessions share this machine and its load average can pass 20: a test that inserts
          // a few dozen rows then takes more than Vitest's 5 s default. When one times out, its
          // leftover work runs into the next test's truncate (a deadlock), so one slow test shows as two.
          testTimeout: 60_000,
          hookTimeout: 60_000,
          alias,
        },
      },
    ],
  },
});
