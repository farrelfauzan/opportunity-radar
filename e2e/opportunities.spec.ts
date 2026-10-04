import type { Page } from "@playwright/test";
import { runDb, resetFixtures } from "./db";
import { expect, test } from "./fixtures";
import {
  detailOf,
  evidenceArticles,
  factorsOf,
  fixtureOpportunities,
  listedFixtures,
  longEvidenceHeadline,
  longTitle,
  markupThesis,
  markupTitle,
  openFixtures,
} from "./opportunity-fixtures";
import { e2eDatabaseUrl } from "../scripts/e2e-env";
import { expectSkeletonOnNavigation } from "./skeleton";

const listed = listedFixtures();
const idOf = (key: string) => fixtureOpportunities.findIndex((f) => f.key === key) + 1; // stored in this order, ids from 1

const copy = {
  en: {
    title: "Opportunities",
    summary: `${openFixtures().length} open · re-scored every morning from the news`,
    labels: { region: "Region", sector: "Sector", horizon: "Horizon", capital: "Capital" },
    allRegions: "All regions",
    allSectors: "All sectors",
    any: "Any",
    indonesia: "Indonesia",
    global: "Global",
    logistics: "Logistics & Supply Chain",
    fisheries: "Fisheries & Maritime",
    short: "0–6 months",
    long: "1–3 years",
    new: "New",
    horizonWord: "Horizon",
    scoreLabel: "opportunity score / 100",
    back: "Back to opportunities",
    empty: "No opportunities match these filters",
    never: "No opportunities yet — the first run is at 07:00 WIB",
    closed: "This opportunity is closed or no longer exists",
    stale: (when: string) => `Opportunities last updated ${when} WIB`,
    error: ["Can't load this right now", "Try again"],
    pick: (f: { title: { en: string; id: string } }) => f.title.en,
  },
  id: {
    title: "Peluang",
    summary: `${openFixtures().length} terbuka · dinilai ulang setiap pagi dari berita`,
    labels: { region: "Wilayah", sector: "Sektor", horizon: "Horizon", capital: "Modal" },
    allRegions: "Semua wilayah",
    allSectors: "Semua sektor",
    any: "Semua",
    indonesia: "Indonesia",
    global: "Global",
    logistics: "Logistik & Rantai Pasok",
    fisheries: "Perikanan & Maritim",
    short: "0–6 bulan",
    long: "1–3 tahun",
    new: "Baru",
    horizonWord: "Horizon",
    scoreLabel: "skor peluang / 100",
    back: "Kembali ke peluang",
    empty: "Tidak ada peluang yang cocok dengan filter ini",
    never: "Belum ada peluang — proses pertama pukul 07.00 WIB",
    closed: "Peluang ini sudah ditutup atau tidak ada lagi",
    stale: (when: string) => `Peluang terakhir diperbarui ${when} WIB`,
    error: ["Tidak dapat memuat sekarang", "Coba lagi"],
    pick: (f: { title: { en: string; id: string } }) => f.title.id,
  },
} as const;

/** The trend of each fixture, as the list shows it (the history is in e2e/opportunity-fixtures.ts). */
const trends = (locale: "en" | "id"): Record<string, string> => ({
  "cold-chain": "▲ 12",
  solar: "▼ 7",
  assistant: "— 0",
  tax: "▲ 9", // first scored exactly 30 days ago: a number
  climate: copy[locale].new, // first scored 29 days ago: New
  bootcamp: copy[locale].new,
  "last-mile": copy[locale].new,
  quake: "▼ 5",
  long: "▲ 5",
  markup: copy[locale].new,
});

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
};

// The list is the one ordered list with a label (the first steps of a detail are an ordered list too).
const listOl = "main ol[aria-label]";
const items = (page: Page) => page.locator(`${listOl} > li`);
const select = (page: Page, locale: "en" | "id", name: keyof (typeof copy)["en"]["labels"]) =>
  page.getByRole("combobox", { name: copy[locale].labels[name] }); // the label's text holds the options too, so not exact; combobox keeps the score bars ("Capital efficiency") out
/** The selected opportunity's panel (only the one that is displayed). */
const panel = (page: Page) => page.locator("main article");
const overflows = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const titlesOf = async (page: Page) =>
  (await items(page).locator("a > span:nth-child(2) > span:first-child").allInnerTexts()).map((t) => t.trim());

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

