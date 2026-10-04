import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const NBSP = " ";

const copy = {
  en: {
    start: "Starting amount (Rp)",
    monthly: "Added each month (Rp)",
    years: "Years",
    return: "Yearly return (%)",
    spread: "Uncertainty (± % points)",
    inflation: "Inflation (%)",
    presets: ["Cash & bonds", "Gold", "Stocks", "Crypto"],
    lines: ["Optimistic", "Base", "Pessimistic", "Paid in"],
    valueAfter10: "Value after 10 years",
    kept: "Showing the last valid result",
    range: "Enter a value from 1 to 40",
    required: "Enter a number",
    disclaimer: "Projections are arithmetic on the assumptions you enter.",
    chart: "Projected value over time",
    inputs: ["10,000,000", "2,000,000", "10", "10", "6", "3.5"],
    results: ["425,665,138", "308,194,292", "592,350,152", "250,000,000", "301,762,025"],
    compactBase: `Rp${NBSP}425.7 million`,
  },
  id: {
    start: "Jumlah awal (Rp)",
    monthly: "Tambahan tiap bulan (Rp)",
    years: "Tahun",
    return: "Imbal hasil per tahun (%)",
    spread: "Ketidakpastian (± poin %)",
    inflation: "Inflasi (%)",
    presets: ["Kas & obligasi", "Emas", "Saham", "Kripto"],
    lines: ["Optimis", "Dasar", "Pesimis", "Setoran"],
    valueAfter10: "Nilai setelah 10 tahun",
    kept: "Menampilkan hasil valid terakhir",
    range: "Masukkan nilai dari 1 sampai 40",
    required: "Masukkan angka",
    disclaimer: "Proyeksi ini hanya hitungan dari asumsi yang Anda masukkan.",
    chart: "Proyeksi nilai dari waktu ke waktu",
    inputs: ["10.000.000", "2.000.000", "10", "10", "6", "3,5"],
    results: ["425.665.138", "308.194.292", "592.350.152", "250.000.000", "301.762.025"],
    compactBase: `Rp${NBSP}425,7 juta`,
  },
} as const;

const fieldKeys = ["start", "monthly", "years", "return", "spread", "inflation"] as const;
const resultIds = ["result-base", "result-pessimistic", "result-optimistic", "result-paid", "result-real"];

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

async function results(page: Page) {
  return Promise.all(resultIds.map((id) => page.getByTestId(id).innerText()));
}

for (const locale of ["en", "id"] as const) {
  const c = copy[locale];

  test(`${locale}: the defaults, their results, the legend and the disclaimer show on load`, async ({ page }) => {
    await page.goto(`/${locale}/calculators`);

    for (const [i, key] of fieldKeys.entries()) {
      await expect(field(page, c[key])).toHaveValue(c.inputs[i]);
    }
    for (const [i, id] of resultIds.entries()) {
      await expect(page.getByTestId(id)).toHaveText(`Rp${NBSP}${c.results[i]}`);
    }
    const main = page.locator("main");
    await expect(main).toContainText(c.valueAfter10);
    await expect(main).toContainText(c.compactBase);
    await expect(main).toContainText(c.disclaimer);
    await expect(main).not.toContainText(c.kept);

    await expect(page.getByRole("button", { name: c.presets[2] })).toHaveAttribute("aria-pressed", "true");
    for (const i of [0, 1, 3]) {
      await expect(page.getByRole("button", { name: c.presets[i] })).toHaveAttribute("aria-pressed", "false");
    }

    const legend = main.getByRole("list");
    for (const name of c.lines) {
      await expect(legend.getByText(name, { exact: true })).toBeVisible();
    }
    const chart = page.getByRole("img", { name: c.chart });
    await expect(chart).toBeVisible();
    await expect(chart.locator(".recharts-line-curve")).toHaveCount(4);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows, "the page scrolls sideways").toBe(false);
  });
}

test("a preset fills return and uncertainty only; editing a field clears the highlight", async ({ page }) => {
  const c = copy.en;
  await page.goto("/en/calculators");

  const crypto = page.getByRole("button", { name: "Crypto" });
  await crypto.click();
  await expect(crypto).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Stocks" })).toHaveAttribute("aria-pressed", "false");
  await expect(field(page, c.return)).toHaveValue("15");
  await expect(field(page, c.spread)).toHaveValue("20");
  await expect(field(page, c.start)).toHaveValue("10,000,000");
  await expect(field(page, c.monthly)).toHaveValue("2,000,000");
  await expect(field(page, c.years)).toHaveValue("10");
  await expect(field(page, c.inflation)).toHaveValue("3.5");
  await expect(page.getByTestId("result-base")).not.toHaveText(`Rp${NBSP}425,665,138`);
  await expect(page.getByTestId("result-paid")).toHaveText(`Rp${NBSP}250,000,000`);

  await field(page, c.inflation).fill("4");
  await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0);
});

