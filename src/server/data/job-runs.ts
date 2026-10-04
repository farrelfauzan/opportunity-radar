import { eq } from "drizzle-orm";
import { db } from "./client.ts";
import { jobRuns, type JobStatus } from "./schema.ts";

export type JobRun = typeof jobRuns.$inferSelect;

/** Writes the run record when the job starts, so a crashed job still leaves one. */
export async function startJobRun(job: string): Promise<JobRun> {
  const [row] = await db().insert(jobRuns).values({ job }).returning();
  return row;
}

export async function finishJobRun(
  id: number,
  result: { status: Exclude<JobStatus, "running">; counts?: Record<string, number>; error?: string },
): Promise<JobRun> {
  const [row] = await db()
    .update(jobRuns)
    .set({ ...result, finishedAt: new Date() })
    .where(eq(jobRuns.id, id))
    .returning();
  if (!row) throw new Error(`No job run with id ${id}`);
  return row;
}

/** Records a finished, successful run at a chosen time (QA: stale-data states). */
export async function recordSuccessfulRun(job: string, at: Date): Promise<JobRun> {
  const [row] = await db()
    .insert(jobRuns)
    .values({ job, status: "ok", startedAt: at, finishedAt: at })
    .returning();
  return row;
}
