// Imported by instrumentation.ts on the Node.js runtime only (process.exit does
// not exist on the Edge runtime). Missing or wrong connection details stop the
// server with a clear message instead of letting it serve 500s.
import { checkConnection } from "./server/data/index.ts";

try {
  await checkConnection();
} catch (error) {
  console.error(`Opportunity Radar cannot start: ${(error as Error).message}`);
  process.exit(1);
}
