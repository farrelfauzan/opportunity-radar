import { describe, expect, test } from "vitest";
import { canonicalUrl, cleanText, cutSnippet } from "./clean";

describe("cleanText", () => {
  test.each([
    ["tags are stripped", "<p>One <b>two</b></p><br/>three", "One two three"],
    ["script and style content is removed", 'a<script>alert("x")</script>b<style>p{}</style>c', "a b c"],
    ["named and numeric entities are decoded", "Tom &amp; Jerry&#8217;s &#x201C;show&#x201D;&nbsp;&hellip;", "Tom & Jerry’s “show” …"],
    ["HTML escaped once is still stripped", "&lt;p&gt;Hello&lt;/p&gt;", "Hello"],
    ["HTML escaped twice is still stripped", "&amp;lt;b&amp;gt;Hi&amp;lt;/b&amp;gt; &amp;amp; bye", "Hi & bye"],
    ["whitespace is collapsed", "  a \n\t b   c ", "a b c"],
    ["HTML escaped three times never comes out as a live tag", "&amp;amp;lt;script&amp;amp;gt;alert(1)&amp;amp;lt;/script&amp;amp;gt;ok", "ok"],
    ["HTML escaped four times never comes out as a live tag", "&amp;amp;amp;lt;b&amp;amp;amp;gt;bold&amp;amp;amp;lt;/b&amp;amp;amp;gt;", "bold"],
    ["comments are removed", "a<!-- hidden -->b", "a b"],
    ["a less-than sign in prose is kept", "rates stay < 5% and > 2%", "rates stay < 5% and > 2%"],
    ["an unknown entity is left as written", "R&D; &zzz;", "R&D; &zzz;"],
    ["an invalid code point is left as written", "&#xD800; &#0;", "&#xD800; &#0;"],
  ])("%s", (_name, input, expected) => {
    expect(cleanText(input)).toBe(expected);
  });
});

describe("cleanText keeps tickers in angle brackets (OR-57)", () => {
  test.each([
    ["Apple <AAPL> beats estimates", "Apple (AAPL) beats estimates"],
    ["Saham <BBCA.JK> naik", "Saham (BBCA.JK) naik"],
    ["Alibaba <9988> rebounds", "Alibaba (9988) rebounds"],
    ["Berkshire <BRK.B> and HK <9988.HK>", "Berkshire (BRK.B) and HK (9988.HK)"],
    ["escaped: Apple &lt;AAPL&gt; beats", "escaped: Apple (AAPL) beats"],
    ["escaped twice: &amp;lt;TSLA&amp;gt;", "escaped twice: (TSLA)"],
    ["<b>Bold</b> stays text", "Bold stays text"],
    ['<a href="x">link</a> text', "link text"],
    ["<SCRIPT>alert(1)</SCRIPT>after", "after"],
    ["<B>Upper bold</B>", "Upper bold"],
    ["<A HREF=x>upper link</A>", "upper link"],
    ["too long <ABCDEFG> is a tag", "too long is a tag"],
    ["lower case <aapl> is a tag", "lower case is a tag"],
  ])("%s → %s", (input, expected) => {
    expect(cleanText(input)).toBe(expected);
  });
});

describe("cleanText on deeply escaped markup", () => {
  const escape = (text: string, levels: number) => {
    for (let i = 0; i < levels; i++) text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return text;
  };

  // 20 levels: the last allowed pass decodes into live tags, so the final strip must remove them.
  test.each([1, 2, 3, 4, 19, 20, 21, 40])("%i levels of escaping never give a live tag", (levels) => {
    const cleaned = cleanText(escape('<script>alert(1)</script><b>bold</b> ok', levels));
    expect(cleaned).not.toMatch(/<[a-z\/]/i);
    if (levels <= 20) expect(cleaned).toBe("bold ok");
  });
});

describe("cutSnippet", () => {
  test("500 characters or fewer are unchanged", () => {
    expect(cutSnippet("x".repeat(500))).toBe("x".repeat(500));
  });

  test("longer text is cut to 500 including the ellipsis", () => {
    const cut = cutSnippet("x".repeat(501));
    expect(cut).toHaveLength(500);
    expect(cut.endsWith("x…")).toBe(true);
  });

  test("characters are counted as code points and never split", () => {
    const cut = cutSnippet("😀".repeat(600));
    expect(Array.from(cut)).toHaveLength(500);
    expect(cut).toBe("😀".repeat(499) + "…");
  });
});

describe("canonicalUrl", () => {
  const same = "https://example.com/story/one";
  test.each([
    ["tracking parameters", "https://example.com/story/one?utm_source=rss&utm_medium=x&fbclid=1&gclid=2&mc_cid=3&mc_eid=4&ref=5&ref_src=6"],
    ["a fragment", "https://example.com/story/one#comments"],
    ["host case", "https://EXAMPLE.Com/story/one"],
    ["http", "http://example.com/story/one"],
    ["a default port", "http://example.com:80/story/one"],
    ["a trailing slash", "https://example.com/story/one/"],
    ["surrounding whitespace", "  https://example.com/story/one\n"],
  ])("%s does not make a different article", (_name, link) => {
    expect(canonicalUrl(link)).toBe(same);
  });

  test("parameters are sorted by code unit, whatever the machine's locale", () => {
    expect(canonicalUrl("https://example.com/a?b=1&B=2&a=3&%C3%A9=4")).toBe("https://example.com/a?B=2&a=3&b=1&%C3%A9=4");
  });

  test("remaining parameters are kept and sorted", () => {
    expect(canonicalUrl("https://example.com/a?page=2&id=7&utm_campaign=x")).toBe("https://example.com/a?id=7&page=2");
    expect(canonicalUrl("https://example.com/a?id=7&page=2")).toBe("https://example.com/a?id=7&page=2");
  });

  test("the root path keeps its slash, and a non-default port stays", () => {
    expect(canonicalUrl("http://Example.com")).toBe("https://example.com/");
    expect(canonicalUrl("https://example.com:8443/a/")).toBe("https://example.com:8443/a");
  });

  test("path case is significant", () => {
    expect(canonicalUrl("https://example.com/Story")).toBe("https://example.com/Story");
  });

  test.each(["javascript:alert(1)", "data:text/html,x", "ftp://example.com/a", "mailto:a@example.com", "", "not a url"])(
    "%j is not a storable link",
    (link) => {
      expect(canonicalUrl(link)).toBeNull();
    },
  );
});
