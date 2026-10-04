// The empty-evidence skip of the scoring job, on its own: the selection is mocked
// to return a due opportunity without visible cited articles (in real data the
// selection's active-source filter already prevents that; the skip is a second guard).
import { expect, test, vi } from "vitest";

vi.mock("@/server/data", async (original) => {
  const real = await original<typeof import("@/server/data")>();
  return {
    ...real,
    opportunitiesToRescore: async () => [
      { id: 1, titleEn: "T", thesisEn: "T", theme: "cybersecurity", region: "indonesia", sectors: ["ai_software"], horizon: "0-6m", capitalLevel: "low", articles: [] },
    ],
    recordOpportunityScore: async () => {
      throw new Error("must not be called");
    },
  };
});

const { scoreOpportunities } = await import("@/server/opportunities/score");

test("an opportunity without visible evidence is skipped: no LLM call, no score", async () => {
  const transport = vi.fn(async () => new Response("must not be called", { status: 500 })) as unknown as typeof fetch;
  const outcome = await scoreOpportunities({ transport });
  expect(transport).not.toHaveBeenCalled();
  expect(outcome).toMatchObject({ status: "ok", counts: { due: 1, scored: 0, skipped: 1 } });
});
