import { describe, expect, test } from "vitest";
import { keywordMatcher } from "./match";

describe("keywordMatcher", () => {
  const match = keywordMatcher(["PPE", "K3", "keselamatan kerja", "health-tech", "SATUSEHAT"]);
  test.each([
    ["New PPE rules for factories", true],
    ["Aturan K3 diperketat", true],
    ["Keselamatan Kerja di tambang", true],
    ["A health-tech startup raises funds", true],
    ["Klinik wajib terhubung ke SatuSehat", true],
    ["Shoppers return to malls", false],
    ["Model K3X launched", false],
    ["Happen in Jakarta", false],
    ["healthtech without the hyphen", false],
  ])("%s → %s", (text, expected) => {
    expect(match(text)).toBe(expected);
  });

  test("no keywords match nothing", () => {
    expect(keywordMatcher([])("anything")).toBe(false);
  });
});
