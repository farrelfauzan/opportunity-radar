# Opportunity Radar — UI copy (EN / ID) and screen states

Ticket OR-12. Source of truth for every static UI string. Sample data, headlines and AI-generated text are not here (they come from the store / the LLM in both languages).

Conventions
- Keys are the dictionary keys of `src/i18n/dictionaries/{en,id}.json` (OR-2): dotted path = nested JSON.
- Placeholders: `{name}`. Counts: EN has `.one` / `.other`; ID has one form (the same text under both keys).
- Characters: NBSP after "Rp" (U+00A0), minus U+2212, em dash "—" for missing values (OR-2 formatters).
- Times: EN `07:00 WIB`, ID `07.00 WIB`. Dates: EN `4 Oct 2026`, ID `4 Okt 2026`.
- Buy / sell / up / down are never told apart by colour alone: always a word, and ▲ / ▼ / — symbols on numbers.
- Wording rule for every signal surface (OR-10): describe, never instruct. No "you should", "we recommend", "buy in N parts", "avoid".

Contents: 1 Shell · 2 States (all screens) · 3 News · 4 Calculators · 5 Radar · 6 Opportunities · 7 Investments · 8 Asset report · 9 Login · 10 Mappings and rules · 11 Phone layout

---

## 1. Shell (OR-3)

| Key | EN | ID |
|---|---|---|
| app.name | Opportunity Radar | Opportunity Radar |
| meta.description | Business opportunities and investment signals from the news. | Peluang bisnis dan sinyal investasi dari berita. |
| nav.radar | Radar | Radar |
| nav.opportunities | Opportunities | Peluang |
| nav.news | News | Berita |
| nav.invest | Investments | Investasi |
| nav.calculators | Calculators | Kalkulator |
| nav.main | Main | Utama |
| nav.language | Language | Bahasa |
| nav.lang.en | EN | EN |
| nav.lang.id | ID | ID |
| nav.alerts.label | Alerts | Peringatan |
| nav.alerts.unread.one | {n} unread alert | {n} peringatan belum dibaca |
| nav.alerts.unread.other | {n} unread alerts | {n} peringatan belum dibaca |
| page.title.radar | Radar | Radar |
| page.title.opportunities | Opportunities | Peluang |
| page.title.news | News | Berita |
| page.title.invest | Investments | Investasi |
| page.title.asset | Asset report | Laporan aset |
| page.title.calculators | Calculators | Kalkulator |
| page.documentTitle | {page} · Opportunity Radar | {page} · Opportunity Radar |
| page.emptyFrame | Nothing here yet | Belum ada data |
| notFound.title | Page not found | Halaman tidak ditemukan |
| notFound.body | This page does not exist. | Halaman ini tidak ada. |
| notFound.back | Back to Radar | Kembali ke Radar |
| error.title | Something went wrong | Terjadi kesalahan |
| error.retry | Try again | Coba lagi |

`nav.main` is the accessible name of the main navigation (screen readers already say "navigation"). The alert bell (`nav.alerts.*`) ships with OR-34. The canvas badge "Sample data" is never shipped.

## 2. States (all screens)

### 2.1 Shared strings

| Key | EN | ID |
|---|---|---|
| state.loading | Loading… | Memuat… |
| time.justNow | just now | baru saja |
| time.minutesAgo | {n}m ago | {n} mnt lalu |
| time.hoursAgo | {n}h ago | {n} jam lalu |
| time.daysAgo | {n}d ago | {n} hari lalu |
| state.error.title | Can't load this right now | Tidak dapat memuat sekarang |
| state.error.body | Try again in a moment. If it keeps happening, the local database may be stopped. | Coba lagi sebentar lagi. Jika terus terjadi, database lokal mungkin berhenti. |
| state.error.retry | Try again | Coba lagi |
| state.never.title | No data yet | Belum ada data |
| state.never.body | The first update runs at {time} WIB. | Pembaruan pertama berjalan pukul {time} WIB. |
| state.never.bodyNews | The first news check runs within 30 minutes. | Pemeriksaan berita pertama berjalan dalam 30 menit. |
| state.stale.today | {what} last updated {time} WIB | {what} terakhir diperbarui {time} WIB |
| state.stale.earlier | {what} last updated {date}, {time} WIB | {what} terakhir diperbarui {date}, {time} WIB |
| state.stale.what.news | News | Berita |
| state.stale.what.opportunities | Opportunities | Peluang |
| state.stale.what.brief | The daily brief | Ringkasan harian |
| state.stale.what.prices | Prices | Harga |
| state.stale.what.signals | Signals | Sinyal |
| state.stale.what.ventures | Venture data | Data usaha |
| state.marketClosed | Market closed · last close {date} | Pasar tutup · penutupan terakhir {date} |
| state.partial | {ok} of {total} sources updated · not updated: {names} | {ok} dari {total} sumber diperbarui · belum diperbarui: {names} |

