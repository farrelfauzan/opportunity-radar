// Opportunity continuity (OR-50, scoring-v1 §4): deterministic, in code.

export type Identity = { theme: string; region: string; sectors: readonly string[]; citations: readonly number[] };
export type OpenOpportunity = Identity & { id: number };
export type Match = { id: number; reason: string } | null;

/**
 * A new theme matches an open opportunity if and only if (same theme AND same
 * region AND at least one shared sector) OR (at least 2 shared cited articles).
 * Several matches: the one sharing the most citations, then the oldest (lowest id).
 */
export function findMatch(theme: Identity, open: readonly OpenOpportunity[]): Match {
  const cited = new Set(theme.citations);
  const candidates = open
    .map((o) => {
      const sharedCitations = o.citations.filter((id) => cited.has(id)).length;
      const sharedSector = o.sectors.some((s) => theme.sectors.includes(s));
      const sameIdentity = o.theme === theme.theme && o.region === theme.region && sharedSector;
      const reason = sameIdentity
        ? `same theme, region and a shared sector${sharedCitations ? ` (${sharedCitations} shared citations)` : ""}`
        : sharedCitations >= 2
          ? `${sharedCitations} shared citations`
          : null;
      return reason ? { id: o.id, reason, sharedCitations } : null;
    })
    .filter((c) => c !== null);
  candidates.sort((a, b) => b.sharedCitations - a.sharedCitations || a.id - b.id);
  return candidates[0] ? { id: candidates[0].id, reason: candidates[0].reason } : null;
}
