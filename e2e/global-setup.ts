import { resetFixtures } from "./db";

// The server was started by the webServer command, which created and migrated
// this run's database. Store the fixtures now so their times are relative to the
// start of the tests, not to the start of the build.
export default function globalSetup() {
  resetFixtures();
}
