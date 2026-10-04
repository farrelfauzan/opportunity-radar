import { finishJobRun, startJobRun, tryJobLock, type JobRun } from "@/server/data";
import { errorSummary } from "./redact.ts";

export type JobOutcome = {
  /** Only the job itself can report "partial"; the runner never does. */
  status?: "ok" | "partial";
  counts?: Record<string, number>;
  /** What went wrong in a partial run (stored redacted, like a thrown error). */
  error?: string;
};

export type Job = {
  /** A run that takes longer is marked failed and its lock is released. */
  timeoutSeconds: number;
  /** Jobs this one runs after when both are steps of the same pipeline. */
  after?: string[];
  run(context: { args: string[]; signal: AbortSignal }): Promise<JobOutcome | void>;
};

/** Runs its steps one after another, in the order their `after` declarations give. */
export type Pipeline = { steps: string[] };

export type Registry = Record<string, Job | Pipeline>;

export class UnknownJobError extends Error {
  validJobs: string[];
  constructor(name: string, validJobs: string[]) {
    super(`Unknown job "${name}"`);
    this.validJobs = validJobs;
  }
}

/** An error whose text the runner wrote itself (job names, timeouts): stored as it is. */
class RunnerError extends Error {}

export type RunOptions = {
  args?: string[];
  /** Overrides the job's own timeout. */
  timeoutSeconds?: number;
  /** Aborting it (SIGINT/SIGTERM) fails the run and releases the lock. */
  signal?: AbortSignal;
};

async function recordSkipped(name: string, reason: string): Promise<JobRun> {
  const run = await startJobRun(name);
  return finishJobRun(run.id, { status: "skipped", error: reason });
}

/** Steps ordered so that each one comes after the steps it declares in `after`. */
export function pipelineOrder(steps: string[], registry: Registry): string[] {
  const ordered: string[] = [];
  const visit = (step: string, path: string[]) => {
    if (ordered.includes(step)) return;
    if (path.includes(step)) throw new Error(`Pipeline steps depend on each other: ${[...path, step].join(" → ")}`);
    const job = Object.hasOwn(registry, step) ? registry[step] : undefined;
    if (!job || "steps" in job) throw new Error(`Pipeline step "${step}" is not a registered job`);
    for (const earlier of job.after ?? []) if (steps.includes(earlier)) visit(earlier, [...path, step]);
    ordered.push(step);
  };
  for (const step of steps) visit(step, []);
  return ordered;
}

async function runPipeline(pipeline: Pipeline, registry: Registry, options: RunOptions): Promise<JobOutcome> {
  const steps = pipelineOrder(pipeline.steps, registry);
  for (const [index, step] of steps.entries()) {
    const run = await runJob(step, registry, { signal: options.signal });
    if (run.status === "ok" || run.status === "partial") continue;
    for (const later of steps.slice(index + 1)) await recordSkipped(later, "previous step failed");
    throw new RunnerError(
      run.status === "skipped" ? `step "${step}" was skipped: ${run.error}` : `step "${step}" failed: ${run.error}`,
    );
  }
  return { counts: { steps: steps.length } };
}

function runWithLimits(job: Job, options: RunOptions): Promise<JobOutcome | void> {
  const seconds = options.timeoutSeconds ?? job.timeoutSeconds;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new RunnerError(`timed out after ${seconds} s`)), seconds * 1000);
  const forward = () => controller.abort(options.signal!.reason);
  if (options.signal?.aborted) forward();
  options.signal?.addEventListener("abort", forward);

  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(controller.signal.reason);
    if (controller.signal.aborted) fail();
    controller.signal.addEventListener("abort", fail);
  });
  const work = job.run({ args: options.args ?? [], signal: controller.signal });
  work.catch(() => {}); // a job that fails after its timeout must not crash the process

  return Promise.race([work, aborted]).finally(() => {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", forward);
  });
}

/**
 * Runs one job or pipeline and returns its job_runs record. Never throws for
 * a failing job: the failure is in the record. Throws UnknownJobError (and
 * writes nothing) when the name is not registered.
 */
export async function runJob(name: string, registry: Registry, options: RunOptions = {}): Promise<JobRun> {
  // hasOwn: "constructor", "toString" or "__proto__" are not jobs.
  const entry = Object.hasOwn(registry, name) ? registry[name] : undefined;
  if (!entry) throw new UnknownJobError(name, Object.keys(registry));

  // The lock lives on its own database session: if this process dies, even
  // with kill -9, the session ends and the lock is gone.
  const unlock = await tryJobLock(name);
  if (!unlock) return recordSkipped(name, "already running");

  try {
    const run = await startJobRun(name);
    try {
      const outcome =
        "steps" in entry ? await runPipeline(entry, registry, options) : await runWithLimits(entry, options);
      return await finishJobRun(run.id, {
        status: outcome?.status ?? "ok",
        counts: outcome?.counts,
        error: outcome?.error && errorSummary(outcome.error),
      });
    } catch (error) {
      // Whatever a job throws may quote its configuration, so it is redacted.
      const summary = error instanceof RunnerError ? error.message : errorSummary(error);
      return await finishJobRun(run.id, { status: "failed", error: summary });
    }
  } finally {
    await unlock();
  }
}
