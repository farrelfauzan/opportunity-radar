const MAX_LENGTH = 500;
// Shorter values ("1", "true", "en") would shred the message, so they are left
// alone, unless the variable's name says it holds a secret.
const MIN_VALUE_LENGTH = 6;
// Whole name segments: API_KEY and DB_PASSWORD match, KEYBOARD_LAYOUT does not.
const SECRET_NAME = /(^|_)(SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIALS?)(_|$)/i;

/**
 * The error text stored in job_runs: the message only (no stack), with every
 * env value known to the process replaced by [redacted].
 */
export function errorSummary(error: unknown, env: Record<string, string | undefined> = process.env): string {
  let text = error instanceof Error ? error.message : String(error);
  const values = Object.entries(env)
    .filter(([name, value]) => !!value && (value.length >= MIN_VALUE_LENGTH || SECRET_NAME.test(name)))
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length); // longest first, so a value inside another is covered
  for (const value of values) text = text.replaceAll(value, "[redacted]");
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}
