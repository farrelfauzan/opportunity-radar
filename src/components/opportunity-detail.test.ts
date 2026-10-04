import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import id from "@/i18n/dictionaries/id.json";
import type { ArticleWithSource, OpportunityDetail } from "@/server/data";
import { Evidence, OpportunityPanel, ScoreBreakdown, TextList } from "./opportunity-detail";

const now = new Date("2026-10-04T05:00:00Z");

const item = {
  id: 7,
  titleEn: "Title",
  titleId: "Judul",
  thesisEn: "Thesis <b>text</b>",
  thesisId: "Tesis",
  region: "indonesia",
  sectors: ["logistics"],
  horizon: "6-12m",
  currentScore: 71,
  capitalLevel: "low",
  capitalReasonEn: "Cheap",
  capitalReasonId: "Murah",
  buyerEn: "Shops",
  buyerId: "Toko",
  modelEn: "Fee",
  modelId: "Biaya",
  risksEn: ["Risk A", "Risk B"],
  risksId: ["Risiko A", "Risiko B"],
  firstStepsEn: ["Step A"],
  firstStepsId: ["Langkah A"],
  relatedExposureEn: null,
  relatedExposureId: null,
  trend: { kind: "change", delta: 9 },
  latestScore: { opportunityId: 7, day: "2026-10-04", overall: 71, demand: 90, timing: 72, competition: 55, capital: 40, regulatory: 0 },
} as unknown as OpportunityDetail;

const article = (over: Partial<ArticleWithSource>): ArticleWithSource =>
  ({
    id: 1,
    headline: "Headline",
    link: "https://example.com/a",
    publishedAt: new Date("2026-10-04T03:00:00Z"),
    sourceName: "Antara",
    sourceSlug: "antara",
    ...over,
  }) as ArticleWithSource;

const panel = (over: Partial<OpportunityDetail> = {}, evidence: ArticleWithSource[] = [], locale: "en" | "id" = "en") =>
  renderToStaticMarkup(
    createElement(OpportunityPanel, { item: { ...item, ...over }, evidence, locale, m: locale === "en" ? en : id, now }),
  );

describe("OpportunityPanel", () => {
  test("shows the score, the five bars with their numbers, the facts, the risks and the steps", () => {
    const html = panel();
    expect(html).toContain(">71<");
    for (const [label, value] of [["Demand", 90], ["Timing", 72], ["Low competition", 55], ["Capital efficiency", 40], ["Low regulatory risk", 0]] as const) {
      expect(html).toContain(`aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"`);
      expect(html).toContain(`>${value}</span>`);
    }
    expect(html).toContain("Higher is better on every row");
    expect(html).toContain("Scores are AI estimates");
    expect(html).toContain("Low (Cheap)");
    expect(html).toContain("▲ 9");
    expect(html).toContain("Risk A");
    expect(html).toContain("Step A");
  });

  test("an empty risks list leaves out the whole Risks section, the steps stay", () => {
    const html = panel({ risksEn: [], risksId: [] });
    expect(html).not.toContain(">Risks<");
    expect(html).not.toContain("Risk A");
    expect(html).toContain("First steps to validate");
  });

  test("an empty steps list leaves out the steps section; both empty leave out both", () => {
    expect(panel({ firstStepsEn: [] })).not.toContain("First steps to validate");
    const none = panel({ risksEn: [], firstStepsEn: [] });
    expect(none).not.toContain(">Risks<");
    expect(none).not.toContain("First steps to validate");
  });

  test("the language picks the text; opportunity text is escaped, never markup", () => {
    expect(panel({}, [], "id")).toContain("Risiko A");
    expect(panel({}, [], "id")).toContain("Rincian skor");
    const html = panel();
    expect(html).toContain("Thesis &lt;b&gt;text&lt;/b&gt;");
    expect(html).not.toContain("<b>text</b>");
  });

  test("related exposure shows only when stored, as plain text", () => {
    expect(panel()).not.toContain("Related market exposure");
    expect(panel({ relatedExposureEn: "IDX stocks", relatedExposureId: "Saham IDX" })).toContain(
      "Related market exposure: IDX stocks",
    );
    expect(panel({ relatedExposureEn: "IDX stocks", relatedExposureId: "Saham IDX" }, [], "id")).toContain(
      "Eksposur pasar terkait: Saham IDX",
    );
  });

  test("without a score row there is no breakdown (no invented numbers)", () => {
    const html = panel({ latestScore: null });
    expect(html).not.toContain("Score breakdown");
    expect(html).not.toContain('role="meter"');
  });

  test("a section without cited articles has no Why now title", () => {
    expect(panel()).not.toContain("Why now");
  });
});

describe("parts", () => {
  test("TextList renders nothing for an empty list", () => {
    expect(renderToStaticMarkup(createElement(TextList, { id: "x", title: "Risks", items: [] }))).toBe("");
  });

  test("ScoreBreakdown renders nothing without a score", () => {
    expect(renderToStaticMarkup(createElement(ScoreBreakdown, { score: null, m: en }))).toBe("");
  });

  test("a bar is as wide as its number, and a number out of range is kept within the track", () => {
    const html = renderToStaticMarkup(
      createElement(ScoreBreakdown, { score: { ...item.latestScore!, demand: 130, regulatory: 0 }, m: en }),
    );
    expect(html).toContain("width:100%");
    expect(html).toContain("width:0%");
    expect(html).toContain("width:72%");
  });
});

describe("Evidence", () => {
  const render = (articles: ArticleWithSource[], locale: "en" | "id" = "en") =>
    renderToStaticMarkup(createElement(Evidence, { articles, now, locale, m: locale === "en" ? en : id }));

  test("nothing cited leaves the section out", () => {
    expect(render([])).toBe("");
  });

  test("a headline links to the publisher in a new tab with source and age, as text", () => {
    const html = render([article({ headline: "<i>Bold</i> & more" })]);
    expect(html).toContain('href="https://example.com/a" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("&lt;i&gt;Bold&lt;/i&gt; &amp; more");
    expect(html).toContain("Antara · 2h ago");
    expect(html).not.toContain("Source:"); // no credit for Antara
    expect(render([article({})], "id")).toContain("Antara · 2 jam lalu");
  });

  test("a link that is not http(s) is shown as plain text", () => {
    const html = render([article({ link: "javascript:alert(1)" })]);
    expect(html).not.toContain("<a ");
    expect(html).toContain("Headline");
  });

  test("the credit line shows for a licensed source only", () => {
    const html = render([article({ sourceSlug: "conversation-id", sourceName: "The Conversation Indonesia" })]);
    expect(html).toContain("Source: The Conversation Indonesia · ");
    expect(html).toContain("CC BY-ND 4.0");
    expect(render([article({ sourceSlug: "ecb", sourceName: "ECB" })])).toContain("Source: European Central Bank");
    expect(render([article({ sourceSlug: "techcrunch" })])).not.toContain("Source:");
  });

  test("the order is the order given", () => {
    const html = render([article({ id: 2, headline: "First" }), article({ id: 1, headline: "Second" })]);
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
  });
});
