type Env = { NODE_ENV?: string; ENABLE_TEST_ROUTES?: string };

/**
 * Test-only routes (such as /[locale]/dev/error) exist in development, and in
 * a production build only when the server runs with ENABLE_TEST_ROUTES=1.
 */
export function testRoutesEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" || env.ENABLE_TEST_ROUTES === "1";
}
