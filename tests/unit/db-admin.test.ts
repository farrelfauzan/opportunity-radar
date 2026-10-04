import { describe, expect, test, vi } from "vitest";
import { dropTestDatabase } from "../../scripts/db-admin.ts";

// The guards run before any connection is made, so these need no database.
describe("dropTestDatabase refuses what could be real data", () => {
  test("a name that does not end in _test (the development database)", async () => {
    await expect(dropTestDatabase("postgres://postgres@127.0.0.1:54329/opportunity_radar")).rejects.toThrow(/_test/);
  });

  test("a _test database that a browser run does not own, including the shared test database", async () => {
    await expect(dropTestDatabase("postgres://postgres@127.0.0.1:54329/opportunity_radar_test")).rejects.toThrow(/only databases named opportunity_radar_e2e_/);
    await expect(dropTestDatabase("postgres://postgres@127.0.0.1:54329/opportunity_radar_eng8_test")).rejects.toThrow(/only databases named/);
  });

  test("the database named in DATABASE_URL or TEST_DATABASE_URL, even with the e2e prefix", async () => {
    for (const variable of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
      vi.stubEnv(variable, "postgres://postgres@127.0.0.1:54329/opportunity_radar_e2e_3210_test");
      await expect(dropTestDatabase("postgres://postgres@127.0.0.1:54329/opportunity_radar_e2e_3210_test")).rejects.toThrow(new RegExp(`database of ${variable}`));
      vi.unstubAllEnvs();
    }
  });

  test("a database that is not on this machine", async () => {
    await expect(dropTestDatabase("postgres://postgres@db.example.com:5432/opportunity_radar_e2e_3210_test")).rejects.toThrow(/this machine/);
  });
});
