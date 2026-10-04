// pnpm job <name> [args] [--timeout <seconds>] [--test]
// The only way to start a job. Runs on plain Node, outside Next.js (see package.json).
import { closeDb } from "@/server/data";
import { jobs } from "@/server/jobs/registry";
import { runJob, UnknownJobError } from "@/server/jobs/runner";
import { loadEnv, testDatabaseUrl } from "./db-admin.ts";

const argv = process.argv.slice(2);
const flag = (name: string, takesValue: boolean): string | undefined => {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv.splice(index, takesValue ? 2 : 1)[takesValue ? 1 : 0];
};

async function main(): Promise<number> {
  loadEnv();
  if (flag("--test", false)) process.env.DATABASE_URL = testDatabaseUrl();
  const timeout = flag("--timeout", true);
  const [name, ...args] = argv;

  const interrupt = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => interrupt.abort(new Error(`interrupted by ${signal}`)));
  }

  try {
    const run = await runJob(name ?? "", jobs, {
      args,
      timeoutSeconds: timeout === undefined ? undefined : Number(timeout),
      signal: interrupt.signal,
    });
    console.log(`${run.job}: ${run.status}${run.error ? ` (${run.error})` : ""}`);
    return run.status === "failed" ? 1 : 0;
  } catch (error) {
    if (!(error instanceof UnknownJobError)) throw error;
    console.error(`${name ? error.message : "Usage: pnpm job <name>"}. Valid jobs: ${error.validJobs.join(", ")}`);
    return 1;
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    return 1;
  })
  // exit() rather than waiting: a timed-out job may still be holding the event loop.
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  });