Loading shows skeleton blocks in the shape of the content; the text `state.loading` is the accessible label only.

### 2.2 Which states apply

| Screen | Loading | Empty | Never ingested | Error | Stale | Partial |
|---|---|---|---|---|---|---|
| Radar | yes | per section | yes | yes | yes (brief, opportunities) | via News |
| Opportunities | yes | yes | yes | yes | yes | no |
| News | yes | yes (filter) | yes | yes | yes | yes (Sources panel) |
| Investments | yes | no (fixed watchlist) | yes | yes | yes (quotes, signals) | per asset row |
| Asset report | yes | no | yes | yes | yes | no |
| Calculators | no | no | no | no | no | no (input errors only, §4) |

### 2.3 Stale thresholds

Stale = time since the last successful run of the job that feeds the data (`lastSuccessfulRun`, OR-7: `ok` or `partial`; an RSS 304 counts as checked).

| Data | Stale after | Applies | Outside those hours |
|---|---|---|---|
| News (RSS) | 2 h | always (24/7) | — |
| IDX quotes (IHSG, BBCA) | 1 h | Mon–Fri 09:00–16:00 WIB, IDX trading days | Show last close with `state.marketClosed`; not stale |
| US quotes (S&P 500) | 1 h | Mon–Fri 09:30–16:00 New York time, NYSE trading days | Same as above |
| Crypto quotes | 1 h | always (24/7) | — |
| Gold / silver quotes | 1 h | Mon 05:00 – Sat 04:00 WIB | Weekend: `state.marketClosed` |
| USD/IDR (Frankfurter, daily) | 26 h | business days | Weekend and holidays: not stale |
| Daily data: brief, opportunities, scores, signals, daily candles, venture data | 26 h | always | — |

Exchange holidays come from a small holiday list in config; until it exists, weekdays count as trading days (a holiday then shows as stale; acceptable for v1).

## 3. News (OR-9, OR-21)

| Key | EN | ID |
|---|---|---|
| news.title | News | Berita |
| news.summary.line | {articles} · {sources} · refreshed every 30 minutes | {articles} · {sources} · diperbarui setiap 30 menit |
| news.summary.articles.one | {n} article today | {n} artikel hari ini |
| news.summary.articles.other | {n} articles today | {n} artikel hari ini |
| news.summary.sources.one | {n} source | {n} sumber |
| news.summary.sources.other | {n} sources | {n} sumber |
| news.cat.all | All | Semua |
| news.cat.business | Business | Bisnis |
| news.cat.politics | Politics & policy | Politik & kebijakan |
| news.cat.tech | Tech & AI | Teknologi & AI |
| news.cat.markets | Markets | Pasar |
| news.cat.commodities | Commodities | Komoditas |
| news.region.label | Region | Wilayah |
| news.region.all | Indonesia + Global | Indonesia + Global |
| news.region.id | Indonesia | Indonesia |
| news.region.global | Global | Global |
| news.item.meta | {source} · {ago} · {region} | {source} · {ago} · {region} |
| news.item.openExternal | Opens on the publisher's site | Dibuka di situs penerbit |
| news.empty | No articles for this filter | Tidak ada artikel untuk filter ini |
| news.loadMore | Load more | Muat lebih banyak |
| news.sources.title | Sources | Sumber |
| news.sources.indonesia | Indonesia: {names} | Indonesia: {names} |
| news.sources.global | Global: {names} | Global: {names} |
| news.sources.notUpdated | not updated | belum diperbarui |
| news.sources.note | Headlines and links only; the full article opens on the publisher's site. | Hanya judul dan tautan; artikel lengkap dibuka di situs penerbit. |
| news.onlyLinked | Only news linked to an opportunity | Hanya berita yang terkait peluang |
| news.impact.opportunity | Opportunity | Peluang |
| news.impact.risk | Risk | Risiko |
| news.impact.context | Context | Konteks |
| news.why | Why it matters | Mengapa penting |
| news.linked | Linked opportunity: {title} | Peluang terkait: {title} |
| news.themes.title | Trending themes, 7 days | Tema populer, 7 hari |
| news.themes.caption | Number of articles mentioning each theme. | Jumlah artikel yang menyebut setiap tema. |

### 3.1 Source credit for open-licence sources (PR 22)

Four sources are reused under licences that require a credit and a link to the original wherever an item is shown (`licence` field in `src/server/news/feeds.ts`). The headline already links to the original; the credit line adds the publisher and, where there is one, the licence.

