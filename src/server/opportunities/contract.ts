// The OR-11 opportunity contract (docs/opportunities/scoring-v1.md §5): first
// the shape of output.schema.json, then the code rules. Written by hand so no
// JSON-Schema library is needed; tests run every case of contract-examples.json.
import { FACTOR_KEYS, SECTORS, THEMES, type FactorScores, type Region, type Sector, type Theme } from "@/server/data";
import { wordingHit } from "@/server/llm/wording";

export type Text = { en: string; id: string };
export type Horizon = "0-6m" | "6-12m" | "1-3y";
export type CapitalLevel = "low" | "medium" | "high";

export type OpportunityOutput = {
  title: Text;
  thesis: Text;
  region: Region;
  theme: Theme;
  sectors: Sector[];
  horizon: Horizon;
  capital: { level: CapitalLevel; reason: Text };
  buyer: Text;
  model: Text;
  risks: Text[];
  firstSteps: Text[];
  factors: Record<keyof FactorScores, { score: number; reason: Text }>;
  citations: string[];
};

class ContractError extends Error {}

const fail = (path: string, problem: string): never => {
  throw new ContractError(`${path}: ${problem}`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function keys(value: unknown, path: string, required: readonly string[]): Record<string, unknown> {
  if (!isObject(value)) return fail(path, "must be an object");
  for (const key of required) if (!(key in value)) fail(path, `missing "${key}"`);
  for (const key of Object.keys(value)) if (!required.includes(key)) fail(path, `unexpected "${key}"`);
  return value;
}

/** `{en, id}`, each a non-blank string of at most `max` characters (code points, as JSON Schema counts). */
function text(value: unknown, path: string, max: number): Text {
  const object = keys(value, path, ["en", "id"]);
  for (const lang of ["en", "id"] as const) {
    const s = object[lang];
    if (typeof s !== "string") fail(`${path}.${lang}`, "must be a string");
    if ((s as string).trim() === "") fail(`${path}.${lang}`, "is empty");
    if (Array.from(s as string).length > max) fail(`${path}.${lang}`, `is longer than ${max} characters`);
    // Describe, never instruct (OR-63); first steps may start with an imperative (OR-65).
    const advice = wordingHit(s as string, "general", { firstStep: path.startsWith("firstSteps") });
    if (advice) fail(`${path}.${lang}`, `has advice wording (rule "${advice.id}"; describe, never instruct)`);
  }
  return { en: object.en as string, id: object.id as string };
}

function list<T>(value: unknown, path: string, min: number, max: number, item: (v: unknown, p: string) => T): T[] {
  if (!Array.isArray(value)) return fail(path, "must be a list");
  if (value.length < min || value.length > max) fail(path, `must have ${min} to ${max} items, has ${value.length}`);
  return value.map((v, i) => item(v, `${path}[${i}]`));
}

function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) fail(path, `must be one of ${allowed.join(", ")}`);
  return value as T;
}

const TOP = ["title", "thesis", "region", "theme", "sectors", "horizon", "capital", "buyer", "model", "risks", "firstSteps", "factors", "citations"] as const;

function check(raw: unknown, inputIds: ReadonlySet<string>): OpportunityOutput {
  const o = keys(raw, "opportunity", TOP);

  const theme = o.theme;
  if (typeof theme !== "string" || !/^[a-z_]+$/.test(theme)) fail("theme", "must be an id");
  if (!THEMES.includes(theme as Theme)) fail("theme", `unknown theme "${theme}"`);
  if (theme === "other") fail("theme", '"other" is not allowed for an opportunity');

  const sectors = list(o.sectors, "sectors", 1, 3, (v, p) => {
    if (typeof v !== "string" || !/^[a-z_]+$/.test(v)) fail(p, "must be an id");
    if (!SECTORS.includes(v as Sector)) fail(p, `unknown sector "${v}"`);
    return v as Sector;
  });
  if (new Set(sectors).size !== sectors.length) fail("sectors", "has duplicates");

  const capital = keys(o.capital, "capital", ["level", "reason"]);
  const factors = keys(o.factors, "factors", FACTOR_KEYS);

  if (!Array.isArray(o.citations)) fail("citations", "must be a list");
  const cited = (o.citations as unknown[]).map((v, i) => {
    if (typeof v !== "string" || v === "") fail(`citations[${i}]`, "must be a non-empty string");
    return v as string;
  });
  if (cited.length < 2) fail("citations", "must have at least 2 items");
  const distinct = [...new Set(cited)];
  if (distinct.length < 2) fail("citations", "must cite at least 2 different articles");
  for (const id of distinct) if (!inputIds.has(id)) fail("citations", `article ${id} was not in the input`);

  return {
    title: text(o.title, "title", 90),
    thesis: text(o.thesis, "thesis", 400),
    region: oneOf(o.region, "region", ["indonesia", "global"] as const),
    theme: theme as Theme,
    sectors,
    horizon: oneOf(o.horizon, "horizon", ["0-6m", "6-12m", "1-3y"] as const),
    capital: { level: oneOf(capital.level, "capital.level", ["low", "medium", "high"] as const), reason: text(capital.reason, "capital.reason", 120) },
    buyer: text(o.buyer, "buyer", 120),
    model: text(o.model, "model", 120),
    risks: list(o.risks, "risks", 2, 5, (v, p) => text(v, p, 160)),
    firstSteps: list(o.firstSteps, "firstSteps", 1, 5, (v, p) => text(v, p, 160)),
    factors: Object.fromEntries(
      FACTOR_KEYS.map((key) => {
        const factor = keys(factors[key], `factors.${key}`, ["score", "reason"]);
        const score = factor.score;
        if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
          fail(`factors.${key}.score`, "must be an integer 0-100");
        }
        return [key, { score: score as number, reason: text(factor.reason, `factors.${key}.reason`, 200) }];
      }),
    ) as OpportunityOutput["factors"],
    citations: distinct,
  };
}

/** The checked opportunity, or the reason it breaks the contract. */
export function checkOpportunity(
  raw: unknown,
  inputIds: ReadonlySet<string>,
): { ok: true; value: OpportunityOutput } | { ok: false; reason: string } {
  try {
    return { ok: true, value: check(raw, inputIds) };
  } catch (error) {
    if (error instanceof ContractError) return { ok: false, reason: error.message };
    throw error;
  }
}
