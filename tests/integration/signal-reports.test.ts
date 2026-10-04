import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getSignal, getSignalReport, insertArticle, saveTriage, signalReportViews, upsertAsset, upsertCandles, upsertSource } from "@/server/data";
import { db } from "@/server/data/client";
import { SAMPLE_NOTE, writeSignalReports } from "@/server/signals/explain";
import { computeSignals } from "@/server/signals/job";

// rising_noisy ends on Friday 2026-10-02; the jobs run that evening (WIB).
const FRIDAY = new Date("2026-10-02T11:00:00Z");

const fixture = () =>
  readFileSync(new URL("../../docs/signals/fixtures/rising_noisy.csv", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [day, close] = line.split(",");
      const c = Number(close);
      return { day, open: c, high: c, low: c, close: c, volume: null };
    });

let counter = 0;
async function stockWithNews(source = "yahoo") {
  const asset = await upsertAsset({ slug: "test-stock", symbol: "TSTK", name: "Teststock", kind: "stock", exchange: "US", currency: "USD", source: "yahoo" });
  await upsertCandles(asset.id, source, fixture());
  await computeSignals({ now: () => FRIDAY });
  const feed = await upsertSource({ slug: "s", name: "S", feedUrl: "https://example.com/f.xml", region: "global", category: "markets" });
  const ids: number[] = [];
  for (const headline of ["Teststock wins a big contract", "Teststock faces a lawsuit", "Unrelated news about rice"]) {
    const { article } = await insertArticle({ sourceId: feed.id, link: `https://example.com/r/${++counter}`, region: "global", category: "markets", headline, publishedAt: new Date(FRIDAY.getTime() - 3600_000) });
    ids.push(article.id);
  }
  await saveTriage(ids.map((articleId) => ({ articleId, status: "ok" as const, category: "markets" as const, region: "global" as const, relevance: 70, impact: "context" as const, whyEn: "Why.", whyId: "Mengapa.", themes: ["other" as const] })));
  return { asset, ids };
}

