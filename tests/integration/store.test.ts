import { execFileSync } from "node:child_process";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { finishJobRun, listSources, recordSuccessfulRun, startJobRun, upsertSource } from "@/server/data";
import { databaseUrl, db } from "@/server/data/client";
import { dropTestDatabase, migrate, testDatabaseUrl } from "../../scripts/db-admin.ts";

beforeEach(async () => {
  await db().execute(sql`truncate articles, sources, job_runs restart identity cascade`);
});

describe("job runs", () => {
  test("a run is recorded when it starts, so a crash still leaves a record", async () => {
    const started = await startJobRun("ingest-news");
    expect(started).toMatchObject({ job: "ingest-news", status: "running", finishedAt: null });

    const rows = await db().execute(sql`select status from job_runs where id = ${started.id}`);
    expect(rows[0].status).toBe("running");
  });

  test("finishing a run stores status, counts, error and the finish time", async () => {
    const started = await startJobRun("ingest-news");
    const finished = await finishJobRun(started.id, {
      status: "partial",
      counts: { stored: 12, skipped: 3 },
      error: "1 of 12 sources failed",
    });

    expect(finished).toMatchObject({
      status: "partial",
      counts: { stored: 12, skipped: 3 },
      error: "1 of 12 sources failed",
    });
    expect(finished.finishedAt!.getTime()).toBeGreaterThanOrEqual(started.startedAt.getTime());
  });

  test("finishing an unknown run is an error", async () => {
    await expect(finishJobRun(999, { status: "ok" })).rejects.toThrow("No job run");
  });

  test("a successful run can be recorded at a chosen time", async () => {
    const at = new Date("2026-10-03T00:00:00Z");
    expect(await recordSuccessfulRun("ingest-news", at)).toMatchObject({ status: "ok", finishedAt: at });
  });
});

describe("sources", () => {
  const source = {
    slug: "antara",
    name: "Antara",
    feedUrl: "https://example.com/antara.xml",
    region: "indonesia",
    category: "business",
  } as const;

  test("upsert creates once and updates by slug", async () => {
    const first = await upsertSource(source);
    const second = await upsertSource({ ...source, name: "ANTARA News" });

    expect(second.id).toBe(first.id);
    expect((await listSources()).map((s) => s.name)).toEqual(["ANTARA News"]);
  });
});

describe("migrations", () => {
  test("running them again changes nothing and keeps the data", async () => {
    await startJobRun("noop");
    const applied = () => db().execute(sql`select count(*) as n from drizzle.__drizzle_migrations`);
    const before = Number((await applied())[0].n);

    await migrate(databaseUrl()); // the test database (tests/integration/setup.ts)

    expect(Number((await applied())[0].n)).toBe(before);
    expect(await db().execute(sql`select job from job_runs`)).toHaveLength(1);
  });
});

describe("connection details", () => {
  const withEnv = (env: Record<string, string | undefined>, run: () => void) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
    try {
      run();
    } finally {
      process.env = saved;
    }
  };

  test("a missing URL gives a clear error", () => {
    withEnv({ DATABASE_URL: undefined }, () => {
      expect(() => databaseUrl()).toThrow(/DATABASE_URL is not set.*pnpm db:setup/);
    });
  });

  test("an invalid URL is reported without echoing its value", () => {
    withEnv({ DATABASE_URL: "mysql://user:hunter2@host/db" }, () => {
      expect(() => databaseUrl()).toThrow("not a valid postgres:// URL");
      expect(() => databaseUrl()).not.toThrow(/hunter2/);
    });
  });

  test("the test database must be on this machine", () => {
    withEnv({ TEST_DATABASE_URL: "postgres://postgres@db.example.com:5432/opportunity_radar_test" }, () => {
      expect(() => testDatabaseUrl()).toThrow("must point at this machine");
    });
  });

  test("the test database must be named *_test and differ from development", () => {
    withEnv({ TEST_DATABASE_URL: "postgres://postgres@127.0.0.1:54329/opportunity_radar" }, () => {
      expect(() => testDatabaseUrl()).toThrow('must end in "_test"');
    });
    withEnv(
      {
        DATABASE_URL: "postgres://postgres@127.0.0.1:54329/x_test",
        TEST_DATABASE_URL: "postgres://postgres@127.0.0.1:54329/x_test",
      },
      () => expect(() => testDatabaseUrl()).toThrow("points at the development database"),
    );
  });
});

describe("repository", () => {
  const ignored = (file: string) => {
    try {
      execFileSync("git", ["check-ignore", "-q", file]);
      return true;
    } catch {
      return false;
    }
  };

  test(".env files are git-ignored, .env.example is not", () => {
    expect(ignored(".env")).toBe(true);
    expect(ignored(".env.local")).toBe(true);
    expect(ignored(".env.example")).toBe(false);
  });
});

describe("dropTestDatabase", () => {
  test("drops a test database and does nothing when it is already gone", async () => {
    // (testDatabaseUrl() refuses here: the integration setup points DATABASE_URL at the test database.)
    const url = new URL(databaseUrl("TEST_DATABASE_URL"));
    url.pathname = "/opportunity_radar_e2e_drop_probe_test";
    const exists = async () => {
      const admin = new URL(url.href);
      admin.pathname = "/postgres";
      const probe = (await import("postgres")).default(admin.href, { max: 1 });
      try {
        return (await probe`select 1 from pg_database where datname = 'opportunity_radar_e2e_drop_probe_test'`).length === 1;
      } finally {
        await probe.end();
      }
    };
    await migrate(url.href); // creates it
    expect(await exists()).toBe(true);
    await dropTestDatabase(url.href);
    expect(await exists()).toBe(false);
    await dropTestDatabase(url.href); // already gone: no error
  });
});
