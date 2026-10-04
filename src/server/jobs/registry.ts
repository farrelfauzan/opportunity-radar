import { ingestNews } from "@/server/news/ingest";
import type { Job, Registry } from "./runner.ts";

const production = process.env.NODE_ENV === "production";

/**
 * A pipeline step whose real job has not landed yet. Outside production,
 * STUB_FAIL=<step> makes that step fail, to test the pipeline.
 */
const stub = (name: string, after?: string[]): Job => ({
  timeoutSeconds: 60,
  after,
  async run() {
    if (!production && process.env.STUB_FAIL === name) throw new Error(`stub step "${name}" failed on request`);
  },
});

const sleep = (seconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, seconds * 1000);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** Jobs for testing the runner. Not registered in production. */
const testJobs: Registry = {
  noop: { timeoutSeconds: 60, async run() {} },
  sleep: {
    timeoutSeconds: 60,
    async run({ args, signal }) {
      const seconds = Number(args[0] ?? 1);
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Usage: pnpm job sleep <seconds>");
      await sleep(seconds, signal);
    },
  },
  fail: {
    timeoutSeconds: 60,
    async run({ args }) {
      throw new Error(args.join(" ") || "this job always fails");
    },
  },
};

export const jobs: Registry = {
  // RSS ingestion, meant to run every 30 minutes. 11 feeds in parallel, 10 s each.
  "ingest-news": { timeoutSeconds: 60, run: () => ingestNews() },
  // Morning pipeline: triage → opportunities → scores → brief. Each stub is
  // replaced by the real job when its ticket lands (OR-14, OR-15/OR-50, OR-16, OR-22).
  triage: stub("triage"),
  opportunities: stub("opportunities", ["triage"]),
  scores: stub("scores", ["opportunities"]),
  brief: stub("brief", ["scores"]),
  morning: { steps: ["triage", "opportunities", "scores", "brief"] },
  ...(production ? {} : testJobs),
};
