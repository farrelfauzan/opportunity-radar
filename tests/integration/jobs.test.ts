import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { lastSuccessfulRun } from "@/server/data";
import { db } from "@/server/data/client";
import { jobs } from "@/server/jobs/registry";
import { pipelineOrder, runJob, UnknownJobError, type Registry } from "@/server/jobs/runner";

const root = fileURLToPath(new URL("../../", import.meta.url));

type Row = { job: string; status: string; error: string | null; started_at: Date; finished_at: Date | null };
const runs = async () =>
  (await db().execute(sql`select job, status, error, started_at, finished_at from job_runs order by id`)) as unknown as Row[];

const untilRunning = async () => {
  for (let i = 0; i < 200; i++) {
    if ((await runs()).some((r) => r.status === "running")) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("the job never started");
};

beforeEach(async () => {
  await db().execute(sql`truncate job_runs restart identity`);
});

describe("runner", () => {
  test("a run is recorded with a finish time after its start", async () => {
    const run = await runJob("noop", jobs);
    expect(run).toMatchObject({ job: "noop", status: "ok", error: null });
    expect(run.finishedAt!.getTime()).toBeGreaterThanOrEqual(run.startedAt.getTime());
  });

  test("the record exists while the job is still running", async () => {
    const stop = new AbortController();
    const running = runJob("sleep", jobs, { args: ["30"], signal: stop.signal });
    await untilRunning();
    expect(await runs()).toMatchObject([{ job: "sleep", status: "running", finished_at: null }]);
    stop.abort(new Error("stopped by the test"));
    await running;
  });

  test("two starts of the same job: one runs, the other is skipped and does no work", async () => {
    let worked = 0;
    const registry: Registry = {
      slow: {
        timeoutSeconds: 5,
        async run() {
          worked++;
          await new Promise((resolve) => setTimeout(resolve, 300));
        },
      },
    };
    const results = await Promise.all([runJob("slow", registry), runJob("slow", registry)]);

    expect(results.map((r) => r.status).sort()).toEqual(["ok", "skipped"]);
    expect(results.find((r) => r.status === "skipped")!.error).toBe("already running");
    expect(worked).toBe(1);
  });

  test("two different jobs run in parallel", async () => {
    const results = await Promise.all([runJob("sleep", jobs, { args: ["0.2"] }), runJob("noop", jobs)]);
    expect(results.map((r) => r.status)).toEqual(["ok", "ok"]);
  });

  test("a run past its timeout is failed, and the lock is free for the next run", async () => {
    const timedOut = await runJob("sleep", jobs, { args: ["5"], timeoutSeconds: 0.2 });
    expect(timedOut).toMatchObject({ status: "failed", error: "timed out after 0.2 s" });

    expect((await runJob("sleep", jobs, { args: ["0"] })).status).toBe("ok");
  });

  test("an aborted run (SIGINT/SIGTERM) is failed and releases the lock", async () => {
    const interrupt = new AbortController();
    const running = runJob("sleep", jobs, { args: ["5"], signal: interrupt.signal });
    setTimeout(() => interrupt.abort(new Error("interrupted by SIGTERM")), 100);

    expect(await running).toMatchObject({ status: "failed", error: "interrupted by SIGTERM" });
    expect((await runJob("sleep", jobs, { args: ["0"] })).status).toBe("ok");
  });

  test("a thrown error is stored with env values redacted", async () => {
    process.env.CANARY_SECRET = "abc123";
    try {
      const run = await runJob("fail", jobs, { args: ["upstream said abc123"] });
      expect(run.status).toBe("failed");
      expect(run.error).toBe("upstream said [redacted]");
    } finally {
      delete process.env.CANARY_SECRET;
    }
  });

  test("only the job itself reports partial, with its counts", async () => {
    const registry: Registry = {
      some: { timeoutSeconds: 5, run: async () => ({ status: "partial", counts: { ok: 11, failed: 1 } }) },
    };
    expect(await runJob("some", registry)).toMatchObject({ status: "partial", counts: { ok: 11, failed: 1 } });
  });

  test.each(["nope", "constructor", "toString", "__proto__", "hasOwnProperty"])(
    "an unknown job (%s) throws, lists the valid jobs and writes no record",
    async (name) => {
      const error = await runJob(name, jobs).catch((e) => e);
      expect(error).toBeInstanceOf(UnknownJobError);
      expect(error.validJobs).toContain("morning");
      expect(await runs()).toEqual([]);
    },
  );

  test("finish times come from the same clock as start times", async () => {
    for (let i = 0; i < 20; i++) await runJob("noop", jobs);
    const rows = await db().execute(sql`select count(*) as n from job_runs where finished_at < started_at`);
    expect(Number(rows[0].n)).toBe(0);
  });
});

describe("pipeline", () => {
  const steps = (failing?: string) => {
    const ran: string[] = [];
    const step = (name: string, after?: string[]) => ({
      timeoutSeconds: 5,
      after,
      async run() {
        ran.push(name);
        if (name === failing) throw new Error(`${name} broke`);
      },
    });
    const registry: Registry = {
      // Declared out of order on purpose: the order comes from `after`.
      third: step("third", ["second"]),
      first: step("first"),
      second: step("second", ["first"]),
      pipeline: { steps: ["third", "second", "first"] },
    };
    return { ran, registry };
  };

  test("steps run in the order their `after` declarations give", async () => {
    const { ran, registry } = steps();
    const run = await runJob("pipeline", registry);

    expect(ran).toEqual(["first", "second", "third"]);
    expect(run).toMatchObject({ status: "ok", counts: { steps: 3 } });
    // Each step starts after the one before it has finished.
    const [, first, second, third] = await runs();
    const time = (value: Date | null) => new Date(value!).getTime();
    expect(time(second.started_at)).toBeGreaterThanOrEqual(time(first.finished_at));
    expect(time(third.started_at)).toBeGreaterThanOrEqual(time(second.finished_at));
  });

  test("a failing step stops the pipeline; later steps are skipped with the reason", async () => {
    const { ran, registry } = steps("second");
    const run = await runJob("pipeline", registry);

    expect(ran).toEqual(["first", "second"]);
    expect(run).toMatchObject({ status: "failed", error: 'step "second" failed: second broke' });
    expect((await runs()).map((r) => [r.job, r.status, r.error])).toEqual([
      ["pipeline", "failed", 'step "second" failed: second broke'],
      ["first", "ok", null],
      ["second", "failed", "second broke"],
      ["third", "skipped", "previous step failed"],
    ]);
  });

  test("a pipeline does not overlap itself", async () => {
    const { registry } = steps();
    const results = await Promise.all([runJob("pipeline", registry), runJob("pipeline", registry)]);
    expect(results.map((r) => r.status).sort()).toEqual(["ok", "skipped"]);
  });

  test("the morning pipeline is triage → opportunities → scores → ventures → brief", () => {
    const morning = jobs.morning as { steps: string[] };
    expect(pipelineOrder([...morning.steps].reverse(), jobs)).toEqual(["triage", "opportunities", "scores", "ventures", "brief"]);
  });

  test("steps that depend on each other are an error, not an endless loop", () => {
    const loop: Registry = {
      a: { timeoutSeconds: 1, after: ["b"], run: async () => {} },
      b: { timeoutSeconds: 1, after: ["a"], run: async () => {} },
    };
    expect(() => pipelineOrder(["a", "b"], loop)).toThrow("depend on each other");
  });
});

describe("lastSuccessfulRun", () => {
  test("is the latest finished ok or partial run; failed, skipped and running are ignored", async () => {
    await db().execute(sql`
      insert into job_runs (job, status, started_at, finished_at) values
        ('ingest-news', 'ok',      '2026-10-03T00:00:00Z', '2026-10-03T00:00:00Z'),
        ('ingest-news', 'partial', '2026-10-03T01:00:00Z', '2026-10-03T01:00:00Z'),
        ('ingest-news', 'failed',  '2026-10-03T02:00:00Z', '2026-10-03T02:00:00Z'),
        ('ingest-news', 'skipped', '2026-10-03T02:30:00Z', '2026-10-03T02:30:00Z'),
        ('ingest-news', 'running', '2026-10-03T03:00:00Z', null),
        ('other-job',   'ok',      '2026-10-03T04:00:00Z', '2026-10-03T04:00:00Z')`);

    expect(await lastSuccessfulRun("ingest-news")).toEqual(new Date("2026-10-03T01:00:00Z"));
    expect(await lastSuccessfulRun("never-ran")).toBeNull();
  });
});

// The real command, on plain Node outside Next.js, against the test database.
// Each test spawns Node processes; on a busy machine one start-up takes seconds.
describe("pnpm job", { timeout: 60_000 }, () => {
  const [node, ...nodeArgs] = JSON.parse(readFileSync(`${root}package.json`, "utf8")).scripts.job.split(" ");
  const env = { ...process.env, NODE_ENV: undefined } as unknown as NodeJS.ProcessEnv;
  const job = (args: string[], extraEnv: Record<string, string> = {}) =>
    spawnSync(node, [...nodeArgs, ...args], { cwd: root, encoding: "utf8", env: { ...env, ...extraEnv } });
  const start = (args: string[]) => spawn(node, [...nodeArgs, ...args], { cwd: root, env });
  const exited = (child: ReturnType<typeof start>) =>
    new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));

  test("noop runs once and writes a record (server-only and @/ resolve)", async () => {
    const result = job(["noop"]);
    expect(result.stdout).toContain("noop: ok");
    expect(result.status).toBe(0);
    expect(await runs()).toMatchObject([{ job: "noop", status: "ok" }]);
  });

  test.each(["nope", "constructor"])("an unknown job (%s) exits non-zero, lists the valid jobs and writes nothing", async (name) => {
    const result = job([name]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Unknown job "${name}". Valid jobs: ingest-news, llm-smoke, prices, metals, crypto, triage, news, opportunities, scores, ventures, brief, morning`);
    expect(await runs()).toEqual([]);
  });

  test("the test jobs are not registered in production", () => {
    const result = job(["noop"], { NODE_ENV: "production" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Valid jobs: ingest-news, llm-smoke, prices, metals, crypto, triage, news, opportunities, scores, ventures, brief, morning\n");
  });

  test("a failed job exits non-zero with the canary redacted", async () => {
    const result = job(["fail", "boom", "abc123"], { CANARY_SECRET: "abc123" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("abc123");
    expect(await runs()).toMatchObject([{ job: "fail", status: "failed", error: "boom [redacted]" }]);
  });

  test.each([["abc"], ["-1"], ["0"], ["Infinity"], [undefined]])(
    "--timeout %s is refused with exit code 2 and nothing recorded",
    async (value) => {
      const result = job(["sleep", "0", "--timeout", ...(value === undefined ? [] : [value])]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("--timeout needs a number of seconds greater than 0");
      expect(await runs()).toEqual([]);
    },
  );

  test("a timeout fails the run and exits non-zero; the next run works", async () => {
    expect(job(["sleep", "5", "--timeout", "1"]).status).not.toBe(0);
    expect(job(["sleep", "0"]).status).toBe(0);
    expect((await runs()).map((r) => [r.status, r.error])).toEqual([
      ["failed", "timed out after 1 s"],
      ["ok", null],
    ]);
  });

  test("a second process while the first runs: one ok, one skipped, both exit 0", async () => {
    // 20 s: under load a second Node process can take ~10 s to start, and it must
    // arrive while the first still runs.
    const first = start(["sleep", "20"]);
    await untilRunning(); // not a fixed wait: process start-up time varies under load
    const second = job(["sleep", "3"]);

    expect(second.stdout).toContain("sleep: skipped (already running)");
    expect(second.status).toBe(0);
    expect(await exited(first)).toBe(0);
    expect((await runs()).map((r) => r.status)).toEqual(["ok", "skipped"]);
  });

  test("the morning pipeline with a failing second step", async () => {
    // The steps are real jobs (nothing to do on an empty store); STUB_FAIL makes one fail outside production.
    const result = job(["morning"], { STUB_FAIL: "scores" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('morning: failed (step "scores" failed');
    expect((await runs()).map((r) => [r.job, r.status])).toEqual([
      ["morning", "failed"],
      ["triage", "ok"],
      ["opportunities", "ok"],
      ["scores", "failed"],
      ["ventures", "skipped"],
      ["brief", "skipped"],
    ]);
  });

  test("SIGTERM marks the run failed and exits non-zero", async () => {
    const child = start(["sleep", "30"]);
    await untilRunning();
    child.kill("SIGTERM");

    expect(await exited(child)).toBe(1);
    expect(await runs()).toMatchObject([{ status: "failed", error: "interrupted by SIGTERM" }]);
  });

  test("after kill -9 the lock is gone with the session, so the next start runs", async () => {
    const child = start(["sleep", "30"]);
    await untilRunning();
    child.kill("SIGKILL");
    await exited(child);

    expect(job(["sleep", "0"]).stdout).toContain("sleep: ok");
    // The killed run could not record its end: it stays as the crash record.
    expect((await runs()).map((r) => r.status)).toEqual(["running", "ok"]);
  });
});
