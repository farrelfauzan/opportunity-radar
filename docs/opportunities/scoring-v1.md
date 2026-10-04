# Opportunity scoring v1 and the LLM output contract

Ticket OR-11. Used by OR-14 (triage: theme vocabulary), OR-15 (create), OR-50 (match, update, close), OR-16 (score), OR-17/18 (display), OR-38 (ventures).
Decided 2026-10-04 by the Designer on the Tech Lead's delegation (D11), from the Researcher's inputs (R-2, branch `research/r-2`). The Tech Lead can overrule any part at merge.

## 1. Overall score (D11)

Overall = equal-weight mean of the five factor scores, rounded with `Math.round`, computed in code (never by the LLM). Five integers always give a mean ending in .0, .2, .4, .6 or .8, so rounding has no tie.

| Demand, Timing, Low competition, Capital efficiency, Low regulatory risk | Sum | Mean | Score |
|---|---|---|---|
| 88, 90, 70, 62, 84 | 394 | 78.8 | 79 |
| 80, 70, 60, 50, 40 | 300 | 60.0 | 60 |
| 80, 70, 60, 50, 41 | 301 | 60.2 | 60 |
| 82, 70, 60, 50, 41 | 303 | 60.6 | 61 |
| 100, 100, 100, 100, 99 | 499 | 99.8 | 100 |
| 0, 0, 0, 0, 0 | 0 | 0.0 | 0 |

Factor scores are integers 0–100; higher is always better on every factor.

## 2. Factor anchors

| Factor | 0 | 50 | 100 |
|---|---|---|---|
| Demand | no sign anyone wants it; only supply-side news | clear need in one segment, mixed signals | documented unmet demand at scale in several sources (shortages, queues, government targets) |
| Timing | window closed, or more than 3 years away | trend emerging; window 12–24 months | trigger event in the last 90 days; window opens within 6 months |
| Low competition | dominated by funded incumbents or free substitutes | several players, none dominant locally | no local player, or only informal sellers |
| Capital efficiency | more than Rp 5 bn or 24 months before first revenue | about Rp 500 m, 6–12 months to first revenue | under Rp 50 m, first revenue within 3 months |
| Low regulatory risk | a licence or ban is likely to block it | a licence is needed but obtainable (e.g. OJK, BPOM) | unregulated, or explicitly supported by government |

Competition rule (added before round 3): government programmes, NGO services and free public tools count as substitutes when they serve the same buyer at no cost.

The rupiah figures in the Capital efficiency row and in §3 are the Researcher's proposal (R-2); the Tech Lead confirms or changes them at merge.

Timing rule added after the round-1 check (§6): if authorities are already acting to **reverse** the trigger (a release of reserves, a price cap), timing is at most 60; if they are acting to **reinforce** it (subsidy, mandate, deadline), timing is at least 60.

Interpolate between anchors. Each factor score comes with a one-sentence reason in EN and ID that cites at least one article.

## 3. Capital level and horizon

| Field | Values |
|---|---|
| Capital level | `low` < Rp 100 m · `medium` Rp 100 m up to but not including Rp 1 bn · `high` ≥ Rp 1 bn (plus a one-line reason, EN and ID) |
| Horizon | `0-6m` · `6-12m` · `1-3y` (labels in `copy.md` §6) |
| Region | `indonesia` · `global`. Same values as `articles.region` (OR-6/OR-8), so opportunities, ventures and articles join without a mapping. The UI label for `global` is "Global" in News and Opportunities and "Worldwide" / "Dunia" on venture cards (`copy.md`) |

The calculator pre-fill amounts per capital level are in `docs/design/copy.md` §10.2.

## 4. Matching, re-scoring and closing (code-owned, deterministic; OR-50)

