// pnpm sources:health [--test]: one row per source with its last successful
// check, last status and the number of articles stored in the last 24 hours.
import { closeDb, sourceHealth } from "@/server/data";
import { loadEnv, testDatabaseUrl } from "./db-admin.ts";

loadEnv();
if (process.argv.includes("--test")) process.env.DATABASE_URL = testDatabaseUrl();

try {
  const rows = (await sourceHealth()).map((row) => ({
    source: row.slug,
    "last success (UTC)": row.lastSuccessAt?.toISOString().slice(0, 16).replace("T", " ") ?? "never",
    "last status": row.lastStatus ?? "not checked",
    "articles 24h": row.articles24h,
  }));
  console.table(rows);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
