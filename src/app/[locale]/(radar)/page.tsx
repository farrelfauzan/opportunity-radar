import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CreditLine } from "@/components/credit-line";
import { focusRing } from "@/components/focus-ring";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentLocale, getMessages, getT } from "@/i18n/dictionaries";
import { formatDateLongWib, formatRelativeTime, formatTimeWib } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { categoryLabel, safeHref } from "@/lib/news/view";
import { horizonKey, inLocale, isNeverScored, staleBanner, trendText } from "@/lib/opportunities/view";
import { affectedText, briefSourceText, plural, updatedText } from "@/lib/radar/view";
import { cn } from "@/lib/utils";
import {
  citationCounts,
  getBrief,
  lastScoringRun,
  listOpportunities,
  recentLinkedNews,
  wibDay,
  type DailyBrief,
  type LinkedNews,
  type ListedOpportunity,
} from "@/server/data";

// Rendered per request (connection() below): the page reads the store, so a build must not prerender it.

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await currentLocale());
  return { title: t("page.documentTitle", { page: t("page.title.radar") }) };
}

const TOP_COUNT = 5;
const NEWS_COUNT = 5;

const heading = "text-[26px] font-bold tracking-tight";
const h2 = "text-base font-semibold";
// Every text below (brief lines, opportunity and article texts) is rendered as text, never as markup.
const wrap = "[overflow-wrap:anywhere]";
const sectionLink = `inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline ${focusRing}`;

async function load(now: Date) {
  const [open, lastRun, brief, news] = await Promise.all([
    listOpportunities({}, now),
    // The same source of truth as "updated" on the Opportunities screen: the last successful
    // "scores" run (the morning pipeline's steps are triage, opportunities, scores, ventures, brief).
    lastScoringRun(),
    getBrief(wibDay(now)),
    recentLinkedNews(NEWS_COUNT),
  ]);
  const top = open.slice(0, TOP_COUNT);
  return { total: open.length, top, counts: await citationCounts(top.map((o) => o.id)), lastRun, brief, news };
}

export default async function RadarPage() {
  await connection();
  const locale = await currentLocale();
  const m = getMessages(locale);
  const now = new Date();

  let data;
  try {
    data = await load(now);
  } catch (error) {
    // The details stay in the server log; the page shows no host, port or message.
    console.error("Radar: cannot read the store", error);
    return (
      <>
        <h1 className={heading}>{m.radar.title}</h1>
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-base font-semibold">{m.state.error.title}</p>
            <p className="text-muted-foreground">{m.state.error.body}</p>
            <a href={`/${locale}`} className={buttonVariants()}>
              {m.state.error.retry}
            </a>
          </CardContent>
        </Card>
      </>
    );
  }

  const { total, top, counts, lastRun, brief, news } = data;

  if (isNeverScored(lastRun, total)) {
    return (
      <>
        <h1 className={heading}>{m.radar.title}</h1>
        <Card>
          <CardContent className="font-semibold">{m.opp.never}</CardContent>
        </Card>
      </>
    );
  }

  const banner = staleBanner(lastRun, now, locale, m.state.stale);
  const updated = updatedText(
    formatDateLongWib(now, locale),
    lastRun && formatTimeWib(lastRun, locale),
    m.radar.updated,
  );

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={heading}>{m.radar.title}</h1>
        <p className="text-muted-foreground">{updated}</p>
      </div>

      {banner && (
        <p role="status" className="rounded-lg border border-glass-border bg-white/8 px-4 py-3 text-foreground">
          {banner}
        </p>
      )}

      <BriefSection brief={brief} locale={locale} m={m} />
      <TopSection items={top} total={total} counts={counts} locale={locale} m={m} />
      {news.length > 0 && <NewsSection items={news} now={now} locale={locale} m={m} />}
    </>
  );
}