| Key | EN | ID |
|---|---|---|
| news.credit.line | Source: {publisher} | Sumber: {publisher} |
| news.credit.lineLicence | Source: {publisher} · {licence} | Sumber: {publisher} · {licence} |
| news.credit.original | Read the original | Baca artikel asli |
| news.credit.publisher.conversation-id | The Conversation Indonesia | The Conversation Indonesia |
| news.credit.publisher.conversation-global | The Conversation | The Conversation |
| news.credit.publisher.federal-reserve | Federal Reserve Board | Federal Reserve Board |
| news.credit.publisher.ecb | European Central Bank | Bank Sentral Eropa (ECB) |
| news.credit.licence.cc-by-nd-4 | CC BY-ND 4.0 | CC BY-ND 4.0 |

| Source slug | Credit line shown (EN) | Licence link |
|---|---|---|
| conversation-id | Source: The Conversation Indonesia · CC BY-ND 4.0 | https://creativecommons.org/licenses/by-nd/4.0/ |
| conversation-global | Source: The Conversation · CC BY-ND 4.0 | https://creativecommons.org/licenses/by-nd/4.0/ |
| federal-reserve | Source: Federal Reserve Board | — |
| ecb | Source: European Central Bank | — |

Rules
- Where: on every surface that shows one of these items: News list (OR-9, OR-21), Radar "News that moves opportunities" (OR-23), opportunity evidence (OR-18), venture related news and wind evidence (OR-51), daily-brief citations if shown. The app has no article detail page: the headline opens the publisher's original in a new tab, which is the required link. `news.credit.original` is used only where a surface shows no clickable headline.
- How: one line under the snippet (or under the headline where no snippet is shown), muted text, the licence name as a link to the licence deed. Shown in both locales; publisher and licence names are not translated except "European Central Bank" in ID.
- The Conversation (CC BY-ND, no derivatives): its summary is shown as stored (tags stripped, entities decoded, cut at 500 characters; no other change), never translated, rewritten or summarised by the LLM, also on `/id`. "Why it matters" and other AI text stay visually separate and labelled as ours, so they are commentary, not an altered version.
- Sources without a reuse licence keep the existing meta line (`news.item.meta`) and no credit line.

Partial state (OR-9 follow-up): when the news is not stale but at least one active source failed on the latest ingestion run (status not ok and not 304), the Sources panel shows `state.partial` at its top and `news.sources.notUpdated` after each affected source name. No page-level banner; the stale banner (§2) takes precedence when both apply.

Region shown on an item uses `news.region.id` / `news.region.global`. Category and region filters live in the URL query. OR-21 adds the impact, why, linked and themes strings; OR-9 uses the rest.

## 4. Calculators (OR-24, OR-25, OR-40)

