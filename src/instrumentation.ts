// Runs once when the Next.js server starts, before it serves a request.
// Missing or wrong connection details stop the server with a clear message
// instead of letting it start half-working.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkConnection } = await import("./server/data/index.ts");
  await checkConnection();
}