test("results follow the fields as you type", async ({ page }) => {
  const c = copy.en;
  await page.goto("/en/calculators");

  await field(page, c.monthly).fill("0");
  await field(page, c.years).fill("1");
  await field(page, c.return).fill("12");
  await field(page, c.spread).fill("0");

  await expect(page.getByTestId("result-base")).toHaveText(`Rp${NBSP}11,200,000`);
  await expect(page.getByTestId("result-pessimistic")).toHaveText(`Rp${NBSP}11,200,000`);
  await expect(page.getByTestId("result-paid")).toHaveText(`Rp${NBSP}10,000,000`);
  await expect(page.locator("main")).toContainText("Value after 1 year");
  await expect(page.locator("main")).toContainText("Year 1");
});

test("an invalid field shows a message next to it and the last valid result stays", async ({ page }) => {
  const c = copy.en;
  await page.goto("/en/calculators");
  const main = page.locator("main");
  const before = await results(page);

  const years = field(page, c.years);
  await years.fill("-1");
  await expect(years).toHaveAttribute("aria-invalid", "true");
  await expect(years).toHaveAccessibleDescription(c.range);
  await expect(main).toContainText(c.kept);
  expect(await results(page)).toEqual(before);
  await expect(main).toContainText(c.valueAfter10);

  // Another field changes while years is still invalid: the result still does not move.
  await field(page, c.start).fill("5,000,000");
  expect(await results(page)).toEqual(before);

  await years.fill("");
  await expect(years).toHaveAccessibleDescription(c.required);
  await years.fill("abc");
  await expect(years).toHaveAccessibleDescription(c.required);
  expect(await results(page)).toEqual(before);

  await years.fill("10");
  await expect(years).not.toHaveAttribute("aria-invalid", "true");
  await expect(main).not.toContainText(c.kept);
  await expect(page.getByTestId("result-paid")).toHaveText(`Rp${NBSP}245,000,000`);
});

test("/id reads numbers the Indonesian way", async ({ page }) => {
  const c = copy.id;
  await page.goto("/id/calculators");

  await field(page, c.return).fill("8,5");
  await expect(field(page, c.return)).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("main")).not.toContainText(c.kept);
  await expect(page.getByTestId("result-base")).not.toHaveText(`Rp${NBSP}425.665.138`);

  await field(page, c.return).fill("10");
  await field(page, c.start).fill("20.000.000");
  await expect(page.getByTestId("result-paid")).toHaveText(`Rp${NBSP}260.000.000`);

  await field(page, c.years).fill("-1");
  await expect(field(page, c.years)).toHaveAccessibleDescription(c.range);
  await expect(page.locator("main")).toContainText(c.kept);
  await expect(page.getByTestId("result-paid")).toHaveText(`Rp${NBSP}260.000.000`);
});

test("typing and picking a preset make no network requests", async ({ page }) => {
  const c = copy.en;
  await page.goto("/en/calculators", { waitUntil: "networkidle" });

  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await field(page, c.start).pressSequentially("5");
  await field(page, c.monthly).fill("3,000,000");
  await field(page, c.years).fill("-1");
  await field(page, c.years).fill("25");
  await field(page, c.return).fill("7.5");
  await field(page, c.spread).fill("2");
  await field(page, c.inflation).fill("4");
  await page.getByRole("button", { name: "Gold" }).click();
  await expect(field(page, c.return)).toHaveValue("8");
  await page.waitForTimeout(500);

  expect(requests).toEqual([]);
});

test("the largest inputs fit their result cells at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/calculators");
  const top: [string, string][] = [
    ["Starting amount (Rp)", "10,000,000,000,000"],
    ["Added each month (Rp)", "10,000,000,000,000"],
    ["Years", "40"],
    ["Yearly return (%)", "100"],
    ["Uncertainty (± % points)", "50"],
  ];
  for (const [name, value] of top) await field(page, name).fill(value);

  await expect(page.getByTestId("result-base")).toHaveCount(0); // above 2^53: no exact line
  const overflowing = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>("div.rounded-lg.bg-black\\/18")];
    return cards.filter((card) => card.scrollWidth > card.clientWidth).length;
  });
  expect(overflowing).toBe(0);
  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageOverflows).toBe(false);
});

