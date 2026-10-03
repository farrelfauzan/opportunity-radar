import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    alias: {
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
});
