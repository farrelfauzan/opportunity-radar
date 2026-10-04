import { and, desc, eq, inArray, isNotNull, sql as sqlTag } from "drizzle-orm";
import { db, sql } from "./client.ts";
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
    // The database clock, like started_at: the host and container clocks can differ.
    .set({ ...result, finishedAt: sqlTag`now()` })
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

/**
 * When the job last finished with status ok or partial (a UTC instant), or
 * null. Failed, skipped and still-running runs are ignored.
 */
export async function lastSuccessfulRun(job: string): Promise<Date | null> {
  const [row] = await db()
    .select({ finishedAt: jobRuns.finishedAt })
    .from(jobRuns)
    .where(and(eq(jobRuns.job, job), inArray(jobRuns.status, ["ok", "partial"]), isNotNull(jobRuns.finishedAt)))
    .orderBy(desc(jobRuns.finishedAt))
    .limit(1);
  return row?.finishedAt ?? null;
}

const JOB_LOCK_CLASS = 7; // first key of the two-key advisory lock; the second is the job name's hash

/**
 * Takes the job's overlap lock, or returns null when another run holds it.
 * The lock belongs to its own database session: call the returned function to
 * release it; if the process dies the session ends and Postgres releases it.
 */
export async function tryJobLock(job: string): Promise<(() => Promise<void>) | null> {
  const session = await sql().reserve();
  const [{ locked }] = await session`select pg_try_advisory_lock(${JOB_LOCK_CLASS}, hashtext(${job})) as locked`;
  if (!locked) {
    session.release();
    return null;
  }
  return async () => {
    await session`select pg_advisory_unlock(${JOB_LOCK_CLASS}, hashtext(${job}))`;
    session.release();
  };
}
