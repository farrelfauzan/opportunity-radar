import { test as base, expect } from "@playwright/test";

/**
 * Every e2e test imports `test` from here. It fails a test when the page logs
 * a console error, throws an uncaught error, or a request to the app's own
 * origin fails or answers 4xx/5xx.
 */
export const test = base.extend<{ pageProblems: string[] }>({
  pageProblems: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = [];
      const own = (url: string) => url.startsWith(baseURL!);

      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`uncaught error: ${error.message}`));
      page.on("requestfailed", (request) => {
        if (own(request.url())) {
          problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`);
        }
      });
      page.on("response", (response) => {
        if (own(response.url()) && response.status() >= 400) {
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
