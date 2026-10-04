import { expect, test } from "vitest";
import { projectInvestment, type InvestmentInput } from "./investment";

const defaults: InvestmentInput = {
  start: 10_000_000,
  monthly: 2_000_000,
  years: 10,
  returnPct: 10,
  spreadPct: 6,
  inflationPct: 3.5,
};

const last = (values: number[]) => values[values.length - 1];
/** Within Rp 1 of the expected amount. */
const expectRupiah = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

test("10,000,000 at 12 % for one year with nothing added is 11,200,000", () => {
  const result = projectInvestment({ ...defaults, monthly: 0, years: 1, returnPct: 12, spreadPct: 0 });
  expectRupiah(last(result.base), 11_200_000);
  expectRupiah(last(result.pessimistic), 11_200_000);
  expectRupiah(last(result.optimistic), 11_200_000);
  expect(result.base).toHaveLength(13);
});

test("the default inputs", () => {
  const result = projectInvestment(defaults);
  expectRupiah(last(result.base), 425_665_138);
  expectRupiah(last(result.pessimistic), 308_194_292);
  expectRupiah(last(result.optimistic), 592_350_152);
  expectRupiah(result.real, 301_762_025);
  expect(last(result.paid)).toBe(250_000_000);
  expect(result.base[0]).toBe(10_000_000);
  expect(result.paid[0]).toBe(10_000_000);
  expect(result.base).toHaveLength(121);
});

test("the monthly amount is added at the end of the month", () => {
  const result = projectInvestment({ ...defaults, start: 0, monthly: 1_000_000, years: 1 });
  expect(result.base[1]).toBe(1_000_000);
});

test("a 0 % return gives back what was paid in", () => {
  const result = projectInvestment({ ...defaults, returnPct: 0, spreadPct: 0 });
  expect(result.base).toEqual(result.paid);
  expect(last(result.base)).toBe(250_000_000);
});

test("a negative return ends below what was paid in", () => {
  const result = projectInvestment({ ...defaults, monthly: 0, years: 2, returnPct: -10, spreadPct: 0 });
  expectRupiah(last(result.base), 8_100_000);
});

test("40 years stays finite", () => {
  const result = projectInvestment({ ...defaults, start: 1e13, monthly: 1e13, years: 40, returnPct: 100, spreadPct: 50 });
  expect(result.base).toHaveLength(481);
  for (const value of [last(result.base), last(result.pessimistic), last(result.optimistic), result.real]) {
    expect(Number.isFinite(value)).toBe(true);
  }
});

test("uncertainty larger than the return puts the pessimistic value below what was paid in", () => {
  const result = projectInvestment({ ...defaults, returnPct: 5, spreadPct: 20 });
  expect(last(result.pessimistic)).toBeLessThan(last(result.paid));
  expect(last(result.pessimistic)).toBeGreaterThan(0);
});

test("the applied yearly rate never goes below −99 %", () => {
  const result = projectInvestment({ ...defaults, monthly: 0, years: 1, returnPct: -50, spreadPct: 50 });
  expectRupiah(last(result.pessimistic), 100_000);
  const beyond = projectInvestment({ ...defaults, monthly: 0, years: 1, returnPct: -80, spreadPct: 50 });
  expectRupiah(last(beyond.pessimistic), 100_000);
});

test("deflation makes today's money worth more than the base value", () => {
  const result = projectInvestment({ ...defaults, inflationPct: -10 });
  expect(result.real).toBeGreaterThan(last(result.base));
});