/** A fake provider answering with `reply(data)`; records the article ids it was sent. */
function provider(reply: (data: { verdict: string; articles: { id: number }[] }) => unknown) {
  const sent: number[][] = [];
  const transport = (async (_u: string, init?: RequestInit) => {
    const user = (JSON.parse(String(init?.body)) as { messages: { content: string }[] }).messages[1].content;
    const data = JSON.parse(/<<<SIGNAL-[0-9a-f]+\n(.*)\nSIGNAL-[0-9a-f]+>>>/.exec(user)![1]);
    sent.push(data.articles.map((a: { id: number }) => a.id));
    return Response.json({ choices: [{ message: { content: JSON.stringify(reply(data)) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
  }) as typeof fetch;
  return { transport, sent };
}
const word = (verdict: string) => ({ BUY: ["buy", "beli"], HOLD: ["hold", "tahan"], SELL: ["sell", "jual"] })[verdict as "BUY"]!;
const valid = (data: { verdict: string; articles: { id: number }[] }) => ({
  explanation: { en: `Both trend checks point up, so the rules give a ${word(data.verdict)[0]} signal.`, id: `Kedua pemeriksaan tren naik, sehingga aturan memberi sinyal ${word(data.verdict)[1]}.` },
  risks: { en: ["The trend can turn."], id: ["Tren dapat berbalik."] },
  news: { supportive: data.articles.slice(0, 1).map((a) => a.id), against: data.articles.slice(1, 2).map((a) => a.id) },
});

beforeEach(async () => {
  await db().execute(sql`truncate assets, articles, sources, llm_usage restart identity cascade`);
  delete process.env.SHOW_SAMPLE_SIGNALS;
});
afterEach(() => {
  delete process.env.SHOW_SAMPLE_SIGNALS;
});

describe("signal reports (OR-33)", () => {
  test("a valid reply is stored in both languages, with the rule verdict and real cited articles (AC2)", async () => {
    const { asset, ids } = await stockWithNews();
    const { transport, sent } = provider(valid);

    const outcome = await writeSignalReports({ transport, now: () => FRIDAY });

    expect(outcome).toMatchObject({ status: "ok", counts: { due: 2, written: 2 } });
    expect(sent[0].sort()).toEqual([ids[0], ids[1]]); // only the asset's news (whole-word match), not the rice story
    for (const term of ["short", "long"] as const) {
      const report = (await getSignalReport(asset.id, term))!;
      expect(report.verdict).toBe((await getSignal(asset.id, term))!.state);
      expect(report.explanationEn).not.toBe("");
      expect(report.explanationId).not.toBe("");
      expect(report).toMatchObject({ newsSupportive: [ids[0]], newsAgainst: [ids[1]], newsTotal: 2, rulesVersion: "rules v1", synthetic: false });
    }
  });

  test("a reply stating another verdict, twice: rejected, nothing stored, the run partial (AC1)", async () => {
    const { asset } = await stockWithNews();
    const { transport } = provider((d) => ({ ...valid(d), explanation: { en: "The asset is a sell on these checks.", id: "Aset ini sinyal jual." } }));

    const outcome = await writeSignalReports({ transport, now: () => FRIDAY });

    expect(outcome).toMatchObject({ status: "partial", counts: { written: 0, rejected: 2 } });
    expect(outcome.error).toMatch(/another verdict/);
    expect(await getSignalReport(asset.id, "long")).toBeNull();
  });

  test("'you should' twice: rejected by the guard and counted", async () => {
    await stockWithNews();
    const { transport } = provider((d) => ({ ...valid(d), explanation: { ...valid(d).explanation, en: `You should keep the ${word(d.verdict)[0]} signal in mind.` } }));
    const outcome = await writeSignalReports({ transport, now: () => FRIDAY });
    expect(outcome.counts).toMatchObject({ written: 0, rejected: 2 });
    expect(outcome.counts?.wording_rejected).toBeGreaterThan(0);
  });

  test("a sample-data signal: both texts start with sample.signalNote, and the screens see it only with SHOW_SAMPLE_SIGNALS=1 (AC3)", async () => {
    const { asset } = await stockWithNews("synthetic");
    await writeSignalReports({ transport: provider(valid).transport, now: () => FRIDAY });

    const report = (await getSignalReport(asset.id, "long"))!;
    expect(report.explanationEn.startsWith("Signal computed on sample data, not on real prices. ")).toBe(true);
    expect(report.explanationId.startsWith("Sinyal dihitung dari data contoh, bukan dari harga nyata. ")).toBe(true);
    expect(SAMPLE_NOTE.en).toBe("Signal computed on sample data, not on real prices.");
    expect(report.synthetic).toBe(true);
    expect(await signalReportViews(asset.id)).toEqual([]);
    process.env.SHOW_SAMPLE_SIGNALS = "1";
    expect((await signalReportViews(asset.id)).length).toBe(2);
  });

  test("a rerun the same day makes no call; a changed verdict, or a week later, makes one", async () => {
    const { asset } = await stockWithNews();
    await writeSignalReports({ transport: provider(valid).transport, now: () => FRIDAY });

    const again = provider(valid);
    expect((await writeSignalReports({ transport: again.transport, now: () => FRIDAY })).counts).toMatchObject({ due: 0 });
    expect(again.sent).toHaveLength(0);

    await db().execute(sql`update signal_reports set verdict = 'SELL' where asset_id = ${asset.id} and term = 'long'`); // as if the verdict had changed since
    const changed = provider(valid);
    expect((await writeSignalReports({ transport: changed.transport, now: () => FRIDAY })).counts).toMatchObject({ due: 1, written: 1 });

    const weekLater = provider(valid);
    expect((await writeSignalReports({ transport: weekLater.transport, now: () => new Date(FRIDAY.getTime() + 8 * 86400_000) })).counts).toMatchObject({ due: 2 });
  });

  test("a no-verdict state gets no report", async () => {
    const asset = await upsertAsset({ slug: "short-history", symbol: "SH", name: "Short", kind: "stock", exchange: "US", currency: "USD", source: "yahoo" });
    await upsertCandles(asset.id, "yahoo", fixture().slice(-120)); // long term INSUFFICIENT
    await computeSignals({ now: () => FRIDAY });
    const { transport } = provider(valid);
    expect((await writeSignalReports({ transport, now: () => FRIDAY })).counts).toMatchObject({ due: 1 }); // the short term only
  });

  test("pnpm job explanations runs on the mock", async () => {
    await stockWithNews();
    const outcome = await writeSignalReports({ now: () => FRIDAY }); // the mock provider (LLM_PROVIDER unset)
    expect(outcome).toMatchObject({ status: "ok", counts: { written: 2 } });
  });
});