const bizCopy = {
  en: {
    title: "Business projection",
    capital: "Starting capital (Rp)",
    fixed: "Fixed cost per month (Rp)",
    revenue: "First-month revenue (Rp)",
    growth: "Revenue growth per month (%)",
    margin: "Gross margin (%)",
    months: "Months to project",
    inputs: ["150,000,000", "25,000,000", "15,000,000", "8", "60", "36"],
    results: ["Month 15", "Month 28", `Rp${NBSP}282,065,717`, `Rp${NBSP}633,919,332`],
    compactLowest: `Rp${NBSP}282.1 million`,
    labels: ["Monthly break-even", "Capital paid back", "Cash needed at the lowest point", "Net cash after 36 months"],
    caption: ["Month 0", "Dashed line = capital fully paid back", "Month 36"],
    chart: "Cumulative cash over time",
    notWithin36: "Not within 36 months",
    neverEnd: `−Rp${NBSP}726,000,000`,
    range: "Enter a value from 6 to 120",
  },
  id: {
    title: "Proyeksi bisnis",
    capital: "Modal awal (Rp)",
    fixed: "Biaya tetap per bulan (Rp)",
    revenue: "Pendapatan bulan pertama (Rp)",
    growth: "Pertumbuhan pendapatan per bulan (%)",
    margin: "Margin kotor (%)",
    months: "Jumlah bulan proyeksi",
    inputs: ["150.000.000", "25.000.000", "15.000.000", "8", "60", "36"],
    results: ["Bulan ke-15", "Bulan ke-28", `Rp${NBSP}282.065.717`, `Rp${NBSP}633.919.332`],
    compactLowest: `Rp${NBSP}282,1 juta`,
    labels: ["Impas bulanan", "Modal kembali", "Kas yang dibutuhkan di titik terendah", "Kas bersih setelah 36 bulan"],
    caption: ["Bulan ke-0", "Garis putus-putus = modal kembali penuh", "Bulan ke-36"],
    chart: "Kas kumulatif dari waktu ke waktu",
    notWithin36: "Tidak dalam 36 bulan",
    neverEnd: `−Rp${NBSP}726.000.000`,
    range: "Masukkan nilai dari 6 sampai 120",
  },
} as const;

const bizFieldKeys = ["capital", "fixed", "revenue", "growth", "margin", "months"] as const;
const bizResultIds = ["biz-breakeven", "biz-payback", "biz-lowest", "biz-end"];

async function bizResults(page: Page) {
  return Promise.all(bizResultIds.map((id) => page.getByTestId(id).innerText()));
}

const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

for (const locale of ["en", "id"] as const) {
  const c = bizCopy[locale];

  test(`${locale}: business projection shows its defaults and their results on load`, async ({ page }) => {
    await page.goto(`/${locale}/calculators`);
    const main = page.locator("main");

    await expect(page.getByRole("heading", { level: 2, name: c.title })).toBeVisible();
    for (const [i, key] of bizFieldKeys.entries()) {
      await expect(field(page, c[key])).toHaveValue(c.inputs[i]);
    }
    for (const [i, id] of bizResultIds.entries()) {
      await expect(page.getByTestId(id)).toHaveText(c.results[i]);
    }
    for (const text of [...c.labels, ...c.caption, c.compactLowest]) {
      await expect(main.getByText(text, { exact: true })).toBeVisible();
    }

    const chart = page.getByRole("img", { name: c.chart });
    await expect(chart).toBeVisible();
    await expect(chart.locator(".recharts-line-curve")).toHaveCount(1);
    await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(1);

    // The disclaimer is the last thing on the page, after both calculators.
    await expect(main.locator("> :last-child")).toContainText(copy[locale].disclaimer);
  });

  test(`${locale}: a business that never pays back says so for break-even and payback`, async ({ page }) => {
    await page.goto(`/${locale}/calculators`);

    await field(page, c.growth).fill("0");
    await expect(page.getByTestId("biz-breakeven")).toHaveText(c.notWithin36);
    await expect(page.getByTestId("biz-payback")).toHaveText(c.notWithin36);
    await expect(page.getByTestId("biz-end")).toHaveText(c.neverEnd);
    await expect(page.getByTestId("biz-lowest")).toHaveText(c.neverEnd.slice(1));
    expect(await scrollsSideways(page), "the page scrolls sideways").toBe(false);
  });
}

