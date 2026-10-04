import { describe, expect, test } from "vitest";
import { numbersIn, otherVerdict, parseReport, unexplainedNumber } from "./explain.ts";
import { newsMatcher } from "./keywords.ts";

const input = { verdict: "HOLD" as const, articleIds: new Set([11, 12]), prices: [1840000, 209.71], rsi: 55.8 };
const good = {
  explanation: {
    en: "The 50-day average is above the 200-day average, but the price is below it, so the rules give a hold signal. A close above Rp 1,840,000 would change it.",
    id: "Rata-rata 50 hari di atas rata-rata 200 hari, tetapi harga di bawahnya, sehingga aturan memberi sinyal tahan. Penutupan di atas Rp 1.840.000 akan mengubahnya.",
  },
  risks: { en: ["Gold pays no income."], id: ["Emas tidak memberi pendapatan."] },
  news: { supportive: [11], against: [12] },
};

describe("signal report checks (OR-33)", () => {
  test("a valid reply passes, in both languages", () => {
    expect(parseReport(good, input)).toMatchObject({ news: { supportive: [11], against: [12] } });
  });

  test("the rule verdict is HOLD and the reply calls the asset a buy: rejected (AC1)", () => {
    const buy = { ...good, explanation: { ...good.explanation, en: "Gold is a buy right now on these checks." } };
    expect(() => parseReport(buy, input)).toThrow(/states another verdict \("buy"; the rules say HOLD\)/);
    const beli = { ...good, explanation: { ...good.explanation, id: "Emas layak beli menurut pemeriksaan." } };
    expect(() => parseReport(beli, input)).toThrow(/another verdict/);
  });

  test("'you should' and other advice: rejected by the shared guard's signal list (AC4)", () => {
    const advice = { ...good, explanation: { ...good.explanation, en: "You should wait for the hold signal to end." } };
    expect(() => parseReport(advice, input)).toThrow(/advice wording \(rule "/);
    const avoid = { ...good, risks: { en: ["Avoid a large position."], id: ["Hindari posisi besar."] } };
    expect(() => parseReport(avoid, input)).toThrow(/advice wording/);
  });

  test("the price guard: only the rules' reversal prices; any other price (a target) is rejected", () => {
    const target = { ...good, explanation: { ...good.explanation, en: "The hold signal holds until gold reaches Rp 2,100,000." } };
    expect(() => parseReport(target, input)).toThrow(/the number 2100000 is not one of the rules' prices/);
    const idTarget = { ...good, explanation: { ...good.explanation, id: "Sinyal tahan berlaku sampai Rp 2.100.000." } };
    expect(() => parseReport(idTarget, input)).toThrow(/2100000/);
    expect(unexplainedNumber("RSI is 55.80, 3 of 5 articles, up 12.5% this year, the 200-day average in 2026", "en", input)).toBeNull();
    expect(unexplainedNumber("a close below 209.71", "en", input)).toBeNull();
    expect(unexplainedNumber("a close below 209.50", "en", input)).toBe(209.5);
  });

  test("numbers are read with each language's separators", () => {
    expect(numbersIn("Rp 1,840,000 and 12.5%", "en")).toEqual([{ value: 1840000, percent: false }, { value: 12.5, percent: true }]);
    expect(numbersIn("Rp 1.840.000 dan 12,5%", "id")).toEqual([{ value: 1840000, percent: false }, { value: 12.5, percent: true }]);
  });

  test("shape: both languages, at most 90 words, 1-5 risks of equal count, news ids from the input and disjoint", () => {
    expect(() => parseReport({ ...good, explanation: { en: "Fine hold.", id: "" } }, input)).toThrow(/explanation.id is empty/);
    expect(() => parseReport({ ...good, explanation: { ...good.explanation, en: "word ".repeat(91) } }, input)).toThrow(/longer than 90 words/);
    expect(() => parseReport({ ...good, risks: { en: ["A.", "B."], id: ["A."] } }, input)).toThrow(/same count/);
    expect(() => parseReport({ ...good, news: { supportive: [99], against: [] } }, input)).toThrow(/article ids from the input/);
    expect(() => parseReport({ ...good, news: { supportive: [11], against: [11] } }, input)).toThrow(/both supportive and against/);
  });

  test("otherVerdict reads whole words only", () => {
    expect(otherVerdict("shareholders and sellers", "BUY")).toBeNull();
    expect(otherVerdict("a sell signal", "BUY")).toBe("sell");
  });
});

describe("news matching per asset", () => {
  test("gold matches its words (whole words, both languages) and its theme", () => {
    const gold = newsMatcher({ slug: "gold", symbol: "XAU", name: "Gold" });
    expect(gold({ headline: "Harga emas Antam naik", themes: [] })).toBe(true);
    expect(gold({ headline: "Central banks buy more", themes: ["gold_commodities"] })).toBe(true);
    expect(gold({ headline: "Golden Week travel boom", themes: [] })).toBe(false);
  });

  test("an asset without configured words matches its symbol and name", () => {
    const tlkm = newsMatcher({ slug: "tlkm", symbol: "TLKM", name: "Telkom Indonesia" });
    expect(tlkm({ headline: "Telkom Indonesia expands data centres", themes: [] })).toBe(true);
  });
});
