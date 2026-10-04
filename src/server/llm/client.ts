// OpenAI-compatible chat client (9router, D1) for every job that uses the LLM.
// Server only: the key is read from server env, never logged, never bundled.
import "server-only";
import { liveUsageThisMonth, recordLlmUsage, type LlmCallStatus, type LlmRole } from "@/server/data";
import { isPrivateHost } from "@/server/net";
import { InvalidOutputError, parseModelJson } from "./json.ts";
import { mockProvider } from "./mock/fetch.ts";

export { InvalidOutputError } from "./json.ts";

/** A setting is missing or wrong; no request was made. */
export class LlmConfigError extends Error {}
/** The monthly cap is reached; no request was made (`budget_exhausted`). */
export class BudgetExhaustedError extends Error {}
/** The provider could not be reached, kept answering with an error, or sent an unusable reply. */
export class LlmRequestError extends Error {}
/** The call's input is larger than one request may send; no request was made. */
export class LlmInputError extends Error {}

export type Message = { role: "system" | "user" | "assistant"; content: string };

export type LlmCall<T> = {
  /** The job making the call: recorded in llm_usage, and picks the mock replies. */
  job: string;
  /** Which model: LLM_MODEL_TRIAGE (cheap, many calls) or LLM_MODEL_REPORT. */
  role: LlmRole;
  messages: Message[];
  /** Checks the parsed JSON and returns it typed; throws when it does not fit. */
  parse: (value: unknown) => T;
  maxTokens?: number;
  /** Tests only: the transport instead of the network or the mock. */
  fetch?: typeof fetch;
};

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_BACKOFF_MS = 10_000;
const MAX_INPUT_CHARS = 200_000; // about 50k tokens: far above any prompt we build
const MAX_REPLY_BYTES = 2 * 1024 * 1024;

type Settings = {
  provider: "mock" | "live";
  url: string;
  key: string;
  model: string;
  prices: { in: number; out: number } | null;
  budgetUsd: number | null;
  tokenCap: number | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new LlmConfigError(`${name} is not set. Add it to .env.local (names are in .env.example).`);
  return value;
}

function number(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new LlmConfigError(`${name} must be a number of at least 0.`);
  return value;
}

/** Reads the settings for one call. Live calls need a URL, key, model and a cap. */
function settings(role: LlmRole): Settings {
  const provider = (process.env.LLM_PROVIDER?.trim() || "mock") as Settings["provider"];
  if (provider !== "mock" && provider !== "live") throw new LlmConfigError('LLM_PROVIDER must be "mock" or "live".');
  const upper = role.toUpperCase();
  if (provider === "mock") {
    return { provider, url: "mock:", key: "", model: process.env[`LLM_MODEL_${upper}`]?.trim() || "mock", prices: null, budgetUsd: null, tokenCap: null };
  }
  const base = required("LLM_BASE_URL");
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    throw new LlmConfigError("LLM_BASE_URL is not a valid URL.");
  }
  // The key travels in a header: plain http only to this machine or a private network.
  if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && isPrivateHost(baseUrl.hostname))) {
    throw new LlmConfigError("LLM_BASE_URL must use https (plain http only for this machine or a private network).");
  }
  const priceIn = number(`LLM_PRICE_${upper}_IN`);
  const priceOut = number(`LLM_PRICE_${upper}_OUT`);
  const budgetUsd = number("LLM_MONTHLY_BUDGET_USD");
  const tokenCap = number("LLM_MONTHLY_TOKEN_CAP");
  const prices = priceIn !== null && priceOut !== null ? { in: priceIn, out: priceOut } : null;
  // Under a USD budget every live call must have a known cost, or it would slip past the budget.
  if (budgetUsd !== null && !prices) {
    throw new LlmConfigError(`LLM_MONTHLY_BUDGET_USD needs LLM_PRICE_${upper}_IN and LLM_PRICE_${upper}_OUT.`);
  }
  // Fail closed: a live call without a cap that can be checked is never made.
  if (!(budgetUsd !== null && prices) && tokenCap === null) {
    throw new LlmConfigError(
      `Set LLM_MONTHLY_BUDGET_USD with LLM_PRICE_${upper}_IN and LLM_PRICE_${upper}_OUT, or LLM_MONTHLY_TOKEN_CAP, before live calls.`,
    );
  }
  return {
    provider,
    url: `${base.replace(/\/+$/, "")}/chat/completions`,
    key: required("LLM_API_KEY"),
    model: required(`LLM_MODEL_${upper}`),
    prices,
    budgetUsd,
    tokenCap,
  };
}

