import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CreditLine } from "@/components/credit-line";
import { SampleBadge } from "@/components/sample-badge";
import { WhyLabel } from "@/components/why-label";
import { focusRing } from "@/components/focus-ring";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentLocale, getMessages, getT } from "@/i18n/dictionaries";
import { formatDateLongWib, formatRelativeTime, formatTimeWib } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { MARKET_JOB, marketView, type MarketRowView } from "@/lib/market/view";
import { categoryLabel, safeHref } from "@/lib/news/view";
import { horizonKey, inLocale, isNeverScored, trendText } from "@/lib/opportunities/view";
import { affectedText, briefSourceText, firstRunTime, plural, sectionStale, updatedText } from "@/lib/radar/view";
import { neverScored, progressPercent, scoreChange } from "@/lib/ventures/view";
import { cn } from "@/lib/utils";
import {
  citationCounts,
  getBrief,
  getMarketSnapshot,
  lastSuccessfulRun,
  lastScoringRun,
  listOpportunities,
  listVentureCards,
  recentLinkedNews,
  wibDay,
  type DailyBrief,
  type LinkedNews,
  type ListedOpportunity,
  type VentureCard,
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
  const [open, lastRun, briefRun, brief, news, market, marketRuns, ventures, venturesRun] = await Promise.all([
    listOpportunities({}, now),
    // The same source of truth as "updated" on the Opportunities screen: the last successful
    // "scores" run (the morning pipeline's steps are triage, opportunities, scores, ventures, brief).
    lastScoringRun(),
    lastSuccessfulRun("brief"),
    getBrief(wibDay(now)),
    recentLinkedNews(NEWS_COUNT),
    getMarketSnapshot(),
    // The last successful run of each job that feeds the snapshot (several rows share one).
    Promise.all([...new Set(Object.values(MARKET_JOB))].map(async (job) => [job, await lastSuccessfulRun(job)] as const)).then(Object.fromEntries),
    listVentureCards(wibDay(now)),
    // The morning step that scores the ventures.
    lastSuccessfulRun("ventures"),
  ]);
  const top = open.slice(0, TOP_COUNT);
  return { total: open.length, top, counts: await citationCounts(top.map((o) => o.id)), lastRun, briefRun, brief, news, market, marketRuns, ventures, venturesRun };
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

  const { total, top, counts, lastRun, briefRun, brief, news, market, marketRuns, ventures, venturesRun } = data;
  const snapshot = marketView(market, marketRuns, now, locale, m);

  // Nothing has ever run: one card in place of the brief; the other sections keep their own empty texts.
  const neverRun = isNeverScored(lastRun, total) && !brief && news.length === 0;
  // The date of the run, not today's: after a missed morning, today's date next to yesterday's time would mislead.
  const updated = updatedText(
    formatDateLongWib(lastRun ?? now, locale),
    lastRun && formatTimeWib(lastRun, locale),
    m.radar.updated,
  );

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={heading}>{m.radar.title}</h1>
        <p className="text-muted-foreground">{updated}</p>
      </div>

      {neverRun ? (
        <section aria-labelledby="radar-never">
          <Card>
            <CardContent className="flex flex-col gap-1">
              <h2 id="radar-never" className={h2}>
                {m.state.never.title}
              </h2>
              <p className="text-muted-foreground">{fill(m.state.never.body, { time: firstRunTime(locale) })}</p>
            </CardContent>
          </Card>
        </section>
      ) : (
        <BriefSection brief={brief} stale={sectionStale(briefRun, now, locale, m.state.stale, "brief")} locale={locale} m={m} />
      )}
      {ventures.length > 0 && (
        <VenturesSection cards={ventures} stale={sectionStale(venturesRun, now, locale, m.state.stale, "ventures")} locale={locale} m={m} />
      )}
      <TopSection
        items={top}
        total={total}
        counts={counts}
        stale={sectionStale(lastRun, now, locale, m.state.stale, "opportunities")}
        locale={locale}
        m={m}
      />
      {news.length > 0 && <NewsSection items={news} now={now} locale={locale} m={m} />}
      {snapshot.rows.length > 0 && <MarketSection rows={snapshot.rows} staleLine={snapshot.staleLine} m={m} />}
    </>
  );
}

