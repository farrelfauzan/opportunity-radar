import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { liveUsageThisMonth, recordLlmUsage, wibMonthStart } from "@/server/data";
import { db } from "@/server/data/client";
import { BudgetExhaustedError, callLlm, InvalidOutputError, LlmConfigError, LlmInputError, LlmRequestError } from "@/server/llm/client";

const root = fileURLToPath(new URL("../../", import.meta.url));
const KEY = "sk-test-canary-1234567890";

const LIVE = {
  LLM_PROVIDER: "live",
  LLM_BASE_URL: "https://router.test/v1",
  LLM_API_KEY: KEY,
  LLM_MODEL_TRIAGE: "triage-model",
  LLM_MODEL_REPORT: "report-model",
  LLM_MONTHLY_TOKEN_CAP: "100000",
};
const LLM_VARS = [...Object.keys(LIVE), "LLM_PRICE_TRIAGE_IN", "LLM_PRICE_TRIAGE_OUT", "LLM_MONTHLY_BUDGET_USD"];

const setEnv = (env: Record<string, string>) => Object.assign(process.env, env);

type Reply = { status?: number; content?: string; usage?: object | null; headers?: Record<string, string>; error?: string };

/** A fake OpenAI-compatible endpoint: answers in order and records every request. */
function provider(...replies: Reply[]) {
  const requests: { url: string; headers: Record<string, string>; body: { model: string; messages: unknown[] } }[] = [];
  const transport = (async (url: string, init?: RequestInit) => {
    requests.push({ url, headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    const reply = replies[requests.length - 1] ?? replies[replies.length - 1];
    if (reply.status && reply.status !== 200) {
      return Response.json({ error: { message: reply.error ?? "provider error" } }, { status: reply.status, headers: reply.headers });
    }
    const usage = reply.usage === null ? {} : { usage: reply.usage ?? { prompt_tokens: 20, completion_tokens: 5 } };
    return Response.json({ choices: [{ message: { role: "assistant", content: reply.content } }], ...usage });
  }) as typeof fetch;
  return { transport, requests };
}

const isOk = (value: unknown) => {
  if ((value as { ok?: unknown } | null)?.ok !== true) throw new Error('expected {"ok":true}');
  return value as { ok: true };
};
const ask = (transport?: typeof fetch, job = "test-job") =>
  callLlm({ job, role: "triage", messages: [{ role: "user", content: "Say ok" }], parse: isOk, fetch: transport });

const usageRows = async () =>
  (await db().execute(
    sql`select job, provider, model, status, input_tokens, output_tokens, usage_estimated, cost_usd from llm_usage order by id`,
  )) as unknown as Record<string, unknown>[];

beforeEach(async () => {
  await db().execute(sql`truncate llm_usage`);
  for (const name of LLM_VARS) delete process.env[name];
});
afterEach(() => {
  for (const name of LLM_VARS) delete process.env[name];
  vi.restoreAllMocks();
});

describe("output checking", () => {
  test("invalid JSON once: retried once, the valid result is returned and both calls recorded", async () => {
    setEnv(LIVE);
    const { transport, requests } = provider({ content: "not json" }, { content: '{"ok":true}' });

    expect(await ask(transport)).toEqual({ ok: true });
    expect(requests).toHaveLength(2);
    expect((await usageRows()).map((r) => r.status)).toEqual(["invalid_output", "ok"]);
  });

  test("invalid twice: a typed failure the job can mark its item failed with", async () => {
    setEnv(LIVE);
    const { transport, requests } = provider({ content: '{"ok":false}' });

    await expect(ask(transport)).rejects.toBeInstanceOf(InvalidOutputError);
    expect(requests).toHaveLength(2);
    expect((await usageRows()).map((r) => r.status)).toEqual(["invalid_output", "invalid_output"]);
  });

  test("a reply in one ```json fence is accepted", async () => {
    setEnv(LIVE);
    expect(await ask(provider({ content: '```json\n{"ok":true}\n```' }).transport)).toEqual({ ok: true });
  });
});

describe("provider errors", () => {
  test("429 then 200: one retry after the backoff", async () => {
    setEnv(LIVE);
    const { transport, requests } = provider({ status: 429, headers: { "retry-after": "1" } }, { content: '{"ok":true}' });

    const started = Date.now();
    expect(await ask(transport)).toEqual({ ok: true });
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(requests).toHaveLength(2);
    expect((await usageRows()).map((r) => r.status)).toEqual(["ok"]);
  });

  test("5xx twice: fails after one retry and records the error", async () => {
    setEnv(LIVE);
    const { transport, requests } = provider({ status: 503 });

    await expect(ask(transport)).rejects.toThrow(new LlmRequestError("LLM request failed: HTTP 503: provider error"));
    expect(requests).toHaveLength(2);
    expect((await usageRows()).map((r) => r.status)).toEqual(["error"]);
  });

  test("4xx is not retried, and a key echoed by the provider is redacted", async () => {
    setEnv(LIVE);
    const { transport, requests } = provider({ status: 401, error: `invalid key ${KEY}` });

    const error = await ask(transport).catch((e) => e);
    expect(error.message).toBe("LLM request failed: HTTP 401: invalid key [redacted]");
    expect(requests).toHaveLength(1);
  });
});

describe("usage log", () => {
  test("every call records job, model and token counts; cost from the configured prices", async () => {
    setEnv({ ...LIVE, LLM_PRICE_TRIAGE_IN: "1", LLM_PRICE_TRIAGE_OUT: "4" });
    await ask(provider({ content: '{"ok":true}', usage: { prompt_tokens: 1000, completion_tokens: 500 } }).transport);

    expect(await usageRows()).toEqual([
      {
        job: "test-job",
        provider: "live",
        model: "triage-model",
        status: "ok",
        input_tokens: 1000,
        output_tokens: 500,
        usage_estimated: false,
        cost_usd: 0.003, // 1000 × $1/M + 500 × $4/M
      },
    ]);
  });

  test("without prices the cost is unknown; without usage the tokens are estimated and flagged", async () => {
    setEnv(LIVE);
    await ask(provider({ content: '{"ok":true}', usage: null }).transport);

    const [row] = await usageRows();
    expect(row).toMatchObject({ cost_usd: null, usage_estimated: true, input_tokens: 2, output_tokens: 3 });
  });
});

describe("monthly cap", () => {
  test("token cap reached in the middle of a job: the next call is not made and logs budget_exhausted", async () => {
    setEnv({ ...LIVE, LLM_MONTHLY_TOKEN_CAP: "100" });
    const { transport, requests } = provider({ content: '{"ok":true}', usage: { prompt_tokens: 80, completion_tokens: 30 } });

    await ask(transport); // 110 tokens: the cap is now reached
    await expect(ask(transport)).rejects.toBeInstanceOf(BudgetExhaustedError);

    expect(requests).toHaveLength(1);
    expect((await usageRows()).map((r) => r.status)).toEqual(["ok", "budget_exhausted"]);
  });

  test("USD budget reached before the job starts: no provider call", async () => {
    setEnv({ ...LIVE, LLM_PRICE_TRIAGE_IN: "1", LLM_PRICE_TRIAGE_OUT: "1", LLM_MONTHLY_BUDGET_USD: "5" });
    delete process.env.LLM_MONTHLY_TOKEN_CAP;
    await recordLlmUsage({ job: "earlier", role: "report", provider: "live", model: "m", costUsd: 5, status: "ok" });
    const { transport, requests } = provider({ content: '{"ok":true}' });

    await expect(ask(transport)).rejects.toThrow("budget_exhausted: 5.00 of 5 USD used this month");
    expect(requests).toHaveLength(0);
  });

  test("only this WIB month's live calls count; mock calls cost nothing", async () => {
    const lastMonth = new Date(wibMonthStart().getTime() - 1000);
    await db().execute(sql`insert into llm_usage (job, role, provider, model, input_tokens, output_tokens, cost_usd, status, created_at)
      values ('old', 'triage', 'live', 'm', 1000, 1000, 9, 'ok', ${lastMonth.toISOString()}),
             ('mock', 'triage', 'mock', 'm', 1000, 1000, null, 'ok', now()),
             ('now', 'triage', 'live', 'm', 10, 5, 0.5, 'ok', now())`);
    expect(await liveUsageThisMonth()).toEqual({ costUsd: 0.5, tokens: 15 });
  });

  test("the WIB month starts at 00:00 WIB on the 1st", () => {
    expect(wibMonthStart(new Date("2026-09-30T17:00:00Z")).toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(wibMonthStart(new Date("2026-09-30T16:59:59Z")).toISOString()).toBe("2026-08-31T17:00:00.000Z");
  });
});

describe("review follow-ups (OR-13 → OR-14)", () => {
  test("5 parallel calls against a tiny token cap do not all go through", async () => {
    setEnv({ ...LIVE, LLM_MONTHLY_TOKEN_CAP: "100" });
    const { transport, requests } = provider({ content: '{"ok":true}', usage: { prompt_tokens: 2, completion_tokens: 40 } });
    const call = () =>
      callLlm({ job: "par", role: "triage", messages: [{ role: "user", content: "Say ok" }], parse: isOk, maxTokens: 40, fetch: transport });

    const results = await Promise.allSettled([call(), call(), call(), call(), call()]);

    // Each call reserves 2 input + 40 output tokens, so at most two fit under 100. Reservations
    // are made before the usage is read, which is conservative: near the cap a call may be
    // refused although it would have fitted, but the cap is never overshot.
    const passed = results.filter((r) => r.status === "fulfilled").length;
    expect(passed).toBeGreaterThanOrEqual(1);
    expect(passed).toBeLessThanOrEqual(2);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof BudgetExhaustedError)).toHaveLength(5 - passed);
    expect(requests).toHaveLength(passed);
  });

  test("a failure to record still releases the reservation", async () => {
    setEnv({ ...LIVE, LLM_MONTHLY_TOKEN_CAP: "100" });
    const { transport } = provider({ content: '{"ok":true}', usage: { prompt_tokens: 1, completion_tokens: 1 } });
    // A model name the llm_usage CHECKs cannot fail on, but a role they refuse: recording throws.
    const failing = callLlm({ job: "rec", role: "bogus" as never, messages: [{ role: "user", content: "x" }], parse: isOk, maxTokens: 60, fetch: transport });
    await expect(failing).rejects.toThrow();
    // The 61 reserved tokens are free again: a call reserving 61 more fits under 100.
    const next = callLlm({ job: "rec", role: "triage", messages: [{ role: "user", content: "x" }], parse: isOk, maxTokens: 60, fetch: transport });
    await expect(next).resolves.toEqual({ ok: true });
  });

  test("reservations are released: after the parallel calls finish, a later call is judged on recorded usage", async () => {
    setEnv({ ...LIVE, LLM_MONTHLY_TOKEN_CAP: "1000" });
    const { transport } = provider({ content: '{"ok":true}', usage: { prompt_tokens: 2, completion_tokens: 5 } });
    const call = () =>
      callLlm({ job: "rel", role: "triage", messages: [{ role: "user", content: "Say ok" }], parse: isOk, maxTokens: 400, fetch: transport });
    await Promise.all([call(), call()]);
    await expect(call()).resolves.toEqual({ ok: true }); // 14 used + 402 reserved < 1000
  });

  test.each(["http://router.example.com/v1", "http://8.8.8.8/v1"])("plain http to a public host (%s) is refused", async (url) => {
    setEnv({ ...LIVE, LLM_BASE_URL: url });
    const { transport, requests } = provider({ content: '{"ok":true}' });
    await expect(ask(transport)).rejects.toThrow("LLM_BASE_URL must use https");
    expect(requests).toHaveLength(0);
  });

  test.each(["http://localhost:11434/v1", "http://127.0.0.1:8080/v1", "http://192.168.1.20/v1", "https://router.example.com/v1"])(
    "%s is allowed",
    async (url) => {
      setEnv({ ...LIVE, LLM_BASE_URL: url });
      await expect(ask(provider({ content: '{"ok":true}' }).transport)).resolves.toEqual({ ok: true });
    },
  );

  test("a 200 reply that is not JSON is a request error", async () => {
    setEnv(LIVE);
    const transport = (async () => new Response("<html>gateway</html>", { status: 200 })) as unknown as typeof fetch;
    await expect(ask(transport)).rejects.toThrow(new LlmRequestError("LLM provider sent a reply that is not JSON"));
  });

  test("an oversize reply is refused", async () => {
    setEnv(LIVE);
    const transport = (async () => new Response("x".repeat(2 * 1024 * 1024 + 1), { status: 200 })) as unknown as typeof fetch;
    await expect(ask(transport)).rejects.toThrow("LLM reply too large");
  });

  test("an input over 200,000 characters is refused before anything is sent or recorded", async () => {
    setEnv(LIVE);
    const { transport, requests } = provider({ content: '{"ok":true}' });
    const huge = callLlm({ job: "big", role: "triage", messages: [{ role: "user", content: "x".repeat(200_001) }], parse: isOk, fetch: transport });
    await expect(huge).rejects.toBeInstanceOf(LlmInputError);
    expect(requests).toHaveLength(0);
    expect(await usageRows()).toEqual([]);
  });

  test("a USD budget needs prices for the role, so no live call has an unknown cost", async () => {
    setEnv({ ...LIVE, LLM_MONTHLY_BUDGET_USD: "10" }); // token cap also set, prices missing
    const { transport, requests } = provider({ content: '{"ok":true}' });
    await expect(ask(transport)).rejects.toThrow("LLM_MONTHLY_BUDGET_USD needs LLM_PRICE_TRIAGE_IN and LLM_PRICE_TRIAGE_OUT.");
    expect(requests).toHaveLength(0);
  });
});

describe("configuration", () => {
  test.each(["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL_TRIAGE"])("live without %s: clear error, no call", async (name) => {
    setEnv(LIVE);
    delete process.env[name];
    const { transport, requests } = provider({ content: '{"ok":true}' });

    await expect(ask(transport)).rejects.toThrow(new LlmConfigError(`${name} is not set. Add it to .env.local (names are in .env.example).`));
    expect(requests).toHaveLength(0);
  });

  test("live without any cap is refused (fail closed)", async () => {
    setEnv(LIVE);
    delete process.env.LLM_MONTHLY_TOKEN_CAP;
    const { transport, requests } = provider({ content: '{"ok":true}' });

    await expect(ask(transport)).rejects.toThrow(/LLM_MONTHLY_BUDGET_USD .* or LLM_MONTHLY_TOKEN_CAP/);
    expect(requests).toHaveLength(0);
  });

  test("another OpenAI-compatible base URL works without code changes", async () => {
    setEnv({ ...LIVE, LLM_BASE_URL: "http://localhost:11434/v1/", LLM_MODEL_TRIAGE: "llama3" });
    const { transport, requests } = provider({ content: '{"ok":true}' });

    await ask(transport);
    expect(requests[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(requests[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(requests[0].body.model).toBe("llama3");
  });
});

describe("mock provider (LLM_PROVIDER unset)", () => {
  test("answers from the recorded replies; no network request leaves the machine", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const value = await callLlm({ job: "llm-smoke", role: "triage", messages: [{ role: "user", content: "ping" }], parse: isOk });

    expect(value).toEqual({ ok: true, reply: "pong" });
    expect(network).not.toHaveBeenCalled();
    expect(await usageRows()).toMatchObject([{ job: "llm-smoke", provider: "mock", model: "mock", input_tokens: 24, output_tokens: 9 }]);
  });

  test("a job without recorded replies fails clearly", async () => {
    await expect(ask(undefined, "no-such-job")).rejects.toThrow('No recorded mock reply for job "no-such-job"');
  });

  test("pnpm job llm-smoke runs on the mock and records its call", async () => {
    const [node, ...args] = JSON.parse(readFileSync(`${root}package.json`, "utf8")).scripts.job.split(" ");
    const env = { ...process.env };
    delete env.DATABASE_URL; // the child picks the test database with --test
    const output = execFileSync(node, [...args, "llm-smoke", "--test"], { cwd: root, encoding: "utf8", env });

    expect(output).toContain("llm-smoke: ok");
    expect(await usageRows()).toMatchObject([{ job: "llm-smoke", provider: "mock", status: "ok" }]);
  }, 60_000);
});
