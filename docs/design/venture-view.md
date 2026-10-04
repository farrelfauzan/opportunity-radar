# Screen 7 — Venture view

Ticket OR-35 (spec); built by OR-51. Reached from "Open venture view" on the Radar's My ventures cards (OR-39).
Copy keys follow `docs/design/copy.md` conventions (OR-12). Look as DESIGN.md: glass cards, words and ▲/▼ symbols, never colour alone.

## Purpose
For one of the owner's own ventures: how far the build is, and whether the market in Indonesia and worldwide is getting better or worse according to the news, with the evidence. It supports the first objective (business opportunities); it shows no investment data.

## Route and navigation
- `/[locale]/ventures/[slug]`; v1 slugs `performa-vision`, `meta-klinik` (from `ventures`, OR-36). An unknown slug gets the localised not-found page (HTTP 404).
- No new nav item: "Radar" is `aria-current` on this route. A back link returns to the Radar.

## Data shown and its source

| Block | Content | Source |
|---|---|---|
| Header | Venture name, one-line description (EN/ID) | `ventures` (OR-36) |
| Progress | Progress bar with %, progress text (e.g. "Sprint 3 delivered · Sprint 4 next · 4 tickets in QA"), source and as-of time | `venture_progress`, latest row (OR-37) |
| Market view | Two cards, Indonesia and Worldwide: overall score / 100 with signed change vs yesterday (▲/▼/—), five factor bars with numbers (same factors as Opportunities), 30-day score line | `venture_market` (OR-38), one row per region per day |
| Tailwinds and headwinds | Per region: one tailwind and one headwind sentence, each with its cited articles (headline links to the publisher, source, relative time) | `venture_market` + `articles` |
| Related news | Articles matched to the venture in the last 30 days, newest first: category, impact word, headline (link), why it matters, source · time | `venture_articles` + `articles` + `article_triage` |
| Action | "Model this in the calculator": opens the business calculator with the venture's name (OR-40) | — |

## Copy (EN / ID)

| Key | EN | ID |
|---|---|---|
| venture.back | ← Radar | ← Radar |
| venture.progress.title | Build progress | Progres pembangunan |
| venture.progress.source | From {source} · updated {time} WIB | Dari {source} · diperbarui {time} WIB |
| venture.progress.notConnected | Progress source not connected | Sumber progres belum terhubung |
| venture.progress.notConnectedBody | Connect this venture's project board to show build progress. | Hubungkan papan proyek usaha ini untuk menampilkan progres pembangunan. |
| venture.market.title | Market view from the news | Pandangan pasar dari berita |
| venture.market.subtitle | Re-scored every morning from the news of the last 30 days | Dinilai ulang setiap pagi dari berita 30 hari terakhir |
| venture.market.region.id | Indonesia | Indonesia |
| venture.market.region.world | Worldwide | Dunia |
| venture.market.score | score / 100 | skor / 100 |
| venture.market.vsYesterday | {change} vs yesterday | {change} dibanding kemarin |
| venture.market.trend | Score, 30 days | Skor, 30 hari |
| venture.market.noScore | No score yet: no related news in the last 30 days | Belum ada skor: tidak ada berita terkait dalam 30 hari terakhir |
| venture.winds.title | What helps and what hurts | Apa yang membantu dan menghambat |
| venture.winds.tailwind | Tailwind | Pendorong |
| venture.winds.headwind | Headwind | Penghambat |
| venture.winds.evidence | Evidence | Bukti |
| venture.news.title | Related news, 30 days | Berita terkait, 30 hari |
| venture.news.empty | No related news in the last 30 days | Tidak ada berita terkait dalam 30 hari terakhir |
| venture.calculator | Model this in the calculator | Hitung di kalkulator |

Factor names, impact words, news categories, the stale banner and shared states reuse `copy.md` keys (`opp.factor.*`, `news.impact.*`, `news.cat.*`, `state.*`).

## States

| State | Behaviour |
|---|---|
| Loading | Skeletons for the progress card, the two market cards and the news list |
| Progress not connected (Meta Klinik until OR-47, Performa Vision until OR-37 has its Notion token) | Progress card shows `venture.progress.notConnected` + body; everything else renders normally |
| No market score for a region (no related news in 30 days) | That region's card shows `venture.market.noScore`; no invented score |
| No related news | `venture.news.empty` |
| Stale | Progress older than 26 h, or market view older than 26 h: the shared stale banner (`state.stale.*`, what = `state.stale.what.ventures`) with the as-of time |
| Error | Shared error state with retry |
| Unknown slug | Localised not-found page, HTTP 404 |

## Phone layout (≤ 400 px)
Header and back link, then the progress card, then the Indonesia card, then the Worldwide card (each: score, change, factor bars, 30-day line, tailwind and headwind), then related news, then the calculator button. No horizontal scroll at 360 px.

## Acceptance hints for OR-51
- Both v1 slugs render in EN and ID; an unknown slug returns 404.
- "Not connected" progress renders without breaking the market view.
- Every tailwind/headwind shows at least one cited article whose link opens the publisher's page.
- Change vs yesterday uses a word-free symbol plus a signed number (▲ 5 / ▼ 2 / — 0), never colour alone.

Estimate for OR-51 (Designer's proposal for the Engineer to confirm): 5 points (one page, four data blocks, a small line chart, states).
