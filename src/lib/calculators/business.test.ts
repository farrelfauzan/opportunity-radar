import { expect, test } from "vitest";
import { projectBusiness, type BusinessInput } from "./business";

const defaults: BusinessInput = {
  capital: 150_000_000,
  fixed: 25_000_000,
  revenue: 15_000_000,
  growth: 8,
  margin: 60,
  months: 36,
};

/** Within Rp 1 of the expected amount. */
const expectRupiah = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

test("the default inputs", () => {
  const result = projectBusiness(defaults);
  expect(result.breakEven).toBe(15);
  expect(result.payback).toBe(28);
  expectRupiah(result.lowest, 282_065_717);
  expectRupiah(result.end, 633_919_332);
  expect(result.cash).toHaveLength(37);
  expect(result.cash[0]).toBe(-150_000_000);
  expect(result.cash[36]).toBe(result.end);
  // The cumulative cash crosses zero at the payback month.
  expect(result.cash[27]).toBeLessThan(0);
  expect(result.cash[28]).toBeGreaterThanOrEqual(0);
});

test("12,000,000 capital paid back by 1,000,000 a month: break-even month 1, payback month 12", () => {
  const result = projectBusiness({
    capital: 12_000_000,
    fixed: 0,
    revenue: 1_000_000,
    growth: 0,
    margin: 100,
    months: 24,
  });
  expect(result.breakEven).toBe(1);
  expect(result.payback).toBe(12);
  expect(result.lowest).toBe(12_000_000);
  expect(result.end).toBe(12_000_000);
});

test("never breaks even and never pays back", () => {
  const result = projectBusiness({ ...defaults, growth: 0 });
  expect(result.breakEven).toBeNull();
  expect(result.payback).toBeNull();
  // 150,000,000 + 36 × (25,000,000 − 9,000,000)
  expectRupiah(result.lowest, 726_000_000);
  expectRupiah(result.end, -726_000_000);
});

test("breaks even in month 1 but has not paid back within the months", () => {
  const result = projectBusiness({ ...defaults, fixed: 9_000_000, growth: 0, months: 6 });
  expect(result.breakEven).toBe(1);
  expect(result.payback).toBeNull();
  expect(result.lowest).toBe(150_000_000);
});

test("0 % margin loses the fixed cost every month", () => {
  const result = projectBusiness({ ...defaults, margin: 0 });
  expect(result.breakEven).toBeNull();
  expect(result.payback).toBeNull();
  expect(result.end).toBe(-150_000_000 - 36 * 25_000_000);
  expect(result.lowest).toBe(-result.end);
});

test("no revenue is the same as no margin", () => {
  const result = projectBusiness({ ...defaults, revenue: 0 });
  expect(result.breakEven).toBeNull();
  expect(result.end).toBe(-150_000_000 - 36 * 25_000_000);
});

test("payback exactly at zero with growth is not pushed a month later by float noise", () => {
  // 1,000,000 + 1,150,000 + 1,322,500 + 1,520,875 = 4,993,375; the float sum ends just below it.
  const input = { capital: 4_993_375, fixed: 0, revenue: 1_000_000, growth: 15, margin: 100, months: 12 };
  const result = projectBusiness(input);
  expect(result.cash[4]).toBeLessThan(0);
  expect(result.cash[4]).toBeCloseTo(0, 6);
  expect(result.payback).toBe(4);
});

test("a monthly result of exactly zero counts as break-even", () => {
  const result = projectBusiness({ ...defaults, fixed: 9_000_000, growth: 0 });
  expect(result.breakEven).toBe(1);
});

test("with shrinking revenue the first month that is not negative still counts", () => {
  const result = projectBusiness({ ...defaults, capital: 0, fixed: 8_000_000, growth: -50 });
  // Month 1: 9,000,000 − 8,000,000; from month 2 on the result is negative.
  expect(result.breakEven).toBe(1);
  expect(result.payback).toBe(1);
  expect(result.cash[2]).toBeLessThan(0);
  expect(result.end).toBeLessThan(0);
});

test("no capital and a positive result from month 1 needs no cash", () => {
  const result = projectBusiness({ ...defaults, capital: 0, fixed: 0 });
  expect(result.lowest).toBe(0);
  expect(Object.is(result.lowest, -0)).toBe(false);
  expect(result.breakEven).toBe(1);
  expect(result.payback).toBe(1);
});

test("120 months at the largest inputs stays finite", () => {
  const result = projectBusiness({ capital: 1e13, fixed: 1e13, revenue: 1e13, growth: 100, margin: 100, months: 120 });
  expect(result.cash).toHaveLength(121);
  expect(Number.isFinite(result.end)).toBe(true);
  expect(Number.isFinite(result.lowest)).toBe(true);
});
