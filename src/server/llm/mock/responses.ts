// Recorded replies for LLM_PROVIDER=mock (the default). Each job that calls the
// LLM adds its cases here (OR-14, OR-15, OR-50, OR-16, OR-22, OR-33, OR-38).
// A case answers when every string in `match` occurs in the request's messages;
// the first matching case of the job wins. Replies are OpenAI chat-completion
// message contents; `usage` is what the provider would report.
//
// These are hand-written in the shape 9router returns, not captured from it:
// the live endpoint is not available yet (OR-52 records real ones).

export type MockCase = {
  name: string;
  match?: string[];
  /** The reply, or a function building it from the request's text (for replies that echo ids). */
  content: string | ((requestText: string) => string);
  usage?: { prompt_tokens: number; completion_tokens: number };
};

/** The JSON inside a fenced data block (see fenceUntrusted) of the request. */
function fencedData(requestText: string, label: string): unknown {
  const block = new RegExp(`<<<${label}-([0-9a-f]+)\\n([\\s\\S]*?)\\n${label}-\\1>>>`).exec(requestText);
  return block ? JSON.parse(block[2]) : [];
}

/** A well-formed opportunity citing the given articles, every text marked "[mock]". */
function mockOpportunity(articles: { id: string; region: string; themes?: string[] }[]) {
  const t = (en: string, id: string) => ({ en: `[mock] ${en}`, id: `[mock] ${id}` });
  const reason = t("Recorded reply: AI scoring is not live yet.", "Jawaban rekaman: penilaian AI belum aktif.");
  const theme = articles[0].themes?.find((x) => x !== "other") ?? "ai_adoption";
  return {
    title: t("Example opportunity from recent news", "Contoh peluang dari berita terbaru"),
    thesis: t("A placeholder written by the local mock; the live model writes the real thesis.", "Teks pengganti dari mock lokal; model asli menulis tesis sebenarnya."),
    region: articles[0].region,
    theme,
    sectors: ["ai_software"],
    horizon: "6-12m",
    capital: { level: "medium", reason },
    buyer: t("Small and medium businesses", "Usaha kecil dan menengah"),
    model: t("Subscription", "Langganan"),
    risks: [t("The mock cannot judge risk.", "Mock tidak dapat menilai risiko."), t("Placeholder risk.", "Risiko pengganti.")],
    firstSteps: [t("Turn on the live model (OR-52).", "Aktifkan model asli (OR-52).")],
    factors: Object.fromEntries(["demand", "timing", "competition", "capital", "regulatory"].map((k) => [k, { score: 50, reason }])),
    citations: articles.slice(0, 2).map((a) => a.id),
  };
}

