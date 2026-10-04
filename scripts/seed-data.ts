// Seed set for development and QA: 66 articles (OR-9) and 13 opportunities with score
// history (OR-17), all with times relative to now.
import { wibDay } from "../src/server/data/index.ts";
import type {
  CapitalLevel,
  Category,
  Horizon,
  NewOpportunity,
  NewScore,
  NewSource,
  Region,
  Sector,
} from "../src/server/data/index.ts";
import { FEEDS } from "../src/server/news/feeds.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;

// The real feed list, so seeded and ingested articles share the same sources.
export const seedSources: NewSource[] = FEEDS;

export type SeedArticle = {
  source: string;
  region: Region;
  category: Category;
  headline: string;
  snippet: string;
  path: string;
  publishedAt: Date;
};

const item = (
  source: string,
  region: Region,
  category: Category,
  headline: string,
  ageMs: number,
  now: number,
  snippet = "Seed article for local development and QA. Not a real news item.",
): SeedArticle => ({
  source,
  region,
  category,
  headline,
  snippet,
  path: `${category}/${region}/${headline.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`,
  publishedAt: new Date(now - ageMs),
});

export function seedArticles(now = Date.now()): SeedArticle[] {
  const list: SeedArticle[] = [];

  // 32 Global "Tech & AI" articles, 20 minutes apart: one filter with more than 30 items.
  for (let i = 1; i <= 32; i++) {
    list.push(
      item(i % 2 ? "techcrunch" : "bbc-technology", "global", "tech-ai", `AI infrastructure update ${i}`, i * 20 * MIN, now),
    );
  }

  // Every other category and region pair gets a few articles, except
  // Commodities + Global, which stays empty on purpose (empty state).
  const pairs: [string, Region, Category, string[]][] = [
    ["antara", "indonesia", "business", ["UMKM digital tumbuh di luar Jawa", "Ekspor furnitur naik pada kuartal ketiga", "Pemerintah siapkan insentif kawasan industri", "Startup logistik raih pendanaan baru"]],
    ["bbc-business", "global", "business", ["Retailers report slower holiday orders", "Shipping costs ease on Asia routes", "Airlines add capacity to Southeast Asia", "Factory output steadies in major economies"]],
    ["cnn-indonesia", "indonesia", "politics", ["DPR bahas aturan baru pusat data", "Aturan sertifikasi halal diperluas", "Pemerintah revisi aturan impor", "Daerah percepat perizinan usaha"]],
    ["the-guardian", "global", "politics", ["New tariff round announced between major economies", "Regulators agree on AI safety reporting", "Trade talks resume after a pause", "Carbon border rules enter a new phase"]],
    ["katadata", "indonesia", "tech-ai", ["Operator pusat data tambah kapasitas di Batam", "Bank adopsi asisten AI untuk layanan nasabah", "Startup AI lokal rilis model bahasa Indonesia", "Investasi cloud di Indonesia meningkat"]],
    ["cnbc-indonesia", "indonesia", "markets", ["IHSG ditutup menguat tipis", "Rupiah melemah terhadap dolar AS", "Saham perbankan pimpin penguatan", "Investor asing catat beli bersih"]],
    ["cnbc", "global", "markets", ["Stocks edge higher ahead of rate decision", "Bond yields rise on strong jobs data", "Dollar firms against Asian currencies", "Tech shares lead a late rally"]],
    ["idx-channel", "indonesia", "commodities", ["Harga nikel naik setelah pembatasan ekspor", "Harga emas Antam cetak rekor baru", "Produksi batu bara turun pada September", "Harga CPO menguat di awal pekan"]],
  ];
  // Ages: 5 minutes, 2 hours, 23 hours and yesterday (26 hours).
  const ages = [5 * MIN, 2 * HOUR, 23 * HOUR, 26 * HOUR];
  for (const [source, region, category, headlines] of pairs) {
    headlines.forEach((headline, i) => list.push(item(source, region, category, headline, ages[i], now)));
  }

  // Edge cases.
  list.push(
    item("bbc-business", "global", "business", "Article dated one hour in the future", -HOUR, now),
    item(
      "the-guardian",
      "global",
      "business",
      'Markup must show as text: <b>bold</b> <script>alert("x")</script> & "quotes"',
      3 * HOUR,
      now,
      'Snippet with markup: <img src=x onerror=alert(1)> <a href="javascript:alert(1)">link</a>',
    ),
  );

  return list;
}

