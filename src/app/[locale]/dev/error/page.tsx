import { notFound } from "next/navigation";
import { connection } from "next/server";
import { testRoutesEnabled } from "@/lib/test-routes";

// Test-only: throws so the error boundary can be checked. In a production
// build it is a 404 unless the server runs with ENABLE_TEST_ROUTES=1.
export default async function ThrowingPage() {
  await connection();
  if (!testRoutesEnabled()) notFound();
  throw new Error("Test error route");
}
