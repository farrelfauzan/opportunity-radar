import { lockTestDatabase, resetTestDatabase } from "../../scripts/db-admin.ts";

// Runs once before the integration tests: waits for any other test run on this
// machine, then empties and migrates the TEST database. Development data is
// never touched: testDatabaseUrl() refuses any database not named *_test.
export default async function setup() {
  let unlock: () => Promise<void>;
  try {
    unlock = await lockTestDatabase();
  } catch (error) {
    if ((error as { code?: string }).code === "ECONNREFUSED") {
      throw new Error('Cannot reach the test database. Is Docker running? Start it with "pnpm db:up".');
    }
    throw error;
  }
  await resetTestDatabase();
  return unlock;
}
