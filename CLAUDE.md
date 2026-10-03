@AGENTS.md

# Opportunity Radar

Personal web app: business-opportunity radar first (Indonesia + worldwide, from news), investments second (risk per asset type, rule-based buy/sell signals, alerts, reports), plus own-venture tracking and calculators. Bilingual EN/ID. Dark purple glass theme.

- Design and open decisions: `docs/DESIGN.md` (status: design approved in conversation on 2026-10-03; the decisions table is still open). Canvas: https://claude.ai/artifact/Q15NYcBsWEAcCPQEsZ5nnX
- Screen markup, copy and exact colours: `docs/design/*.dc.html` (reference only, sample data; not app code).
- Data sources and their limits: `docs/research/R-1-data-sources.md`.
- Team roles and protocol: `.claude/agents/`, `.claude/team/PROTOCOL.md` (start with `.claude/team/start-team.sh`).
- Stack: Next.js App Router + TypeScript + pnpm, shadcn/ui (`src/components/ui`), Recharts via the shadcn `chart` component. No separate backend: third-party fetching only in server code, keys only in server env vars.
- Checks: `pnpm lint` and `pnpm build`.
