// Lets plain Node run the app's server TypeScript outside Next.js (pnpm job):
// resolves the "@/" alias to src/ and imports written without an extension.
import { registerHooks } from "node:module";

const src = new URL("../src/", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const target = specifier.startsWith("@/") ? src + specifier.slice(2) : specifier;
    try {
      return nextResolve(target, context);
    } catch (error) {
      for (const suffix of [".ts", "/index.ts"]) {
        try {
          return nextResolve(target + suffix, context);
        } catch {}
      }
      throw error;
    }
  },
});