| Key | EN | ID |
|---|---|---|
| calc.title | Calculators | Kalkulator |
| calc.intro | Provisional projections from your own assumptions. Change any number; results update as you type. | Proyeksi sementara dari asumsi Anda sendiri. Ubah angka mana pun; hasil diperbarui saat Anda mengetik. |
| calc.inv.title | Investment projection | Proyeksi investasi |
| calc.inv.presetGroup | Asset type assumptions | Asumsi jenis aset |
| calc.inv.preset.cash | Cash & bonds | Kas & obligasi |
| calc.inv.preset.gold | Gold | Emas |
| calc.inv.preset.stocks | Stocks | Saham |
| calc.inv.preset.crypto | Crypto | Kripto |
| calc.inv.start | Starting amount (Rp) | Jumlah awal (Rp) |
| calc.inv.monthly | Added each month (Rp) | Tambahan tiap bulan (Rp) |
| calc.inv.years | Years | Tahun |
| calc.inv.return | Yearly return (%) | Imbal hasil per tahun (%) |
| calc.inv.spread | Uncertainty (± % points) | Ketidakpastian (± poin %) |
| calc.inv.inflation | Inflation (%) | Inflasi (%) |
| calc.inv.presetNote | The asset-type buttons fill in example assumptions, not forecasts. Higher-risk assets get a wider uncertainty band. | Tombol jenis aset mengisi contoh asumsi, bukan perkiraan. Aset berisiko lebih tinggi mendapat rentang ketidakpastian lebih lebar. |
| calc.inv.valueAfter.one | Value after {years} year | Nilai setelah {years} tahun |
| calc.inv.valueAfter.other | Value after {years} years | Nilai setelah {years} tahun |
| calc.inv.paid | You paid in | Total setoran Anda |
| calc.inv.real | In today's money | Dalam nilai uang hari ini |
| calc.inv.axisNow | Now | Sekarang |
| calc.inv.axisYear | Year {years} | Tahun {years} |
| calc.inv.optimistic | Optimistic | Optimis |
| calc.inv.base | Base | Dasar |
| calc.inv.pessimistic | Pessimistic | Pesimis |
| calc.inv.paidLine | Paid in | Setoran |
| calc.inv.chartLabel | Projected value over time for pessimistic, base and optimistic returns, compared with the amount paid in | Proyeksi nilai dari waktu ke waktu untuk imbal hasil pesimis, dasar, dan optimis, dibandingkan dengan total setoran |
| calc.biz.title | Business projection | Proyeksi bisnis |
| calc.biz.hint | Open it from an opportunity or a venture to start with that idea's numbers | Buka dari sebuah peluang atau usaha untuk memulai dengan angka ide tersebut |
| calc.biz.from | Starting from: {title} | Dimulai dari: {title} |
| calc.biz.capital | Starting capital (Rp) | Modal awal (Rp) |
| calc.biz.fixed | Fixed cost per month (Rp) | Biaya tetap per bulan (Rp) |
| calc.biz.revenue | First-month revenue (Rp) | Pendapatan bulan pertama (Rp) |
| calc.biz.growth | Revenue growth per month (%) | Pertumbuhan pendapatan per bulan (%) |
| calc.biz.margin | Gross margin (%) | Margin kotor (%) |
| calc.biz.months | Months to project | Jumlah bulan proyeksi |
| calc.biz.breakeven | Monthly break-even | Impas bulanan |
| calc.biz.payback | Capital paid back | Modal kembali |
| calc.biz.lowest | Cash needed at the lowest point | Kas yang dibutuhkan di titik terendah |
| calc.biz.end.one | Net cash after {months} month | Kas bersih setelah {months} bulan |
| calc.biz.end.other | Net cash after {months} months | Kas bersih setelah {months} bulan |
| calc.biz.month | Month {n} | Bulan ke-{n} |
| calc.biz.notWithin.one | Not within {months} month | Tidak dalam {months} bulan |
| calc.biz.notWithin.other | Not within {months} months | Tidak dalam {months} bulan |
| calc.biz.axisStart | Month 0 | Bulan ke-0 |
| calc.biz.paybackLine | Dashed line = capital fully paid back | Garis putus-putus = modal kembali penuh |
| calc.biz.chartLabel | Cumulative cash over time; the business has paid back its capital where the line crosses the dashed zero line | Kas kumulatif dari waktu ke waktu; modal usaha sudah kembali saat garis memotong garis nol putus-putus |
| calc.disclaimer | Projections are arithmetic on the assumptions you enter. They are not forecasts or financial advice; real returns and revenues vary and can be negative. | Proyeksi ini hanya hitungan dari asumsi yang Anda masukkan. Ini bukan perkiraan atau nasihat keuangan; imbal hasil dan pendapatan nyata bervariasi dan bisa negatif. |
| calc.err.required | Enter a number | Masukkan angka |
| calc.err.range | Enter a value from {min} to {max} | Masukkan nilai dari {min} sampai {max} |
| calc.err.keptPrevious | Showing the last valid result | Menampilkan hasil valid terakhir |
| calc.unit.million | million | juta |
| calc.unit.billion | billion | miliar |
| calc.unit.trillion | trillion | triliun |
| calc.result.beyond | more than Rp 1,000 trillion | lebih dari Rp 1.000 triliun |

`calc.inv.chartLabel`, `calc.inv.presetGroup` and `calc.biz.chartLabel` are accessible names (charts and the preset button group). Large amounts in results use compact form, with the unit words `calc.unit.*`: millions with one decimal, billions and trillions with two. EN `Rp 425.7 million`, `Rp 1.20 billion`, `Rp 2.00 trillion`; ID `Rp 425,7 juta`, `Rp 1,20 miliar`, `Rp 2,00 triliun`. Each result card also shows the exact rupiah amount below the compact form, except above 2^53 (about 9 × 10^15), where only the compact form is shown. From Rp 1.000 trillion (10^15) upwards, results and chart axis labels show `calc.result.beyond` instead of a number; never exponent notation ("3.5e+48") and never a 40-digit amount. Exact values for the defaults are in the AC of OR-24/25.

## 5. Radar (OR-23, OR-28, OR-34, OR-39)

