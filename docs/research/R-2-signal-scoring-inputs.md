# R-2 — Facts and recommended answers for OR-10 (signal rules) and OR-11 (scoring rubric), plus data-source terms

Checked 2026-10-04. Evidence key: **[L]** endpoint called live that day · **[P]** read on the vendor's page that day · **[S]** third-party snippet · **[I]** inference or standard definition, not tested. Live calls were made from a residential Indonesian IP, not from a hosting provider.

## Question and the decision it feeds
What should the rules and the rubric say so that QA can check them by hand (OR-10, OR-11), and which data-source terms and limits matter for D9 (Yahoo, gold-api.com)? The Designer writes `docs/signals/rules-v1.md` and `docs/opportunities/scoring-v1.md` from this and decides D10/D11 inside the tickets; the Tech Lead can overrule at merge.

## Short answer
1. **Signals**: state-based rules on closes only, strict tie rules, no blank cells (tables below). News check and currency are shown as context and never move a verdict. Fixtures with expected values are in `R-2-fixtures/`.
2. **Gold and silver history is the real problem**: gold-api.com has no history without an API key [L], and the long-term rule needs 200 closes. Use Yahoo `GC=F` / `SI=F` (futures, ~500 closes in 2 years [L]) for the signal and label it as futures, or wait about 10 months. Needs a Tech Lead call.
3. **Scoring**: equal-weight mean; with five factors the mean never ends in .5, so rounding is unambiguous (table below).
4. **Terms (D9)**: Yahoo's terms prohibit automated collection and commercial reuse [P]; gold-api.com permits commercial use and requires no attribution, but multiple requests per second get an IP ban [P]. Both are acceptable for a single-user app polling every 5–15 minutes; the Yahoo risk is the terms, not the rate.

## 1. OR-10 — rules

### Definitions [I: standard]
- A **row** is one stored close. "SMA50" = mean of the last 50 rows, "SMA200" = last 200 rows. Rows, not calendar days: stocks give ~5 rows a week, crypto and metals 7.
- **RSI14 (Wilder 1978)**: changes = close[i] − close[i−1]. First avgGain / avgLoss = simple mean of the first 14 gains / losses (needs 15 closes). After that avg = (previous × 13 + current) / 14. RSI = 100 × avgGain / (avgGain + avgLoss). Both zero (flat) → 50. avgLoss 0 and avgGain > 0 → 100. avgGain 0 and avgLoss > 0 → 0.

### Decision tables (every combination has one answer)
Short term (days to weeks), needs ≥ 50 rows:
| RSI14 | close vs SMA50 | verdict |
|---|---|---|
| < 30 or > 70 | any | HOLD (stretched) |
| 30 to 70 inclusive | close > SMA50 | BUY |
| 30 to 70 inclusive | close < SMA50 | SELL |
| 30 to 70 inclusive | close = SMA50 | HOLD |

Long term (1 year and more), needs ≥ 200 rows:
| SMA50 vs SMA200 | close vs SMA200 | verdict |
|---|---|---|
| SMA50 > SMA200 | close > SMA200 | BUY |
| SMA50 < SMA200 | close < SMA200 | SELL |
| any other combination, including any equality | | HOLD |

### Data quality and history [I: thresholds are my judgement]
| Case | Result |
|---|---|
| Fewer rows than needed (short: < 50, long: < 200; RSI needs 15) | INSUFFICIENT for that term, no verdict |
| Any close ≤ 0 | whole series rejected, INVALID_DATA |
| Several rows for one date | keep the last |
| Gap in dates | no filling; rows are counted as they are |
| Latest close older than 7 calendar days (stocks), 3 (crypto, metals) | STALE, no verdict. IDX closes ~9 days around Lebaran: use 10 for ID stocks that week |
| Cash, bonds | no price series, no signal; show risk only |

### Which checks per asset type [I]
| Asset | Series | Notes |
|---|---|---|
| IDX stocks, IHSG | Yahoo `.JK` / `^JKSE` daily | native IDR close |
| US stocks | Yahoo daily | USD close; currency shown as context |
| Gold, silver | Yahoo `GC=F`, `SI=F` daily (see §3) | futures, USD; IDR per gram only for display |
| Crypto | Binance `data-api.binance.vision` klines (1000 daily rows per call [L]) or Indodax OHLC | IDR pair via Indodax |
| Cash, bonds | none | — |

