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
