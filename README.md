# Opportunity Radar

## Run it locally

**Docker Desktop must be running** for development, QA and the browser tests: the app stores its
data in a local Postgres started with docker compose.

One line, from a clean checkout:

```bash
pnpm install && pnpm db:setup && pnpm dev
```

`pnpm db:setup` starts Postgres on port **54329** (loopback only, data in the named volume
`opportunity-radar_or_pgdata`), writes `.env.local` with the local connection settings if the file
does not exist, creates and migrates the development and test databases, and seeds the
development database with sample news. It is safe to run again.

## Database

| Command | What it does |
|---|---|
| `pnpm db:setup` | Everything above, in one step |
| `pnpm db:up` / `pnpm db:down` | Start / stop Postgres (stopping keeps the data; use it to see the app's error states) |
| `pnpm db:migrate` | Apply pending migrations. Running it twice changes nothing |
| `pnpm db:seed` | Add the sample sources and 66 articles, with times relative to now |
| `pnpm db:set-last-run <job> <minutes ago \| ISO time>` | Record a successful run of a job at that time (stale-data states) |
| `pnpm db:reset` | Empty the **test** database and migrate it. Refuses any database whose name does not end in `_test` |
| `pnpm db:generate` | After changing `src/server/data/schema.ts`: write the next migration into `drizzle/` |

`migrate`, `seed` and `set-last-run` work on the development database; add `--test` for the test
database, for example `pnpm db:seed --test`. `pnpm db:reset` always works on the test database.

There are two databases on the one server, chosen by env vars in `.env.local` (names in
`.env.example`): `DATABASE_URL` (development) and `TEST_DATABASE_URL` (used by `pnpm test` and by
QA). Tests never touch development data. To run the app on the test database:
`DATABASE_URL="$TEST_DATABASE_URL" pnpm dev` after `set -a; source .env.local; set +a`.

Every worktree on this machine shares the same Postgres container and volume. The local database
has no password: its port is published on 127.0.0.1 only.

## Jobs

Jobs (news ingestion, the morning pipeline, later prices and signals) start from the command line
only; there is no HTTP entry point.

```bash
pnpm job <name> [arguments] [--timeout <seconds>] [--test]
```

- `pnpm job nope` (any unknown name) lists the valid jobs.
- Every run is recorded in `job_runs` when it starts and updated when it ends. Exit code 0 for
  `ok`, `partial` and `skipped`; non-zero for `failed`.
- A job that is already running is not started twice: the second start is recorded as `skipped`.
- `pnpm job morning` runs triage → opportunities → scores → brief and stops at the first failing
  step; later steps are recorded as `skipped`.
- `--test` runs against the test database; `--timeout` overrides the job's own time limit.
- For testing only (not available with `NODE_ENV=production`): `pnpm job noop`,
  `pnpm job sleep <seconds>`, `pnpm job fail [message]`, and `STUB_FAIL=<step> pnpm job morning`
  to make one pipeline step fail.

The data model is described in [docs/data-model.md](docs/data-model.md); tests in
[docs/testing.md](docs/testing.md).

## Next.js

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
