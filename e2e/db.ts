import { execFileSync } from "node:child_process";
import { retryOnDeadlock } from "./retry";

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Runs a command of scripts/e2e-db.ts against this run's own database and returns its output. */
export function runDb(...args: string[]): string {
  // `fixtures` truncates tables while a page request in flight may read them: Postgres then picks a victim
  // ("deadlock detected", 40P01) and one of the two dies. The command is safe to run again, so try a few
  // times, pausing a little longer each time (the request that held the lock is then usually done).
  return retryOnDeadlock(
    () =>
      execFileSync(
        process.execPath,
        ["--conditions=react-server", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/e2e-db.ts", ...args],
        { encoding: "utf8" },
      ),
    sleep,
  );
}

/** The default state: today's fixtures and a successful ingestion 5 minutes ago. */
export const resetFixtures = () => runDb("fixtures");