### Flip prices
Short-term BUY/SELL flips at the mean of the 49 closes before the last one; long-term close-vs-SMA200 flips at the mean of the 199 before. RSI-driven flips have no simple closed form; the generator finds them to 0.01 by search and the fixtures list them (README). [L: computed]

### Wording rules to propose [I]
- BUY / HOLD / SELL always a word; disclaimer EN: "Rule-based information, not financial advice." ID: "Informasi berbasis aturan, bukan nasihat keuangan."
- Banned patterns (EN): "buy in N parts/steps", "should", "must", "we recommend", "you need to", "avoid", "avoided", "core of", "only a small", "your portfolio". ID: "sebaiknya", "harus", "kami sarankan", "Anda perlu", "hindari", "inti dari", "porsi kecil saja".
- Regulatory context [I, from memory, not checked today]: personalised investment advice in Indonesia is a licensed activity (OJK, investment adviser). Impersonal, rule-based information is the safer side. It matters only if the app is ever shared beyond Farrel.

## 2. OR-11 — scoring

### Overall score and rounding
Equal-weight mean of five integers, `Math.round`. Five integers sum to S; S/5 is always n.0, .2, .4, .6 or .8 — never .5 — so rounding has no tie. Worked examples (Demand, Timing, Competition, Capital, Regulatory):
| factors | sum | mean | score |
|---|---|---|---|
| 80, 70, 60, 50, 40 | 300 | 60.0 | 60 |
| 80, 70, 60, 50, 41 | 301 | 60.2 | 60 |
| 81, 70, 60, 50, 41 | 302 | 60.4 | 60 |
| 82, 70, 60, 50, 41 | 303 | 60.6 | 61 |
| 83, 70, 60, 50, 41 | 304 | 60.8 | 61 |
| 100, 100, 100, 100, 99 | 499 | 99.8 | 100 |
| 0, 0, 0, 0, 0 | 0 | 0.0 | 0 |
The ".33" case in QA's review needs three factors and does not occur.

### Factor anchors (higher is always better) — proposals, the Tech Lead may change the rupiah figures
| Factor | 0 | 50 | 100 |
|---|---|---|---|
| Demand | no sign anyone wants it; only supply-side news | clear need in one segment, mixed signals | documented unmet demand at scale in several sources (shortages, queues, government targets) |
| Timing | window closed or more than 3 years away | trend emerging, window 12–24 months | trigger event in the last 90 days, window opens within 6 months |
| Competition (low competition = high score) | dominated by funded incumbents or free substitutes | several players, none dominant locally | no local player, or only informal sellers |
| Capital efficiency | more than Rp 5 bn or 24 months before first revenue | about Rp 500 m, 6–12 months | under Rp 50 m, first revenue within 3 months |
| Regulatory risk (low risk = high score) | licence or ban likely to block it | licence needed but obtainable (e.g. OJK, BPOM) | unregulated or explicitly supported by government |

Capital level for the contract: Low ≤ Rp 100 m, Medium Rp 100 m–1 bn, High > Rp 1 bn.

### Matching, re-scoring, closing (code-owned, deterministic)
- New theme T matches open opportunity O iff **(same theme AND same region AND at least one shared sector) OR (at least 2 shared cited articles)**. Otherwise a new opportunity.
- Examples: match: T ev_batteries/Indonesia/{energy_mining, manufacturing} vs O ev_batteries/Indonesia/{manufacturing}; match: ai_adoption/Worldwide/{ai_software} vs same plus fintech_finance; match: different themes but 2 shared articles. No match: same theme and sector, different region; same theme and region, no shared sector, 1 shared article; different theme, 1 shared article. Borderline (decided): same theme and region, no shared sector, exactly 2 shared articles → match; exactly 1 → no match.
- Re-score only when at least 1 new linked article exists since the last score. Close after 30 days with no new linked article (same as the 30-day trend window). A closed opportunity is never matched; a new one is created.