type Reservation = { tokens: number; costUsd: number };

// Live calls in flight in this process. Usage is recorded only after a call
// returns, so calls made in parallel reserve their estimate here first.
const inFlight: Reservation = { tokens: 0, costUsd: 0 };
// Everything this process has recorded for live calls, only ever growing. A call
// recorded while another call is reading the month's usage may be missing from
// that read and already released from inFlight; the growth of this total over
// the read covers it (it may count such a call twice, never zero times).
const recordedLive: Reservation = { tokens: 0, costUsd: 0 };

/**
 * Checked before every live request, so a cap reached in the middle of a job
 * stops it. A call goes ahead only if this month's usage, the calls in flight
 * and its own estimate (input, plus maxTokens of output when given) fit the
 * cap; it then reserves that estimate until it is recorded. The estimate is
 * reserved before the usage is read, which is conservative: near the cap a call
 * may be refused because of parallel calls that are refused too, but the cap is
 * never overshot within one process. Separate processes do not see each other's
 * reservations: each can overshoot by one call.
 */
async function reserve(s: Settings, estimate: Reservation): Promise<Reservation | null> {
  if (s.provider !== "live") return null;
  // Reserve first, so calls starting while this one reads see it.
  inFlight.tokens += estimate.tokens;
  inFlight.costUsd += estimate.costUsd;
  const before = { ...recordedLive };
  let read: Reservation;
  try {
    read = await liveUsageThisMonth();
  } catch (error) {
    release(estimate);
    throw error;
  }
  const used = {
    tokens: read.tokens + recordedLive.tokens - before.tokens,
    costUsd: read.costUsd + recordedLive.costUsd - before.costUsd,
  };
  // inFlight already holds this call's own estimate.
  if (s.budgetUsd !== null && (used.costUsd >= s.budgetUsd || used.costUsd + inFlight.costUsd > s.budgetUsd)) {
    release(estimate);
    throw new BudgetExhaustedError(`budget_exhausted: ${used.costUsd.toFixed(2)} of ${s.budgetUsd} USD used this month`);
  }
  if (s.tokenCap !== null && (used.tokens >= s.tokenCap || used.tokens + inFlight.tokens > s.tokenCap)) {
    release(estimate);
    throw new BudgetExhaustedError(`budget_exhausted: ${used.tokens} of ${s.tokenCap} tokens used this month`);
  }
  return estimate;
}

function release(reservation: Reservation | null): void {
  if (!reservation) return;
  inFlight.tokens -= reservation.tokens;
  inFlight.costUsd -= reservation.costUsd;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function backoff(response: Response, attempt: number): number {
  const seconds = Number(response.headers.get("retry-after"));
  return Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000 * 2 ** attempt, MAX_BACKOFF_MS);
}

async function errorMessage(response: Response, key: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    // A provider may echo the key it rejected: never pass it on.
    const message = key ? body.error?.message?.replaceAll(key, "[redacted]") : body.error?.message;
    if (message) return `: ${message.slice(0, 200)}`;
  } catch {}
  return "";
}

type Completion = { content: string; usage?: { prompt_tokens?: number; completion_tokens?: number } };

