// Which news a venture's keywords match (OR-38). Whole words only, case-insensitive,
// in any script: "PPE" matches "PPE rules" but not "shopper"; "K3" not "K3X".
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function keywordMatcher(keywords: readonly string[]): (text: string) => boolean {
  if (keywords.length === 0) return () => false;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${keywords.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "iu");
  return (text) => pattern.test(text);
}
