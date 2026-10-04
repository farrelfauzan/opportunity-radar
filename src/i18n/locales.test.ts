import { expect, test } from "vitest";
import { canonicalLocalePath } from "./locales";

test("a supported locale in the wrong case maps to the lowercase path, keeping the rest", () => {
  expect(canonicalLocalePath("/EN")).toBe("/en");
  expect(canonicalLocalePath("/Id")).toBe("/id");
  expect(canonicalLocalePath("/iD")).toBe("/id");
  expect(canonicalLocalePath("/EN/news")).toBe("/en/news");
  expect(canonicalLocalePath("/ID/invest/gold")).toBe("/id/invest/gold");
  expect(canonicalLocalePath("/EN/")).toBe("/en/");
  expect(canonicalLocalePath("/EN/Mixed/Case")).toBe("/en/Mixed/Case");
});

test("anything else needs no change", () => {
  for (const path of ["/", "/en", "/id", "/en/news", "/FR", "/Fr/news", "/ENG", "/e", "/en2", "/news/EN", ""]) {
    expect(canonicalLocalePath(path), path).toBeNull();
  }
});
