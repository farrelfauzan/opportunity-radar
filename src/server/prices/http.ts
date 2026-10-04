// One GET for the OR-27 price sources: a timeout, and every failure as a
// PriceSourceError (that asset keeps its values; the run is partial).
import { PriceSourceError } from "./yahoo.ts";

export async function getJson(url: string, transport: typeof fetch = fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await transport(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new PriceSourceError((error as { name?: string }).name === "TimeoutError" ? "timeout" : "network error");
  }
  if (!response.ok) throw new PriceSourceError(String(response.status));
  try {
    return await response.json();
  } catch {
    throw new PriceSourceError("not a JSON response");
  }
}

/** A price given as a number or a numeric string, or a PriceSourceError when it is not a positive finite number. */
export function positive(value: unknown, what: string): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) throw new PriceSourceError(`invalid ${what} ${JSON.stringify(value)}`);
  return n;
}
