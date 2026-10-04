import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

// Builds a temporary copy of the app with one extra page: a Client Component
// that imports the data module. The copy sits inside the repo so it resolves
// the same node_modules.
test("a client component importing the data module fails the build", { timeout: 180_000 }, () => {
  const copy = mkdtempSync(join(root, ".tmp-client-import-"));
  try {
    for (const entry of ["src", "next.config.ts", "tsconfig.json", "package.json", "postcss.config.mjs"]) {
      cpSync(join(root, entry), join(copy, entry), { recursive: true });
    }
    mkdirSync(join(copy, "src/app/client-probe"));
    writeFileSync(
      join(copy, "src/app/client-probe/page.tsx"),
      `"use client";
import { listArticles } from "@/server/data";
export default function Page() {
  return <p>{String(listArticles)}</p>;
}
`,
    );

    const build = spawnSync("pnpm", ["exec", "next", "build"], { cwd: copy, encoding: "utf8" });
    const output = build.stdout + build.stderr;

    expect(build.status).not.toBe(0);
    // It fails for the right reason: the server-only marker in the data module.
    expect(output).toContain("server-only");
    expect(output).toContain("src/server/data/index.ts");
    expect(output).toContain("client-probe/page.tsx");
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

// The LLM key is read from server env at run time; the build must not contain
// it, and no browser bundle may contain the LLM client.
test("the build output contains neither the LLM key nor the LLM client", { timeout: 180_000 }, () => {
  const canary = "sk-canary-0d1e2f3a4b5c";
  const copy = mkdtempSync(join(root, ".tmp-llm-bundle-"));
  try {
    // tests/fixtures.ts too: unit tests under src/ import it, and the build type-checks them.
    for (const entry of ["src", "next.config.ts", "tsconfig.json", "package.json", "postcss.config.mjs", "tests/fixtures.ts"]) {
      cpSync(join(root, entry), join(copy, entry), { recursive: true });
    }
    const build = spawnSync("pnpm", ["exec", "next", "build"], {
      cwd: copy,
      encoding: "utf8",
      env: { ...process.env, LLM_PROVIDER: "live", LLM_API_KEY: canary },
    });
    expect(build.status, build.stdout + build.stderr).toBe(0);
    expect(build.stdout + build.stderr).not.toContain(canary);

    const grep = (pattern: string, dir: string) =>
      spawnSync("grep", ["-rl", "--", pattern, dir], { encoding: "utf8" }).stdout.trim();
    // Turbopack's build cache (.next/cache) records env values seen at build time: it is
    // local and never served, so it is left out here; see the OR-13 Log. Everything that
    // is served or run (.next/server, .next/static, the manifests) must not contain the key.
    const outputs = spawnSync("grep", ["-rl", "--exclude-dir=cache", "--", canary, join(copy, ".next")], {
      encoding: "utf8",
    }).stdout.trim();
    expect(outputs).toBe("");
    // Strings only the client contains, searched in what the browser downloads.
    expect(grep("chat/completions", join(copy, ".next/static"))).toBe("");
    expect(grep("budget_exhausted", join(copy, ".next/static"))).toBe("");
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});
