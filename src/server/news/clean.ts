// Feed text is untrusted: these functions turn it into plain text and a safe,
// comparable URL. Nothing here is ever rendered as HTML.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", sbquo: "‚", bdquo: "„",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·",
  laquo: "«", raquo: "»", copy: "©", reg: "®", trade: "™", deg: "°",
  euro: "€", pound: "£", yen: "¥", cent: "¢", times: "×", divide: "÷",
  eacute: "é", egrave: "è", aacute: "á", agrave: "à", uuml: "ü", ouml: "ö", auml: "ä",
  ntilde: "ñ", ccedil: "ç", iacute: "í", oacute: "ó", uacute: "ú",
};

function codePoint(value: number, original: string): string {
  return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
    ? String.fromCodePoint(value)
    : original;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    const hex = body[1] === "x" || body[1] === "X";
    return codePoint(parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10), match);
  });
}

function stripMarkup(text: string): string {
  return text
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ") // the content goes, not only the tags
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?[a-z!][^>]*>/gi, " ");
}

const MAX_PASSES = 20;

/**
 * Plain text from feed text: script/style content removed, tags stripped,
 * entities decoded, whitespace collapsed. Feeds escape HTML once, twice or
 * more ("&amp;lt;p&amp;gt;"), so strip-and-decode repeats until nothing
 * changes, and the result always ends with a strip: a decode can never be the
 * last step that turns escaped markup into live tags.
 */
export function cleanText(input: string): string {
  let text = input;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = decodeEntities(stripMarkup(text));
    if (next === text) break;
    text = next;
  }
  return stripMarkup(text).replace(/\s+/g, " ").trim();
}

const SNIPPET_MAX = 500;

/** At most 500 characters (code points, so no character is split), ending in "…" when cut. */
export function cutSnippet(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= SNIPPET_MAX) return text;
  return `${characters.slice(0, SNIPPET_MAX - 1).join("").trimEnd()}…`;
}

const TRACKING = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;

/**
 * The URL articles are unique by, or null when the link is not http(s).
 * https, lower-case host, no default port, no fragment, tracking parameters
 * removed, remaining parameters sorted, no trailing slash except the root.
 */
export function canonicalUrl(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:"; // also drops :80 / :443, and URL lower-cases the host
  url.hash = "";
  const kept = [...url.searchParams].filter(([name]) => !TRACKING.test(name));
  const order = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0); // code units, not the machine's locale
  kept.sort(([a, av], [b, bv]) => order(a, b) || order(av, bv));
  url.search = new URLSearchParams(kept).toString();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}
