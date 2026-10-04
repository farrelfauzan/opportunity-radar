import type { NewSource } from "@/server/data";

/** A feed and its defaults. `category` is refined per article by AI triage (OR-14). */
export type Feed = NewSource;

// 11 feeds from 10 publishers, live-tested on 2026-10-04 (docs/research/R-1-data-sources.md).
// Hacker News was dropped: it answers 419 to our fetcher (OR-8 Log).
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
];