const staleClass = "rounded-lg border border-glass-border bg-white/8 px-4 py-3 text-foreground";

function BriefSection({
  brief,
  stale,
  locale,
  m,
}: {
  brief: DailyBrief | null;
  stale: string | null;
  locale: Locale;
  m: Messages;
}) {
  return (
    <section aria-labelledby="radar-brief">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 id="radar-brief" className={h2}>
            {m.radar.brief.title}
          </h2>
          {stale && (
            <p role="status" className={staleClass}>
              {stale}
            </p>
          )}
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

const tile = "min-w-0 flex-1 basis-36 rounded-lg bg-black/20 px-3 py-2.5";

function VenturesSection({ cards, stale, locale, m }: { cards: VentureCard[]; stale: string | null; locale: Locale; m: Messages }) {
  return (
    <section aria-labelledby="radar-ventures" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="radar-ventures" className={h2}>
          {m.radar.ventures.title}
        </h2>
        <span className="text-xs text-muted-foreground">{m.radar.ventures.subtitle}</span>
      </div>
      {stale && (
        <p role="status" className={staleClass}>
          {stale}
        </p>
      )}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
        {cards.map((card) => (
          <li key={card.venture.id} data-venture={card.venture.slug} className="flex">
            <VentureItem card={card} locale={locale} m={m} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// Everything from the store below (names, descriptions, winds) is rendered as text, never as markup.
function VentureItem({ card, locale, m }: { card: VentureCard; locale: Locale; m: Messages }) {
  const { venture, progress, market, winds, relatedNews } = card;
  const s = m.radar.ventures;
  const never = neverScored(market, winds);
  const percent = progress && progressPercent(progress.percent);
  const progressLabel = venture.progressGoal === "mvp" ? s.progressMvp : s.progressRelease;
  const tailwind = winds && inLocale(locale, winds.tailwindEn ?? "", winds.tailwindId ?? "");
  const headwind = winds && inLocale(locale, winds.headwindEn ?? "", winds.headwindId ?? "");
  return (
    <Card className="w-full">
      <CardContent className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className={cn("text-[17px] font-bold", wrap)}>{venture.name}</h3>
          <p className={cn("text-[#E2DDF0]", wrap)}>{inLocale(locale, venture.descriptionEn, venture.descriptionId)}</p>
        </div>
        {progress ? (
          <div data-venture-progress>
            <div className="flex justify-between gap-2 text-[13px]">
              <span className="font-semibold">{progressLabel}</span>
              <span className="font-mono">{percent}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={progressLabel}
              aria-valuenow={percent!}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15"
            >
              <span className="block h-2 bg-primary" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : (
          <p data-venture-progress="none" className="text-[13px] text-muted-foreground">
            {s.notConnected}
          </p>
        )}
        {never ? (
          <div data-venture-never className="rounded-lg bg-black/20 px-3 py-2.5">
            <p className="font-semibold">{m.state.never.title}</p>
            <p className="text-muted-foreground">{fill(m.state.never.body, { time: firstRunTime(locale) })}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <ScoreTile region="indonesia" label={s.oppId} view={market.indonesia} m={m} />
            <ScoreTile region="global" label={s.oppWorld} view={market.global} m={m} />
          </div>
        )}
        {(tailwind || headwind) && (
          <ul className="flex flex-col gap-1.5 text-[#E2DDF0]">
            {tailwind && (
              <li data-wind="tailwind" className={wrap}>
                <span className="font-semibold text-[#5EEAD4]">{s.tailwind}</span> · {tailwind}
              </li>
            )}
            {headwind && (
              <li data-wind="headwind" className={wrap}>
                <span className="font-semibold text-[#FDBA74]">{s.headwind}</span> · {headwind}
              </li>
            )}
          </ul>
        )}
        {!never && (
          <p data-venture-news className="text-xs text-muted-foreground">
            {relatedNews > 0 ? plural(relatedNews, s.related) : s.noNews}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreTile({ region, label, view, m }: { region: string; label: string; view: VentureCard["market"]["global"]; m: Messages }) {
  const score = view?.score ?? null;
  const change = score === null ? null : scoreChange(view!.delta, m.opp.trend);
  return (
    <div data-venture-score={region} className={tile}>
      <p className="text-xs text-muted-foreground">{label}</p>
      {score === null ? (
        <p className="text-xs text-muted-foreground">{m.venture.market.noScore}</p>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-2 font-mono">
          {/* The notation is for the eye; the screen reader gets "76 out of 100" (radar.ventures.scoreLabel). */}
          <span aria-hidden="true" className="flex items-baseline gap-x-2">
            <span className="text-[22px] font-medium text-primary">{score}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </span>
          <span className="sr-only">{fill(m.radar.ventures.scoreLabel, { score })}</span>
          {change && (
            <span
              data-trend={change.direction}
              className={cn("text-xs font-semibold", change.direction === "up" && "text-primary", change.direction === "down" && "text-destructive", change.direction === "flat" && "text-muted-foreground")}
            >
              {change.text}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function TopSection({
  items,
  total,
  counts,
  stale,
  locale,
  m,
}: {
  items: ListedOpportunity[];
  total: number;
  counts: Map<number, number>;
  stale: string | null;
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
      {stale && (
        <p role="status" className={staleClass}>
          {stale}
        </p>
      )}
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
            {/* Nothing to say when every citation is hidden (a switched-off source). */}
            {citations > 0 && <span className="text-xs text-muted-foreground">{plural(citations, m.radar.top.basedOn)}</span>}
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
              <span className="sr-only"> ({m.news.item.openExternal})</span>
            </span>
          </a>
        ) : (
          <span className={cn("py-2.5 text-[15px] font-semibold", wrap)}>{article.headline}</span>
        )}
        {why && (
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <WhyLabel label={m.news.why} ai={m.news.whyAi} aiSr={m.news.whyAiSr} />
            <p className={cn("min-w-0 text-[#E2DDF0]", wrap)}>{why}</p>
          </div>
        )}
        {/* Plain text, nothing when only closed opportunities cite it. */}
        {article.openCount > 0 && (
          <p className="text-xs text-muted-foreground">{plural(article.openCount, m.radar.news.linked)}</p>
        )}
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

function MarketSection({ rows, staleLine, m }: { rows: MarketRowView[]; staleLine: string | null; m: Messages }) {
  return (
    <section aria-labelledby="radar-market">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 id="radar-market" className={h2}>
            {m.radar.market.title}
          </h2>
          {staleLine && (
            <p role="status" className={staleClass}>
              {staleLine}
            </p>
          )}
          <ul>
            {rows.map((row) => (
              <li key={row.slug} data-market={row.slug}>
                <MarketItem row={row} m={m} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

function MarketItem({ row, m }: { row: MarketRowView; m: Messages }) {
  const change = row.change;
  const tone = change?.direction === "up" ? "text-primary" : change?.direction === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#4B3E75] py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{row.name}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span data-market-price className="font-mono text-[13px]">
            {row.price}
          </span>
          {row.synthetic && <SampleBadge label={m.sample.badge} />}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span data-market-asof>{row.asOf}</span>
          {row.stale && <span className="font-semibold text-foreground">{m.radar.market.stale}</span>}
        </span>
      </div>
      {/* On a phone the sparkline drops below the price and change (copy.md §11). */}
      {row.points && (
        <div className="shrink-0 max-sm:order-last max-sm:basis-full">
          <svg viewBox="0 0 96 28" aria-hidden="true" data-market-spark className="h-7 w-24">
            <polyline points={row.points} fill="none" strokeWidth={1.5} className={cn("stroke-current", tone)} />
          </svg>
          {row.trend && <span className="sr-only">{row.trend}</span>}
        </div>
      )}
      {/* The arrow and number are for the eye; the screen reader gets "up 1.2%" instead. */}
      <span data-market-change={change?.direction ?? "none"} className={cn("w-16 shrink-0 text-right font-mono text-[13px] font-medium", tone)}>
        {change ? (
          <>
            <span aria-hidden="true">
              {change.arrow} {change.text}
            </span>
            <span className="sr-only">{change.label}</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">{m.radar.market.noChange}</span>
          </>
        )}
      </span>
    </div>
  );
}
