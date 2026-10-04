import { describe, expect, test } from "vitest";
import { DEFAULT_TERM, investHref, parseTerm } from "./query";

describe("parseTerm", () => {
  test("the default is long term", () => {
    expect(DEFAULT_TERM).toBe("long");
    expect(parseTerm({})).toBe("long");
  });

  test("short and long are read as they are", () => {
    expect(parseTerm({ term: "short" })).toBe("short");
    expect(parseTerm({ term: "long" })).toBe("long");
  });

  test("anything else is long term: junk, a wrong case, empty, a repeated parameter", () => {
    for (const term of ["", "SHORT", "Short", "shorter", "1", "short ", ["short", "short"], ["short"], undefined]) {
      expect(parseTerm({ term }), JSON.stringify(term)).toBe("long");
    }
  });
});

describe("investHref", () => {
  test("long term, the default, has no term in the URL; short term has ?term=short", () => {
    expect(investHref("en", {}, "long")).toBe("/en/invest");
    expect(investHref("id", {}, "short")).toBe("/id/invest?term=short");
  });

  test("the other query values stay, in order, and an old term is replaced", () => {
    expect(investHref("en", { a: "1", term: "short", b: "x y" }, "long")).toBe("/en/invest?a=1&b=x+y");
    expect(investHref("en", { a: "1", term: "junk" }, "short")).toBe("/en/invest?a=1&term=short");
  });

  test("a repeated value stays repeated, and an undefined one is dropped", () => {
    expect(investHref("en", { tag: ["a", "b"], gone: undefined }, "short")).toBe("/en/invest?tag=a&tag=b&term=short");
  });
});
