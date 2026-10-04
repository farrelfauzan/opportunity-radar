// Database administration shared by scripts/db.ts and the integration tests:
// which database to use, creating it, migrating it and wiping the test one.
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as runMigrations } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseUrl } from "../src/server/data/client.ts";

const root = new URL("../", import.meta.url);
const envFile = new URL(".env.local", root);

/** Loads .env.local when it exists. Variables already set in the environment win. */
export function loadEnv(): void {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

const target = (url: string) => {
  const { hostname, port, pathname } = new URL(url);
  return `${hostname}:${port || 5432}${pathname}`;
};

const requireTestName = (url: string) => {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("Refusing to run: TEST_DATABASE_URL must point at this machine (127.0.0.1 or localhost).");
  }
  if (!new URL(url).pathname.endsWith("_test")) {
    throw new Error('Refusing to run: the test database name must end in "_test".');
  }
};

/**
 * The test database URL. Refuses anything that could be development data:
 * a database on this machine, whose name ends in "_test" and differs from DATABASE_URL.
 */
export function testDatabaseUrl(): string {
  const url = databaseUrl("TEST_DATABASE_URL");
  requireTestName(url);
  if (process.env.DATABASE_URL && target(process.env.DATABASE_URL) === target(url)) {
    throw new Error("Refusing to run: TEST_DATABASE_URL points at the development database.");
  }
  return url;
}

const connect = (url: string) => postgres(url, { max: 1, onnotice: () => {} });

/** Creates the database when it does not exist yet. */
async function ensureDatabase(url: string): Promise<void> {
  const name = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = connect(admin.href);
  try {
    const found = await sql`select 1 from pg_database where datname = ${name}`;
    if (found.length === 0) {
      // 42P04: another session created it between the check and the create.
      await sql`create database ${sql(name)}`.catch((error) => {
        if (error.code !== "42P04") throw error;
      });
    }
  } finally {
    await sql.end();
  }
}

/** Applies pending migrations. Running it again changes nothing. */
export async function migrate(url: string): Promise<void> {
  await ensureDatabase(url);
  const sql = connect(url);
  try {
    await runMigrations(drizzle(sql), { migrationsFolder: new URL("drizzle", root).pathname });
  } finally {
    await sql.end();
  }
}

/** Empties a TEST database (the test one by default, or the e2e one) and migrates it again. */
export async function resetTestDatabase(url = testDatabaseUrl()): Promise<void> {
  requireTestName(url);
  await ensureDatabase(url);
  const sql = connect(url);
  try {
    await sql`drop schema if exists public cascade`;
    await sql`drop schema if exists drizzle cascade`;
    await sql`create schema public`;
  } finally {
    await sql.end();
  }
  await migrate(url);
}

/**
 * Drops a TEST database (name ends in "_test", on this machine) with any connections still open to it, so a
 * browser-test run leaves nothing on the shared Postgres server. Nothing happens when it does not exist.
 */
export async function dropTestDatabase(url: string): Promise<void> {
  requireTestName(url);
  const name = new URL(url).pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = connect(admin.href);
  try {
    await sql`drop database if exists ${sql(name)} with (force)`;
  } finally {
    await sql.end();
  }
}

/**
 * Holds a server-wide lock until the returned function is called, so two test
 * runs on this machine (several sessions share one Postgres) wait for each other.
 */
export async function lockTestDatabase(): Promise<() => Promise<void>> {
  const url = testDatabaseUrl();
  await ensureDatabase(url);
  const sql = connect(url);
  await sql`select pg_advisory_lock(hashtext('opportunity-radar:test-run'))`;
  return () => sql.end();
}
