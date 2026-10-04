import type { Metadata } from "next";
import Link from "next/link";
import { CreditLine } from "@/components/credit-line";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentLocale, getMessages, getT } from "@/i18n/dictionaries";
import { formatRelativeTime } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { inLocale } from "@/lib/opportunities/view";
import { newsHref, PAGE_SIZE, parseNewsQuery, type NewsQuery } from "@/lib/news/query";
import {
  themeBarPercent,
  INGEST_JOB,
  isNeverIngested,
  isStale,
  onlyLinked,
  partialState,
  safeHref,
  staleBanner,
} from "@/lib/news/view";
import {
  CATEGORIES,
  lastSuccessfulRun,
  listArticles,
  listSources,
  newsEnrichment,
  sourceHealth,
  trendingThemes,
  REGIONS,
  type ArticleWithSource,
  type Category,
  type Impact,
  type NewsEnrichment,
} from "@/server/data";
import { LinkedToggle } from "./linked-toggle";
import { RegionSelect } from "./region-select";

// Rendered per request: reading searchParams keeps the page out of every cache,
// so a newly stored article shows on the next reload.

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await currentLocale());
  return { title: t("page.documentTitle", { page: t("page.title.news") }) };
}

const categoryLabel = {
  business: "business",
  politics: "politics",
  "tech-ai": "tech",
  markets: "markets",
  commodities: "commodities",
} as const satisfies Record<Category, keyof Messages["news"]["cat"]>;

const chip =
  "inline-flex min-h-11 items-center rounded-md border border-input bg-black/18 px-3.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=true]:border-foreground aria-[current=true]:bg-foreground aria-[current=true]:text-background";

// The impact is a word first; the colours (design: News.dc.html) only back it up.
const impactStyle = {
  opportunity: "bg-[#1D4B48] text-[#5EEAD4]",
  risk: "bg-[#5A3320] text-[#FDBA74]",
  context: "bg-[#4B3E75] text-[#E2DDF0]",
} as const satisfies Record<Impact, string>;

const heading = "text-[26px] font-bold tracking-tight";

async function load({ category, region, linked }: NewsQuery, now: Date) {
  // One query for the day; the filters are applied to it, so the header counts and the list agree.
  const [all, sources, health, lastRun, themes] = await Promise.all([
    listArticles({}),
    listSources(),
    sourceHealth(),
    lastSuccessfulRun(INGEST_JOB),
    trendingThemes(now),
  ]);
  const filtered = all.filter((a) => (!category || a.category === category) && (!region || a.region === region));
  const enrichment = await newsEnrichment(filtered.map((a) => a.id));
  const list = linked ? onlyLinked(filtered, enrichment) : filtered;
  return { all, list, enrichment, sources, health, lastRun, themes };
}

