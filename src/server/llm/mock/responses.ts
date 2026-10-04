// Recorded replies for LLM_PROVIDER=mock (the default). Each job that calls the
// LLM adds its cases here (OR-14, OR-15, OR-50, OR-16, OR-22, OR-33, OR-38).
// A case answers when every string in `match` occurs in the request's messages;
// the first matching case of the job wins. Replies are OpenAI chat-completion
// message contents; `usage` is what the provider would report.
//
// These are hand-written in the shape 9router returns, not captured from it:
// the live endpoint is not available yet (OR-52 records real ones).

export type MockCase = {
  name: string;
  match?: string[];
  /** The reply, or a function building it from the request's text (for replies that echo ids). */
  content: string | ((requestText: string) => string);
  usage?: { prompt_tokens: number; completion_tokens: number };
};

/** The JSON inside a fenced data block (see fenceUntrusted) of the request. */
function fencedData(requestText: string, label: string): unknown {
  const block = new RegExp(`<<<${label}-([0-9a-f]+)\\n([\\s\\S]*?)\\n${label}-\\1>>>`).exec(requestText);
  return block ? JSON.parse(block[2]) : [];
}

export const MOCK_RESPONSES: Record<string, MockCase[]> = {
  // OR-14: one well-formed item per article, so the News screen has data offline.
  // Every text says it is a mock reply; the category and region stay the feed's.
  triage: [
    {
      name: "echo-articles",
      content: (requestText) =>
        JSON.stringify({
          items: (fencedData(requestText, "ARTICLES") as { id: number; region: string; feedCategory: string }[]).map((a) => ({
            id: a.id,
            category: a.feedCategory,
            region: a.region,
            relevance: 50,
            impact: "context",
            why: { en: "[mock] Recorded reply: AI triage is not live yet.", id: "[mock] Jawaban rekaman: triase AI belum aktif." },
            themes: ["other"],
          })),
        }),
      usage: { prompt_tokens: 900, completion_tokens: 600 },
    },
  ],
  // pnpm job llm-smoke: one tiny call that proves the client end to end.
  "llm-smoke": [
    {
      name: "pong",
      content: '{"ok":true,"reply":"pong"}',
      usage: { prompt_tokens: 24, completion_tokens: 9 },
    },
  ],
};