| Key | EN | ID |
|---|---|---|
| radar.title | Today's radar | Radar hari ini |
| radar.updated | {date} · updated {time} WIB | {date} · diperbarui {time} WIB |
| radar.brief.title | Daily brief — what changed for business opportunities | Ringkasan harian — apa yang berubah bagi peluang bisnis |
| radar.brief.source | AI summary of {articles} from {sources} | Ringkasan AI dari {articles}, {sources} |
| radar.brief.articles.one | {n} article | {n} artikel |
| radar.brief.articles.other | {n} articles | {n} artikel |
| radar.brief.sources.one | {n} source | {n} sumber |
| radar.brief.sources.other | {n} sources | {n} sumber |
| radar.brief.affected.one | {n} opportunity affected | {n} peluang terdampak |
| radar.brief.affected.other | {n} opportunities affected | {n} peluang terdampak |
| radar.brief.none | Not enough news yet today | Belum cukup berita hari ini |
| radar.ventures.title | My ventures | Usaha saya |
| radar.ventures.subtitle | Progress from each project's board · market view re-scored daily from the news | Progres dari papan tiap proyek · pandangan pasar dinilai ulang tiap hari dari berita |
| radar.ventures.progressMvp | Progress to MVP | Progres menuju MVP |
| radar.ventures.progressRelease | Progress to next release | Progres menuju rilis berikutnya |
| radar.ventures.notConnected | Progress source not connected | Sumber progres belum terhubung |
| radar.ventures.oppId | Opportunity · Indonesia | Peluang · Indonesia |
| radar.ventures.oppWorld | Opportunity · Worldwide | Peluang · Dunia |
| radar.ventures.tailwind | Tailwind | Pendorong |
| radar.ventures.headwind | Headwind | Penghambat |
| radar.ventures.open.one | Open venture view · {n} related news item | Buka tampilan usaha · {n} berita terkait |
| radar.ventures.open.other | Open venture view · {n} related news items | Buka tampilan usaha · {n} berita terkait |
| radar.ventures.noNews | No related news this month | Belum ada berita terkait bulan ini |
| radar.top.title | Top opportunities | Peluang teratas |
| radar.top.seeAll | See all ({n}) | Lihat semua ({n}) |
| radar.top.score | score | skor |
| radar.top.horizon | Horizon {h} | Horizon {h} |
| radar.top.basedOn.one | Based on {n} news item | Berdasarkan {n} berita |
| radar.top.basedOn.other | Based on {n} news items | Berdasarkan {n} berita |
| radar.top.empty | No opportunities yet. The first morning run is at 07:00 WIB. | Belum ada peluang. Proses pagi pertama berjalan pukul 07.00 WIB. |
| radar.alerts.title | Investment alerts | Peringatan investasi |
| radar.alerts.disclaimer | Rule-based signals, not financial advice. | Sinyal berbasis aturan, bukan nasihat keuangan. |
| radar.alerts.empty | No signal changes yet | Belum ada perubahan sinyal |
| radar.market.title | Market snapshot | Ringkasan pasar |
| radar.news.title | News that moves opportunities | Berita yang menggerakkan peluang |
| radar.news.all | All news | Semua berita |

Brief line labels ("Policy:", "Tech & AI:", "Markets:" in the canvas) are not free text: OR-22 tags each line with one of the News categories and the UI shows `news.cat.*` (Politics & policy, Tech & AI, Markets, Business, Commodities) followed by a colon.

Section order (desktop and phone): brief → My ventures → Top opportunities → News that moves opportunities → Investment alerts → Market snapshot. Investments never come before opportunities.

## 6. Opportunities (OR-17, OR-18, OR-41, OR-40)

| Key | EN | ID |
|---|---|---|
| opp.title | Opportunities | Peluang |
| opp.summary | {n} open · re-scored every morning from the news | {n} terbuka · dinilai ulang setiap pagi dari berita |
| opp.filter.region.all | All regions | Semua wilayah |
| opp.filter.region.id | Indonesia | Indonesia |
| opp.filter.region.global | Global | Global |
| opp.filter.sector.label | Sector | Sektor |
| opp.filter.sector.all | All sectors | Semua sektor |
| opp.filter.horizon | Horizon | Horizon |
| opp.filter.any | Any | Semua |
| opp.horizon.short | 0–6 months | 0–6 bulan |
| opp.horizon.mid | 6–12 months | 6–12 bulan |
| opp.horizon.long | 1–3 years | 1–3 tahun |
| opp.filter.capital | Capital | Modal |
| opp.capital.low | Low | Rendah |
| opp.capital.medium | Medium | Sedang |
| opp.capital.high | High | Tinggi |
| opp.filter.shortlisted | Shortlisted | Daftar pendek |
| opp.trend.new | New | Baru |
| opp.trend.up | ▲ {n} | ▲ {n} |
| opp.trend.down | ▼ {n} | ▼ {n} |
| opp.trend.flat | — 0 | — 0 |
| opp.empty | No opportunities match these filters | Tidak ada peluang yang cocok dengan filter ini |
| opp.never | No opportunities yet — the first run is at 07:00 WIB | Belum ada peluang — proses pertama pukul 07.00 WIB |
| opp.detail.meta | {region} · {sector} · Horizon {horizon} | {region} · {sector} · Horizon {horizon} |
| opp.detail.score | opportunity score / 100 | skor peluang / 100 |
| opp.detail.breakdown | Score breakdown | Rincian skor |
| opp.factor.demand | Demand | Permintaan |
| opp.factor.timing | Timing | Waktu |
| opp.factor.competition | Low competition | Persaingan rendah |
| opp.factor.capital | Capital efficiency | Efisiensi modal |
| opp.factor.regulatory | Low regulatory risk | Risiko regulasi rendah |
| opp.detail.breakdownNote | Higher is better on every row (low competition and low regulatory risk score high). | Makin tinggi makin baik di setiap baris (persaingan rendah dan risiko regulasi rendah bernilai tinggi). |
| opp.detail.facts | Quick facts | Fakta singkat |
| opp.detail.capital | Starting capital | Modal awal |
| opp.detail.buyer | Who buys | Siapa pembelinya |
| opp.detail.model | Model | Model |
| opp.detail.trend30 | Score, 30 days | Skor, 30 hari |
| opp.detail.evidence | Why now — evidence from the news | Mengapa sekarang — bukti dari berita |
| opp.detail.risks | Risks | Risiko |
| opp.detail.steps | First steps to validate | Langkah awal untuk validasi |
| opp.detail.save | Save to my shortlist | Simpan ke daftar pendek |
| opp.detail.saved | Saved to shortlist | Tersimpan di daftar pendek |
| opp.detail.calculator | Model this in the calculator | Hitung di kalkulator |
| opp.detail.print | Print / save as PDF | Cetak / simpan sebagai PDF |
| opp.detail.related | Related market exposure: {text} | Eksposur pasar terkait: {text} |
| opp.detail.closed | This opportunity is closed or no longer exists | Peluang ini sudah ditutup atau tidak ada lagi |
| opp.detail.closedTag | Closed | Ditutup |
| opp.detail.back | Back to opportunities | Kembali ke peluang |

