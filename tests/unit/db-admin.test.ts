import { describe, expect, test } from "vitest";
import { dropTestDatabase } from "../../scripts/db-admin.ts";

// The guards run before any connection is made, so these need no database.
describe("dropTestDatabase refuses what could be real data", () => {
  test("a name that does not end in _test (the development database)", async () => {
    await expect(dropTestDatabase("postgres://postgres@127.0.0.1:54329/opportunity_radar")).rejects.toThrow(/_test/);
  });

  test("a database that is not on this machine", async () => {
    await expect(dropTestDatabase("postgres://postgres@db.example.com:5432/opportunity_radar_e2e_3210_test")).rejects.toThrow(/this machine/);
  });
});
