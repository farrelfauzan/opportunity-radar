import { NextRequest } from "next/server";
import { expect, test } from "vitest";
import { proxy } from "./proxy";

const run = (url: string, cookie?: string) =>
  proxy(new NextRequest(`http://localhost:3000${url}`, cookie ? { headers: { cookie } } : undefined));

test("/ goes to the picked language, or English", () => {
  const plain = run("/");
  expect(plain.status).toBe(307);
  expect(new URL(plain.headers.get("location")!).pathname).toBe("/en");
  expect(new URL(run("/", "locale=id").headers.get("location")!).pathname).toBe("/id");
  expect(new URL(run("/", "locale=fr").headers.get("location")!).pathname).toBe("/en");
});

test("a locale in the wrong case is redirected to lowercase (308), keeping the query", () => {
  const response = run("/EN/news?q=a%20b&x=1");
  expect(response.status).toBe(308);
  const location = new URL(response.headers.get("location")!);
  expect(location.pathname).toBe("/en/news");
  expect(location.search).toBe("?q=a%20b&x=1");
  expect(new URL(run("/ID").headers.get("location")!).pathname).toBe("/id");
});

test("lowercase locales and other paths pass through untouched", () => {
  for (const url of ["/en", "/id/news", "/FR", "/Fr/news"]) {
    const response = run(url);
    expect(response.status, url).toBe(200);
    expect(response.headers.get("location"), url).toBeNull();
    expect(response.headers.get("x-middleware-next"), url).toBe("1");
  }
});
