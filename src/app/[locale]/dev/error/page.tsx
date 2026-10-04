import { notFound } from "next/navigation";
import { connection } from "next/server";

// Test-only: throws so the error boundary can be checked. In a production
// build it is a 404 unless the server runs with ENABLE_TEST_ROUTES=1.
export default async function ThrowingPage() {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_TEST_ROUTES !== "1") {
    notFound();
  }
  throw new Error("Test error route");
}
