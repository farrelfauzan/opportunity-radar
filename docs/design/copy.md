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

`nav.main` is the accessible name of the main navigation (screen readers already say "navigation"). The alert bell (`nav.alerts.*`) ships with OR-34. The canvas's header badge "Sample data" is not shipped in the header; sample prices are labelled where they appear (§8.2).

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
| news.cat.label | Category | Kategori |
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
| news.whyAi | AI | AI |
| news.whyAiSr | Written by AI from the article, not by the publisher | Ditulis oleh AI dari artikel, bukan oleh penerbit |
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

AI mark on "Why it matters" (OR-21 review): the label `news.why` is followed by `news.whyAi`, a small word in muted text with a solid 1px outline (the dashed outline stays reserved for `sample.badge`), and `news.whyAiSr` as screen-reader text. The visible tooltip is `news.whyAiSr` too. Applies wherever the "why it matters" text is shown: News items (OR-21), Radar "News that moves opportunities" (OR-23), venture related news (OR-51) if it shows the text. The publisher's snippet never carries the mark.

Partial state (OR-9 follow-up): when the news is not stale but at least one active source failed on the latest ingestion run (status not ok and not 304), the Sources panel shows `state.partial` at its top and `news.sources.notUpdated` after each affected source name. No page-level banner; the stale banner (§2) takes precedence when both apply.

Region shown on an item uses `news.region.id` / `news.region.global`. Category and region filters live in the URL query. OR-21 adds the impact, why, linked and themes strings; OR-9 uses the rest. Theme labels are `news.theme.<id>`, one per id in `docs/opportunities/scoring-v1.md` §8 with the EN and ID text from that table (not repeated here, like the sector labels in §6). The Trending themes card ranks the last 7 days' triaged articles by theme, leaves `other` out of the ranking, and is omitted entirely when nothing is left to rank. Right column on desktop: Trending themes first, Sources second (as in the design).

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
| radar.market.asOf | As of {time} WIB | Per {time} WIB |
| radar.market.asOfEarlier | As of {date}, {time} WIB | Per {date}, {time} WIB |
| radar.market.asOfDate | As of {date} | Per {date} |
| radar.market.stale | Out of date | Belum diperbarui |
| radar.market.up | up {pct} | naik {pct} |
| radar.market.down | down {pct} | turun {pct} |
| radar.market.flat | unchanged | tidak berubah |
| radar.news.title | News that moves opportunities | Berita yang menggerakkan peluang |
| radar.news.all | All news | Semua berita |
| radar.news.linked.one | Linked to {n} opportunity | Terkait {n} peluang |
| radar.news.linked.other | Linked to {n} opportunities | Terkait {n} peluang |

Brief line labels ("Policy:", "Tech & AI:", "Markets:" in the canvas) are not free text: OR-22 tags each line with one of the News categories and the UI shows `news.cat.*` (Politics & policy, Tech & AI, Markets, Business, Commodities) followed by a colon.

Radar states (OR-23 review):
- Stale: per section, not page-wide. The brief card shows `state.stale.today`/`.earlier` with `state.stale.what.brief`; Top opportunities with `state.stale.what.opportunities`. Both can show at once.
- Never run (no brief, no opportunities, no news ever stored): one card with `state.never.title` and `state.never.body`, `{time}` = 07:00 (the morning run), in place of the brief; the other sections show their own empty texts.
- Top opportunities: "Based on N news items" (`radar.top.basedOn`) is hidden when N is 0; `radar.brief.affected` is plain text (no link).
- News that moves opportunities: each row shows `news.item.meta` (source · time · region, as on News), the why-text with the AI mark (§3), and `radar.news.linked` when the item is linked to at least one open opportunity (hidden at 0; plain text).

Section order (desktop and phone): brief → My ventures → Top opportunities → News that moves opportunities → Investment alerts → Market snapshot. Investments never come before opportunities.