// ---- Acceptance criteria -------------------------------------------------------------------

for (const locale of ["en", "id"] as const) {
  const c = copy[locale];

  test(`${locale} AC1: open opportunities are sorted by score, each with region, sector, horizon and a trend symbol`, async ({
    page,
    baseURL,
  }) => {
    // Nothing is requested from outside the app.
    const outside: string[] = [];
    page.on("request", (request) => {
      if (!/^(data|blob):/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) {
        outside.push(request.url());
      }
    });

    await page.goto(`/${locale}/opportunities`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
    await expect(page).toHaveTitle(`${c.title} · Opportunity Radar`);
    await expect(page.locator("main")).toContainText(c.summary);

    await expect(items(page)).toHaveCount(listed.length); // the closed one is not listed
    const scores = listed.map((f) => String(f.history.at(-1)![1]));
    const expectedTitles = listed.map((f) => c.pick(f));
    expect(await titlesOf(page)).toEqual(expectedTitles);

    for (const [index, f] of listed.entries()) {
      const item = items(page).nth(index);
      await expect(item, f.key).toContainText(scores[index]);
      await expect(item.locator("[data-trend]"), f.key).toHaveText(trends(locale)[f.key]);
    }

    // Region, sector and horizon of the first item (cold-chain: Indonesia, two sectors, 0-6 months).
    await expect(items(page).first()).toContainText(
      `${c.indonesia} · ${c.logistics}, ${c.fisheries} · ${c.horizonWord} ${c.short}`,
    );
    // Tie at 66 (climate before bootcamps): the older id first.
    expect(expectedTitles.indexOf(c.pick(fixtureOpportunities[idOf("climate") - 1]))).toBeLessThan(
      expectedTitles.indexOf(c.pick(fixtureOpportunities[idOf("bootcamp") - 1])),
    );
    // A closed opportunity is never listed.
    await expect(page.locator("main")).not.toContainText(fixtureOpportunities[idOf("closed") - 1].title.en);
    await expect(page.locator("main")).not.toContainText(fixtureOpportunities[idOf("closed") - 1].title.id);
    expect(outside, "requests to another origin").toEqual([]);
  });

  test(`${locale} AC2: Indonesia + Logistics shows only matching items and the URL holds both filters`, async ({ page }) => {
    await page.goto(`/${locale}/opportunities`);
    await expect(select(page, locale, "region")).toHaveValue("all");

    await select(page, locale, "region").selectOption("indonesia");
    await expect(page).toHaveURL(`/${locale}/opportunities?region=indonesia`);
    await select(page, locale, "sector").selectOption("logistics");
    await expect(page).toHaveURL(`/${locale}/opportunities?region=indonesia&sector=logistics`);

    const expected = listed.filter((f) => f.region === "indonesia" && f.sectors.includes("logistics"));
    expect(expected.map((f) => f.key)).toEqual(["cold-chain", "last-mile"]);
    await expect(items(page)).toHaveCount(2);
    expect(await titlesOf(page)).toEqual(expected.map((f) => c.pick(f)));
    await expect(select(page, locale, "region")).toHaveValue("indonesia");
    await expect(select(page, locale, "sector")).toHaveValue("logistics");

    // The URL is the whole state: a reload and a link to the other language keep it.
    await page.reload();
    await expect(items(page)).toHaveCount(2);
    await page
      .getByRole("group", { name: locale === "en" ? "Language" : "Bahasa" })
      .getByRole("link", { name: locale === "en" ? "ID" : "EN" })
      .click();
    const other = locale === "en" ? "id" : "en";
    await expect(page).toHaveURL(`/${other}/opportunities?region=indonesia&sector=logistics`);
    await expect(items(page)).toHaveCount(2);

    // Back to All keeps the other filter.
    await select(page, other, "region").selectOption("all");
    await expect(page).toHaveURL(`/${other}/opportunities?sector=logistics`);
    await expect(items(page)).toHaveCount(3); // plus the global one with a logistics sector
  });

  test(`${locale} AC3: no opportunities and no scoring run says when the first run happens`, async ({ page }) => {
    try {
      runDb("fixtures", "--no-opportunities", "--scores-run=never");
      await page.goto(`/${locale}/opportunities`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
      await expect(page.locator("main")).toContainText(c.never);
      await expect(items(page)).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveCount(0);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale} AC4: on a phone, tapping an item opens its detail as its own view with a back link that keeps the filters`, async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/${locale}/opportunities?region=global`);

    // The list only: the detail of the first item is not on screen.
    await expect(items(page)).toHaveCount(3);
    await expect(panel(page)).toBeHidden();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);

    const second = items(page).nth(1).getByRole("link");
    const id = idOf("long");
    await expect(second).toHaveAttribute("href", `/${locale}/opportunities/${id}?region=global`);
    await second.click();
    await expect(page).toHaveURL(`/${locale}/opportunities/${id}?region=global`);

    // Its own view: the opportunity, a back link, no list and no filters.
    const f = fixtureOpportunities[id - 1];
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(longTitle);
    await expect(panel(page)).toContainText(String(f.history.at(-1)![1]));
    await expect(panel(page)).toContainText(c.scoreLabel);
    await expect(panel(page)).toContainText(locale === "en" ? f.thesis.en : f.thesis.id);
    await expect(page.locator(listOl)).toBeHidden();
    await expect(select(page, locale, "region")).toBeHidden();
    const back = page.getByRole("link", { name: c.back });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", `/${locale}/opportunities?region=global`);
    expect(await overflows(page)).toBe(false);

    await back.click();
    await expect(page).toHaveURL(`/${locale}/opportunities?region=global`);
    await expect(items(page)).toHaveCount(3);
    await expect(select(page, locale, "region")).toHaveValue("global");
  });
}

