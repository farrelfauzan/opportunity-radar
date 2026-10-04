// The only door to the store. Pages, route handlers and jobs import from
// "@/server/data"; nothing else touches the database client. Importing this
// from a Client Component fails the build (tests/integration/client-import.test.ts).
import "server-only";

export { checkConnection, closeDb } from "./client.ts";
export { REGIONS, CATEGORIES, JOB_STATUSES, SECTORS } from "./schema.ts";
export type { Region, Category, JobStatus, Sector, FactorScores } from "./schema.ts";
export * from "./articles.ts";
export * from "./sources.ts";
export * from "./job-runs.ts";
export * from "./ventures.ts";
