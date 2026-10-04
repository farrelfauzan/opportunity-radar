import type { NewSource } from "@/server/data";

/** A feed and its defaults. `category` is refined per article by AI triage (OR-14). */
export type Feed = NewSource & {
  /** Terms that apply wherever one of its items is shown (R-1 Addendum). Not stored. */
  licence?: string;
};

/** The fields of a feed that are stored in `sources`. */
export const sourceOf = ({ slug, name, feedUrl, region, category, active }: Feed): NewSource => ({
  slug,
  name,
  feedUrl,
  region,
  category,
  active,
});

// Feed list after the terms review in docs/research/R-1-data-sources.md (Addendum).
// A feed with `active: false` is kept in the list but never fetched, and its source is switched off.
// Hacker News was dropped earlier: it answers 419 to our fetcher (OR-8 Log).
const CREDIT_AND_LINK = "Show the publisher's credit and a link to the original wherever an item is shown.";

export const FEEDS: Feed[] = [
  { slug: "cnbc-indonesia", name: "CNBC Indonesia", feedUrl: "https://www.cnbcindonesia.com/news/rss", region: "indonesia", category: "business" },
  { slug: "antara", name: "Antara", feedUrl: "https://www.antaranews.com/rss/ekonomi-bisnis.xml", region: "indonesia", category: "business" },
  { slug: "cnn-indonesia", name: "CNN Indonesia", feedUrl: "https://www.cnnindonesia.com/ekonomi/rss", region: "indonesia", category: "business" },
  { slug: "katadata", name: "Katadata", feedUrl: "https://katadata.co.id/rss", region: "indonesia", category: "business" },
  { slug: "idx-channel", name: "IDX Channel", feedUrl: "https://www.idxchannel.com/rss", region: "indonesia", category: "markets" },
  { slug: "republika", name: "Republika", feedUrl: "https://www.republika.co.id/rss/ekonomi", region: "indonesia", category: "business" },
  // The Conversation (CC BY-ND 4.0): its Atom feed carries the full article; only the
  // summary is stored, unmodified apart from the 500-character cut. Credit and link required.
  {
    slug: "conversation-id",
    name: "The Conversation Indonesia",
    feedUrl: "https://theconversation.com/id/articles.atom",
    region: "indonesia",
    category: "business",
    licence: `CC BY-ND 4.0. Store only the summary, unmodified. ${CREDIT_AND_LINK}`,
  },
  {
    slug: "conversation-global",
    name: "The Conversation",
    feedUrl: "https://theconversation.com/global/articles.atom",
    region: "global",
    category: "business",
    licence: `CC BY-ND 4.0. Store only the summary, unmodified. ${CREDIT_AND_LINK}`,
  },
  // Central banks: press releases, reuse allowed with credit and a link.
  {
    slug: "federal-reserve",
    name: "Federal Reserve",
    feedUrl: "https://www.federalreserve.gov/feeds/press_all.xml",
    region: "global",
    category: "markets",
    licence: CREDIT_AND_LINK,
  },
  {
    slug: "ecb",
    name: "ECB",
    feedUrl: "https://www.ecb.europa.eu/rss/press.html",
    region: "global",
    category: "markets",
    licence: CREDIT_AND_LINK,
  },
  { slug: "techcrunch", name: "TechCrunch", feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/", region: "global", category: "tech-ai" },
  { slug: "cnbc", name: "CNBC", feedUrl: "https://www.cnbc.com/id/10001147/device/rss/rss.html", region: "global", category: "business" },
  // Off: their terms forbid AI use of their content or harvesting its metadata (R-1 Addendum).
  { slug: "bbc-business", name: "BBC Business", feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml", region: "global", category: "business", active: false },
  { slug: "bbc-technology", name: "BBC Technology", feedUrl: "https://feeds.bbci.co.uk/news/technology/rss.xml", region: "global", category: "tech-ai", active: false },
  { slug: "the-guardian", name: "The Guardian", feedUrl: "https://www.theguardian.com/uk/business/rss", region: "global", category: "business", active: false },
  // Off until the Tech Lead decides: the Condé Nast User Agreement appears to forbid storing
  // items and sending them to an LLM (R-1 Addendum, OR-8 Log).
  { slug: "wired", name: "Wired", feedUrl: "https://www.wired.com/feed/rss", region: "global", category: "tech-ai", active: false },
];
