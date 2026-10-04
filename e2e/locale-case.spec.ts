import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "./fixtures";

// OR-55: on a case-insensitive file system (macOS) a request for /EN used to overwrite the
// cached /en page, so /en answered 404 after the next restart. Passes trivially where the
// file system tells EN from en; the redirect itself is checked on any system.

test("a wrong-case locale redirects to lowercase and keeps the query", async ({ request }) => {
  for (const [from, path] of [
    ["/EN", "/en"],
    ["/ID/news?q=a%20b&x=1", "/id/news"],
    ["/En/invest/gold", "/en/invest/gold"],
    ["/%45N", "/en"], // percent-encoded letters: "%45" is "E"
    ["/%45n/news", "/en/news"],
  ]) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(308);
    const location = new URL(response.headers().location, "http://localhost");
    expect(location.pathname, from).toBe(path);
    // The server may write a space as "+": the same query, compared by meaning.
    expect(Object.fromEntries(location.searchParams), from).toEqual(from.includes("?") ? { q: "a b", x: "1" } : {});
  }
});

test("/en and /id still answer 200 after a restart that followed /EN and /ID requests", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1280", "one run is enough: the server restarts twice");
  const port = Number(process.env.E2E_PORT ?? 3210) + 3; // the web server uses E2E_PORT
  const start = async (): Promise<ChildProcess> => {
    const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
      stdio: "ignore",
    });
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(`http://localhost:${port}/en`, { redirect: "manual" });
        return server;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    server.kill();
    throw new Error(`The test server did not start on port ${port}`);
  };
  const stop = async (server: ChildProcess) => {
    const closed = new Promise((resolve) => server.once("close", resolve));
    server.kill();
    await closed;
  };
  const status = async (path: string) => (await fetch(`http://localhost:${port}${path}`, { redirect: "manual" })).status;

  const first = await start();
  try {
    expect(await status("/EN")).toBe(308);
    expect(await status("/ID")).toBe(308);
    expect(await status("/EN/news")).toBe(308);
    expect(await status("/%45N")).toBe(308);
    expect(await status("/%45n/news")).toBe(308);
    expect(await status("/en")).toBe(200);
  } finally {
    await stop(first);
  }

  const second = await start();
  try {
    for (const path of ["/en", "/id", "/en/news", "/id/calculators"]) {
      expect(await status(path), `${path} after the restart`).toBe(200);
    }
  } finally {
    await stop(second);
  }
});
