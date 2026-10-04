import { expect, test } from "vitest";
import { testRoutesEnabled } from "./test-routes";

test("test-only routes are off in a production build unless explicitly enabled", () => {
  expect(testRoutesEnabled({ NODE_ENV: "production" })).toBe(false);
  expect(testRoutesEnabled({ NODE_ENV: "production", ENABLE_TEST_ROUTES: "0" })).toBe(false);
  expect(testRoutesEnabled({ NODE_ENV: "production", ENABLE_TEST_ROUTES: "1" })).toBe(true);
  expect(testRoutesEnabled({ NODE_ENV: "development" })).toBe(true);
});
