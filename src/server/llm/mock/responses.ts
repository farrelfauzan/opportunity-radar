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
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
};

export const MOCK_RESPONSES: Record<string, MockCase[]> = {
  // pnpm job llm-smoke: one tiny call that proves the client end to end.
  "llm-smoke": [
    {
      name: "pong",
      content: '{"ok":true,"reply":"pong"}',
      usage: { prompt_tokens: 24, completion_tokens: 9 },
    },
  ],
};