- A new theme T matches an open opportunity O if and only if **(same theme AND same region AND at least one shared sector) OR (at least 2 shared cited articles)**. Otherwise a new opportunity is created.
- Examples. Match: T `ev_batteries`/Indonesia/{energy_mining, manufacturing} vs O `ev_batteries`/Indonesia/{manufacturing}. Match: different themes but 2 shared articles. No match: same theme and sector, different region. No match: same theme and region, no shared sector, 1 shared article. Same theme and region, no shared sector, exactly 2 shared articles → match.
- On a match: the existing opportunity keeps its id, theme, region and sectors and gains the new citations. Its text fields (title, thesis, buyer, model, capital reason, risks, first steps) are replaced by the new item's text **only when** the theme is the same **and** the new item cites at least one article the opportunity already cites. Otherwise (a match through 2 shared citations under a different theme, or a same-theme item with no shared article) only the citations are added and the text stays. The rule is applied in code from the stored theme and the cited article ids, never from the model's own claim of which opportunity it updates. It keeps the text consistent with the theme and makes it harder for a single injected article to rewrite an existing opportunity; the real defences stay the fencing of article text and the contract checks (decided 2026-10-04 on the OR-50 review).
- Re-score only when at least 1 new linked article exists since the last score; otherwise yesterday's score is carried with no new row.
- Close after 30 days with no new linked article. A closed opportunity is never matched again (a new one is created); it stays readable for history and the shortlist.

## 5. LLM output contract (OR-15, OR-16)

Shape is checked with `docs/opportunities/output.schema.json` (JSON Schema 2020-12); the rules marked "code" are checked in code after the schema. The table below and the schema say the same thing; if they ever differ, the schema wins for shape and this section wins for code rules.

Prompt safety: article headlines and snippets are untrusted data. They go to the LLM inside clear delimiters with an instruction to treat them as data only; any instruction found in them is ignored. Validation (schema + code rules) is the backstop: output that breaks the contract is rejected whatever the input said.

| Field | Type / rule |
|---|---|
| `title` | `{en, id}`, each 1–90 chars |
| `thesis` | `{en, id}`, each 1–400 chars |
| `region` | `indonesia` \| `global` |
| `theme` | one id from §8 (not `other`) |
| `sectors` | 1–3 ids from §7 |
| `horizon` | `0-6m` \| `6-12m` \| `1-3y` |
| `capital` | `{level: low\|medium\|high, reason: {en, id} ≤ 120 chars}` |
| `buyer`, `model` | `{en, id}`, each 1–120 chars |
| `risks` | 2–5 items, each `{en, id}` ≤ 160 chars |
| `firstSteps` | 1–5 items, each `{en, id}` ≤ 160 chars |
| `factors` | `{demand, timing, competition, capital, regulatory}`: each `{score: integer 0–100, reason: {en, id} ≤ 200 chars}` |
| `citations` | article ids; **code:** at least 2 distinct ids, every id must be in the input set |