/** One request, retried once on 429 or 5xx after a backoff. */
async function request(s: Settings, transport: typeof fetch, body: object): Promise<Completion> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (s.key) headers.Authorization = `Bearer ${s.key}`;
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await transport(s.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = (error as { name?: string }).name === "TimeoutError";
      throw new LlmRequestError(timedOut ? "LLM request timed out" : "LLM provider could not be reached");
    }
    if (response.ok) {
      if (Number(response.headers.get("content-length")) > MAX_REPLY_BYTES) throw new LlmRequestError("LLM reply too large");
      const text = await response.text();
      if (text.length > MAX_REPLY_BYTES) throw new LlmRequestError("LLM reply too large");
      let json: { choices?: { message?: { content?: unknown } }[]; usage?: Completion["usage"] };
      try {
        json = JSON.parse(text);
      } catch {
        throw new LlmRequestError("LLM provider sent a reply that is not JSON");
      }
      const content = json.choices?.[0]?.message?.content;
      return { content: typeof content === "string" ? content : "", usage: json.usage };
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt === 0) {
      await sleep(backoff(response, attempt));
      continue;
    }
    throw new LlmRequestError(`LLM request failed: HTTP ${response.status}${await errorMessage(response, s.key)}`);
  }
}

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/**
 * Asks the model for JSON and returns it checked by `parse`. Invalid output
 * (not JSON, or rejected by `parse`) is retried once; a second failure throws
 * InvalidOutputError so the caller can mark its item failed. Every request is
 * recorded in llm_usage. With LLM_PROVIDER unset the in-process mock answers.
 */
export async function callLlm<T>(call: LlmCall<T>): Promise<T> {
  const inputChars = call.messages.reduce((sum, m) => sum + m.content.length, 0);
  if (inputChars > MAX_INPUT_CHARS) {
    throw new LlmInputError(`LLM input too large: ${inputChars} characters (limit ${MAX_INPUT_CHARS})`);
  }
  const s = settings(call.role);
  const transport = call.fetch ?? (s.provider === "mock" ? mockProvider(call.job) : fetch);
  const body = {
    model: s.model,
    messages: call.messages,
    temperature: 0,
    ...(call.maxTokens ? { max_tokens: call.maxTokens } : {}),
  };
  const record = async (status: LlmCallStatus, extra: { inputTokens?: number; outputTokens?: number; estimated?: boolean } = {}) => {
    const { inputTokens = null, outputTokens = null } = extra;
    const costUsd =
      s.prices && inputTokens !== null && outputTokens !== null
        ? (inputTokens * s.prices.in + outputTokens * s.prices.out) / 1_000_000
        : null;
    const row = await recordLlmUsage({
      job: call.job,
      role: call.role,
      provider: s.provider,
      model: s.model,
      inputTokens,
      outputTokens,
      usageEstimated: extra.estimated ?? false,
      costUsd,
      status,
    });
    if (s.provider === "live") {
      recordedLive.tokens += (inputTokens ?? 0) + (outputTokens ?? 0);
      recordedLive.costUsd += costUsd ?? 0;
    }
    return row;
  };

  const inputEstimate = estimateTokens(call.messages.map((m) => m.content).join("\n"));
  const outputEstimate = call.maxTokens ?? 0;
  const estimate: Reservation = {
    tokens: inputEstimate + outputEstimate,
    costUsd: s.prices ? (inputEstimate * s.prices.in + outputEstimate * s.prices.out) / 1_000_000 : 0,
  };

  for (let attempt = 1; ; attempt++) {
    let reservation: Reservation | null;
    try {
      reservation = await reserve(s, estimate);
    } catch (error) {
      if (error instanceof BudgetExhaustedError) await record("budget_exhausted");
      throw error;
    }

    // Released in `finally`, after recording, whatever happens (also if recording fails).
    try {
      let completion: Completion;
      try {
        completion = await request(s, transport, body);
      } catch (error) {
        await record("error");
        throw error;
      }

      // Without usage from the provider, estimate it so the token cap still counts the call.
      const reported = completion.usage;
      const estimated = typeof reported?.prompt_tokens !== "number" || typeof reported?.completion_tokens !== "number";
      const tokens = estimated
        ? {
            inputTokens: estimateTokens(call.messages.map((m) => m.content).join("\n")),
            outputTokens: estimateTokens(completion.content),
            estimated: true,
          }
        : { inputTokens: reported!.prompt_tokens!, outputTokens: reported!.completion_tokens! };

      let value: T;
      try {
        value = call.parse(parseModelJson(completion.content));
      } catch (error) {
        await record("invalid_output", tokens);
        if (attempt === 2) {
          throw new InvalidOutputError(`invalid output twice: ${(error as Error).message}`.slice(0, 300));
        }
        continue;
      }
      // Recorded before the reservation is released, so the cap never loses sight of the call.
      await record("ok", tokens);
      return value;
    } finally {
      release(reservation);
    }
  }
}
