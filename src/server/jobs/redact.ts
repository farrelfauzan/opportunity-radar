const MAX_LENGTH = 500;
// Shorter values ("1", "true", "en") are not secrets and would shred the message.
const MIN_VALUE_LENGTH = 6;

/**
 * The error text stored in job_runs: the message only (no stack), with every
 * env value known to the process replaced by [redacted].
 */
export function errorSummary(error: unknown, env: Record<string, string | undefined> = process.env): string {
  let text = error instanceof Error ? error.message : String(error);
  const values = Object.values(env)
    .filter((value): value is string => !!value && value.length >= MIN_VALUE_LENGTH)
    .sort((a, b) => b.length - a.length); // longest first, so a value inside another is covered
  for (const value of values) text = text.replaceAll(value, "[redacted]");
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}