// ---- Desktop: list beside the detail ------------------------------------------------------------

test("1280 px: the first item is selected by default, and choosing another keeps the list beside its detail", async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/en/opportunities");

  const first = listed[0];
  await expect(items(page)).toHaveCount(listed.length);
  // The default selection is a visual mark beside the list; the URL names no opportunity, so no aria-current.
  await expect(items(page).first().getByRole("link")).toHaveAttribute("data-selected", "true");
  await expect(items(page).locator('[data-selected="true"]')).toHaveCount(1);
  await expect(items(page).locator("[aria-current]")).toHaveCount(0);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(first.title.en);
  await expect(panel(page)).toContainText(first.thesis.en);
  await expect(panel(page)).toContainText("82");
  await expect(panel(page)).toContainText("opportunity score / 100");
  await expect(page.getByRole("link", { name: "Back to opportunities" })).toBeHidden();

  // The list and the detail are side by side.
  const listBox = (await page.locator(listOl).boundingBox())!;
  const panelBox = (await panel(page).boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width);
  expect(Math.abs(panelBox.y - listBox.y)).toBeLessThan(80);

  // Choose the third one: the URL gets its id, the list stays, the selection moves.
  const third = listed[2];
  await items(page).nth(2).getByRole("link").click();
  await expect(page).toHaveURL(`/en/opportunities/${idOf(third.key)}`);
  await expect(items(page)).toHaveCount(listed.length);
  await expect(items(page).nth(2).getByRole("link")).toHaveAttribute("aria-current", "true");
  await expect(items(page).first().getByRole("link")).not.toHaveAttribute("aria-current", "true");
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(third.title.en);
  await expect(panel(page)).toContainText("Thesis of AI assistant");

  // On the index, the default selection follows the filters.
  await page.goto("/en/opportunities?region=global");
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(third.title.en);
  await expect(items(page).first().getByRole("link")).toHaveAttribute("data-selected", "true");
});

test("1280 px: a filter without matches shows the empty state and no detail", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/en/opportunities?region=global&capital=high");
  await expect(page.locator("main")).toContainText("No opportunities match these filters");
  await expect(items(page)).toHaveCount(0);
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Opportunities");
  // The summary is the whole count, not the filter's.
  await expect(page.locator("main")).toContainText(copy.en.summary);

  await page.goto("/id/opportunities?sector=education&horizon=1-3y");
  await expect(page.locator("main")).toContainText(copy.id.empty);
});