// ---- Opportunities (OR-17) ------------------------------------------------------------------

const DAY = 24 * HOUR;

type Pair = { en: string; id: string };
const t = (en: string, id: string): Pair => ({ en, id });

type Factors = [demand: number, timing: number, competition: number, capital: number, regulatory: number];

/** Equal-weight mean of the five factors, rounded (docs/opportunities/scoring-v1.md section 1). */
export const overallOf = (f: Factors) => Math.round(f.reduce((sum, n) => sum + n, 0) / 5);

type SeedOpportunity = {
  title: Pair;
  thesis: Pair;
  region: Region;
  theme: string;
  sectors: Sector[];
  horizon: Horizon;
  capital: { level: CapitalLevel; reason: Pair };
  buyer: Pair;
  model: Pair;
  risks: Pair[];
  firstSteps: Pair[];
  exposure?: Pair;
  /** Today's five factor scores. */
  factors: Factors;
  /** Days since the first score (the history has one row per day), and the overall score on that first day. */
  age: number;
  from: number;
  /** Closed this many days ago: scores stop on that day. */
  closedDaysAgo?: number;
};

const seedOpportunityList: SeedOpportunity[] = [
  {
    title: t("Cold-chain logistics for small fish farmers", "Logistik rantai dingin untuk pembudidaya ikan kecil"),
    thesis: t(
      "Aquaculture output is growing in eastern Indonesia, but fresh fish still loses value on the way to cities. Shared cold storage and refrigerated pick-ups could serve farmers that big carriers ignore.",
      "Produksi budidaya di Indonesia timur terus naik, tetapi ikan segar masih kehilangan nilai dalam perjalanan ke kota. Gudang dingin bersama dan penjemputan berpendingin dapat melayani pembudidaya yang diabaikan perusahaan logistik besar.",
    ),
    region: "indonesia",
    theme: "logistics_supply_chain",
    sectors: ["logistics", "fisheries_maritime"],
    horizon: "6-12m",
    capital: { level: "medium", reason: t("Used cold-storage containers and two refrigerated vans", "Kontainer pendingin bekas dan dua van berpendingin") },
    buyer: t("Fish farmer groups, restaurants and hotel kitchens", "Kelompok pembudidaya ikan, restoran dan dapur hotel"),
    model: t("Per-kilogram handling fee plus a monthly storage subscription", "Biaya penanganan per kilogram ditambah langganan penyimpanan bulanan"),
    risks: [
      t("Electricity cost and outages in remote areas", "Biaya dan pemadaman listrik di daerah terpencil"),
      t("Fuel price changes squeeze delivery margins", "Perubahan harga BBM menekan margin pengiriman"),
      t("Trust takes time: farmers may keep selling to local traders", "Kepercayaan butuh waktu: pembudidaya mungkin tetap menjual ke pengepul lokal"),
    ],
    firstSteps: [
      t("Interview 10 farmer groups about losses before they reach the market", "Wawancarai 10 kelompok pembudidaya tentang kerugian sebelum ikan sampai pasar"),
      t("Rent cold storage for one month and run a pilot route", "Sewa gudang dingin selama sebulan dan jalankan satu rute uji coba"),
    ],
    exposure: t("Logistics and consumer-staples stocks on the IDX", "Saham logistik dan barang konsumsi pokok di BEI"),
    factors: [86, 82, 70, 58, 78],
    age: 45,
    from: 62,
  },
  {
    title: t("Rooftop solar leasing for small factories", "Sewa panel surya atap untuk pabrik kecil"),
    thesis: t(
      "Industrial electricity tariffs keep rising and panel prices keep falling. Small factories want lower bills without paying the full installation cost up front.",
      "Tarif listrik industri terus naik dan harga panel terus turun. Pabrik kecil ingin tagihan lebih rendah tanpa membayar penuh biaya pemasangan di awal.",
    ),
    region: "indonesia",
    theme: "renewable_energy",
    sectors: ["renewables_climate", "manufacturing"],
    horizon: "6-12m",
    capital: { level: "high", reason: t("Panels are financed by you and repaid over five years", "Panel Anda danai sendiri dan dibayar kembali selama lima tahun") },
    buyer: t("Small and mid-sized factories with daytime power use", "Pabrik kecil dan menengah dengan pemakaian listrik siang hari"),
    model: t("Monthly lease priced below the grid tariff, with a buy-out option", "Sewa bulanan di bawah tarif PLN, dengan opsi pembelian"),
    risks: [
      t("Net-metering rules for industrial users may change", "Aturan net-metering untuk pengguna industri dapat berubah"),
      t("Tenants can leave before the panels are repaid", "Penyewa dapat pergi sebelum panel lunas"),
      t("Large installers can cut prices to win the same customers", "Instalatur besar dapat menurunkan harga untuk merebut pelanggan yang sama"),
    ],
    firstSteps: [
      t("Collect electricity bills from five factories and size a system", "Kumpulkan tagihan listrik dari lima pabrik dan hitung ukuran sistem"),
      t("Ask two installers for a partner price", "Minta harga mitra dari dua instalatur"),
    ],
    factors: [78, 72, 55, 35, 70],
    age: 45,
    from: 70,
  },
  {
    title: t("WhatsApp customer-service assistant for online shops", "Asisten layanan pelanggan WhatsApp untuk toko online"),
    thesis: t(
      "Small online sellers answer the same questions all day on WhatsApp. A ready-made assistant that knows their catalogue and order status can cut replies from minutes to seconds at a low monthly price.",
      "Penjual online kecil menjawab pertanyaan yang sama sepanjang hari di WhatsApp. Asisten siap pakai yang memahami katalog dan status pesanan dapat mempercepat balasan dari menit menjadi detik dengan harga bulanan murah.",
    ),
    region: "indonesia",
    theme: "ai_adoption",
    sectors: ["ai_software", "retail_ecommerce"],
    horizon: "0-6m",
    capital: { level: "low", reason: t("Cloud costs and a part-time developer", "Biaya cloud dan satu pengembang paruh waktu") },
    buyer: t("Owners of small online shops with 50 to 500 orders a month", "Pemilik toko online kecil dengan 50 sampai 500 pesanan per bulan"),
    model: t("Monthly subscription per shop, tiered by message volume", "Langganan bulanan per toko, bertingkat menurut jumlah pesan"),
    risks: [
      t("Messaging platform rules and fees can change", "Aturan dan biaya platform pesan dapat berubah"),
      t("Many chat tools already exist; switching must be effortless", "Banyak alat chat sudah ada; berpindah harus sangat mudah"),
    ],
    firstSteps: [
      t("Build a demo for one product category and test it with 10 shops", "Buat demo untuk satu kategori produk dan uji pada 10 toko"),
      t("Check the platform's business messaging terms", "Periksa ketentuan pesan bisnis platform"),
    ],
    factors: [74, 80, 40, 88, 85],
    age: 45,
    from: 73,
  },
  {
    title: t("Scam-protection tools for small businesses", "Alat perlindungan penipuan untuk usaha kecil"),
    thesis: t(
      "Reports of payment and impersonation scams keep rising. Small businesses lack a security team and need simple checks on payment requests and unknown links.",
      "Laporan penipuan pembayaran dan penyamaran terus naik. Usaha kecil tidak punya tim keamanan dan butuh pemeriksaan sederhana untuk permintaan pembayaran dan tautan asing.",
    ),
    region: "indonesia",
    theme: "cybersecurity",
    sectors: ["fintech_finance", "ai_software"],
    horizon: "0-6m",
    capital: { level: "low", reason: t("Software only; no inventory", "Hanya perangkat lunak; tanpa stok barang") },
    buyer: t("Shop owners, bookkeepers and small finance teams", "Pemilik toko, pembukuan dan tim keuangan kecil"),
    model: t("Per-seat subscription with a free tier for one user", "Langganan per pengguna dengan paket gratis untuk satu pengguna"),
    risks: [
      t("A missed scam damages trust quickly", "Penipuan yang lolos cepat merusak kepercayaan"),
      t("Banks and wallets may add the same checks for free", "Bank dan dompet digital dapat menambah pemeriksaan serupa gratis"),
    ],
    firstSteps: [
      t("List the ten most common scam messages from shop owners", "Daftar sepuluh pesan penipuan paling umum dari pemilik toko"),
      t("Prototype a link and payment-request checker", "Buat prototipe pemeriksa tautan dan permintaan pembayaran"),
    ],
    factors: [75, 70, 45, 85, 60],
    age: 3,
    from: 66,
  },
  {
    title: t("Climate-resilient farming services", "Layanan pertanian tahan iklim"),
    thesis: t(
      "Irregular rainfall is hurting yields. Farmers need planting-calendar advice, drought-tolerant seed access and small irrigation kits delivered together by a trusted local service.",
      "Curah hujan yang tidak menentu menurunkan hasil panen. Petani butuh saran kalender tanam, akses benih tahan kering dan paket irigasi kecil yang diberikan bersama oleh layanan lokal tepercaya.",
    ),
    region: "indonesia",
    theme: "food_security",
    sectors: ["agri_food"],
    horizon: "6-12m",
    capital: { level: "medium", reason: t("Demo plots, field staff and a small stock of kits", "Lahan contoh, petugas lapangan dan stok kecil paket irigasi") },
    buyer: t("Farmer cooperatives and local governments", "Koperasi tani dan pemerintah daerah"),
    model: t("Service contracts per hectare plus margin on kits", "Kontrak layanan per hektare ditambah margin dari paket irigasi"),
    risks: [
      t("Payments depend on harvest cycles", "Pembayaran bergantung pada siklus panen"),
      t("Free government extension services compete for the same farmers", "Penyuluhan pemerintah yang gratis bersaing untuk petani yang sama"),
      t("Results take a full season to prove", "Hasil butuh satu musim penuh untuk dibuktikan"),
    ],
    firstSteps: [
      t("Pick one district and meet its cooperative leaders", "Pilih satu kabupaten dan temui pengurus koperasinya"),
      t("Run a one-hectare pilot with a drought-tolerant seed", "Jalankan uji coba satu hektare dengan benih tahan kering"),
    ],
    factors: [70, 75, 55, 50, 70],
    age: 29,
    from: 58,
  },
  {
    title: t("Tax-compliance tool for online sellers", "Alat kepatuhan pajak untuk penjual online"),
    thesis: t(
      "New reporting rules for marketplace sellers mean thousands of small shops must track sales and file correctly. A simple tool that reads marketplace reports and prepares the figures fills a clear gap.",
      "Aturan pelaporan baru bagi penjual marketplace berarti ribuan toko kecil harus mencatat penjualan dan melapor dengan benar. Alat sederhana yang membaca laporan marketplace dan menyiapkan angkanya mengisi celah yang jelas.",
    ),
    region: "indonesia",
    theme: "indonesia_policy",
    sectors: ["retail_ecommerce", "fintech_finance"],
    horizon: "0-6m",
    capital: { level: "low", reason: t("Software and one tax adviser on call", "Perangkat lunak dan satu konsultan pajak siaga") },
    buyer: t("Marketplace sellers and the bookkeepers who serve them", "Penjual marketplace dan pembukuan yang melayani mereka"),
    model: t("Yearly subscription with a per-filing add-on", "Langganan tahunan dengan tambahan per pelaporan"),
    risks: [
      t("Rules may be delayed or simplified", "Aturan dapat ditunda atau disederhanakan"),
      t("Marketplaces may build their own reports", "Marketplace dapat membuat laporan sendiri"),
    ],
    firstSteps: [
      t("Read the latest sellers' reporting rules and list the required figures", "Baca aturan pelaporan penjual terbaru dan daftar angka yang diwajibkan"),
      t("Build a spreadsheet prototype with five real sellers", "Buat prototipe spreadsheet bersama lima penjual nyata"),
    ],
    factors: [80, 88, 45, 75, 65],
    age: 30,
    from: 62,
  },
  {
    title: t("Household energy-saving advice and rooftop-solar matching", "Saran hemat energi rumah tangga dan pencocokan panel surya atap"),
    thesis: t(
      "Rising power bills push households to look for savings, but advice is scattered. A service that audits a home online and matches it with vetted installers can earn a referral fee.",
      "Tagihan listrik yang naik mendorong rumah tangga mencari penghematan, tetapi saran tersebar. Layanan yang mengaudit rumah secara online dan mencocokkannya dengan instalatur terpilih dapat memperoleh komisi rujukan.",
    ),
    region: "global",
    theme: "renewable_energy",
    sectors: ["renewables_climate", "consumer_services"],
    horizon: "6-12m",
    capital: { level: "low", reason: t("A website, a calculator and partner agreements", "Situs web, kalkulator dan perjanjian mitra") },
    buyer: t("Homeowners and the installers who want their leads", "Pemilik rumah dan instalatur yang menginginkan calon pelanggannya"),
    model: t("Referral fee per installation won", "Komisi rujukan untuk setiap pemasangan yang berhasil"),
    risks: [
      t("Installer quality reflects on your name", "Kualitas instalatur memengaruhi nama Anda"),
      t("Incentives differ by country and change often", "Insentif berbeda tiap negara dan sering berubah"),
    ],
    firstSteps: [
      t("Pick one city and list five vetted installers", "Pilih satu kota dan daftar lima instalatur terpilih"),
      t("Publish a savings calculator and count sign-ups", "Terbitkan kalkulator penghematan dan hitung pendaftarnya"),
    ],
    factors: [70, 60, 35, 80, 75],
    age: 45,
    from: 66,
  },
  {
    title: t("Compliance and fleet tools for ride-hailing drivers", "Alat kepatuhan dan armada untuk pengemudi ojek online"),
    thesis: t(
      "Drivers face new licence and vehicle rules while managing fuel and service costs alone. An app that tracks documents, reminders and running costs saves them fines and surprises.",
      "Pengemudi menghadapi aturan izin dan kendaraan baru sambil mengelola biaya BBM dan servis sendirian. Aplikasi yang melacak dokumen, pengingat dan biaya operasional menghindarkan mereka dari denda dan kejutan.",
    ),
    region: "indonesia",
    theme: "smes_msme",
    sectors: ["logistics", "consumer_services"],
    horizon: "0-6m",
    capital: { level: "low", reason: t("A mobile app and community outreach", "Aplikasi seluler dan penjangkauan komunitas") },
    buyer: t("Individual drivers and small fleet owners", "Pengemudi perorangan dan pemilik armada kecil"),
    model: t("Free basic tier with a paid fleet dashboard", "Paket dasar gratis dengan dasbor armada berbayar"),
    risks: [
      t("Drivers pay little and churn quickly", "Pengemudi membayar sedikit dan cepat berhenti"),
      t("Platforms could offer the same tools to their own drivers", "Platform dapat menawarkan alat serupa kepada pengemudinya"),
    ],
    firstSteps: [
      t("Join two driver communities and ask what costs them most", "Gabung dua komunitas pengemudi dan tanyakan biaya terbesar mereka"),
      t("Prototype a document and service reminder", "Buat prototipe pengingat dokumen dan servis"),
    ],
    factors: [60, 75, 40, 70, 50],
    age: 45,
    from: 59,
  },
  {
    title: t("Permission controls for AI agents used by small businesses", "Kontrol izin untuk agen AI yang dipakai usaha kecil"),
    thesis: t(
      "Small teams are starting to let AI agents act on email, files and payments. They need a simple way to say what an agent may do, with an approval step and a record of actions.",
      "Tim kecil mulai membiarkan agen AI bertindak pada email, berkas dan pembayaran. Mereka butuh cara sederhana untuk menentukan apa yang boleh dilakukan agen, dengan langkah persetujuan dan catatan tindakan.",
    ),
    region: "global",
    theme: "ai_regulation",
    sectors: ["ai_software"],
    horizon: "1-3y",
    capital: { level: "medium", reason: t("Two engineers for about a year before first revenue", "Dua insinyur selama sekitar satu tahun sebelum pendapatan pertama") },
    buyer: t("Owners and operations leads of companies with 5 to 50 staff", "Pemilik dan kepala operasional perusahaan dengan 5 sampai 50 karyawan"),
    model: t("Per-agent monthly subscription", "Langganan bulanan per agen"),
    risks: [
      t("Agent platforms may add their own controls", "Platform agen dapat menambahkan kontrol sendiri"),
      t("The market is early and standards are unsettled", "Pasarnya masih awal dan standar belum mapan"),
    ],
    firstSteps: [
      t("Interview 15 small businesses that already use AI agents", "Wawancarai 15 usaha kecil yang sudah memakai agen AI"),
      t("Prototype an approval step for payments only", "Buat prototipe langkah persetujuan khusus pembayaran"),
    ],
    factors: [55, 60, 35, 60, 65],
    age: 45,
    from: 48,
  },
  {
    title: t("Earthquake and flood resilience services for buildings", "Layanan ketahanan gempa dan banjir untuk bangunan"),
    thesis: t(
      "Recent disasters raised awareness of building safety. Local governments and property owners need inspections, retrofit plans and flood-proofing, but few firms offer all three.",
      "Bencana belakangan ini meningkatkan kesadaran akan keselamatan bangunan. Pemerintah daerah dan pemilik properti butuh inspeksi, rencana penguatan dan perlindungan banjir, tetapi sedikit perusahaan menawarkan ketiganya.",
    ),
    region: "indonesia",
    theme: "climate_disasters",
    sectors: ["property_construction", "govtech_public"],
    horizon: "1-3y",
    capital: { level: "high", reason: t("Certified engineers, equipment and insurance", "Insinyur bersertifikat, peralatan dan asuransi") },
    buyer: t("Local governments, schools and commercial property owners", "Pemerintah daerah, sekolah dan pemilik properti komersial"),
    model: t("Inspection fees plus project-based retrofit contracts", "Biaya inspeksi ditambah kontrak penguatan per proyek"),
    risks: [
      t("Government tenders are slow and politically exposed", "Tender pemerintah lambat dan rentan secara politik"),
      t("Liability if an inspected building fails", "Tanggung jawab hukum jika bangunan yang diinspeksi gagal"),
      t("Certified engineers are scarce", "Insinyur bersertifikat sangat terbatas"),
    ],
    firstSteps: [
      t("Find two certified engineers willing to partner", "Temukan dua insinyur bersertifikat yang bersedia bermitra"),
      t("Offer a low-cost school inspection as a reference project", "Tawarkan inspeksi sekolah murah sebagai proyek rujukan"),
    ],
    factors: [55, 70, 55, 45, 60],
    age: 30,
    from: 60,
  },
  {
    title: t("Halal export marketplace for small food producers", "Marketplace ekspor halal untuk produsen makanan kecil"),
    thesis: t(
      "Demand for halal food is growing in the Gulf and Southeast Asia, while small Indonesian producers struggle with certification papers and export logistics. A platform that bundles both can open those markets.",
      "Permintaan makanan halal tumbuh di Timur Tengah dan Asia Tenggara, sementara produsen kecil Indonesia kesulitan dengan sertifikasi dan logistik ekspor. Platform yang menggabungkan keduanya dapat membuka pasar tersebut.",
    ),
    region: "global",
    theme: "halal_islamic_finance",
    sectors: ["agri_food", "retail_ecommerce"],
    horizon: "6-12m",
    capital: { level: "medium", reason: t("Platform build, sample shipments and a compliance adviser", "Pembangunan platform, kiriman contoh dan penasihat kepatuhan") },
    buyer: t("Importers, halal supermarkets and food service buyers abroad", "Importir, supermarket halal dan pembeli jasa boga di luar negeri"),
    model: t("Commission on each export order", "Komisi untuk setiap pesanan ekspor"),
    risks: [
      t("Each destination has its own import rules", "Setiap negara tujuan punya aturan impor sendiri"),
      t("Shipping delays can spoil food products", "Keterlambatan pengiriman dapat merusak produk makanan"),
      t("Producers may sell directly once introduced to a buyer", "Produsen dapat menjual langsung setelah dikenalkan ke pembeli"),
    ],
    firstSteps: [
      t("Pick one product and one destination country", "Pilih satu produk dan satu negara tujuan"),
      t("Ask five importers what documents they require", "Tanyakan lima importir dokumen apa yang mereka butuhkan"),
    ],
    exposure: t("Consumer-staples exporters and shipping stocks", "Eksportir barang konsumsi pokok dan saham pelayaran"),
    factors: [72, 64, 50, 60, 66],
    age: 45,
    from: 55,
  },
  {
    title: t("Digital skills bootcamps for small-business owners", "Bootcamp keterampilan digital untuk pemilik usaha kecil"),
    thesis: t(
      "Many small-business owners sell online for the first time but lack skills in ads, bookkeeping and customer chat. Short evening bootcamps with a local mentor address a need that universities ignore.",
      "Banyak pemilik usaha kecil berjualan online untuk pertama kali tetapi kurang paham iklan, pembukuan dan chat pelanggan. Bootcamp malam singkat dengan mentor lokal menjawab kebutuhan yang diabaikan perguruan tinggi.",
    ),
    region: "indonesia",
    theme: "education_skills",
    sectors: ["education"],
    horizon: "6-12m",
    capital: { level: "low", reason: t("Rented classrooms and part-time mentors", "Ruang kelas sewaan dan mentor paruh waktu") },
    buyer: t("Small-business owners, local governments and banks with MSME programmes", "Pemilik usaha kecil, pemerintah daerah dan bank dengan program UMKM"),
    model: t("Course fees, plus sponsored cohorts for banks and governments", "Biaya kursus, ditambah kelas yang disponsori bank dan pemerintah"),
    risks: [
      t("Completion rates are low for evening courses", "Tingkat penyelesaian kursus malam rendah"),
      t("Free government training competes on price", "Pelatihan pemerintah yang gratis bersaing dari sisi harga"),
    ],
    firstSteps: [
      t("Run one free evening session and collect questions", "Adakan satu sesi malam gratis dan kumpulkan pertanyaan"),
      t("Sign a mentor for the first paid cohort", "Gandeng satu mentor untuk kelas berbayar pertama"),
    ],
    factors: [66, 58, 48, 82, 90],
    age: 3,
    from: 60,
  },
  {
    // Closed: it must never be listed (QA).
    title: t("Fuel-cost hedging service for fleet operators", "Layanan lindung nilai biaya BBM untuk operator armada"),
    thesis: t(
      "A fuel price spike made fleet owners look for ways to fix their costs. The price spike faded and the opportunity was closed.",
      "Lonjakan harga BBM membuat pemilik armada mencari cara mengunci biaya. Lonjakan itu mereda dan peluang ini ditutup.",
    ),
    region: "global",
    theme: "oil_gas_coal",
    sectors: ["logistics", "energy_mining"],
    horizon: "0-6m",
    capital: { level: "medium", reason: t("Working capital for fuel contracts", "Modal kerja untuk kontrak BBM") },
    buyer: t("Fleet operators and delivery companies", "Operator armada dan perusahaan pengiriman"),
    model: t("Fixed-price fuel contracts with a service margin", "Kontrak BBM harga tetap dengan margin layanan"),
    risks: [
      t("Price moves against you after you lock a contract", "Harga bergerak melawan Anda setelah kontrak dikunci"),
      t("Counterparty risk with fuel suppliers", "Risiko pihak lawan dengan pemasok BBM"),
    ],
    firstSteps: [t("Ask three fleet operators how they buy fuel today", "Tanyakan kepada tiga operator armada cara mereka membeli BBM saat ini")],
    factors: [90, 88, 85, 90, 87],
    age: 45,
    from: 70,
    closedDaysAgo: 10,
  },
];

