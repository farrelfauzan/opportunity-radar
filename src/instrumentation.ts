// Runs once when the Next.js server starts, before it serves a request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node.ts");
}
