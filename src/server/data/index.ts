// The only door to the store. Pages, route handlers and jobs import from
// "@/server/data"; nothing else touches the database client. Importing this
// from a Client Component fails the build (tests/integration/client-import.test.ts).
import "server-only";

export { checkConnection, closeDb } from "./client.ts";
export {
  REGIONS,
  CATEGORIES,
  JOB_STATUSES,
  SECTORS,
  HORIZONS,
  CAPITAL_LEVELS,
  OPPORTUNITY_STATUSES,
  THEMES,
  IMPACTS,
  ASSET_KINDS,
  PRICE_SOURCES,
  SIGNAL_TERMS,
  VERDICTS,
  SIGNAL_STATES,
  FACTOR_KEYS,
} from "./schema.ts";
export type {
  Region,
  Category,
  JobStatus,
  Sector,
  Horizon,
  CapitalLevel,
  OpportunityStatus,
  FactorScores,
  LlmRole,
  LlmCallStatus,
  Theme,
  Impact,
  BriefLine,
  AssetKind,
  PriceSource,
  SignalTerm,
  SignalVerdict,
  SignalState,
} from "./schema.ts";
export * from "./articles.ts";
export * from "./sources.ts";
export * from "./job-runs.ts";
export * from "./opportunities.ts";
export { addDays, computeTrend, daysBetween, TREND_DAYS } from "./trend.ts";
export type { Trend } from "./trend.ts";
export * from "./ventures.ts";
export * from "./llm-usage.ts";
export * from "./triage.ts";
export * from "./briefs.ts";
export * from "./radar.ts";
export * from "./news.ts";
export * from "./prices.ts";
export * from "./signals.ts";
export * from "./market.ts";
export * from "./signal-reports.ts";
