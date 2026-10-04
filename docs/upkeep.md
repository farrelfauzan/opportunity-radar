# Upkeep: things to do on a schedule

Short list for the owner (single user). Each item names where the thing lives. Started 2026-10-04; add items here, not in tickets.

| When | Task | Where | If it is missed |
|---|---|---|---|
| Every September (IDX publishes next year's calendar) | Add next year's IDX Idul Fitri closure: last close before it and first close after it | Closure table used by the signal engine (OR-29); rule in `docs/signals/rules-v1.md` §4; dates so far in R-6 (`docs/research/R-1-data-sources.md` addendum) | IDX stocks fall back to the 7-day limit and show no signal for a few days after Lebaran (safe, but noisy) |
| Every January, once the list exists | Update the exchange holiday list (IDX, NYSE) | Config named in `docs/design/copy.md` §2.3 | Until it exists, holidays show as stale data (accepted for v1) |
| Yearly, and whenever a feed or price source is added | Re-read the publisher terms of every news feed and price source; check the credit lines still match | Feed list `src/server/news/feeds.ts`; terms in R-1 addenda R-2 and R-4; credit lines `docs/design/copy.md` §3.1; D9 (Yahoo, gold-api.com) in `docs/DESIGN.md` | A source may forbid storing or AI use; drop or switch it |
| Yearly, and at once if it may have leaked | Rotate the 9router API key | Server env var only (never in code); D1 in `docs/DESIGN.md` | Usage on a leaked key is billed to the owner |
| Yearly | Check the database size (price history grows by one row per asset per day, news daily) | Local Postgres (`pnpm db:up`) | Disk fills slowly; nothing breaks suddenly |
