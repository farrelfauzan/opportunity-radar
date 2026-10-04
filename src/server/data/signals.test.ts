import { afterEach, describe, expect, test, vi } from "vitest";
import { showSampleSignals, toView, type Signal } from "./signals.ts";

// A stored signal computed on made-up prices; the rest of the row does not matter to the switch.
const signal = (synthetic: boolean): Signal => ({
  assetId: 1,
  term: "long",
  state: "BUY",
  verdict: "BUY",
  since: "2026-10-02",
  asOfDay: "2026-10-02",
  indicators: null,
  checks: [],
  agree: null,
  reversals: [],
  currency: null,
  rulesVersion: "rules v1",
  synthetic,
  computedAt: new Date("2026-10-02T11:00:00Z"),
});

afterEach(() => vi.unstubAllEnvs());

describe("sample-data signals (copy.md §8.2)", () => {
  test("under NODE_ENV=production the switch is ignored: a synthetic signal reads as SAMPLE, with no verdict", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHOW_SAMPLE_SIGNALS", "1");
    expect(showSampleSignals()).toBe(false);
    expect(toView(signal(true))).toEqual({ term: "long", state: "SAMPLE", rulesVersion: "rules v1" });
  });

  test("without the switch a synthetic signal reads as SAMPLE in development too", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SHOW_SAMPLE_SIGNALS", "");
    expect(toView(signal(true)).state).toBe("SAMPLE");
  });

  test("outside production the switch shows the verdict of a synthetic signal", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SHOW_SAMPLE_SIGNALS", "1");
    expect(toView(signal(true))).toMatchObject({ state: "BUY", verdict: "BUY", synthetic: true });
  });

  test("only the value 1 turns the switch on", () => {
    vi.stubEnv("NODE_ENV", "development");
    for (const value of ["true", "0", "yes"]) {
      vi.stubEnv("SHOW_SAMPLE_SIGNALS", value);
      expect(toView(signal(true)).state).toBe("SAMPLE");
    }
  });

  test("a real signal is never touched, in production or not", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(toView(signal(false))).toMatchObject({ state: "BUY", synthetic: false });
    vi.stubEnv("NODE_ENV", "development");
    expect(toView(signal(false))).toMatchObject({ state: "BUY", synthetic: false });
  });
});
