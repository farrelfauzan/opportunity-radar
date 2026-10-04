import { execFileSync } from "node:child_process";

/** Runs a command of scripts/e2e-db.ts against this run's own database and returns its output. */
export function runDb(...args: string[]): string {
  return execFileSync(
    process.execPath,
    ["--conditions=react-server", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/e2e-db.ts", ...args],
    { encoding: "utf8" },
  );
}

/** The default state: today's fixtures and a successful ingestion 5 minutes ago. */
export const resetFixtures = () => runDb("fixtures");
