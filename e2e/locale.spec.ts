import { expect, test } from "./fixtures";

test.describe("the start page redirects to a language", () => {
  const cases: { name: string; headers: Record<string, string>; to: string }[] = [
    { name: "no cookie", headers: {}, to: "/en" },
    { name: "no cookie, Indonesian browser", headers: { "Accept-Language": "id-ID,id;q=0.9" }, to: "/en" },
    { name: "cookie id", headers: { Cookie: "locale=id" }, to: "/id" },
    { name: "cookie fr", headers: { Cookie: "locale=fr" }, to: "/en" },
    { name: "empty cookie", headers: { Cookie: "locale=" }, to: "/en" },
  ];
  for (const { name, headers, to } of cases) {
    test(name, async ({ request }) => {
      const response = await request.get("/", { headers, maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers().location, "http://localhost").pathname).toBe(to);
    });
  }
});

test("/en and /id render in their language", async ({ page }) => {
  await page.goto("/en", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today's radar");
  await expect(page.getByTestId("sample-number")).toHaveText("Rp 1,935,000");

  await page.goto("/id", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Radar hari ini");
  await expect(page.getByTestId("sample-number")).toHaveText("Rp 1.935.000");
});

test("an unsupported language is a plain 404 without the app shell", async ({ request }) => {
  for (const path of ["/fr", "/fr/news"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    const html = await response.text();
    expect(html, path).not.toMatch(/<(header|nav)\b/);
  }
});

test("an unknown page under a language is a 404", async ({ request }) => {
  expect((await request.get("/id/does-not-exist")).status()).toBe(404);
});

test("static files are served, not redirected", async ({ request }) => {
  const favicon = await request.get("/favicon.ico", { maxRedirects: 0 });
  expect(favicon.status()).toBe(200);
  const robots = await request.get("/robots.txt", { maxRedirects: 0 });
  expect(robots.status()).toBe(404);
  const api = await request.get("/api/anything", { maxRedirects: 0 });
  expect(api.status()).toBe(404);
});