Market snapshot (OR-28):
- Rows: IHSG, USD/IDR, Gold / gram, Bitcoin (`asset.name.*`), each with price, 1-day change, a 10-point sparkline, and `sample.badge` on synthetic rows (§8.2).
- Change: ▲ / ▼ / — and the unsigned percentage with one decimal per locale (▲ 1.2%, ▼ 0.8%, — 0.0% when it rounds to zero). Up in the teal accent, down in orange, unchanged in muted text; the arrow is the shape, colour is never alone. Accessible label: `radar.market.up` / `.down` / `.flat` (the arrow is hidden from screen readers).
- As-of: visible muted text under the price (no hover, so it works on phones): `radar.market.asOf` when today, `radar.market.asOfEarlier` otherwise; USD/IDR is a daily reference rate with no time, so it uses `radar.market.asOfDate`.
- Stale (past the §2.3 threshold, inside market hours only): the row shows the word `radar.market.stale` after its as-of text, and the section shows `state.stale.today` / `.earlier` with `state.stale.what.prices` once above the rows when any row is stale. Outside market hours the row shows `state.marketClosed` in place of the as-of text, and is not stale.

## 6. Opportunities (OR-17, OR-18, OR-41, OR-40)

| Key | EN | ID |
|---|---|---|
| opp.title | Opportunities | Peluang |
| opp.summary | {n} open · re-scored every morning from the news | {n} terbuka · dinilai ulang setiap pagi dari berita |
| opp.filter.region.label | Region | Wilayah |
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
| opp.detail.evidenceMeta | {source} · {ago} | {source} · {ago} |
| opp.detail.aiNote | Scores are AI estimates from the cited news, scored against a fixed rubric every morning. | Skor adalah perkiraan AI dari berita yang dikutip, dinilai dengan rubrik tetap setiap pagi. |
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

Quick facts, starting capital: the level word, then the model's reason in brackets: "Medium (equipment and certified engineers)" / "Sedang (…)"; the reason is shown as stored. A closed or unknown opportunity id answers HTTP 404 with `opp.detail.closed` and `opp.detail.back` (the 404 page cannot tell closed from unknown); `opp.detail.closedTag` is the tag on shortlisted closed items in the list (OR-41).

Evidence items under "Why now" show the headline (link to the original), then `opp.detail.evidenceMeta`; items from open-licence sources add the credit line (§3.1). `opp.detail.aiNote` sits under the score breakdown in muted text.

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
| asset.verdict.notCounted | not counted | tidak dihitung |
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

## 8.1 Rule texts and asset names (OR-26/27/28, OR-29 → OR-30/31/32/34)

All text the rule engine (OR-29) produces is assembled from these keys; the LLM never writes it. Wording per `docs/signals/rules-v1.md` §7: it describes what the rules see, never instructs. Prices and percentages are formatted per locale (OR-2).

### Asset names and kinds (v1 watchlist and market snapshot)

| Key | EN | ID |
|---|---|---|
| asset.name.ihsg | IHSG | IHSG |
| asset.name.bbca | BBCA | BBCA |
| asset.name.sp500 | S&P 500 | S&P 500 |
| asset.name.gold | Gold | Emas |
| asset.name.silver | Silver | Perak |
| asset.name.bitcoin | Bitcoin | Bitcoin |
| asset.name.ethereum | Ethereum | Ethereum |
| asset.name.usdidr | USD/IDR | USD/IDR |
| asset.name.goldGram | Gold / gram | Emas / gram |
| asset.kind.metalShort | IDR per gram | IDR per gram |

The watchlist's kind line uses `asset.kind.idx`, `asset.kind.index`, `asset.kind.crypto` (§8) and `asset.kind.metalShort`. Added assets (OR-44) show their symbol as the name.

### States with no verdict

| Key | EN | ID |
|---|---|---|
| signal.stale | No signal: prices are out of date | Tanpa sinyal: harga belum diperbarui |
| signal.invalid | No signal: the price data has errors | Tanpa sinyal: data harga bermasalah |
| signal.sample | No signal: sample data | Tanpa sinyal: data contoh |

`signal.none` (§7) is for `INSUFFICIENT`, `signal.stale` for `STALE`, `signal.invalid` for `INVALID_DATA`, `signal.sample` for any series whose source is `synthetic` (§8.2); cash & bonds use `signal.noSignal`.

### Checks: "What we see" (OR-32 checks table, signal cards)

