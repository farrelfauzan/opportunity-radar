// OpenAI-compatible chat client (9router, D1) for every job that uses the LLM.
// Server only: the key is read from server env, never logged, never bundled.
import "server-only";
import { liveUsageThisMonth, recordLlmUsage, type LlmCallStatus, type LlmRole } from "@/server/data";
import { InvalidOutputError, parseModelJson } from "./json.ts";
import { mockProvider } from "./mock/fetch.ts";

export { InvalidOutputError } from "./json.ts";

/** A setting is missing or wrong; no request was made. */
export class LlmConfigError extends Error {}
/** The monthly cap is reached; no request was made (`budget_exhausted`). */
export class BudgetExhaustedError extends Error {}
/** The provider could not be reached or kept answering with an error. */
export class LlmRequestError extends Error {}

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
  if (!/^https?:\/\//.test(base)) throw new LlmConfigError("LLM_BASE_URL must start with http:// or https://.");
  const priceIn = number(`LLM_PRICE_${upper}_IN`);
  const priceOut = number(`LLM_PRICE_${upper}_OUT`);
  const budgetUsd = number("LLM_MONTHLY_BUDGET_USD");
  const tokenCap = number("LLM_MONTHLY_TOKEN_CAP");
  const prices = priceIn !== null && priceOut !== null ? { in: priceIn, out: priceOut } : null;
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

/** Checked before every live request, so a cap reached in the middle of a job stops it. */
async function checkCap(s: Settings): Promise<void> {
  if (s.provider !== "live") return;
  const used = await liveUsageThisMonth();
  if (s.budgetUsd !== null && s.prices && used.costUsd >= s.budgetUsd) {
    throw new BudgetExhaustedError(`budget_exhausted: ${used.costUsd.toFixed(2)} of ${s.budgetUsd} USD used this month`);
  }
  if (s.tokenCap !== null && used.tokens >= s.tokenCap) {
    throw new BudgetExhaustedError(`budget_exhausted: ${used.tokens} of ${s.tokenCap} tokens used this month`);
  }
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
      const json = (await response.json()) as { choices?: { message?: { content?: unknown } }[]; usage?: Completion["usage"] };
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
  const s = settings(call.role);
  const transport = call.fetch ?? (s.provider === "mock" ? mockProvider(call.job) : fetch);
  const body = {
    model: s.model,
    messages: call.messages,
    temperature: 0,
    ...(call.maxTokens ? { max_tokens: call.maxTokens } : {}),
  };
  const record = (status: LlmCallStatus, extra: { inputTokens?: number; outputTokens?: number; estimated?: boolean } = {}) => {
    const { inputTokens = null, outputTokens = null } = extra;
    const costUsd =
      s.prices && inputTokens !== null && outputTokens !== null
        ? (inputTokens * s.prices.in + outputTokens * s.prices.out) / 1_000_000
        : null;
    return recordLlmUsage({
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
  };

  for (let attempt = 1; ; attempt++) {
    try {
      await checkCap(s);
    } catch (error) {
      if (error instanceof BudgetExhaustedError) await record("budget_exhausted");
      throw error;
    }

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

    try {
      const value = call.parse(parseModelJson(completion.content));
      await record("ok", tokens);
      return value;
    } catch (error) {
      await record("invalid_output", tokens);
      if (attempt === 2) {
        throw new InvalidOutputError(`invalid output twice: ${(error as Error).message}`.slice(0, 300));
      }
    }
  }
}
