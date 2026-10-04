import { callLlm } from "@/server/llm/client";
import { ingestNews } from "@/server/news/ingest";
import { generateOpportunities } from "@/server/opportunities/generate";
import { scoreOpportunities } from "@/server/opportunities/score";
import { triageNews } from "@/server/news/triage";
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

/**
 * A morning step that, outside production, fails on request with STUB_FAIL=<step>,
 * so the pipeline's stop-on-failure can be shown from the command line (OR-7 AC).
 */
const step = (name: string, job: Job): Job => ({
  ...job,
  async run(context) {
    if (!production && process.env.STUB_FAIL === name) throw new Error("failed on request (STUB_FAIL)");
    return job.run(context);
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

/** One tiny LLM call through the client: mock by default, the live check for OR-52. */
const llmSmoke: Job = {
  timeoutSeconds: 180,
  async run() {
    await callLlm({
      job: "llm-smoke",
      role: "triage",
      messages: [
        { role: "system", content: "You answer with JSON only." },
        { role: "user", content: 'Reply with exactly {"ok":true,"reply":"pong"}' },
      ],
      parse: (value) => {
        if ((value as { ok?: unknown } | null)?.ok !== true) throw new Error('expected {"ok":true}');
        return value;
      },
      maxTokens: 50,
    });
    return { counts: { calls: 1 } };
  },
};

export const jobs: Registry = {
  // RSS ingestion, meant to run every 30 minutes. active feeds in parallel, 10 s each.
  "ingest-news": { timeoutSeconds: 60, run: () => ingestNews() },
  "llm-smoke": llmSmoke,
  // Morning pipeline: triage → opportunities → scores → brief. Each stub is
  // replaced by the real job when its ticket lands (OR-14, OR-15/OR-50, OR-16, OR-22).
  // OR-14. Also the second step of `news` (ingest, then triage), the command to run every 30 minutes.
  triage: step("triage", { timeoutSeconds: 600, after: ["ingest-news"], run: () => triageNews() }),
  news: { steps: ["ingest-news", "triage"] },
  // OR-15 (matching, update and close come with OR-50).
  opportunities: step("opportunities", { timeoutSeconds: 600, after: ["triage"], run: () => generateOpportunities() }),
  // OR-16: re-score open opportunities with new evidence.
  scores: step("scores", { timeoutSeconds: 900, after: ["opportunities"], run: () => scoreOpportunities() }),
  brief: stub("brief", ["scores"]),
  morning: { steps: ["triage", "opportunities", "scores", "brief"] },
  ...(production ? {} : testJobs),
};
