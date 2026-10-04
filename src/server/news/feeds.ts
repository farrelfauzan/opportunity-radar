import type { Category, Region } from "@/server/data";

export type Feed = {
  slug: string;
  name: string;
  feedUrl: string;
  region: Region;
  /** Default category of everything in the feed; AI triage (OR-14) refines it per article. */
  category: Category;
  /** The feed's description is not a summary of the article (Hacker News: a "Comments" link). */
  noSnippet?: boolean;
};

// 12 feeds from 11 publishers, live-tested on 2026-10-04 (docs/research/R-1-data-sources.md).
export const FEEDS: Feed[] = [
  { slug: "cnbc-indonesia", name: "CNBC Indonesia", feedUrl: "https://www.cnbcindonesia.com/news/rss", region: "indonesia", category: "business" },
  { slug: "antara", name: "Antara", feedUrl: "https://www.antaranews.com/rss/ekonomi-bisnis.xml", region: "indonesia", category: "business" },
  { slug: "cnn-indonesia", name: "CNN Indonesia", feedUrl: "https://www.cnnindonesia.com/ekonomi/rss", region: "indonesia", category: "business" },
  { slug: "katadata", name: "Katadata", feedUrl: "https://katadata.co.id/rss", region: "indonesia", category: "business" },
  { slug: "idx-channel", name: "IDX Channel", feedUrl: "https://www.idxchannel.com/rss", region: "indonesia", category: "markets" },
  { slug: "republika", name: "Republika", feedUrl: "https://www.republika.co.id/rss/ekonomi", region: "indonesia", category: "business" },
  { slug: "bbc-business", name: "BBC Business", feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml", region: "global", category: "business" },
  { slug: "bbc-technology", name: "BBC Technology", feedUrl: "https://feeds.bbci.co.uk/news/technology/rss.xml", region: "global", category: "tech-ai" },
  { slug: "techcrunch", name: "TechCrunch", feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/", region: "global", category: "tech-ai" },
  { slug: "the-guardian", name: "The Guardian", feedUrl: "https://www.theguardian.com/uk/business/rss", region: "global", category: "business" },
  { slug: "cnbc", name: "CNBC", feedUrl: "https://www.cnbc.com/id/10001147/device/rss/rss.html", region: "global", category: "business" },
  { slug: "hacker-news", name: "Hacker News", feedUrl: "https://news.ycombinator.com/rss", region: "global", category: "tech-ai", noSnippet: true },
];

/** The fields stored in `sources` (everything except reading hints like noSnippet). */
export const sourceOf = ({ slug, name, feedUrl, region, category }: Feed) => ({ slug, name, feedUrl, region, category });