Code rules:
- Every text field is non-empty in both `en` and `id`.
- An unknown sector, or a theme outside §8 (or `other`), is rejected at opportunity level. In triage (OR-14), an unknown theme is mapped to `other`.
- Response that is not valid JSON: strip exactly one surrounding ```` ```json ```` fence, nothing else; if still invalid, retry once, then mark the item failed.
- Text is rendered as text, never as markup.

`docs/opportunities/contract-examples.json` holds one valid example and 11 invalid examples covering the citation, score, text, sector, theme, length, list-size and horizon rules (not every enum and max-length has its own case) plus three raw-response cases for the fence rule; OR-15/16 tests load them. Checked on 2026-10-04 with a JSON Schema validator: the valid example passes, every invalid one is rejected by the schema or the code rules.

## 6. Two-scorer check (OR-11 AC1)

Scorers are two agent sessions, not two people: Designer = A, Researcher = B. Each scored blind, timestamped, before seeing the other. Themes and articles: `docs/opportunities/samples/themes.json` (copied from the Researcher's branch `research/r-2`).

Round 1 (anchors of §2 without the timing rule). Order: demand, timing, low competition, capital efficiency, low regulatory risk.

| Theme | A (2026-10-04T01:19:43Z) | B (2026-10-04T01:17:30Z) | Differences | Overall A / B |
|---|---|---|---|---|
| a · Climate-resilient farming services, Indonesia | 70, 75, 60, 45, 70 | 70, 75, 50, 50, 55 | 0, 0, 10, 5, 15 | 64 / 60 |
| b · Fuel-cost and supply-chain resilience, Worldwide | 65, 70, 35, 65, 75 | 70, 50, 30, 70, 70 | 5, **20**, 5, 5, 5 | 62 / 58 |
| c · Scam-protection tools, Indonesia | 75, 65, 40, 70, 45 | 80, 65, 35, 65, 50 | 5, 0, 5, 5, 5 | 59 / 59 |

Result: 14 of 15 factor differences ≤ 15; **one miss** (theme b timing: A counted the diesel spike as the trigger, B discounted it because governments were releasing reserves). Fix: the timing rule in §2. Round 1 is not re-scored.

Round 2 (timing rule added; themes in `samples/themes-round2.json`). **Scorer B was not blind**: A's scores reached B in a message before B scored (disclosed by B, `seen_other_scores: true`). Recorded, but not counted as independent evidence.

| Theme | A (2026-10-04T01:24:21Z, blind) | B (2026-10-04T01:25:03Z, not blind) | Differences | Overall A / B |
|---|---|---|---|---|
| d · Tax-compliance tools for online sellers, Indonesia | 75, 85, 45, 70, 65 | 65, 80, 35, 70, 55 | 10, 5, 10, 0, 10 | 68 / 61 |
| e · Peatland fire early warning and restoration, Indonesia | 50, 55, 60, 40, 55 | 55, 55, 45, 35, 50 | 5, 0, 15, 5, 5 | 52 / 48 |
| f · AI-agent permission controls for small businesses, Worldwide | 55, 60, 35, 60, 65 | 50, 55, 25, 70, 60 | 5, 5, 10, 10, 5 | 55 / 52 |

All 15 differences ≤ 15, and both scorers kept timing on the right side of the new rule. B scored competition lower in every theme, which led to the competition rule in §2.

Round 3 (competition rule added; themes in `samples/themes-round3.json`). B scored at 2026-10-04T01:28:02Z and committed at 01:28:11Z (fb777a7 holds the themes and B's scores; dc571a8 fills one empty field; both on `research/r-2`); A read only `themes-round3.json` (from dc571a8; A's score file names that commit) and scored without opening B's file and committed (2026-10-04T01:28:46Z, commit 1a57825 on `or-11-scoring`); only then were B's scores read. Both blind.

| Theme | A | B | Differences | Overall A / B |
|---|---|---|---|---|
| g · Earthquake and flood resilience services, Indonesia | 55, 70, 55, 45, 60 | 50, 55, 40, 50, 45 | 5, 15, 15, 5, 15 | 57 / 48 |
| h · Household energy-saving and rooftop-solar advice, Worldwide | 70, 65, 30, 65, 65 | 70, 65, 25, 55, 50 | 0, 0, 5, 10, 15 | 59 / 53 |
| i · Compliance and fleet tools for ride-hailing drivers, Indonesia | 60, 75, 40, 65, 50 | 50, 60, 30, 70, 45 | 10, 15, 10, 5, 5 | 58 / 51 |

**Result: AC1 met.** All 15 factor differences are ≤ 15. The margin is zero on 5 of them, and B is lower than A overall by 6 to 9 points in every theme. The rubric is consistent enough for v1 to rank opportunities, but a single score should not be read finer than about ±10. Re-check after the first two weeks of real runs.

Score files with timestamps: `docs/opportunities/samples/` (copied from the Researcher's branch `research/r-2`).

## 7. Fixed sector list (18)
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


## 8. Theme vocabulary (36 + other)

Triage (OR-14) picks up to 3 themes per article from this list; trending themes (OR-21) count these ids.

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