| Key | EN | ID |
|---|---|---|
| signal.check.rsiInRange | RSI is {rsi}: between 30 and 70 | RSI {rsi}: di antara 30 dan 70 |
| signal.check.rsiAbove50 | RSI is {rsi}: between 30 and 70, above 50 | RSI {rsi}: di antara 30 dan 70, di atas 50 |
| signal.check.rsiBelow50 | RSI is {rsi}: between 30 and 70, below 50 | RSI {rsi}: di antara 30 dan 70, di bawah 50 |
| signal.check.rsiHigh | RSI is {rsi}: above 70 (overbought) | RSI {rsi}: di atas 70 (jenuh beli) |
| signal.check.rsiLow | RSI is {rsi}: below 30 (oversold) | RSI {rsi}: di bawah 30 (jenuh jual) |
| signal.check.close50.above | The price ({price}) is above the 50-day average ({sma}) | Harga ({price}) di atas rata-rata 50 hari ({sma}) |
| signal.check.close50.below | The price ({price}) is below the 50-day average ({sma}) | Harga ({price}) di bawah rata-rata 50 hari ({sma}) |
| signal.check.close50.equal | The price equals the 50-day average ({sma}) | Harga sama dengan rata-rata 50 hari ({sma}) |
| signal.check.sma50vs200.above | The 50-day average is above the 200-day average | Rata-rata 50 hari di atas rata-rata 200 hari |
| signal.check.sma50vs200.below | The 50-day average is below the 200-day average | Rata-rata 50 hari di bawah rata-rata 200 hari |
| signal.check.sma50vs200.equal | The 50-day and 200-day averages are equal | Rata-rata 50 hari dan 200 hari sama |
| signal.check.close200.above | The price ({price}) is above the 200-day average ({sma}) | Harga ({price}) di atas rata-rata 200 hari ({sma}) |
| signal.check.close200.below | The price ({price}) is below the 200-day average ({sma}) | Harga ({price}) di bawah rata-rata 200 hari ({sma}) |
| signal.check.close200.equal | The price equals the 200-day average ({sma}) | Harga sama dengan rata-rata 200 hari ({sma}) |
| signal.check.currency.weaker | The rupiah weakened {pct} against the US dollar over 30 days (USD/IDR rose) | Rupiah melemah {pct} terhadap dolar AS dalam 30 hari (USD/IDR naik) |
| signal.check.currency.stronger | The rupiah strengthened {pct} against the US dollar over 30 days (USD/IDR fell) | Rupiah menguat {pct} terhadap dolar AS dalam 30 hari (USD/IDR turun) |
| signal.check.currency.flat | The rupiah was unchanged against the US dollar over 30 days | Rupiah tidak berubah terhadap dolar AS dalam 30 hari |
| signal.check.news | Relevant articles this week: {supportive} positive, {against} negative, {total} in total | Artikel relevan minggu ini: {supportive} positif, {against} negatif, total {total} |
| signal.check.newsNone | No relevant articles this week | Tidak ada artikel relevan minggu ini |

`{pct}` in the currency rows is unsigned (formatted per locale without a sign): the direction is in the wording, chosen from the sign of the 30-day USD/IDR change (a rise = `weaker`; a change that rounds to 0.0% = `flat`). Check names use `asset.check.*` (§8); verdict words use `asset.verdict.*`. The currency and news rows always carry `asset.verdict.context`. The momentum row carries its word (rules-v1 §3.3) followed by `asset.verdict.notCounted` in muted text. `asset.card.agree` appears on the long-term card only ("{n} of 2 checks agree"); the short-term card shows no counter, since momentum is not counted and one check would remain.

### Triggers (signal history and alerts)

