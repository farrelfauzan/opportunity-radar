import type { Messages } from "@/i18n/t";

type Credit = {
  /** Key of the publisher name in news.credit.publisher. */
  publisher: keyof Messages["news"]["credit"]["publisher"];
  /** The reuse licence, when it has a name and a deed to link to. */
  licence?: { key: keyof Messages["news"]["credit"]["licence"]; href: string };
};

const CC_BY_ND_4 = { key: "cc-by-nd-4", href: "https://creativecommons.org/licenses/by-nd/4.0/" } as const;

/**
 * Sources reused under a licence that requires the publisher's credit wherever an
 * item is shown (the `licence` note in src/server/news/feeds.ts, docs/design/copy.md §3.1).
 * The Conversation is CC BY-ND: its summary is shown exactly as stored, never
 * translated or rewritten. Every other source has no credit line.
 */
const credits: Record<string, Credit> = {
  "conversation-id": { publisher: "conversation-id", licence: CC_BY_ND_4 },
  "conversation-global": { publisher: "conversation-global", licence: CC_BY_ND_4 },
  "federal-reserve": { publisher: "federal-reserve" },
  ecb: { publisher: "ecb" },
};

export function creditFor(sourceSlug: string): Credit | null {
  return Object.hasOwn(credits, sourceSlug) ? credits[sourceSlug] : null;
}
