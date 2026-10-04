import { afterAll } from "vitest";
import { testDatabaseUrl } from "../../scripts/db-admin.ts";
import { closeDb } from "@/server/data";

// The data module reads DATABASE_URL: inside tests that is always the test database.
process.env.DATABASE_URL = testDatabaseUrl();

afterAll(closeDb);