### Contract rules
- Shape (JSON Schema): required fields, types, enums, array sizes, max lengths. Code rules: cited IDs ⊂ input IDs; at least 2 distinct cited IDs; scores integers 0–100; risks 2–5; first steps 1–5.
- Max lengths (chars): title 90, thesis 400, each risk 160, each first step 160, capital reason 120. Text is rendered as text, never as markup.
- Not valid JSON → reject and retry once. Strip exactly one surrounding ```json fence; tolerate nothing else.
- Sector outside the list → reject. Theme outside the vocabulary → triage (OR-14) maps it to `other`; at opportunity level reject.
- Every text field is non-empty in both `en` and `id`.

### Fixed sector list (18)
| id | EN | ID |
|---|---|---|
| agri_food | Agriculture & Food | Pertanian & Pangan |
| fisheries_maritime | Fisheries & Maritime | Perikanan & Maritim |
| energy_mining | Energy & Mining | Energi & Pertambangan |
| renewables_climate | Renewables & Climate | Energi Terbarukan & Iklim |
| manufacturing | Manufacturing & Industry | Manufaktur & Industri |
| logistics | Logistics & Supply Chain | Logistik & Rantai Pasok |
| retail_ecommerce | Retail & E-commerce | Ritel & E-commerce |
| fintech_finance | Fintech & Financial Services | Fintech & Jasa Keuangan |
| health_biotech | Healthcare & Biotech | Kesehatan & Bioteknologi |
| education | Education & Skills | Pendidikan & Keterampilan |
| property_construction | Property & Construction | Properti & Konstruksi |
| tourism_hospitality | Tourism & Hospitality | Pariwisata & Perhotelan |
| media_creative | Media & Creative | Media & Kreatif |
| telecom_infra | Telecom & Digital Infrastructure | Telekomunikasi & Infrastruktur Digital |
| ai_software | AI & Software | AI & Perangkat Lunak |
| hardware_electronics | Hardware & Electronics | Perangkat Keras & Elektronik |
| govtech_public | GovTech & Public Services | GovTech & Layanan Publik |
| consumer_services | Consumer Services | Jasa Konsumen |

### Controlled theme vocabulary (36 + other)
| id | EN | ID |
|---|---|---|
| ai_adoption | AI adoption in business | Adopsi AI di bisnis |
| ai_regulation | AI regulation | Regulasi AI |
| data_centers | Data centres & cloud | Pusat data & cloud |
| semiconductors | Semiconductors & chips | Semikonduktor & chip |
| cybersecurity | Cybersecurity & scams | Keamanan siber & penipuan |
| digital_payments | Digital payments | Pembayaran digital |
| digital_banking_lending | Digital banking & lending | Bank digital & pinjaman |
| interest_rates | Interest rates & central banks | Suku bunga & bank sentral |
| inflation_cost_living | Inflation & cost of living | Inflasi & biaya hidup |
| rupiah_fx | Rupiah & currency moves | Rupiah & pergerakan kurs |
| trade_tariffs | Trade, tariffs & sanctions | Perdagangan, tarif & sanksi |
| geopolitics_conflict | Geopolitical conflict | Konflik geopolitik |
| indonesia_policy | Indonesian government policy | Kebijakan pemerintah Indonesia |
| indonesia_budget_subsidy | State budget & subsidies | APBN & subsidi |
| downstreaming_minerals | Downstreaming & critical minerals | Hilirisasi & mineral kritis |
| ev_batteries | EVs & batteries | Kendaraan listrik & baterai |
| renewable_energy | Renewable energy & transition | Energi terbarukan & transisi |
| oil_gas_coal | Oil, gas & coal | Minyak, gas & batu bara |
| food_security | Food security & agriculture | Ketahanan pangan & pertanian |
| healthcare_access | Healthcare access & health-tech | Akses kesehatan & health-tech |
| pharma_biotech | Pharma & biotech | Farmasi & bioteknologi |
| ecommerce_social | E-commerce & social commerce | E-commerce & social commerce |
| consumer_spending | Consumer spending & middle class | Belanja konsumen & kelas menengah |
| logistics_supply_chain | Logistics & supply chain | Logistik & rantai pasok |
| infrastructure_construction | Infrastructure & construction | Infrastruktur & konstruksi |
| property_housing | Property & housing | Properti & perumahan |
| tourism_travel | Tourism & travel | Pariwisata & perjalanan |
| education_skills | Education & workforce skills | Pendidikan & keterampilan tenaga kerja |
| startup_funding | Startup funding & venture capital | Pendanaan startup & modal ventura |
| ipo_capital_markets | IPOs & capital markets | IPO & pasar modal |
| halal_islamic_finance | Halal economy & Islamic finance | Ekonomi halal & keuangan syariah |
| crypto_assets | Crypto & digital assets | Kripto & aset digital |
| gold_commodities | Gold & commodity prices | Emas & harga komoditas |
| labour_wages_layoffs | Jobs, wages & layoffs | Pekerjaan, upah & PHK |
| climate_disasters | Climate & natural disasters | Iklim & bencana alam |
| smes_msme | SMEs & MSMEs | UMKM |
| other | Other | Lainnya |

### Two-scorer check (AC1)
Sample themes with real articles: `R-2-samples/themes.json`. Scorers are two agent sessions (Designer = A, Researcher = B), not two people; QA asked that this be stated. Scorer B scored at 2026-10-04T01:17:30Z before seeing A's scores. Scores and differences are added to this section once A's scores arrive. [pending]

## 3. Data-source terms and limits

| Source | Free tier / limits | Key | Terms on display and redistribution | Delay | History | From a hosting IP |
|---|---|---|---|---|---|---|
| Yahoo chart endpoint | unofficial; 15 consecutive symbol requests all returned 200 [L]; no published limit | No | Terms prohibit access "using any automated means … robots, spiders, scrapers" and commercial reuse; personal use only [P: legal.yahoo.com/us/en/yahoo/terms/otos]. The chart endpoint is not a licensed API [I] | ~10 s cache header [L]; exchange delay not stated | `range=10y&interval=1d` OK [R-1 L]; `range=max&interval=1d` returned only 269 rows from 2004 (coarser), so use an explicit range [L] | Not tested |
| gold-api.com | "No rate limiting for real-time prices"; "multiple requests per second" counts as abuse, IP ban without notice [P: /terms] | No for prices | Commercial use explicitly permitted; no attribution; storage and re-display not addressed [P] (storing our own copy is [I] fine) | seconds (`updatedAt` 2026-10-04T01:10:04Z when called 01:10) [L] | **Real-time only; `/history` returns 401 "No x-api-key header"** [L] | Not tested |
| Binance `data-api.binance.vision` | request-weight headers returned (`x-mbx-used-weight-1m`) [L]; klines up to 1000 rows per call [L]; the weight limit value I did not read today | No | Binance page returned 403 to my fetch; terms unread | real time | 1000 daily rows per call | Not tested (R-1: `api.binance.com` failed from Indonesia) |
| Indodax public API | 180 requests/minute [P: github.com/btcid/indodax-official-api-docs Public-RestAPI.md] | No | none stated [P] | real time | OHLC `/tradingview/history_v2`, 1D supported [P] | Not tested |
| Frankfurter | no key; daily ECB | No | open source API | daily | time series works (2025-10-01..10-10 returned) [L] | Not tested |

Spot vs futures today [L]: gold-api XAU 4141.80 vs Yahoo GC=F 4162.30 (+0.5%); XAG 60.52 vs SI=F 59.98.

## Options for the gold/silver history problem
| Option | Cost | Upside | Downside |
|---|---|---|---|
| Signal on Yahoo GC=F / SI=F futures, display spot from gold-api | none | 200+ closes on day 1 | futures ≠ spot (roll, basis); same Yahoo terms issue |
| Build own spot history from gold-api polling | none | true spot | long-term signal unavailable for ~10 months, short-term after ~50 trading days |
| Paid history API | money, key | clean | needs Tech Lead approval (keys, paid plans) |
Recommendation: first option, with the signal screen saying "based on COMEX futures closes".

## Confidence and what is unverified
- High: indicator definitions and fixtures (two independent implementations agree); live endpoint results above on the day.
- Medium: stale thresholds, Lebaran length, rupiah anchors for the factor table (judgement).
- Unverified: whether Yahoo/gold-api/Binance work from a Lambda IP; Binance weight limit value and terms; publisher RSS terms; Yahoo's actual exchange delay for IDX; the OJK adviser-licence statement.
- What would settle it: OR-5 retest from the deployed environment; Tech Lead decision on futures vs spot.

## Impact on tickets
- OR-10, OR-11: inputs for both specs; fixtures for QA and OR-29.
- OR-29 (signal engine): rows-based windows, stale/insufficient/invalid states, flip-price boundary test from the fixtures.
- Price-ingestion tickets for gold and silver: backfill from Yahoo GC=F/SI=F; gold-api only for the live quote.
- OR-8 (RSS): feed list in R-1 addendum.
- D9: Yahoo terms wording above; gold-api.com terms now read (commercial use allowed).
- Possible wrong earlier decision: R-1 said gold/silver spot "gold-api.com [L]" as primary for the metals needs; for signals it cannot supply history (new finding). Tech Lead to be told via the Orchestrator.