test("filters: horizon and capital select by URL value, in both languages' labels", async ({ page }) => {
  await page.goto("/id/opportunities");
  await select(page, "id", "horizon").selectOption("1-3y");
  await expect(page).toHaveURL("/id/opportunities?horizon=1-3y");
  await expect(select(page, "id", "horizon").locator("option:checked")).toHaveText(copy.id.long);
  await select(page, "id", "capital").selectOption("high");
  await expect(page).toHaveURL("/id/opportunities?horizon=1-3y&capital=high");
  const expected = listed.filter((f) => f.horizon === "1-3y" && f.capital === "high");
  await expect(items(page)).toHaveCount(expected.length);
  expect(await titlesOf(page)).toEqual(expected.map((f) => f.title.id));
  await expect(select(page, "id", "capital").locator("option:checked")).toHaveText("Tinggi");

  // The sector select lists the 18 fixed sectors and All.
  await expect(select(page, "id", "sector").locator("option")).toHaveCount(19);
  await expect(select(page, "id", "sector").locator("option").nth(0)).toHaveText(copy.id.allSectors);
  await expect(select(page, "id", "sector").locator("option").nth(1)).toHaveText("Pertanian & Pangan");
});

test("invalid query values fall back to All without an error", async ({ page }) => {
  await page.goto("/en/opportunities?region=mars&sector=unicorns&horizon=forever&capital=huge");
  await expect(items(page)).toHaveCount(listed.length);
  await expect(select(page, "en", "region")).toHaveValue("all");
  await expect(select(page, "en", "sector")).toHaveValue("all");
  await expect(select(page, "en", "horizon")).toHaveValue("all");
  await expect(select(page, "en", "capital")).toHaveValue("all");
  await expect(page.locator("main")).not.toContainText(copy.en.error[0]);

  // A valid filter beside an invalid one is kept; a repeated parameter is not a value.
  await page.goto("/en/opportunities?region=global&capital=huge");
  await expect(select(page, "en", "region")).toHaveValue("global");
  await expect(items(page)).toHaveCount(3);
  await page.goto("/en/opportunities?region=global&region=indonesia");
  await expect(items(page)).toHaveCount(listed.length);
});

test.describe("not found", () => {
  test.use({ allowErrorResponses: true });

  const missing = [
    ["a closed id", () => String(idOf("closed"))],
    ["an unknown id", () => "9999"],
    ["a text id", () => "abc"],
    ["id 0", () => "0"],
  ] as const;

  for (const locale of ["en", "id"] as const) {
    for (const [name, id] of missing) {
      test(`${locale}: ${name} answers HTTP 404 with the localised not-found page`, async ({ page }) => {
        const response = await page.goto(`/${locale}/opportunities/${id()}?region=indonesia`);
        expect(response?.status()).toBe(404);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy[locale].title);
        await expect(page.locator("main")).toContainText(copy[locale].closed);
        await expect(page.getByRole("banner").getByRole("navigation")).toBeVisible();
        await page.getByRole("link", { name: copy[locale].back }).click();
        await expect(page).toHaveURL(`/${locale}/opportunities`);
        await expect(items(page).first()).toBeVisible();
      });
    }
  }

  test("an open id answers 200", async ({ page }) => {
    const response = await page.goto(`/en/opportunities/${idOf("cold-chain")}`);
    expect(response?.status()).toBe(200);
  });
});

// ---- Detail ------------------------------------------------------------------------------------

const factors = ["demand", "timing", "competition", "capital", "regulatory"] as const;
const detailCopy = {
  en: {
    factorLabels: ["Demand", "Timing", "Low competition", "Capital efficiency", "Low regulatory risk"],
    breakdown: "Score breakdown",
    note: "Higher is better on every row (low competition and low regulatory risk score high).",
    aiNote: "Scores are AI estimates from the cited news, scored against a fixed rubric every morning.",
    facts: ["Starting capital", "Who buys", "Model", "Score, 30 days"],
    low: "Low",
    evidence: "Why now — evidence from the news",
    risks: "Risks",
    steps: "First steps to validate",
    related: (text: string) => `Related market exposure: ${text}`,
    source: (text: string) => `Source: ${text}`,
    ago: (days: number) => `${days}d ago`,
    otherLanguage: "ID",
    languageGroup: "Language",
  },
  id: {
    factorLabels: ["Permintaan", "Waktu", "Persaingan rendah", "Efisiensi modal", "Risiko regulasi rendah"],
    breakdown: "Rincian skor",
    note: "Makin tinggi makin baik di setiap baris (persaingan rendah dan risiko regulasi rendah bernilai tinggi).",
    aiNote: "Skor adalah perkiraan AI dari berita yang dikutip, dinilai dengan rubrik tetap setiap pagi.",
    facts: ["Modal awal", "Siapa pembelinya", "Model", "Skor, 30 hari"],
    low: "Rendah",
    evidence: "Mengapa sekarang — bukti dari berita",
    risks: "Risiko",
    steps: "Langkah awal untuk validasi",
    related: (text: string) => `Eksposur pasar terkait: ${text}`,
    source: (text: string) => `Sumber: ${text}`,
    ago: (days: number) => `${days} hari lalu`,
    otherLanguage: "EN",
    languageGroup: "Bahasa",
  },
} as const;

