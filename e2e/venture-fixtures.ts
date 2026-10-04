// Deterministic venture data for the browser tests (Radar "My ventures"): pure data, stored by
// scripts/e2e-db.ts, read by e2e/radar-ventures.spec.ts.
// Performa Vision is connected: progress, both regions scored (up and down against yesterday), winds.
// Meta Klinik is not: no progress row; Indonesia unchanged, Worldwide without a score, a different pair of winds.

export const ventureInjection = `<script>window.__pwned=1</script> & "quotes"`;

type Pair = { en: string; id: string };

export type FixtureVenture = {
  slug: string;
  name: string;
  goal: "mvp" | "release";
  description: Pair;
  progress: { percent: number; sprintDelivered: number; sprintNext: number; ticketsInQa: number } | null;
  /** Today's score and yesterday's (null: no row for yesterday), per region; a null score is "no related news". */
  market: Record<"indonesia" | "global", { today: number | null; yesterday: number | null }>;
  winds: { tailwind: Pair | null; headwind: Pair | null };
  /** Relevances of the matches to the first articles stored; those below 50 are not counted. */
  matches: number[];
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
  },
];

/** The count the card shows: matches rated 50 or more. */
export const relatedCount = (v: FixtureVenture) => v.matches.filter((r) => r >= 50).length;