| Key | EN | ID |
|---|---|---|
| signal.trigger.close50.above | The price closed above the 50-day average. | Harga ditutup di atas rata-rata 50 hari. |
| signal.trigger.close50.below | The price closed below the 50-day average. | Harga ditutup di bawah rata-rata 50 hari. |
| signal.trigger.close50.equal | The price closed at the 50-day average. | Harga ditutup tepat di rata-rata 50 hari. |
| signal.trigger.rsiOut | RSI moved outside 30–70. | RSI keluar dari rentang 30–70. |
| signal.trigger.rsiBack | RSI moved back between 30 and 70. | RSI kembali ke rentang 30–70. |
| signal.trigger.longBuy | The 50-day average and the price are both above the 200-day average. | Rata-rata 50 hari dan harga sama-sama di atas rata-rata 200 hari. |
| signal.trigger.longSell | The 50-day average and the price are both below the 200-day average. | Rata-rata 50 hari dan harga sama-sama di bawah rata-rata 200 hari. |
| signal.trigger.longMixed | The 50-day average and the price no longer point the same way against the 200-day average. | Rata-rata 50 hari dan harga tidak lagi searah terhadap rata-rata 200 hari. |
| signal.trigger.initial | First signal computed. | Sinyal pertama dihitung. |

OR-29 stores the trigger key per history row (the one that best explains the change: for short term, an RSI move outranks a close-vs-50 move).

### Alert text (OR-34)

| Key | EN | ID |
|---|---|---|
| alert.text.short | Short-term signal changed from {from} to {to}. {trigger} | Sinyal jangka pendek berubah dari {from} menjadi {to}. {trigger} |
| alert.text.long | Long-term signal changed from {from} to {to}. {trigger} | Sinyal jangka panjang berubah dari {from} menjadi {to}. {trigger} |

`{from}` and `{to}` are the verdict words `signal.buy|hold|sell`; `{trigger}` is a `signal.trigger.*` text. `initial` rows raise no alert.

### What would change the signal (OR-32)

| Key | EN | ID |
|---|---|---|
| asset.reverse.titleAny | What would change this signal | Apa yang akan mengubah sinyal ini |
| signal.reverse.close50.below | A close below {price} (the 50-day average) | Penutupan di bawah {price} (rata-rata 50 hari) |
| signal.reverse.close50.above | A close above {price} (the 50-day average) | Penutupan di atas {price} (rata-rata 50 hari) |
| signal.reverse.rsiHigh | A close above about {price}, which would lift RSI above 70 | Penutupan di atas sekitar {price}, yang akan menaikkan RSI ke atas 70 |
| signal.reverse.rsiLow | A close below about {price}, which would push RSI below 30 | Penutupan di bawah sekitar {price}, yang akan menurunkan RSI ke bawah 30 |
| signal.reverse.rsiBackBelow70 | A close below about {price}, which would bring RSI back under 70 | Penutupan di bawah sekitar {price}, yang akan membawa RSI kembali di bawah 70 |
| signal.reverse.rsiBackAbove30 | A close above about {price}, which would bring RSI back above 30 | Penutupan di atas sekitar {price}, yang akan membawa RSI kembali di atas 30 |
| signal.reverse.close200.below | A close below {price} (the 200-day average) | Penutupan di bawah {price} (rata-rata 200 hari) |
| signal.reverse.close200.above | A close above {price} (the 200-day average) | Penutupan di atas {price} (rata-rata 200 hari) |
| signal.reverse.smaDown | The 50-day average moving below the 200-day average | Rata-rata 50 hari bergerak ke bawah rata-rata 200 hari |
| signal.reverse.smaUp | The 50-day average moving above the 200-day average | Rata-rata 50 hari bergerak ke atas rata-rata 200 hari |
| signal.reverse.none | No price within the usual range would change this signal | Tidak ada harga dalam rentang wajar yang akan mengubah sinyal ini |

Momentum check text: `signal.check.rsiAbove50` / `rsiBelow50` for RSI inside 30–70 ("Supports buy" / "Supports sell"), `rsiInRange` at exactly 50 ("Neutral"), `rsiHigh` / `rsiLow` when stretched ("Neutral"); rules-v1 §3.3. Reversal keys: `rsiHigh` / `rsiLow` when RSI would become stretched (a BUY or SELL turning HOLD); `rsiBackBelow70` / `rsiBackAbove30` when a stretched RSI would come back into range (a HOLD turning BUY or SELL).

Use `asset.reverse.title` ("What would change this to {verdict}") when every listed condition leads to the same verdict, otherwise `asset.reverse.titleAny`. At most two conditions per term (rules-v1 §5).

### Chart (OR-31)

