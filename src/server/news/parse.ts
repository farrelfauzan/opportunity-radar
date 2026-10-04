import { XMLParser, XMLValidator } from "fast-xml-parser";

/** A feed that could not be used; the message is the source's readable status. */
export class FeedError extends Error {}

export type FeedItem = { title: string; link: string; description: string; date: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false, // keep "0123" and dates as text
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

type Node = string | { "#text"?: string; [key: string]: unknown } | undefined;

const text = (node: Node): string => (typeof node === "string" ? node : (node?.["#text"] ?? "")).toString();

/** Decodes the response body using the charset of the XML declaration, else the HTTP header, else UTF-8. */
export function decodeFeed(body: ArrayBuffer, contentType: string | null): string {
  const head = new TextDecoder("latin1").decode(body.slice(0, 200));
  const declared = /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(head)?.[1];
  const fromHeader = /charset=["']?([^"';\s]+)/i.exec(contentType ?? "")?.[1];
  for (const charset of [declared, fromHeader]) {
    try {
      if (charset) return new TextDecoder(charset).decode(body);
    } catch {} // unknown charset label: try the next one
  }
  return new TextDecoder("utf-8").decode(body);
}

/** Items of an RSS 2.0, RSS 1.0 (RDF) or Atom document, as raw untrusted text. */
export function parseFeed(xml: string): FeedItem[] {
  if (/^\s*<(!doctype\s+html|html[\s>])/i.test(xml)) throw new FeedError("not a feed (HTML page)");
  if (XMLValidator.validate(xml) !== true) throw new FeedError("malformed XML");
  let doc;
  try {
    doc = parser.parse(xml); // refuses external entities ("External entities are not supported")
  } catch {
    throw new FeedError("unsupported XML");
  }

  const rssItems = doc.rss?.channel?.item ?? doc["rdf:RDF"]?.item;
  if (doc.rss?.channel || doc["rdf:RDF"]) {
    return (rssItems ?? []).map((item: Record<string, Node>) => ({
      title: text(item.title),
      link: text((item.link as Node[] | undefined)?.[0]),
      description: text(item.description),
      date: text(item.pubDate) || text(item["dc:date"]),
    }));
  }
  if (doc.feed) {
    return (doc.feed.entry ?? []).map((entry: Record<string, Node>) => {
      const links = (entry.link ?? []) as { "@_rel"?: string; "@_href"?: string }[];
      const link = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      return {
        title: text(entry.title),
        link: link?.["@_href"] ?? "",
        description: text(entry.summary) || text(entry.content),
        date: text(entry.published) || text(entry.updated),
      };
    });
  }
  throw new FeedError("not a feed");
}
