// Deterministic venture data for the browser tests (Radar "My ventures"): pure data, stored by
// scripts/e2e-db.ts, read by e2e/radar-ventures.spec.ts.
// Performa Vision is connected: progress, both regions scored (up and down against yesterday), winds.
// Meta Klinik is not: no progress row; Indonesia unchanged, Worldwide without a score, a different pair of winds.
// The venture view (OR-51) adds to both: older market rows (the 30-day line), cited articles of the winds, and a third
// venture (Pasar Baru) that carries the long related-news list ("Load more"): its matches are only rows in
// venture_articles (the News fixtures' counts do not change), most of them filler articles of the days before today.

export const ventureInjection = `<script>window.__pwned=1</script> & "quotes"`;

type Pair = { en: string; id: string };

export type FixtureVenture = {
  slug: string;
  name: string;
  goal: "mvp" | "release";
  description: Pair;
  progress: { percent: number; sprintDelivered: number | null; sprintNext: number | null; ticketsInQa: number | null } | null;
  /** Today's score and yesterday's (null: no row for yesterday), per region; a null score is "no related news". */
  market: Record<"indonesia" | "global", { today: number | null; yesterday: number | null }>;
  winds: { tailwind: Pair | null; headwind: Pair | null };
  /** Relevances of the matches to the first articles stored; those below 50 are not counted. */
  matches: number[];
  /** Older market rows, [days ago (2 or more), score], per region: with today's and yesterday's they make the 30-day line. */
  earlier?: Record<"indonesia" | "global", [number, number | null][]>;
  /** Keys of the News fixture articles the winds cite (default: the first stored article, for both). */
  cites?: { tailwind: string[]; headwind: string[] };
  // ("first" is the first stored article; the others are the keys of News fixture articles, "licensed" being The Conversation's.)
  /** More matches, at relevance 80, to News fixture articles by their key (the order is the order of the list below). */
  matchKeys?: string[];
  /** Filler articles (published on the days before today, relevance 70) matched to the venture, and one more at relevance 49. */
  fillers?: number;
};

export const fixtureVentures: FixtureVenture[] = [
  {
    slug: "performa-vision",
    name: "Performa Vision",
    goal: "mvp",
    description: {
      en: "AI video analytics for workplace safety (CCTV, PPE detection)",
      id: "Analitik video AI untuk keselamatan kerja (CCTV, deteksi APD)",
    },
    progress: { percent: 62, sprintDelivered: 3, sprintNext: 4, ticketsInQa: 4 },
    market: { indonesia: { today: 76, yesterday: 71 }, global: { today: 68, yesterday: 70 } },
    winds: {
      tailwind: {
        en: `Stricter workplace-safety enforcement in manufacturing and mining. ${ventureInjection}`,
        id: `Penegakan K3 yang lebih ketat di manufaktur dan pertambangan. ${ventureInjection}`,
      },
      headwind: { en: "Global camera vendors bundling cheap on-device AI.", id: "Vendor kamera global menyertakan AI on-device murah." },
    },
    matches: [80, 50, 49], // two count
    // Indonesia: the 28 older days of the 30-day line but three gaps (5, 6 and 17 days ago); Worldwide: 6 scattered days.
    earlier: {
      indonesia: Array.from({ length: 28 }, (_, i): [number, number] => [i + 2, 60 + ((i * 7) % 15)]).filter(([ago]) => ![5, 6, 17].includes(ago)),
      global: [[3, 66], [4, 67], [9, 61], [10, 62], [25, 70], [29, 64]],
    },
    cites: { tailwind: ["first", "licensed"], headwind: ["tariff"] },
  },
  {
    slug: "meta-klinik",
    name: "Meta Klinik",
    goal: "release",
    description: {
      en: "Clinic management system (records, appointments, billing) <b>bold</b>",
      id: "Sistem manajemen klinik (rekam medis, janji temu, penagihan) <b>tebal</b>",
    },
    progress: null,
    market: { indonesia: { today: 81, yesterday: 81 }, global: { today: null, yesterday: null } },
    winds: {
      tailwind: { en: "Clinics must connect their records to the national health data platform.", id: "Klinik wajib menghubungkan rekam medis ke platform data kesehatan nasional." },
      headwind: { en: "Crowded clinic-software market.", id: "Pasar perangkat lunak klinik yang padat." },
    },
    matches: [40], // none counts
    // Indonesia: only two older days (gaps between); Worldwide never had a score.
    earlier: { indonesia: [[8, 78], [20, 74]], global: [] },
  },
  {
    slug: "pasar-baru",
    name: "Pasar Baru",
    goal: "release",
    description: { en: "Marketplace for neighbourhood grocers", id: "Pasar daring untuk warung kelontong" },
    // Some progress data is missing: the sentence leaves those parts out ("Next: sprint 2 · 1 ticket in QA").
    progress: { percent: 20, sprintDelivered: null, sprintNext: 2, ticketsInQa: 1 },
    market: { indonesia: { today: 55, yesterday: null }, global: { today: null, yesterday: null } },
    winds: {
      tailwind: { en: "Rising digital payments among small grocers.", id: "Pembayaran digital makin dipakai warung kecil." },
      headwind: { en: "Thin margins in grocery delivery.", id: "Margin tipis di pengantaran bahan pokok." },
    },
    matches: [],
    cites: { tailwind: ["licensed"], headwind: ["tariff"] },
    // Newest first: today's keyed News articles, then the filler (28 in all: a first page of 20 and 8 more).
    matchKeys: ["tariff", "rupiah", "coldchain", "failed", "markup-news", "licensed"],
    fillers: 22,
  },
];

/** The count the card shows: matches rated 50 or more. */
export const relatedCount = (v: FixtureVenture) => v.matches.filter((r) => r >= 50).length + (v.matchKeys?.length ?? 0) + (v.fillers ?? 0);

/** The scored days of a region, oldest first: [days ago, score]. A day without a score or a row is not in it. */
export function scoreSeries(v: FixtureVenture, region: "indonesia" | "global"): [number, number][] {
  const days: [number, number | null][] = [...(v.earlier?.[region] ?? []), [1, v.market[region].yesterday], [0, v.market[region].today]];
  return days.filter((d): d is [number, number] => d[1] !== null).sort((a, b) => b[0] - a[0]);
}
