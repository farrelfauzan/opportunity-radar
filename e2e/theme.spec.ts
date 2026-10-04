import { expect, test } from "./fixtures";

// The app is dark only: these checks run with the OS set to light mode.
test.use({ colorScheme: "light" });

test("the start page shows the dark glass theme", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Radar · Opportunity Radar");

  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("body")).toHaveCSS("color", "rgb(250, 248, 255)");
  await expect(page.locator("body")).toHaveCSS("background-image", /radial-gradient/);
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(29, 18, 54)");

  const card = page.locator('[data-slot="card"]');
  await expect(card).toHaveCSS("background-color", "rgba(255, 255, 255, 0.08)");
  await expect(card).toHaveCSS("backdrop-filter", "blur(18px)");
  await expect(card).toHaveCSS("border-top-color", "rgba(255, 255, 255, 0.16)");
  await expect(card).toHaveCSS("border-top-width", "1px");

  await expect(page.locator("main")).toHaveCSS("font-variant-numeric", "tabular-nums");

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("the signal and chart tokens are on :root", async ({ page }) => {
  await page.goto("/");
  const names = [
    "--signal-buy",
    "--signal-buy-bg",
    "--signal-sell",
    "--signal-sell-bg",
    "--signal-hold",
    "--signal-hold-bg",
    "--chart-1",
    "--chart-2",
    "--chart-3",
    "--chart-4",
    "--chart-5",
  ];
  const values = await page.evaluate((list) => {
    const style = getComputedStyle(document.documentElement);
    return list.map((name) => style.getPropertyValue(name).trim().toLowerCase());
  }, names);
  expect(Object.fromEntries(names.map((name, i) => [name, values[i]]))).toEqual({
    "--signal-buy": "#5eead4",
    "--signal-buy-bg": "#1d4b48",
    "--signal-sell": "#fdba74",
    "--signal-sell-bg": "#5a3320",
    "--signal-hold": "#e2ddf0",
    "--signal-hold-bg": "#4b3e75",
    "--chart-1": "#2dd4bf",
    "--chart-2": "#fb923c",
    "--chart-3": "#60a5fa",
    "--chart-4": "#c1b9da",
    "--chart-5": "#fbbf24",
  });
});