test("business results follow the fields as you type", async ({ page }) => {
  const c = bizCopy.en;
  await page.goto("/en/calculators");

  await field(page, c.capital).fill("12,000,000");
  await field(page, c.fixed).fill("0");
  await field(page, c.revenue).fill("1,000,000");
  await field(page, c.growth).fill("0");
  await field(page, c.margin).fill("100");
  await field(page, c.months).fill("24");

  await expect(page.getByTestId("biz-breakeven")).toHaveText("Month 1");
  await expect(page.getByTestId("biz-payback")).toHaveText("Month 12");
  await expect(page.getByTestId("biz-lowest")).toHaveText(`Rp${NBSP}12,000,000`);
  await expect(page.getByTestId("biz-end")).toHaveText(`Rp${NBSP}12,000,000`);
  const main = page.locator("main");
  await expect(main.getByText("Net cash after 24 months", { exact: true })).toBeVisible();
  await expect(main.getByText("Month 24", { exact: true })).toBeVisible();
});

test("an invalid business field keeps the last valid result and leaves the investment calculator alone", async ({
  page,
}) => {
  const c = bizCopy.en;
  await page.goto("/en/calculators");
  const main = page.locator("main");
  const before = await bizResults(page);
  const investmentBefore = await results(page);

  const months = field(page, c.months);
  await months.fill("5");
  await expect(months).toHaveAttribute("aria-invalid", "true");
  await expect(months).toHaveAccessibleDescription(c.range);
  await expect(main.getByText(copy.en.kept)).toHaveCount(1);
  expect(await bizResults(page)).toEqual(before);

  // Another field changes while months is still invalid: the result still does not move.
  await field(page, c.capital).fill("1,000,000");
  expect(await bizResults(page)).toEqual(before);

  for (const text of ["121", "36.5"]) {
    await months.fill(text);
    await expect(months).toHaveAccessibleDescription(c.range);
  }
  await months.fill("");
  await expect(months).toHaveAccessibleDescription(copy.en.required);
  await field(page, c.margin).fill("101");
  await expect(field(page, c.margin)).toHaveAccessibleDescription("Enter a value from 0 to 100");
  expect(await bizResults(page)).toEqual(before);
  expect(await results(page)).toEqual(investmentBefore);

  await field(page, c.margin).fill("60");
  await months.fill("36");
  await expect(months).not.toHaveAttribute("aria-invalid", "true");
  await expect(main).not.toContainText(copy.en.kept);
  await expect(page.getByTestId("biz-payback")).not.toHaveText(before[1]);
});

test("/id reads business numbers the Indonesian way; the largest projection fits the page", async ({ page }) => {
  const c = bizCopy.id;
  await page.goto("/id/calculators", { waitUntil: "networkidle" });

  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await field(page, c.growth).fill("8,5");
  await expect(field(page, c.growth)).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("biz-end")).not.toHaveText(c.results[3]);

  await field(page, c.growth).fill("0");
  await field(page, c.capital).fill("100.000.000");
  await expect(page.getByTestId("biz-lowest")).toHaveText(`Rp${NBSP}676.000.000`);

  await field(page, c.growth).fill("8");
  await field(page, c.months).fill("120");
  await expect(page.getByTestId("biz-payback")).toHaveText("Bulan ke-27");
  await expect(page.locator("main").getByText("Kas bersih setelah 120 bulan", { exact: true })).toBeVisible();
  expect(await scrollsSideways(page), "the page scrolls sideways").toBe(false);

  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
});

test("the business calculator's largest figures fit at 390 px and show no exact line above 2^53", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/calculators");
  const top: [string, string][] = [
    ["Starting capital (Rp)", "10,000,000,000,000"],
    ["Fixed cost per month (Rp)", "10,000,000,000,000"],
    ["First-month revenue (Rp)", "10,000,000,000,000"],
    ["Revenue growth per month (%)", "100"],
    ["Months to project", "120"],
  ];
  for (const [name, value] of top) await field(page, name).fill(value);

  await expect(page.getByTestId("biz-end")).toHaveCount(0);
  const overflowing = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>("div.rounded-lg.bg-black\\/18")];
    return cards.filter((card) => card.scrollWidth > card.clientWidth).length;
  });
  expect(overflowing).toBe(0);
});
