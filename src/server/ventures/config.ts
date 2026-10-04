import type { NewVenture } from "@/server/data";

// The owner's ventures. Edited here in v1 (no UI); `pnpm db:seed` writes them to
// the store and running it again changes nothing. Descriptions are the ones on
// the Radar card (docs/design/Main.dc.html, Main-ID.dc.html).
export const VENTURES: NewVenture[] = [
  {
    slug: "performa-vision",
    name: "Performa Vision",
    descriptionEn: "AI video analytics for workplace safety (CCTV, PPE detection)",
    descriptionId: "Analitik video AI untuk keselamatan kerja (CCTV, deteksi APD)",
    // Sector ids from docs/opportunities/scoring-v1.md §7.
    sectors: ["ai_software", "manufacturing", "energy_mining"],
    // Matched against headlines and snippets (OR-38), in both languages.
    keywords: [
      "workplace safety", "occupational safety", "keselamatan kerja", "K3",
      "PPE", "APD", "CCTV", "video analytics", "computer vision", "kecelakaan kerja",
    ],
    progressGoal: "mvp",
    // Read from its Notion board by OR-37 once the token is configured.
    progressSource: "notion",
  },
  {
    slug: "meta-klinik",
    name: "Meta Klinik",
    descriptionEn: "Clinic management system (records, appointments, billing)",
    descriptionId: "Sistem manajemen klinik (rekam medis, janji temu, penagihan)",
    sectors: ["health_biotech", "ai_software"],
    keywords: [
      "clinic", "klinik", "electronic medical record", "rekam medis", "SATUSEHAT",
      "BPJS Kesehatan", "health data", "puskesmas", "health-tech", "telemedicine",
    ],
    progressGoal: "release",
    // Not connected until its board is named (OR-47).
    progressSource: null,
  },
];
