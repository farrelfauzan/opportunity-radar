import { expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import { creditFor } from "./credit";

test("the four licensed sources have a credit; The Conversation names its licence", () => {
  expect(creditFor("conversation-id")).toEqual({
    publisher: "conversation-id",
    licence: { key: "cc-by-nd-4", href: "https://creativecommons.org/licenses/by-nd/4.0/" },
  });
  expect(creditFor("conversation-global")?.licence?.key).toBe("cc-by-nd-4");
  expect(creditFor("federal-reserve")).toEqual({ publisher: "federal-reserve" });
  expect(creditFor("ecb")).toEqual({ publisher: "ecb" });
});

test("other sources have no credit line, whatever the slug looks like", () => {
  for (const slug of ["antara", "techcrunch", "", "constructor", "__proto__", "toString"]) {
    expect(creditFor(slug), slug).toBeNull();
  }
});

test("every credited source has its publisher name and licence in both languages", () => {
  for (const slug of ["conversation-id", "conversation-global", "federal-reserve", "ecb"]) {
    const credit = creditFor(slug)!;
    expect(en.news.credit.publisher[credit.publisher]).toBeTruthy();
    expect(id.news.credit.publisher[credit.publisher]).toBeTruthy();
    if (credit.licence) {
      expect(en.news.credit.licence[credit.licence.key]).toBeTruthy();
      expect(id.news.credit.licence[credit.licence.key]).toBeTruthy();
    }
  }
});
