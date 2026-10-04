import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { checkOpportunity } from "./contract";

type Case = { name: string; rule?: string; output: unknown };
const examples = JSON.parse(
  readFileSync(new URL("../../../docs/opportunities/contract-examples.json", import.meta.url), "utf8"),
) as { inputArticleIds: string[]; valid: Case[]; invalid: Case[] };
const input = new Set(examples.inputArticleIds);

describe("OR-11 contract (contract-examples.json)", () => {
  test.each(examples.valid)("valid: $name", ({ output }) => {
    const outcome = checkOpportunity(output, input);
    expect(outcome).toMatchObject({ ok: true });
  });

  test.each(examples.invalid)("invalid: $name", ({ output }) => {
    expect(checkOpportunity(output, input)).toMatchObject({ ok: false });
  });

  const valid = () => structuredClone(examples.valid[0].output) as Record<string, unknown>;

  test.each([
    ["an extra top-level key", (o: Record<string, unknown>) => ({ ...o, extra: 1 }), 'unexpected "extra"'],
    ["a missing top-level key", ({ thesis: _, ...o }: Record<string, unknown>) => (void _, o), 'missing "thesis"'],
    ["a blank Indonesian text", (o: Record<string, unknown>) => ({ ...o, buyer: { en: "Sellers", id: "   " } }), "buyer.id: is empty"],
    ["a duplicate sector", (o: Record<string, unknown>) => ({ ...o, sectors: ["ai_software", "ai_software"] }), "sectors: has duplicates"],
    ["an unknown region", (o: Record<string, unknown>) => ({ ...o, region: "worldwide" }), "region: must be one of"],
    ["a sixth factor", (o: Record<string, unknown>) => ({ ...o, factors: { ...(o.factors as object), luck: { score: 1, reason: { en: "a", id: "b" } } } }), 'unexpected "luck"'],
    ["the same article cited twice only", (o: Record<string, unknown>) => ({ ...o, citations: ["101", "101"] }), "at least 2 different"],
  ])("rejects %s", (_name, mutate, reason) => {
    const outcome = checkOpportunity(mutate(valid()), input);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.reason).toContain(reason);
  });

  test("lengths count characters, not UTF-16 units: 90 emoji fit the title", () => {
    const o = valid();
    o.title = { en: "😀".repeat(90), id: "judul" };
    expect(checkOpportunity(o, input).ok).toBe(true);
  });
});
