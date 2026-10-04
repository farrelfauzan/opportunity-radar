import { defineConfig } from "drizzle-kit";

// Used by `pnpm db:generate` only (schema -> SQL files in ./drizzle).
// Migrations are applied by scripts/db.ts, which picks the database.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/data/schema.ts",
  out: "./drizzle",
});