Not shipped in v1: `opp.detail.print` (OR-45; replaces the canvas "Full report (PDF)").

Sector labels come from the fixed sector list in `docs/opportunities/scoring-v1.md` (OR-11), which carries EN and ID labels.

## 7. Investments (OR-30, OR-34)

| Key | EN | ID |
|---|---|---|
| inv.title | Investments | Investasi |
| inv.intro | Compare the risk of each asset type, then see what the rules say. | Bandingkan risiko tiap jenis aset, lalu lihat apa kata aturannya. |
| inv.term.short | Short term (days–weeks) | Jangka pendek (hari–minggu) |
| inv.term.long | Long term (1 year+) | Jangka panjang (1 tahun+) |
| inv.term.shortLabel | Short term | Jangka pendek |
| inv.term.longLabel | Long term | Jangka panjang |
| inv.classes.title | Asset types and their risk | Jenis aset dan risikonya |
| inv.risk.label | Risk {n}/5 · {label} | Risiko {n}/5 · {label} |
| inv.risk.1 | Low | Rendah |
| inv.risk.2 | Low–medium | Rendah–sedang |
| inv.risk.3 | Medium | Sedang |
| inv.risk.4 | High | Tinggi |
| inv.risk.5 | Very high | Sangat tinggi |
| inv.drop | Typical drop | Penurunan umum |
| inv.mainRisks | Main risks | Risiko utama |
| inv.watchlist.title.short | Watchlist — short-term signals | Daftar pantau — sinyal jangka pendek |
| inv.watchlist.title.long | Watchlist — long-term signals | Daftar pantau — sinyal jangka panjang |
| inv.col.asset | Asset | Aset |
| inv.col.price | Price | Harga |
| inv.col.day | 1 day | 1 hari |
| inv.col.month | 30 days | 30 hari |
| inv.col.signal | Signal | Sinyal |
| inv.col.risk | Risk | Risiko |
| signal.buy | BUY | BELI |
| signal.sell | SELL | JUAL |
| signal.hold | HOLD | TAHAN |
| signal.none | Not enough history | Riwayat belum cukup |
| signal.noSignal | No signal | Tanpa sinyal |
| inv.alerts.title | Alerts | Peringatan |
| inv.alerts.report | Read the full report | Baca laporan lengkap |
| inv.alerts.empty | No signal changes yet | Belum ada perubahan sinyal |
| inv.addAsset | Add asset | Tambah aset |
| inv.alertsTo.label | Send alerts to | Kirim peringatan ke |
| inv.alertsTo.app | In the app | Di aplikasi |
| inv.alertsTo.telegram | Telegram | Telegram |
| inv.alertsTo.email | Email | Email |
| inv.disclaimer | Signals are produced by fixed, published rules on price data. They are information for your own decision, not financial advice, and past behaviour does not guarantee future results. | Sinyal dihasilkan oleh aturan tetap yang dipublikasikan atas data harga. Ini informasi untuk keputusan Anda sendiri, bukan nasihat keuangan, dan perilaku masa lalu tidak menjamin hasil di masa depan. |

Not shipped in v1: `inv.addAsset` (OR-44 decides), `inv.alertsTo.*` (alerts are in-app only, D4; Telegram OR-42, email OR-43). Keys exist so the dictionaries stay complete.

The disclaimer drops "plus a news check" from the canvas: in rules v1 the news check is context and never moves the verdict (OR-10, D10).

### 7.1 Asset-type risk cards (static content, wording per OR-10: descriptive, no instructions)

