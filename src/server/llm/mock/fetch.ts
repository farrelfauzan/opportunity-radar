import { MOCK_RESPONSES } from "./responses.ts";

/**
 * A stand-in for the provider's /chat/completions endpoint that answers in
 * process from the recorded replies of one job. Nothing leaves the machine.
 */
export function mockProvider(job: string): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string; messages?: { content?: string }[] };
    const text = (body.messages ?? []).map((m) => m.content ?? "").join("\n");
    const found = (MOCK_RESPONSES[job] ?? []).find((c) => (c.match ?? []).every((m) => text.includes(m)));
    if (!found) {
      return Response.json(
        { error: { message: `No recorded mock reply for job "${job}". Add one in src/server/llm/mock/responses.ts.` } },
        { status: 404 },
      );
    }
    return Response.json({
      id: `mock-${found.name}`,
      object: "chat.completion",
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: found.content }, finish_reason: "stop" }],
      ...(found.usage ? { usage: { ...found.usage, total_tokens: found.usage.prompt_tokens + found.usage.completion_tokens } } : {}),
    });
  }) as typeof fetch;
}