function BriefSection({ brief, locale, m }: { brief: DailyBrief | null; locale: Locale; m: Messages }) {
  return (
    <section aria-labelledby="radar-brief">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 id="radar-brief" className={h2}>
            {m.radar.brief.title}
          </h2>
          {brief ? (
            <>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px]">
                {brief.lines.map((line, index) => {
                  const affected = affectedText(line.opportunityIds.length, m.radar.brief.affected);
                  return (
                    <li key={index} className={wrap}>
                      <strong>{m.news.cat[categoryLabel[line.label]]}:</strong> {inLocale(locale, line.en, line.id)}
                      {affected && <span className="text-muted-foreground"> {affected}</span>}
                    </li>
                  );
                })}
              </ol>
              <p className="text-xs text-muted-foreground">
                {briefSourceText(brief.articleCount, brief.sourceCount, m.radar.brief)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">{m.radar.brief.none}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function TopSection({
  items,
  total,
  counts,
  locale,
  m,
}: {
  items: ListedOpportunity[];
  total: number;
  counts: Map<number, number>;
  locale: Locale;
  m: Messages;
}) {
  return (
    <section aria-labelledby="radar-top" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="radar-top" className={h2}>
          {m.radar.top.title}
        </h2>
        {items.length > 0 && (
          <Link href={`/${locale}/opportunities`} className={sectionLink}>
            {fill(m.radar.top.seeAll, { n: total })}
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground">{m.radar.top.empty}</CardContent>
        </Card>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <TopItem item={item} citations={counts.get(item.id) ?? 0} locale={locale} m={m} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

const chip = "rounded-sm bg-[#4B3E75] px-2 py-0.5 text-xs text-[#E2DDF0]";

function TopItem({
  item,
  citations,
  locale,
  m,
}: {
  item: ListedOpportunity;
  citations: number;
  locale: Locale;
  m: Messages;
}) {
  const trend = trendText(item.trend, m.opp.trend);
  return (
    // The title link is stretched over the whole card, so the card is one tap target.
    <Card className="relative has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      <CardContent className="flex items-start gap-4">
        <div className="w-14 shrink-0 text-center">
          <p className="font-mono text-2xl font-medium text-primary">{item.currentScore}</p>
          <p className="text-[11px] text-muted-foreground">{m.radar.top.score}</p>
          <p
            data-trend={trend.direction}
            className={cn(
              "text-xs font-semibold",
              trend.direction === "up" && "text-primary",
              trend.direction === "down" && "text-destructive",
              (trend.direction === "flat" || trend.direction === "new") && "text-muted-foreground",
            )}
          >
            {trend.text}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Link
            href={`/${locale}/opportunities/${item.id}`}
            className={cn(
              "text-base font-semibold after:absolute after:inset-0 focus-visible:outline-none",
              wrap,
            )}
          >
            {inLocale(locale, item.titleEn, item.titleId)}
          </Link>
          <p className={cn("text-[#E2DDF0]", wrap)}>{inLocale(locale, item.thesisEn, item.thesisId)}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={chip}>{item.region === "indonesia" ? m.opp.filter.region.id : m.opp.filter.region.global}</span>
            <span className={cn(chip, wrap)}>{item.sectors.map((sector) => m.opp.sector[sector]).join(", ")}</span>
            <span className={chip}>{fill(m.radar.top.horizon, { h: m.opp.horizon[horizonKey[item.horizon]] })}</span>
            <span className="text-xs text-muted-foreground">{plural(citations, m.radar.top.basedOn)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewsSection({ items, now, locale, m }: { items: LinkedNews[]; now: Date; locale: Locale; m: Messages }) {
  return (
    <section aria-labelledby="radar-news">
      <Card>
        <CardContent className="flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <h2 id="radar-news" className={h2}>
              {m.radar.news.title}
            </h2>
            <Link href={`/${locale}/news`} className={sectionLink}>
              {m.radar.news.all}
            </Link>
          </div>
          <ol>
            {items.map((article) => (
              <li key={article.id} className="border-t border-[#4B3E75] py-3 last:pb-0">
                <NewsItem article={article} now={now} locale={locale} m={m} />
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}

function NewsItem({ article, now, locale, m }: { article: LinkedNews; now: Date; locale: Locale; m: Messages }) {
  const href = safeHref(article.link);
  const why = inLocale(locale, article.whyEn ?? "", article.whyId ?? "");
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <span className="w-[120px] shrink-0 pt-0.5 text-xs font-semibold text-[#E2DDF0]">
        {m.news.cat[categoryLabel[article.category]]}
      </span>
      <div className="flex min-w-0 flex-[1_1_420px] flex-col">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex min-h-11 items-center rounded-sm text-[15px] font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              wrap,
            )}
          >
            <span>
              {article.headline}
              <span className="sr-only">. {m.news.item.openExternal}</span>
            </span>
          </a>
        ) : (
          <span className={cn("py-2.5 text-[15px] font-semibold", wrap)}>{article.headline}</span>
        )}
        {why && <p className={cn("text-[#E2DDF0]", wrap)}>{why}</p>}
        <CreditLine sourceSlug={article.sourceSlug} strings={m.news.credit} />
      </div>
      <span className={cn("min-w-0 pt-0.5 text-xs text-muted-foreground", wrap)}>
        {fill(m.news.item.meta, {
          source: article.sourceName,
          ago: formatRelativeTime(article.publishedAt, now, locale, m.time),
          region: article.region === "indonesia" ? m.news.region.id : m.news.region.global,
        })}
      </span>
    </div>
  );
}
