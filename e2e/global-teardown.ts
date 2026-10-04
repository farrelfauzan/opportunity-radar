import { execFileSync } from "node:child_process";

// The run's own database (opportunity_radar_e2e_<port>_test) is dropped when the tests end, so runs leave
// nothing on the shared Postgres server (its disk is shared by every session). The next run creates it again.
export default function globalTeardown() {
  try {
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/e2e-db.ts", "drop"],
      { stdio: "inherit" },
    );
  } catch {
    // A failed clean-up must not turn a green run red; the next run empties the database anyway.
  }
}
