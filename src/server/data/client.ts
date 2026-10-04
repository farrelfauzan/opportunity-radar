import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

/**
 * Reads a postgres:// URL from the environment. The error names the variable
 * and never echoes its value.
 */
export function databaseUrl(name = "DATABASE_URL"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Run "pnpm db:setup", or add it to .env.local (names are in .env.example).`,
    );
  }
  let protocol = "";
  try {
    protocol = new URL(value).protocol;
  } catch {}
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new Error(`${name} is not a valid postgres:// URL. Check .env.local.`);
  }
  return value;
}

function connect() {
  const sql = postgres(databaseUrl(), { onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }) };
}

// Kept on globalThis so `next dev` hot reloads reuse one connection pool.
const holder = globalThis as { __orData?: ReturnType<typeof connect> };

export function db() {
  return (holder.__orData ??= connect()).db;
}

/** Fails with a clear, secret-free message when the database cannot be reached. */
export async function checkConnection(): Promise<void> {
  const url = new URL(databaseUrl());
  try {
    await db().execute("select 1");
  } catch (error) {
    // Only the error code is reported: driver messages can contain connection details.
    const { code, cause } = error as { code?: string; cause?: { code?: string } };
    const reason = cause?.code ?? code ?? "unknown error";
    throw new Error(
      `Cannot reach the database at ${url.hostname}:${url.port || 5432}${url.pathname} (${reason}). ` +
        `Is Docker running? Start the database with "pnpm db:up".`,
    );
  }
}

export async function closeDb(): Promise<void> {
  await holder.__orData?.sql.end();
  holder.__orData = undefined;
}
