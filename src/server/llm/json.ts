/** The model's text was not the JSON the caller asked for. */
export class InvalidOutputError extends Error {}

const ONE_FENCE = /^\s*```json[ \t]*\n([\s\S]*)\n```\s*$/;

/**
 * JSON from a model reply (docs/opportunities/scoring-v1.md §5): parsed as is,
 * or after stripping exactly one surrounding ```json fence, nothing else.
 */
export function parseModelJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {}
  const inner = ONE_FENCE.exec(raw)?.[1];
  if (inner !== undefined) {
    try {
      return JSON.parse(inner);
    } catch {}
  }
  throw new InvalidOutputError("the reply is not valid JSON");
}
