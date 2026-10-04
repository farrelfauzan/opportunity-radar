import { expect, test } from "vitest";
import { errorSummary } from "./redact";

test("every env value in the message is replaced", () => {
  const env = { CANARY_SECRET: "abc123", API_KEY: "sk-live-0000", EMPTY: "" };
  expect(errorSummary(new Error("401 for key sk-live-0000 (abc123)"), env)).toBe(
    "401 for key [redacted] ([redacted])",
  );
});

test("a value that contains another is replaced whole", () => {
  const env = { SHORT: "secret", LONG: "secret-and-more" };
  expect(errorSummary(new Error("got secret-and-more"), env)).toBe("got [redacted]");
});

test("very short values are left alone, so the message stays readable", () => {
  expect(errorSummary(new Error("1 of 12 feeds failed"), { FLAG: "1", LANG: "en" })).toBe("1 of 12 feeds failed");
});

test("the summary is the message only, cut at 500 characters", () => {
  const summary = errorSummary(new Error("x".repeat(600)), {});
  expect(summary).toHaveLength(501);
  expect(summary.endsWith("…")).toBe(true);
  expect(errorSummary("plain string", {})).toBe("plain string");
});
