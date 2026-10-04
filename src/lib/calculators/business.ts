export type BusinessInput = {
  /** Starting capital, rupiah. */
  capital: number;
  /** Fixed cost per month, rupiah. */
  fixed: number;
  /** Revenue in the first month, rupiah. */
  revenue: number;
  /** Revenue growth per month, percent. */
  growth: number;
  /** Gross margin, percent. */
  margin: number;
  /** Whole months to project, 6–120. */
  months: number;
};

export type BusinessProjection = {
  /** Cumulative cash at the end of each month, starting with month 0 (−capital). */
  cash: number[];
  /** First month whose monthly result is not negative; null when there is none. */
  breakEven: number | null;
  /** First month whose cumulative cash is not negative; null when there is none. */
  payback: number | null;
  /** Cash needed at the lowest point of the cumulative cash, month 0 included. Never negative. */
  lowest: number;
  /** Cumulative cash after the last month, capital included. */
  end: number;
};

/**
 * Month by month: cash starts at −capital, each month adds revenue × margin −
 * fixed cost, then revenue grows. Break-even and payback compare whole rupiah,
 * so float noise at the boundary cannot shift the month.
 */
export function projectBusiness(input: BusinessInput): BusinessProjection {
  const { capital, fixed, growth, margin, months } = input;
  let revenue = input.revenue;
  let total = -capital;
  let breakEven: number | null = null;
  let payback: number | null = null;
  const cash = [total];
  for (let month = 1; month <= months; month++) {
    const result = (revenue * margin) / 100 - fixed;
    total += result;
    cash.push(total);
    if (breakEven === null && Math.round(result) >= 0) breakEven = month;
    if (payback === null && Math.round(total) >= 0) payback = month;
    revenue *= 1 + growth / 100;
  }
  return { cash, breakEven, payback, lowest: Math.max(0, -Math.min(...cash)), end: total };
}
