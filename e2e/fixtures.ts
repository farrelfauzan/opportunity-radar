import { test as base, expect } from "@playwright/test";

/**
 * Every e2e test imports `test` from here. It fails a test when the page logs
 * a console error, throws an uncaught error, or a request to the app's own
 * origin fails or answers 4xx/5xx.
 */
export const test = base.extend<{ pageProblems: string[]; allowErrorResponses: boolean }>({
  // Set with test.use({ allowErrorResponses: true }) in tests that open a 404
  // or error page on purpose: HTTP error statuses are then not a problem.
  allowErrorResponses: [false, { option: true }],
  pageProblems: [
    async ({ page, baseURL, allowErrorResponses }, use) => {
      const problems: string[] = [];
      const own = (url: string) => new URL(url).origin === new URL(baseURL!).origin;

      page.on("console", (message) => {
        if (message.type() !== "error") return;
        if (allowErrorResponses && message.text().startsWith("Failed to load resource")) return;
        problems.push(`console.error: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`uncaught error: ${error.message}`));
      page.on("requestfailed", (request) => {
        // A request cancelled by a navigation (a prefetch, for example) is not a failure.
        if (own(request.url()) && request.failure()?.errorText !== "net::ERR_ABORTED") {
          problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`);
        }
      });
      page.on("response", (response) => {
        if (!allowErrorResponses && own(response.url()) && response.status() >= 400) {
          problems.push(`HTTP ${response.status()}: ${response.url()}`);
        }
      });

      await use(problems);

      expect(problems, "console errors, uncaught errors or failed own-origin requests").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
