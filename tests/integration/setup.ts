import { afterAll } from "vitest";
import { testDatabaseUrl } from "../../scripts/db-admin.ts";
import { closeDb } from "@/server/data";

// Tests never call the public Frankfurter API unless a test sets PRICES_FRANKFURTER itself.
process.env.PRICES_FRANKFURTER ??= "fixtures";
// Nor Binance or Indodax (live by default), unless a test sets PRICES_CRYPTO itself.
process.env.PRICES_CRYPTO ??= "fixtures";

// The data module reads DATABASE_URL: inside tests that is always the test database.
process.env.DATABASE_URL = testDatabaseUrl();

afterAll(closeDb);
