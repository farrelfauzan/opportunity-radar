type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const leaves = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string") leaves.set(prefix + key, value);
    else for (const [k, v] of flatten(value, `${prefix}${key}.`)) leaves.set(k, v);
  }
  return leaves;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

/**
 * Compares the English and Indonesian dictionaries. Returns one message per
 * problem, each naming the key; an empty list means the two are in step.
 */
export function findParityProblems(en: Tree, id: Tree): string[] {
  const enLeaves = flatten(en);
  const idLeaves = flatten(id);
  const problems: string[] = [];

  for (const [key, enText] of enLeaves) {
    const idText = idLeaves.get(key);
    if (idText === undefined) {
      problems.push(`missing in id: ${key}`);
    } else if (placeholders(enText).join() !== placeholders(idText).join()) {
      problems.push(`placeholder mismatch: ${key}`);
    }
  }
  for (const key of idLeaves.keys()) {
    if (!enLeaves.has(key)) problems.push(`missing in en: ${key}`);
  }
  return problems;
}
