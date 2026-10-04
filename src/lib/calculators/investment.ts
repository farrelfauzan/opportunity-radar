export type InvestmentInput = {
  /** Starting amount, rupiah. */
  start: number;
  /** Added at the end of each month, rupiah. */
  monthly: number;
  /** Whole years, 1–40. */
  years: number;
  /** Yearly return, percent. */
  returnPct: number;
  /** Uncertainty, percentage points either side of the return. */
  spreadPct: number;
  /** Yearly inflation, percent. */
  inflationPct: number;
};

export type InvestmentProjection = {
  /** Value at the end of each month, starting with month 0 (now). */
  base: number[];
  pessimistic: number[];
  optimistic: number[];
  /** Total paid in by the end of each month. */
  paid: number[];
  /** The final base value in today's money. */
  real: number;
};

/** Monthly compounding of a yearly rate; the monthly amount is added at the end of each month. */
function grow(start: number, monthly: number, months: number, yearlyPct: number): number[] {
  // A yearly loss is capped at 99 %, so the monthly rate stays a real number.
  const rate = Math.pow(1 + Math.max(-99, yearlyPct) / 100, 1 / 12) - 1;
  const values = [start];
  for (let value = start, month = 0; month < months; month++) {
    value = value * (1 + rate) + monthly;
    values.push(value);
  }
  return values;
}

export function projectInvestment(input: InvestmentInput): InvestmentProjection {
  const { start, monthly, years, returnPct, spreadPct, inflationPct } = input;
  const months = years * 12;
  const base = grow(start, monthly, months, returnPct);
  return {
    base,
    pessimistic: grow(start, monthly, months, returnPct - spreadPct),
    optimistic: grow(start, monthly, months, returnPct + spreadPct),
    paid: base.map((_, month) => start + monthly * month),
    real: base[months] / Math.pow(1 + inflationPct / 100, years),
  };
}