| Asset type (EN / ID) | Examples | Risk | Typical drop (EN / ID) | Long term (EN / ID) | Short term (EN / ID) | Main risks (EN / ID) |
|---|---|---|---|---|---|---|
| Cash & government bonds / Kas & obligasi negara | Money market, SBN | 1 | A few percent / Beberapa persen | Stability and income; often used for emergency savings / Stabil dan memberi pendapatan; sering dipakai untuk dana darurat | Low-volatility place for cash between trades / Tempat kas yang tenang di antara transaksi | Inflation, interest-rate changes / Inflasi, perubahan suku bunga |
| Gold / Emas | XAU, Antam | 2 | 10–20% over a year / 10–20% dalam setahun | Store of value; tends to hold up when the rupiah weakens / Penyimpan nilai; cenderung bertahan saat rupiah melemah | Slow mover; the buy/sell spread takes much of a short move / Bergerak lambat; selisih jual-beli memakan sebagian besar gerakan singkat | No income, USD and interest rates, dealer spread / Tanpa pendapatan, USD dan suku bunga, selisih dealer |
| Silver / Perak | XAG | 3 | 20–35% / 20–35% | Often held as a smaller hedge next to gold / Sering dipegang sebagai lindung nilai kecil di samping emas | Swings more than gold; short moves can be large in both directions / Berayun lebih besar dari emas; gerakan singkat bisa besar ke dua arah | Industrial demand cycles, thin retail market / Siklus permintaan industri, pasar ritel tipis |
| Indonesian stocks / Saham Indonesia | IDX: BBCA, TLKM | 4 | 30–50% in a crisis / 30–50% saat krisis | Growth and dividends over 5 years or more / Pertumbuhan dan dividen dalam 5 tahun atau lebih | Short-term moves are mostly in liquid blue chips / Gerakan jangka pendek sebagian besar pada saham unggulan yang likuid | Company results, foreign fund flows, rupiah / Kinerja emiten, aliran dana asing, rupiah |
| Global stocks / Saham global | S&P 500, Nasdaq | 4 | 30–50% in a crisis / 30–50% saat krisis | Diversification outside Indonesia / Diversifikasi di luar Indonesia | Driven by earnings dates and US rates / Digerakkan jadwal laporan laba dan suku bunga AS | USD/IDR rate, valuation, access and tax / Kurs USD/IDR, valuasi, akses dan pajak |
| Crypto / Kripto | BTC, ETH | 5 | 50–80% / 50–80% | Highly speculative; many holders keep it to a small part of their savings / Sangat spekulatif; banyak pemegang menjaganya sebagai bagian kecil dari tabungan | Fast moves, 24/7; losses can be large and quick / Gerakan cepat, 24/7; kerugian bisa besar dan cepat | Extreme volatility, regulation, exchange failure / Volatilitas ekstrem, regulasi, kegagalan bursa |

## 8. Asset report (OR-31, OR-32)

| Key | EN | ID |
|---|---|---|
| asset.back | ← Investments | ← Investasi |
| asset.kind.metal | Precious metal · spot price converted to IDR per gram | Logam mulia · harga spot dikonversi ke IDR per gram |
| asset.kind.metalFutures | Precious metal · price: spot in IDR per gram · signal computed on COMEX futures closes | Logam mulia · harga: spot dalam IDR per gram · sinyal dihitung dari harga penutupan kontrak berjangka COMEX |
| asset.kind.idx | Stock · IDX | Saham · BEI |
| asset.kind.index | Index · {exchange} | Indeks · {exchange} |
| asset.kind.crypto | Crypto · USD | Kripto · USD |
| asset.today | {change} today | {change} hari ini |
| asset.chart.price | Price | Harga |
| asset.chart.ma50 | 50-day average | Rata-rata 50 hari |
| asset.chart.ma200 | 200-day average | Rata-rata 200 hari |
| asset.chart.buy | Buy signal ▲ | Sinyal beli ▲ |
| asset.chart.sell | Sell signal ▼ | Sinyal jual ▼ |
| asset.range.1m | 1M | 1B |
| asset.range.3m | 3M | 3B |
| asset.range.1y | 1Y | 1T |
| asset.range.5y | 5Y | 5T |
| asset.chart.short.one | Only {n} month of data | Hanya {n} bulan data |
| asset.chart.short.other | Only {n} months of data | Hanya {n} bulan data |
| asset.card.changedToday | changed today {time} | berubah hari ini {time} |
| asset.card.unchanged.one | unchanged {n} day | tidak berubah {n} hari |
| asset.card.unchanged.other | unchanged {n} days | tidak berubah {n} hari |
| asset.card.agree | {n} of {m} checks agree | {n} dari {m} pemeriksaan sepakat |
| asset.report.title | Report: why the long-term signal says {verdict} | Laporan: mengapa sinyal jangka panjang {verdict} |
| asset.report.generated | Generated {date}, {time} WIB · rules {version} + AI news check | Dibuat {date}, {time} WIB · aturan {version} + pemeriksaan berita AI |
| asset.report.notReady | Explanation not ready yet | Penjelasan belum siap |
| asset.checks.check | Check | Pemeriksaan |
| asset.checks.seen | What we see | Yang terlihat |
| asset.checks.verdict | Verdict | Penilaian |
| asset.verdict.supportsBuy | Supports buy | Mendukung beli |
| asset.verdict.supportsSell | Supports sell | Mendukung jual |
| asset.verdict.against | Against | Menentang |
| asset.verdict.neutral | Neutral | Netral |
| asset.verdict.context | Context only | Hanya konteks |
| asset.check.trend | Trend | Tren |
| asset.check.momentum | Momentum | Momentum |
| asset.check.currency | Currency | Mata uang |
| asset.check.news | News check | Pemeriksaan berita |
| asset.risks.title | Risks of this position | Risiko posisi ini |
| asset.reverse.title | What would change this to {verdict} | Apa yang akan mengubahnya menjadi {verdict} |
| asset.reverse.note | You get an alert the moment any of these happens. | Anda mendapat peringatan begitu salah satu hal ini terjadi. |
| asset.history.title | Signal history | Riwayat sinyal |
| asset.history.change | Price change since signal: {pct} | Perubahan harga sejak sinyal: {pct} |
| asset.history.open | open | berjalan |
| asset.related | Related business opportunities | Peluang bisnis terkait |
| asset.print | Print / save as PDF | Cetak / simpan sebagai PDF |
| asset.alertMe | Alert me when this changes | Beri tahu saya saat ini berubah |

