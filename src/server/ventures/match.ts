// Which news a venture's keywords match (OR-38). Whole words only, case-insensitive,
// in any script: "PPE" matches "PPE rules" but not "shopper"; "K3" not "K3X".
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function keywordMatcher(keywords: readonly string[]): (text: string) => boolean {
  const usable = keywords.map((k) => k.trim()).filter(Boolean); // a blank keyword would match any gap
  if (usable.length === 0) return () => false;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${usable.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "iu");
  return (text) => pattern.test(text);
}