export type SeedOpportunityRecord = {
  opportunity: NewOpportunity;
  /** One score row per day, oldest first; the last row is the current score. */
  scores: NewScore[];
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function seedOpportunities(now = Date.now()): SeedOpportunityRecord[] {
  return seedOpportunityList.map((o) => {
    const last = o.closedDaysAgo ?? 0;
    const end = overallOf(o.factors);
    const scores: NewScore[] = [];
    for (let ago = o.age; ago >= last; ago--) {
      // A straight line from the first day's overall score to the last day's.
      const target = o.age === last ? end : Math.round(o.from + ((end - o.from) * (o.age - ago)) / (o.age - last));
      const shift = target - end;
      const [demand, timing, competition, capital, regulatory] = o.factors.map((f) => clamp(f + shift));
      scores.push({
        day: wibDay(new Date(now - ago * DAY)),
        overall: overallOf([demand, timing, competition, capital, regulatory]),
        demand,
        timing,
        competition,
        capital,
        regulatory,
      });
    }
    return {
      opportunity: {
        titleEn: o.title.en,
        titleId: o.title.id,
        thesisEn: o.thesis.en,
        thesisId: o.thesis.id,
        region: o.region,
        theme: o.theme,
        sectors: o.sectors,
        horizon: o.horizon,
        capitalLevel: o.capital.level,
        capitalReasonEn: o.capital.reason.en,
        capitalReasonId: o.capital.reason.id,
        buyerEn: o.buyer.en,
        buyerId: o.buyer.id,
        modelEn: o.model.en,
        modelId: o.model.id,
        risksEn: o.risks.map((r) => r.en),
        risksId: o.risks.map((r) => r.id),
        firstStepsEn: o.firstSteps.map((r) => r.en),
        firstStepsId: o.firstSteps.map((r) => r.id),
        relatedExposureEn: o.exposure?.en ?? null,
        relatedExposureId: o.exposure?.id ?? null,
        createdAt: new Date(now - o.age * DAY),
        closedAt: o.closedDaysAgo === undefined ? undefined : new Date(now - o.closedDaysAgo * DAY),
      },
      scores,
    };
  });
}