The asset report reuses `inv.disclaimer` (no separate key). The canvas tab title "Asset signal report" is `page.title.asset`. Not shipped in v1: `asset.alertMe` (every signal change already raises an in-app alert, OR-34), `asset.print` (OR-45; replaces the canvas "Download report (PDF)").

The canvas line "Suggested approach: buy in 3 parts over 6 weeks rather than all at once" is removed (D10: instruction, not information). The history column shows "price change since signal" instead of "avoided −6.2%".

## 9. Login (OR-19, parked)

| Key | EN | ID |
|---|---|---|
| login.title | Log in | Masuk |
| login.password | Password | Kata sandi |
| login.submit | Log in | Masuk |
| login.wrong | Wrong password | Kata sandi salah |
| login.tooMany.one | Too many attempts. Try again in {minutes} minute. | Terlalu banyak percobaan. Coba lagi dalam {minutes} menit. |
| login.tooMany.other | Too many attempts. Try again in {minutes} minutes. | Terlalu banyak percobaan. Coba lagi dalam {minutes} menit. |
| login.logout | Log out | Keluar |

## 10. Mappings and rules

### 10.1 "New" trend label (OR-16, OR-17)
An opportunity whose first score is fewer than 30 days old shows `opp.trend.new` instead of a 30-day change: day 0 to day 29 show "New", day 30 shows the change.

### 10.2 Capital level → starting capital (OR-40)
Used only to pre-fill the business calculator (within OR-25's input range).

| Level | EN | ID | Starting capital |
|---|---|---|---|
| low | Low | Rendah | Rp 50.000.000 |
| medium | Medium | Sedang | Rp 250.000.000 |
| high | High | Tinggi | Rp 1.000.000.000 |

### 10.3 Venture descriptions (OR-36)

| Venture | EN | ID |
|---|---|---|
| Performa Vision | AI video analytics for workplace safety (CCTV, PPE detection) | Analitik video AI untuk keselamatan kerja (CCTV, deteksi APD) |
| Meta Klinik | Clinic management system (records, appointments, billing) | Sistem manajemen klinik (rekam medis, janji temu, penagihan) |

## 11. Phone layout (≤ 400 px)

- Shell: nav wraps onto a second line; language switch stays on the first line at the right; no horizontal scroll at 360 px.
- Radar: one column in the §5 section order; venture cards stack; market snapshot rows keep price and change on one line, sparkline below.
- News: category chips wrap; region select full width; the Sources and Trending themes panels move below the list.
- Opportunities: list only; tapping an item opens `/[locale]/opportunities/[id]` with a back link; filters collapse into a wrapped row of selects.
- Investments: risk cards one per row; the watchlist becomes cards (name + kind, price + change, signal word, risk), no table scroll.
- Asset report: header, then range buttons above a full-width chart, then the two signal cards stacked, then the report sections.
- Calculators: the two calculators stack (investment first); inputs one per row; results above the chart.
- Longest ID strings to check at 360 px: `news.onlyLinked`, `state.partial`, `inv.term.short`, `opp.detail.breakdownNote`, `radar.ventures.subtitle`.
