// The cap read window (OR-13 → OR-15 review): a call recorded while another call
// is reading the month's usage is missing from that read and already released
// from the in-flight reservations. The client adds what it recorded during the
// read. Made deterministic by holding the second call's read until the first
// call has been recorded, and answering it with the usage as it was before.
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { db } from "@/server/data/client";

const gate: { open?: () => void; wait?: Promise<void> } = {};
const hold = { next: false };

vi.mock("@/server/data", async (original) => {
  const real = await original<typeof import("@/server/data")>();
  return {
    ...real,
    liveUsageThisMonth: async (at?: Date) => {
      if (!hold.next) return real.liveUsageThisMonth(at);
      hold.next = false;
      const before = await real.liveUsageThisMonth(at); // the usage as it is now: before the first call records
      await gate.wait; // ...returned only after the first call has recorded and released
      return before;
    },
  };
});

const { callLlm, BudgetExhaustedError } = await import("@/server/llm/client");

const LIVE = { LLM_PROVIDER: "live", LLM_BASE_URL: "https://router.test/v1", LLM_API_KEY: "k-123456", LLM_MODEL_TRIAGE: "m", LLM_MONTHLY_TOKEN_CAP: "1000" };

beforeEach(async () => {
  await db().execute(sql`truncate llm_usage`);
  Object.assign(process.env, LIVE);
  gate.wait = new Promise((resolve) => (gate.open = resolve));
});
afterEach(() => {
  for (const k of Object.keys(LIVE)) delete process.env[k];
});

test("a call recorded during another call's usage read is still counted against the cap", async () => {
  const transport = (async () =>
    Response.json({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 600, completion_tokens: 300 } })) as unknown as typeof fetch;
  const isOk = (v: unknown) => v;
  const call = (maxTokens: number) =>
    callLlm({ job: "window", role: "triage", messages: [{ role: "user", content: "x" }], parse: isOk, maxTokens, fetch: transport });

  // B starts first: it reserves 1 + 200 tokens and its usage read is held.
  hold.next = true;
  const b = call(200);
  // A goes through (the cap is far), records 900 tokens and releases its reservation.
  await expect(call(0)).resolves.toEqual({ ok: true });
  gate.open!();

  // B's read says 0 used, but A's 900 recorded meanwhile: 900 + 201 > 1000, so B is refused.
  await expect(b).rejects.toBeInstanceOf(BudgetExhaustedError);
});
