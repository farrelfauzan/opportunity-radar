import { describe, expect, test } from "vitest";
import { findMatch, type OpenOpportunity } from "./match";

const open = (id: number, theme: string, region: string, sectors: string[], citations: number[] = []): OpenOpportunity => ({ id, theme, region, sectors, citations });
const theme = (t: string, region: string, sectors: string[], citations: number[] = []) => ({ theme: t, region, sectors, citations });

// The examples of docs/opportunities/scoring-v1.md §4.
describe("findMatch (scoring-v1 §4)", () => {
  test("match: same theme and region, a shared sector", () => {
    const o = open(1, "ev_batteries", "indonesia", ["manufacturing"]);
    expect(findMatch(theme("ev_batteries", "indonesia", ["energy_mining", "manufacturing"]), [o])).toMatchObject({ id: 1 });
  });

  test("match: different themes but 2 shared articles", () => {
    const o = open(1, "ev_batteries", "indonesia", ["manufacturing"], [10, 11, 12]);
    expect(findMatch(theme("downstreaming_minerals", "global", ["energy_mining"], [11, 12]), [o])).toEqual({ id: 1, reason: "2 shared citations" });
  });

  test("no match: same theme and sector, different region", () => {
    expect(findMatch(theme("ev_batteries", "global", ["manufacturing"]), [open(1, "ev_batteries", "indonesia", ["manufacturing"])])).toBeNull();
  });

  test("no match: same theme and region, no shared sector, 1 shared article", () => {
    const o = open(1, "ev_batteries", "indonesia", ["manufacturing"], [10]);
    expect(findMatch(theme("ev_batteries", "indonesia", ["logistics"], [10, 20]), [o])).toBeNull();
  });

  test("match: same theme and region, no shared sector, exactly 2 shared articles", () => {
    const o = open(1, "ev_batteries", "indonesia", ["manufacturing"], [10, 11]);
    expect(findMatch(theme("ev_batteries", "indonesia", ["logistics"], [10, 11]), [o])).toMatchObject({ id: 1 });
  });

  test("several matches: the most shared citations wins, then the oldest", () => {
    const a = open(1, "ev_batteries", "indonesia", ["manufacturing"], [10]);
    const b = open(2, "ev_batteries", "indonesia", ["manufacturing"], [10, 11, 12]);
    const c = open(3, "ev_batteries", "indonesia", ["manufacturing"], [10, 11, 12]);
    expect(findMatch(theme("ev_batteries", "indonesia", ["manufacturing"], [10, 11, 12]), [a, c, b])).toMatchObject({ id: 2 });
    expect(findMatch(theme("ev_batteries", "indonesia", ["manufacturing"]), [c, a])).toMatchObject({ id: 1 });
  });

  test("nothing open: new", () => {
    expect(findMatch(theme("ev_batteries", "indonesia", ["manufacturing"]), [])).toBeNull();
  });
});
