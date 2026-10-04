// One GET for the OR-27 price sources: a timeout, and every failure as a
// PriceSourceError (that asset keeps its values; the run is partial).
import { PriceSourceError } from "./yahoo.ts";

const MAX_BYTES = 2 * 1024 * 1024; // a klines page of 1000 rows is about 200 KB

export async function getJson(url: string, transport: typeof fetch = fetch): Promise<unknown> {
  let response: Response;
  let body: string;
  try {
    // The hosts are fixed: a redirect elsewhere is refused.
    response = await transport(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (!response.ok) throw new PriceSourceError(String(response.status));
    body = await readCapped(response);
  } catch (error) {
    if (error instanceof PriceSourceError) throw error;
    throw new PriceSourceError((error as { name?: string }).name === "TimeoutError" ? "timeout" : "network error");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new PriceSourceError("not a JSON response");
  }
}

/** The body as text, or a PriceSourceError past MAX_BYTES (read in chunks, never all at once). */
async function readCapped(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new PriceSourceError(`response larger than ${MAX_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** A price given as a number or a numeric string, or a PriceSourceError when it is not a positive finite number. */
export function positive(value: unknown, what: string): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) throw new PriceSourceError(`invalid ${what} ${JSON.stringify(value)}`);
  return n;
}
