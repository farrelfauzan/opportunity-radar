// Where the browser tests keep their data. Plain Node only (no database driver, no
// import.meta): playwright.config.ts and the specs load it as well as scripts/e2e-db.ts.
import { existsSync } from "node:fs";

/** The port the browser tests serve the app on (E2E_PORT, default 3210). */
export const e2ePort = () => Number(process.env.E2E_PORT ?? 3210);

/**
 * The database the browser tests' server uses: the test database's server and
 * credentials, but its own database, named for the port so that runs on
 * different ports (other sessions, other worktrees) never share data.
 * The name always ends in "_test", so it can never be the development database.
 */
export function e2eDatabaseUrl(port = e2ePort()): string {
  // Run from the repository root, like every script in package.json.
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL is not set. Run \"pnpm db:setup\", or add it to .env.local.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid postgres:// URL. Check .env.local.");
  }
  url.pathname = `/opportunity_radar_e2e_${port}_test`;
  return url.href;
}