const fixture = (key: string) => fixtureOpportunities[idOf(key) - 1];
const evidence = (key: string) => evidenceArticles.find((e) => e.key === key)!;
const evidenceItems = (page: Page) => panel(page).locator('section[aria-labelledby="opp-evidence"] li');
const detailUrl = (locale: string, key: string) => `/${locale}/opportunities/${idOf(key)}`;

for (const locale of ["en", "id"] as const) {
  const c = copy[locale];
  const d = detailCopy[locale];
  const pick = (pair: { en: string; id: string }) => pair[locale];

  test(`${locale} AC1: the detail shows the score, five bars each with its number, quick facts, risks, steps and related exposure`, async ({
    page,
    baseURL,
  }) => {
    const outside: string[] = [];
    page.on("request", (request) => {
      if (!/^(data|blob):/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) {
        outside.push(request.url());
      }
    });
    const f = fixture("cold-chain");
    const text = detailOf(f);
    await page.goto(detailUrl(locale, "cold-chain"));

    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(pick(f.title));
    await expect(panel(page)).toContainText(`${c.indonesia} · ${c.logistics}, ${c.fisheries} · ${c.horizonWord} ${c.short}`);
    await expect(panel(page)).toContainText("82");
    await expect(panel(page)).toContainText(c.scoreLabel);
    await expect(panel(page)).toContainText(pick(f.thesis));

    // Score breakdown: five bars in order, each with its number printed and as a meter value.
    await expect(panel(page).getByRole("heading", { level: 3, name: d.breakdown })).toBeVisible();
    const meters = panel(page).getByRole("meter");
    await expect(meters).toHaveCount(5);
    const values = factorsOf(82);
    for (const [index, factor] of factors.entries()) {
      const meter = meters.nth(index);
      const value = values[factor];
      await expect(meter).toHaveAttribute("aria-label", d.factorLabels[index]);
      await expect(meter).toHaveAttribute("aria-valuenow", String(value));
      await expect(meter).toHaveAttribute("aria-valuemin", "0");
      await expect(meter).toHaveAttribute("aria-valuemax", "100");
      expect(await meter.locator("span").getAttribute("style")).toMatch(new RegExp(`^width:\\s*${value}%`)); // the bar is as wide as the number
      const row = panel(page).locator("li").filter({ hasText: d.factorLabels[index] }).filter({ has: page.getByRole("meter") });
      await expect(row).toHaveCount(1);
      await expect(row.locator("span").last()).toHaveText(String(value)); // the number is printed
    }
    await expect(panel(page)).toContainText(d.note);
    await expect(panel(page)).toContainText(d.aiNote);

    // Quick facts.
    const facts = panel(page).locator("dl");
    await expect(facts.locator("dt")).toHaveText(d.facts);
    await expect(facts.locator("dd")).toHaveText([
      `${d.low} (${pick(text.capitalReason)})`,
      pick(text.buyer),
      pick(text.model),
      "▲ 12",
    ]);

    // Risks (a bulleted list) and first steps (a numbered list).
    await expect(panel(page).getByRole("heading", { level: 3, name: d.risks })).toBeVisible();
    await expect(panel(page).locator("ul").filter({ hasText: text.risks[locale][0] }).locator("li")).toHaveText(
      text.risks[locale],
    );
    await expect(panel(page).getByRole("heading", { level: 3, name: d.steps })).toBeVisible();
    await expect(panel(page).locator("ol > li")).toHaveText(text.steps[locale]);
    await expect(panel(page)).toContainText(d.related(pick(text.related!)));

    expect(await overflows(page)).toBe(false);
    expect(outside, "requests to another origin").toEqual([]);
  });

  test(`${locale} AC1: the evidence is the 3 cited articles, newest first, each a new-tab link with source and age`, async ({
    page,
    baseURL,
  }) => {
    const outside: string[] = [];
    page.on("request", (request) => {
      if (!/^(data|blob):/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) {
        outside.push(request.url());
      }
    });
    await page.goto(detailUrl(locale, "cold-chain"));
    await expect(panel(page).getByRole("heading", { level: 3, name: d.evidence })).toBeVisible();
    // Stored as ecb, antara, conversation; shown by date: antara (1 day), conversation (3), ecb (6).
    const order = ["antara", "conversation", "ecb"].map(evidence);
    await expect(evidenceItems(page)).toHaveCount(3);
    for (const [index, e] of order.entries()) {
      const item = evidenceItems(page).nth(index);
      const link = item.getByRole("link", { name: e.headline });
      await expect(link).toHaveAttribute("href", `https://example.com/e2e/evidence/${e.key}`);
      await expect(link).toHaveAttribute("target", "_blank");
      expect(await link.getAttribute("rel")).toBe("noopener noreferrer");
      const source = { antara: "Antara", conversation: "The Conversation Indonesia", ecb: "European Central Bank" }[e.key]!;
      await expect(item).toContainText(`${source} · ${d.ago([1, 3, 6][index])}`);
    }

    // The credit line: the Conversation names its licence (linked to the deed), the ECB its name, Antara nothing.
    const conversation = evidenceItems(page).nth(1);
    await expect(conversation).toContainText(`${d.source("The Conversation Indonesia")} · CC BY-ND 4.0`);
    const licence = conversation.getByRole("link", { name: "CC BY-ND 4.0" });
    await expect(licence).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nd/4.0/");
    await expect(licence).toHaveAttribute("target", "_blank");
    expect(await licence.getAttribute("rel")).toBe("noopener noreferrer");
    await expect(evidenceItems(page).nth(2)).toContainText(
      d.source(locale === "en" ? "European Central Bank" : "Bank Sentral Eropa (ECB)"),
    );
    await expect(evidenceItems(page).nth(0)).not.toContainText(d.source(""));
    await expect(evidenceItems(page)).toHaveCount(3);
    // The summary of an article is not shown at all.
    await expect(panel(page)).not.toContainText(evidence("conversation").snippet);
    // No image, icon or other media.
    await expect(page.locator("main img, main svg image, main video, main iframe")).toHaveCount(0);
    expect(outside, "requests to another origin").toEqual([]);
  });

  test(`${locale}: an article of a switched-off source is not shown as evidence`, async ({ page }) => {
    try {
      await page.goto(detailUrl(locale, "solar"));
      // Shown by date: antara (1 day), the Katadata one (4), markup (8).
      await expect(evidenceItems(page)).toHaveCount(3);
      await expect(evidenceItems(page).nth(1)).toContainText(evidence("off").headline);

      runDb("deactivate", "katadata");
      await page.reload();
      await expect(evidenceItems(page)).toHaveCount(2);
      await expect(panel(page)).not.toContainText(evidence("off").headline);
      await expect(evidenceItems(page).nth(0)).toContainText(evidence("antara").headline);
    } finally {
      resetFixtures();
    }
  });

  test(`${locale}: an opportunity without a visible citation shows no evidence section, nor a related line without exposure`, async ({
    page,
  }) => {
    await page.goto(detailUrl(locale, "assistant"));
    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(pick(fixture("assistant").title));
    await expect(panel(page).getByRole("heading", { level: 3, name: d.breakdown })).toBeVisible();
    await expect(panel(page).getByRole("heading", { level: 3, name: d.evidence })).toHaveCount(0);
    await expect(panel(page)).not.toContainText(d.related(""));
  });

  test(`${locale}: reload and the language switch keep the same opportunity in the other language`, async ({ page }) => {
    const other = locale === "en" ? "id" : "en";
    const f = fixture("cold-chain");
    await page.goto(`${detailUrl(locale, "cold-chain")}?region=indonesia`);
    await page.reload();
    await expect(page).toHaveURL(`${detailUrl(locale, "cold-chain")}?region=indonesia`);
    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(pick(f.title));
    await expect(evidenceItems(page)).toHaveCount(3);

    await page.getByRole("group", { name: d.languageGroup }).getByRole("link", { name: d.otherLanguage }).click();
    await expect(page).toHaveURL(`${detailUrl(other, "cold-chain")}?region=indonesia`);
    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(f.title[other]);
    await expect(panel(page)).toContainText(f.thesis[other]);
    await expect(panel(page)).toContainText(detailCopy[other].breakdown);
    await expect(panel(page)).toContainText(detailOf(f).risks[other][0]);
    await expect(evidenceItems(page)).toHaveCount(3);
    await expect(page.locator("html")).toHaveAttribute("lang", other);
  });

  test(`${locale} 390 px: long text wraps inside the screen, in every part of the detail`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(detailUrl(locale, "long"));
    await expect(panel(page).getByRole("heading", { level: 2 })).toContainText(longTitle.slice(0, 30));
    await expect(panel(page)).toContainText(longEvidenceHeadline);
    await expect(evidenceItems(page)).toHaveCount(2);
    expect(await overflows(page)).toBe(false);
    // Nothing reaches past the right edge of the screen.
    for (const element of await panel(page).locator("h2, h3, li, dd, p, a").all()) {
      const box = await element.boundingBox();
      if (box) expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    // The same page in the normal case: no sideways scroll either.
    await page.goto(detailUrl(locale, "cold-chain"));
    await expect(evidenceItems(page)).toHaveCount(3);
    expect(await overflows(page)).toBe(false);
    for (const element of await panel(page).locator("h2, h3, li, dd, p, a").all()) {
      const box = await element.boundingBox();
      if (box) expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    expect(c.back).toBeTruthy();
  });
}

test("1280 px: on the list route the first item's whole detail sits beside the list", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto("/en/opportunities");
  await expect(panel(page).getByRole("meter")).toHaveCount(5);
  await expect(evidenceItems(page)).toHaveCount(3);
  await expect(panel(page).locator("dl dd").last()).toHaveText("▲ 12");
  // Choosing another one swaps the whole detail, evidence included.
  await items(page).filter({ hasText: fixture("solar").title.en }).getByRole("link").click();
  await expect(page).toHaveURL(detailUrl("en", "solar"));
  await expect(panel(page).getByRole("meter").first()).toHaveAttribute("aria-valuenow", String(factorsOf(78).demand));
  await expect(evidenceItems(page).first()).toContainText(evidence("antara").headline);
});