export default async function NewsPage({ searchParams }: PageProps<"/[locale]/news">) {
  const locale = await currentLocale();
  const m = getMessages(locale);
  const query = parseNewsQuery(await searchParams);
  const now = new Date();

  let data;
  try {
    data = await load(query, now);
  } catch (error) {
    // The details stay in the server log; the page shows no host, port or message.
    console.error("News: cannot read the store", error);
    return (
      <>
        <h1 className={heading}>{m.page.title.news}</h1>
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-base font-semibold">{m.state.error.title}</p>
            <p className="text-muted-foreground">{m.state.error.body}</p>
            <a href={newsHref(locale, query)} className={buttonVariants()}>
              {m.state.error.retry}
            </a>
          </CardContent>
        </Card>
      </>
    );
  }

  const { all, list, enrichment, sources, health, lastRun, themes } = data;

  if (isNeverIngested(lastRun, all.length)) {
    return (
      <>
        <h1 className={heading}>{m.page.title.news}</h1>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-base font-semibold">{m.state.never.title}</p>
            <p className="text-muted-foreground">{m.state.never.bodyNews}</p>
          </CardContent>
        </Card>
      </>
    );
  }

  const banner = staleBanner(lastRun, now, locale, m.state.stale);
  const partial = partialState(health, isStale(lastRun, now));
  const failedSlugs = new Set(partial?.failed.map((s) => s.slug));
  const visible = list.slice(0, query.shown);
  const regionOptions = [
    { value: "all", label: m.news.region.all, region: undefined },
    { value: "indonesia", label: m.news.region.id, region: "indonesia" },
    { value: "global", label: m.news.region.global, region: "global" },
  ] as const;
  const maxThemeCount = Math.max(...themes.map((t) => t.count));

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={heading}>{m.page.title.news}</h1>
        <p className="text-muted-foreground">{summary(m.news.summary, all)}</p>
      </div>

      {banner && (
        <p role="status" className="rounded-lg border border-glass-border bg-white/8 px-4 py-3 text-foreground">
          {banner}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div role="group" aria-label={m.news.cat.label} className="flex flex-wrap gap-1">
          {[undefined, ...CATEGORIES].map((category) => (
            <Link
              key={category ?? "all"}
              href={newsHref(locale, { category, region: query.region, linked: query.linked })}
              aria-current={category === query.category ? "true" : undefined}
              className={chip}
            >
              {m.news.cat[category ? categoryLabel[category] : "all"]}
            </Link>
          ))}
        </div>
        <RegionSelect
          label={m.news.region.label}
          value={query.region ?? "all"}
          options={regionOptions.map((o) => ({
            value: o.value,
            label: o.label,
            href: newsHref(locale, { category: query.category, region: o.region, linked: query.linked }),
          }))}
        />
        <LinkedToggle
          label={m.news.onlyLinked}
          checked={query.linked === true}
          href={newsHref(locale, { category: query.category, region: query.region, linked: query.linked ? undefined : true })}
        />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
          {visible.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground">{m.news.empty}</CardContent>
            </Card>
          ) : (
            <ol className="flex flex-col gap-3">
              {visible.map((article) => (
                <li key={article.id}>
                  <Item article={article} extra={enrichment.get(article.id)} now={now} locale={locale} m={m} />
                </li>
              ))}
            </ol>
          )}
          {list.length > query.shown && (
            <Link
              href={newsHref(locale, { ...query, shown: query.shown + PAGE_SIZE })}
              scroll={false}
              className={`${buttonVariants({ variant: "outline" })} h-11 self-start`}
            >
              {m.news.loadMore}
            </Link>
          )}
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">{m.news.sources.title}</h2>
              {partial && (
                <p className="text-xs font-semibold text-foreground [overflow-wrap:anywhere]">
                  {fill(m.state.partial, {
                    ok: partial.ok,
                    total: partial.total,
                    names: partial.failed.map((s) => s.name).join(", "),
                  })}
                </p>
              )}
              {REGIONS.map((region) => {
                // A source that did not update is marked with a word, not only with colour.
                const names = sources
                  .filter((s) => s.active && s.region === region)
                  .map((s) => (failedSlugs.has(s.slug) ? `${s.name} — ${m.news.sources.notUpdated}` : s.name));
                if (names.length === 0) return null;
                return (
                  <p key={region} className="text-[#E2DDF0] [overflow-wrap:anywhere]">
                    {fill(region === "indonesia" ? m.news.sources.indonesia : m.news.sources.global, {
                      names: names.join(", "),
                    })}
                  </p>
                );
              })}
              <p className="text-xs text-muted-foreground">{m.news.sources.note}</p>
            </CardContent>
          </Card>
          {themes.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-2.5">
                <h2 className="text-base font-semibold">{m.news.themes.title}</h2>
                <ul className="flex flex-col gap-2.5">
                  {themes.map(({ theme, count }) => (
                    <li key={theme}>
                      <div className="flex justify-between gap-2">
                        <span className="[overflow-wrap:anywhere]">{m.news.theme[theme]}</span>
                        <span className="font-mono text-[13px] text-[#E2DDF0]">{count}</span>
                      </div>
                      <span
                        role="meter"
                        aria-label={m.news.theme[theme]}
                        aria-valuemin={0}
                        aria-valuemax={maxThemeCount}
                        aria-valuenow={count}
                        className="mt-1 block h-1.5 overflow-hidden rounded-[3px] bg-[#4B3E75]"
                      >
                        <span className="block h-1.5 bg-[#2DD4BF]" style={{ width: `${themeBarPercent(count, maxThemeCount)}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{m.news.themes.caption}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

const plural = (count: number, forms: { one: string; other: string }) =>
  fill(count === 1 ? forms.one : forms.other, { n: count });

/** "N articles today · M sources · refreshed every 30 minutes": the whole day, not the filter. */
function summary(strings: Messages["news"]["summary"], today: ArticleWithSource[]): string {
  return fill(strings.line, {
    articles: plural(today.length, strings.articles),
    sources: plural(new Set(today.map((a) => a.sourceId)).size, strings.sources),
  });
}

function Item({
  article,
  extra,
  now,
  locale,
  m,
}: {
  article: ArticleWithSource;
  /** Triage and linked opportunity; undefined when there is neither (no tag, no box, no link, no placeholder). */
  extra: NewsEnrichment | undefined;
  now: Date;
  locale: Locale;
  m: Messages;
}) {
  // Headline and snippet are rendered as text only, never as markup.
  const href = safeHref(article.link);
  const triage = extra?.triage;
  const linked = extra?.linked;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {/* articles.category is the triage category once triage succeeded (saveTriage overwrites it), the feed category until then. */}
          <span className="font-semibold text-[#E2DDF0]">{m.news.cat[categoryLabel[article.category]]}</span>
          <span className="[overflow-wrap:anywhere]">
            {fill(m.news.item.meta, {
              source: article.sourceName,
              ago: formatRelativeTime(article.publishedAt, now, locale, m.time),
              region: article.region === "indonesia" ? m.news.region.id : m.news.region.global,
            })}
          </span>
          {triage && (
            <span className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${impactStyle[triage.impact]}`}>
              {m.news.impact[triage.impact]}
            </span>
          )}
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm text-base font-semibold [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {article.headline}
            <span className="sr-only">. {m.news.item.openExternal}</span>
          </a>
        ) : (
          <span className="text-base font-semibold [overflow-wrap:anywhere]">{article.headline}</span>
        )}
        {article.snippet && <p className="text-[#E2DDF0] [overflow-wrap:anywhere]">{article.snippet}</p>}
        <CreditLine sourceSlug={article.sourceSlug} strings={m.news.credit} />
        {triage && (
          // Our commentary, kept apart from the stored snippet (a licensed summary is never altered).
          <div className="flex gap-2.5 rounded-lg bg-black/18 px-3 py-2.5">
            <span className="shrink-0 pt-px text-xs font-semibold text-[#2DD4BF]">{m.news.why}</span>
            <span className="min-w-0 text-[#E2DDF0] [overflow-wrap:anywhere]">
              {inLocale(locale, triage.whyEn, triage.whyId)}
            </span>
          </div>
        )}
        {linked && (
          <Link
            href={`/${locale}/opportunities/${linked.id}`}
            className="w-fit rounded-sm py-1 text-[13px] text-[#2DD4BF] [overflow-wrap:anywhere] hover:text-[#5EEAD4] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {fill(m.news.linked, { title: inLocale(locale, linked.titleEn, linked.titleId) })}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