export const MOCK_RESPONSES: Record<string, MockCase[]> = {
  // OR-22: three "[mock]" lines citing the first articles and today's opportunity changes.
  brief: [
    {
      name: "three-lines",
      content: (requestText) => {
        const data = fencedData(requestText, "BRIEF") as { articles: { id: number; category: string }[]; opportunities: { id: number }[] };
        const opp = data.opportunities.map((o) => o.id).slice(0, 2);
        return JSON.stringify({
          lines: [0, 1, 2].map((i) => ({
            label: data.articles[i]?.category ?? "business",
            en: `[mock] Recorded brief line ${i + 1}: the AI brief is not live yet.`,
            id: `[mock] Baris ringkasan rekaman ${i + 1}: ringkasan AI belum aktif.`,
            opportunityIds: i === 0 ? opp : [],
            articleIds: [data.articles[i]?.id ?? data.articles[0].id],
          })),
        });
      },
      usage: { prompt_tokens: 3000, completion_tokens: 400 },
    },
  ],
  // OR-33: a "[mock]" explanation naming only the rules' verdict, one risk, the first article as supportive.
  explanations: [
    {
      name: "plain-report",
      content: (requestText) => {
        const data = fencedData(requestText, "SIGNAL") as { verdict: "BUY" | "HOLD" | "SELL"; articles: { id: number }[] };
        const word = { BUY: ["buy", "beli"], HOLD: ["hold", "tahan"], SELL: ["sell", "jual"] }[data.verdict] ?? ["hold", "tahan"];
        return JSON.stringify({
          explanation: {
            en: `[mock] Recorded explanation: the rules give a ${word[0]} signal; the AI explanation is not live yet.`,
            id: `[mock] Penjelasan rekaman: aturan memberi sinyal ${word[1]}; penjelasan AI belum aktif.`,
          },
          risks: { en: ["[mock] Recorded risk: prices can move against the signal."], id: ["[mock] Risiko rekaman: harga dapat bergerak berlawanan dengan sinyal."] },
          news: { supportive: data.articles.slice(0, 1).map((a) => a.id), against: [] },
        });
      },
      usage: { prompt_tokens: 1200, completion_tokens: 300 },
    },
  ],
  // OR-38: every matched article rated relevant, middle scores, a "[mock]" wind pair.
  ventures: [
    {
      name: "middle-view",
      content: (requestText) => {
        const data = fencedData(requestText, "VENTURE") as { articles: { id: number }[] };
        const ids = data.articles.map((a) => a.id);
        const scores = { demand: 50, timing: 50, competition: 50, capital: 50, regulatory: 50 };
        const wind = (en: string, id: string) => ({ en: `[mock] ${en}`, id: `[mock] ${id}`, articleIds: ids.slice(0, 1) });
        return JSON.stringify({
          articles: ids.map((id) => ({ id, relevance: 60 })),
          markets: { indonesia: scores, global: scores },
          tailwind: wind("Recorded reply: the AI market view is not live yet.", "Jawaban rekaman: pandangan pasar AI belum aktif."),
          headwind: wind("Recorded reply: no real assessment.", "Jawaban rekaman: belum ada penilaian sebenarnya."),
        });
      },
      usage: { prompt_tokens: 2500, completion_tokens: 500 },
    },
  ],
  // OR-16: the same middle score on every factor, marked "[mock]".
  scores: [
    {
      name: "middle-scores",
      content: JSON.stringify({
        factors: Object.fromEntries(
          ["demand", "timing", "competition", "capital", "regulatory"].map((k) => [
            k,
            { score: 50, reason: { en: "[mock] Recorded reply: AI scoring is not live yet.", id: "[mock] Jawaban rekaman: penilaian AI belum aktif." } },
          ]),
        ),
      }),
      usage: { prompt_tokens: 1500, completion_tokens: 400 },
    },
  ],
  // OR-15: one opportunity citing the first two articles, so the Opportunities screen has data offline.
  opportunities: [
    {
      name: "one-mock-opportunity",
      content: (requestText) => {
        const articles = fencedData(requestText, "ARTICLES") as { id: string; region: string; themes?: string[] }[];
        return JSON.stringify({ opportunities: articles.length >= 2 ? [mockOpportunity(articles)] : [] });
      },
      usage: { prompt_tokens: 4000, completion_tokens: 1500 },
    },
  ],
  // OR-14: one well-formed item per article, so the News screen has data offline.
  // Every text says it is a mock reply; the category and region stay the feed's.
  triage: [
    {
      name: "echo-articles",
      content: (requestText) =>
        JSON.stringify({
          items: (fencedData(requestText, "ARTICLES") as { id: number; region: string; feedCategory: string }[]).map((a) => ({
            id: a.id,
            category: a.feedCategory,
            region: a.region,
            relevance: 50,
            impact: "context",
            why: { en: "[mock] Recorded reply: AI triage is not live yet.", id: "[mock] Jawaban rekaman: triase AI belum aktif." },
            themes: ["other"],
          })),
        }),
      usage: { prompt_tokens: 900, completion_tokens: 600 },
    },
  ],
  // pnpm job llm-smoke: one tiny call that proves the client end to end.
  "llm-smoke": [
    {
      name: "pong",
      content: '{"ok":true,"reply":"pong"}',
      usage: { prompt_tokens: 24, completion_tokens: 9 },
    },
  ],
};