test("detail text and evidence are rendered as text, never as markup", async ({ page }) => {
  await page.goto(detailUrl("en", "markup"));
  await expect(panel(page)).toContainText(markupThesis);
  await expect(panel(page)).toContainText(markupTitle); // headline, buyer and risk: visible characters
  await expect(evidenceItems(page)).toHaveCount(1);
  await expect(evidenceItems(page).getByRole("link")).toHaveAttribute("href", "https://example.com/e2e/evidence/markup");
  await expect(page.locator("main img, main b, main script, main a[href^='javascript']")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

// ---- Text is text ------------------------------------------------------------------------------

test("opportunity text is rendered as text, never as markup", async ({ page }) => {
  await page.goto("/en/opportunities");
  const item = items(page).filter({ hasText: "Bold" });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(markupTitle); // the angle brackets are visible characters
  await expect(page.locator("main img, main b, main script")).toHaveCount(0);

  await page.setViewportSize(DESKTOP);
  await page.goto(`/en/opportunities/${idOf("markup")}`);
  await expect(panel(page)).toContainText(markupThesis);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(markupTitle);
  await expect(page.locator("main img, main b, main script, main a[href^='javascript']")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

// ---- Layout ----------------------------------------------------------------------------------

test("390 px: no sideways scroll with a very long title, in the list and in the detail, in both languages", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  for (const locale of ["en", "id"]) {
    await page.goto(`/${locale}/opportunities`);
    const long = items(page).filter({ hasText: longTitle.slice(0, 30) });
    await expect(long).toHaveCount(1);
    expect(await overflows(page), `${locale} list`).toBe(false);
    const box = (await long.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);

    await page.goto(`/${locale}/opportunities/${idOf("long")}`);
    await expect(page.getByRole("heading", { level: 2 })).toContainText(longTitle.slice(0, 30));
    expect(await overflows(page), `${locale} detail`).toBe(false);
  }
  // The four selects wrap inside the width.
  await page.goto("/id/opportunities");
  await expect(items(page).first()).toBeVisible();
  for (const name of ["region", "sector", "horizon", "capital"] as const) {
    const box = (await select(page, "id", name).boundingBox())!;
    expect(box.x + box.width, name).toBeLessThanOrEqual(390);
  }
});

test("every target of the list is at least 44 px tall on a phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/en/opportunities");
  await expect(items(page).first()).toBeVisible();
  for (const link of await items(page).getByRole("link").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  for (const name of ["region", "sector", "horizon", "capital"] as const) {
    expect((await select(page, "en", name).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

// ---- Stale ----------------------------------------------------------------------------------

/** WIB clock parts of an instant. */
function wib(at: Date) {
  const shifted = new Date(at.getTime() + 7 * 3600_000);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    clock: [shifted.getUTCHours(), shifted.getUTCMinutes()].map((n) => String(n).padStart(2, "0")),
  };
}

for (const locale of ["en", "id"] as const) {
  test(`${locale}: a scoring run more than 26 hours ago shows the stale banner with the WIB date and time; 25 hours does not`, async ({
    page,
  }) => {
    const c = copy[locale];
    try {
      runDb("fixtures", `--scores-run=${25 * 60}`);
      await page.goto(`/${locale}/opportunities`);
      await expect(items(page)).toHaveCount(listed.length);
      await expect(page.getByRole("status")).toHaveCount(0);

      const { scoresRun } = JSON.parse(runDb("fixtures", `--scores-run=${30 * 60}`));
      const then = wib(new Date(scoresRun));
      const time = then.clock.join(locale === "id" ? "." : ":");
      await page.goto(`/${locale}/opportunities`);
      await expect(page.getByRole("status")).toHaveText(c.stale(`${then.day} ${MONTHS[locale][then.month]}, ${time}`));
      // The stored opportunities are still listed under the banner.
      await expect(items(page)).toHaveCount(listed.length);
    } finally {
      resetFixtures();
    }
  });
}

test("opportunities without any scoring run are listed without a stale banner", async ({ page }) => {
  try {
    runDb("fixtures", "--scores-run=never");
    await page.goto("/en/opportunities");
    await expect(items(page)).toHaveCount(listed.length);
    await expect(page.getByRole("status")).toHaveCount(0);
  } finally {
    resetFixtures();
  }
});

test("the screen has a loading state: while the list loads, the skeleton is on screen", async ({ page }) => {
  await expectSkeletonOnNavigation(page, {
    from: "/en/news",
    link: "Opportunities",
    target: /\/en\/opportunities\?_rsc=/,
    loaded: () => items(page).first(),
  });
});

// ---- Store unreachable --------------------------------------------------------------------------

// As in e2e/news.spec.ts: the table the page reads is renamed away in the test's own e2e database
// and back, so no second server is needed.
test.describe("store unreachable", () => {
  for (const locale of ["en", "id"] as const) {
    test(`${locale}: the error state shows no host, port, password or stack trace, and retry works`, async ({ page }) => {
      const c = copy[locale];
      const url = `/${locale}/opportunities?region=indonesia`;

      await page.goto(url);
      await expect(items(page).first()).toBeVisible();

      try {
        runDb("break", "opportunities");
        await page.goto(url);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(c.title);
        await expect(page.locator("main")).toContainText(c.error[0]);
        const retry = page.getByRole("link", { name: c.error[1], exact: true });
        await expect(retry).toHaveAttribute("href", url);
        await expect(items(page)).toHaveCount(0);
        await expect(page.getByRole("banner").getByRole("navigation")).toBeVisible();

        // Neither the visible text nor the HTML (with the page data) holds a detail.
        const db = new URL(e2eDatabaseUrl());
        const html = await page.content();
        for (const detail of [
          db.hostname,
          db.port,
          db.pathname.slice(1),
          "postgres://",
          "postgres",
          'relation "', // what a database says about a missing table
          "42P01",
          "__off",
          "ECONNREFUSED",
          "digest",
          "node_modules",
          "    at ",
        ]) {
          expect(html, `the page leaks "${detail}"`).not.toContain(detail);
        }

        // The detail route shows the same state (not a 404), with its own retry link.
        await page.goto(`/${locale}/opportunities/1?region=indonesia`);
        await expect(page.locator("main")).toContainText(c.error[0]);
        await expect(page.getByRole("link", { name: c.error[1], exact: true })).toHaveAttribute(
          "href",
          `/${locale}/opportunities/1?region=indonesia`,
        );

        // The store is still down, so the retry link brings the same state back.
        await page.getByRole("link", { name: c.error[1], exact: true }).click();
        await expect(page.locator("main")).toContainText(c.error[0]);
      } finally {
        runDb("restore", "opportunities");
      }

      await page.goto(url);
      await expect(items(page).first()).toBeVisible();
    });
  }
});