| Key | EN | ID |
|---|---|---|
| asset.chart.summary | {name}: latest price {price}; 50-day average {sma50}; 200-day average {sma200}; last signal {verdict} on {date} | {name}: harga terakhir {price}; rata-rata 50 hari {sma50}; rata-rata 200 hari {sma200}; sinyal terakhir {verdict} pada {date} |
| asset.chart.markerBuy | Buy signal ▲ on {date} at {price} | Sinyal beli ▲ pada {date} di {price} |
| asset.chart.markerSell | Sell signal ▼ on {date} at {price} | Sinyal jual ▼ pada {date} di {price} |

`asset.chart.summary` is the chart's text alternative for screen readers; the marker texts are the tooltips and the markers' accessible names.

## 8.2 Sample (synthetic) price data

Until live price sources are switched on (OR-53, OR-54, waiting for the Tech Lead's D9 decision), stored prices may be `synthetic`: made up in the shape of the real source. A price, chart, signal or alert built on them must never look real. Decided 2026-10-04 (Orchestrator).

| Key | EN | ID |
|---|---|---|
| sample.label | Sample data, not real prices | Data contoh, bukan harga nyata |
| sample.badge | Sample | Contoh |
| sample.explain | These prices are made up to test the app. Real prices are used once the live data source is switched on. | Harga ini dibuat untuk menguji aplikasi. Harga nyata dipakai setelah sumber data langsung diaktifkan. |
| sample.signalNote | Signal computed on sample data, not on real prices. | Sinyal dihitung dari data contoh, bukan dari harga nyata. |
| sample.alertsNone | No alerts while prices are sample data | Tidak ada peringatan selama harga masih data contoh |

**No verdict on sample data** (Tech Lead, delegated, via the Orchestrator, 2026-10-04; option C): in normal use a BUY, HOLD or SELL computed on made-up prices is never shown. The rule engine still computes it and stores it flagged `synthetic`; screens show the no-verdict state `signal.sample` instead, no alert is raised, and the chart shows no markers.

**Development and QA only:** the server env switch `SHOW_SAMPLE_SIGNALS=1` (off by default, never set in production) shows the verdicts computed on sample data, with the sample labels: `sample.label` as below, both signal cards and the report starting with `sample.signalNote`, and markers drawn. Even with the switch on, no alert is raised from synthetic data.

Where it goes (any series whose source is `synthetic`):
- Investments watchlist (OR-30): `sample.badge` as a word next to the price of each synthetic row, and `signal.sample` in its signal column; when any row is synthetic, one `sample.label` line above the table with `sample.explain` as its description.
- Asset report (OR-31, OR-32): `sample.label` with `sample.explain` directly under the asset header, above the chart; the chart's text alternative (`asset.chart.summary`) ends with `sample.label` and gives no last signal; the chart shows no buy/sell markers; both signal cards show the no-verdict state `signal.sample` with `sample.explain` as the reason; the checks table, explanation, reversal conditions and signal history are not shown.
- Market snapshot on the Radar (OR-28): `sample.badge` on each synthetic row.
- Alerts (OR-34): no alert is created from a synthetic series; the bell counts none; when no alert exists because prices are synthetic, the alert lists show `sample.alertsNone` instead of the normal empty text.
- Signal explanation (OR-33): no explanation is generated or shown for a synthetic series.

The label is a word in muted text with a dashed outline (like the canvas's former "Sample data" badge), never colour alone. It describes the data; it is not a warning about the signal and adds no advice.

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
- News: category chips wrap; region select full width; the Trending themes and Sources panels move below the list, in that order.
- Opportunities: list only; tapping an item opens `/[locale]/opportunities/[id]` with a back link; filters collapse into a wrapped row of selects.
- Investments: risk cards one per row; the watchlist becomes cards (name + kind, price + change, signal word, risk), no table scroll.
- Asset report: header, then range buttons above a full-width chart, then the two signal cards stacked, then the report sections.
- Calculators: the two calculators stack (investment first); inputs one per row; results above the chart.
- Longest ID strings to check at 360 px: `news.onlyLinked`, `state.partial`, `inv.term.short`, `opp.detail.breakdownNote`, `radar.ventures.subtitle`.
