import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditLine } from "@/components/credit-line";
import { focusRing } from "@/components/focus-ring";
import { Evidence, FactorBars } from "@/components/opportunity-detail";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreDelta } from "@/components/venture-score";
import { WhyLabel } from "@/components/why-label";
import { currentLocale, getMessages, getT } from "@/i18n/dictionaries";
import { formatRelativeTime, formatTimeWib } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { categoryLabel, safeHref } from "@/lib/news/view";
import { inLocale } from "@/lib/opportunities/view";
import { firstRunTime, sectionStale } from "@/lib/radar/view";
import {
  neverScored,
  NEWS_PAGE_SIZE,
  parseShown,
  progressPercent,
  progressSentence,
  progressSourceName,
  scoreAsOf,
  seriesView,
  ventureHref,
} from "@/lib/ventures/view";
import { cn } from "@/lib/utils";
import { getVentureView, lastSuccessfulRun, type Impact, type RelatedArticle, type VentureView } from "@/server/data";

// Rendered per request (searchParams, and the page reads the store). Not wrapped in a loading boundary: the
// response is not streamed, so an unknown slug is answered with HTTP 404 (as the opportunity detail does).

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await currentLocale());
  return { title: t("page.documentTitle", { page: t("page.title.radar") }) };
}

const heading = "text-[26px] font-bold tracking-tight";
const h2 = "text-base font-semibold";
// Every text below (names, descriptions, winds, headlines, why) is rendered as text, never as markup.
const wrap = "[overflow-wrap:anywhere]";
const staleClass = "rounded-lg border border-glass-border bg-white/8 px-4 py-3 text-foreground";
const link = `rounded-sm hover:underline ${focusRing}`;

// The impact is a word first; the colours (design: News.dc.html) only back it up.
const impactStyle = {
  opportunity: "bg-[#1D4B48] text-[#5EEAD4]",
  risk: "bg-[#5A3320] text-[#FDBA74]",
  context: "bg-[#4B3E75] text-[#E2DDF0]",
} as const satisfies Record<Impact, string>;

export default async function VenturePage({ params, searchParams }: PageProps<"/[locale]/ventures/[slug]">) {
  const locale = await currentLocale();
  const m = getMessages(locale);
  const { slug } = await params;
  const shown = parseShown((await searchParams).shown);
  const now = new Date();

  let data;
  try {
    data = await Promise.all([getVentureView(slug, shown, now), lastSuccessfulRun("ventures")]);
  } catch (error) {
    // The details stay in the server log; the page shows no host, port or message.
    console.error("Venture view: cannot read the store", error);
    return (
      <>
        <BackLink locale={locale} m={m} />
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-base font-semibold">{m.state.error.title}</p>
            <p className="text-muted-foreground">{m.state.error.body}</p>
            <a href={ventureHref(locale, slug, shown)} className={buttonVariants()}>
              {m.state.error.retry}
            </a>
          </CardContent>
        </Card>
      </>
    );
  }

  const [view, venturesRun] = data;
  if (!view) notFound();

  const { venture } = view.card;
  const stale = sectionStale(venturesRun, now, locale, m.state.stale, "ventures");
  const never = neverScored(view.card.market, view.card.winds);

  return (
    <>
      <BackLink locale={locale} m={m} />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className={cn(heading, wrap)}>{venture.name}</h1>
        <p className={cn("text-[15px] text-[#E2DDF0]", wrap)}>{inLocale(locale, venture.descriptionEn, venture.descriptionId)}</p>
      </div>
      {stale && (
        <p role="status" className={staleClass}>
          {stale}
        </p>
      )}
      <ProgressSection view={view} locale={locale} m={m} />
      <MarketSection view={view} never={never} now={now} locale={locale} m={m} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <WindsSection view={view} never={never} now={now} locale={locale} m={m} />
        <NewsSection view={view} never={never} shown={shown} now={now} locale={locale} m={m} />
      </div>
    </>
  );
}

function BackLink({ locale, m }: { locale: Locale; m: Messages }) {
  return (
    <Link href={`/${locale}`} className={cn("inline-flex min-h-11 w-fit items-center text-primary underline-offset-4 hover:underline", focusRing)}>
      {m.venture.back}
    </Link>
  );
}

function NeverCard({ locale, m }: { locale: Locale; m: Messages }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-base font-semibold">{m.state.never.title}</p>
        <p className="text-muted-foreground">{fill(m.state.never.body, { time: firstRunTime(locale) })}</p>
      </CardContent>
    </Card>
  );
}

function ProgressSection({ view, locale, m }: { view: VentureView; locale: Locale; m: Messages }) {
  const { venture, progress } = view.card;
  const s = m.venture.progress;
  const label = venture.progressGoal === "mvp" ? m.radar.ventures.progressMvp : m.radar.ventures.progressRelease;
  const percent = progress && progressPercent(progress.percent);
  const sentence = progress && progressSentence(progress, s);
  const source = venture.progressSource && progressSourceName[venture.progressSource];
  return (
    <section aria-labelledby="venture-progress">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 id="venture-progress" className={h2}>
            {s.title}
          </h2>
          {progress ? (
            <div data-venture-progress className="flex flex-col gap-2">
              <div className="flex justify-between gap-2 text-[13px]">
                <span className="font-semibold">{label}</span>
                <span className="font-mono">{percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label={label}
                aria-valuenow={percent!}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 overflow-hidden rounded-full bg-white/15"
              >
                <span className="block h-2 bg-primary" style={{ width: `${percent}%` }} />
              </div>
              {sentence && <p className={cn("text-[#E2DDF0]", wrap)}>{sentence}</p>}
              {source && (
                <p className="text-xs text-muted-foreground">{fill(s.source, { source, time: formatTimeWib(progress.fetchedAt, locale) })}</p>
              )}
            </div>
          ) : (
            <div data-venture-progress="none" className="flex flex-col gap-1">
              <p className="font-semibold">{m.radar.ventures.notConnected}</p>
              <p className="text-muted-foreground">{s.notConnectedBody}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function MarketSection({ view, never, now, locale, m }: { view: VentureView; never: boolean; now: Date; locale: Locale; m: Messages }) {
  const s = m.venture.market;
  return (
    <section aria-labelledby="venture-market" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="venture-market" className={h2}>
          {s.title}
        </h2>
        <span className="text-xs text-muted-foreground">{s.subtitle}</span>
      </div>
      {never ? (
        <div data-venture-never>
          <NeverCard locale={locale} m={m} />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4">
          <RegionCard region="indonesia" label={m.radar.ventures.oppId} view={view} now={now} locale={locale} m={m} />
          <RegionCard region="global" label={m.radar.ventures.oppWorld} view={view} now={now} locale={locale} m={m} />
        </div>
      )}
    </section>
  );
}

function RegionCard({ region, label, view, now, locale, m }: { region: "indonesia" | "global"; label: string; view: VentureView; now: Date; locale: Locale; m: Messages }) {
  const row = view.card.market[region];
  const score = row?.score ?? null;
  const line = seriesView(view.series[region], m.venture.market);
  const asOf = row && scoreAsOf(row.day, now, locale, m.radar.ventures.scoreAsOf);
  return (
    <Card data-venture-score={region}>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        {row === null || score === null ? (
          <p className="text-muted-foreground">{m.venture.market.noScore}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono">
              {/* The notation is for the eye; the screen reader gets "76 out of 100" (radar.ventures.scoreLabel). */}
              <span aria-hidden="true" className="flex items-baseline gap-x-2">
                <span className="text-[34px] leading-none font-medium text-primary">{score}</span>
                <span className="text-xs text-muted-foreground">{m.venture.market.score}</span>
              </span>
              <span className="sr-only">{fill(m.radar.ventures.scoreLabel, { score })}</span>
              <ScoreDelta delta={row.delta} words m={m} />
              {asOf && (
                <span data-score-asof className="font-sans text-xs text-muted-foreground">
                  {asOf}
                </span>
              )}
            </div>
            <FactorBars score={row.factors} m={m} />
            {line && <TrendLine line={line} m={m} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TrendLine({ line, m }: { line: NonNullable<ReturnType<typeof seriesView>>; m: Messages }) {
  return (
    <div data-venture-line className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{m.opp.detail.trend30}</p>
      {/* The summary is the text of the line; the drawing itself is for the eye. */}
      <svg viewBox="0 0 96 28" preserveAspectRatio="none" aria-hidden="true" className="h-12 w-full text-primary">
        <polyline points={line.points} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-current" />
      </svg>
      <span className="sr-only">{line.summary}</span>
    </div>
  );
}

function WindsSection({ view, never, now, locale, m }: { view: VentureView; never: boolean; now: Date; locale: Locale; m: Messages }) {
  const { winds } = view.card;
  const pairs = winds
    ? ([
        { kind: "tailwind", label: m.radar.ventures.tailwind, tone: "text-[#5EEAD4]", text: inLocale(locale, winds.tailwindEn ?? "", winds.tailwindId ?? ""), ids: winds.tailwindArticleIds },
        { kind: "headwind", label: m.radar.ventures.headwind, tone: "text-[#FDBA74]", text: inLocale(locale, winds.headwindEn ?? "", winds.headwindId ?? ""), ids: winds.headwindArticleIds },
      ] as const).filter((pair) => pair.text)
    : [];
  // A venture scored without any wind (no related news that day) has nothing to say here.
  if (!never && pairs.length === 0) return null;
  return (
    <section aria-labelledby="venture-winds" className="flex min-w-0 flex-col gap-3">
      <h2 id="venture-winds" className={h2}>
        {m.venture.winds.title}
      </h2>
      {never ? (
        <div data-venture-never>
          <NeverCard locale={locale} m={m} />
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {pairs.map((pair) => (
            <li key={pair.kind} data-wind={pair.kind}>
              <Card>
                <CardContent className="flex min-w-0 flex-col gap-2">
                  <p className={wrap}>
                    <span className={cn("font-semibold", pair.tone)}>{pair.label}</span> · {pair.text}
                  </p>
                  <Evidence
                    id={`venture-${pair.kind}-evidence`}
                    title={m.venture.winds.evidence}
                    articles={[...view.windArticles.values()].filter((a) => pair.ids.includes(a.id))}
                    now={now}
                    locale={locale}
                    m={m}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewsSection({ view, never, shown, now, locale, m }: { view: VentureView; never: boolean; shown: number; now: Date; locale: Locale; m: Messages }) {
  const { venture, relatedNews } = view.card;
  return (
    <section aria-labelledby="venture-news" className="flex min-w-0 flex-col gap-3">
      <h2 id="venture-news" className={h2}>
        {m.venture.news.title}
      </h2>
      {never ? (
        <div data-venture-never>
          <NeverCard locale={locale} m={m} />
        </div>
      ) : view.news.length === 0 ? (
        <Card>
          <CardContent data-venture-news-empty className="text-muted-foreground">
            {m.venture.news.empty}
          </CardContent>
        </Card>
      ) : (
        <ol className="flex flex-col gap-3">
          {view.news.map((article) => (
            <li key={article.id}>
              <NewsItem article={article} now={now} locale={locale} m={m} />
            </li>
          ))}
        </ol>
      )}
      {!never && relatedNews > view.news.length && (
        <Link
          href={ventureHref(locale, venture.slug, shown + NEWS_PAGE_SIZE)}
          scroll={false}
          className={`${buttonVariants({ variant: "outline" })} h-11 self-start`}
        >
          {m.news.loadMore}
        </Link>
      )}
    </section>
  );
}

function NewsItem({ article, now, locale, m }: { article: RelatedArticle; now: Date; locale: Locale; m: Messages }) {
  const href = safeHref(article.link);
  const why = inLocale(locale, article.whyEn ?? "", article.whyId ?? "");
  return (
    <Card>
      <CardContent className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-semibold text-[#E2DDF0]">{m.news.cat[categoryLabel[article.category]]}</span>
          {article.impact && (
            <span className={`rounded-full px-2 py-0.5 font-semibold ${impactStyle[article.impact]}`}>{m.news.impact[article.impact]}</span>
          )}
        </div>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={cn(link, "text-base font-semibold", wrap)}>
            {article.headline}
            <span className="sr-only"> ({m.news.item.openExternal})</span>
          </a>
        ) : (
          <span className={cn("text-base font-semibold", wrap)}>{article.headline}</span>
        )}
        {why && (
          <div className="flex gap-2.5 rounded-lg bg-black/18 px-3 py-2.5">
            <WhyLabel label={m.news.why} ai={m.news.whyAi} aiSr={m.news.whyAiSr} />
            <span className={cn("min-w-0 text-[#E2DDF0]", wrap)}>{why}</span>
          </div>
        )}
        <span className={cn("text-xs text-muted-foreground", wrap)}>
          {fill(m.news.item.meta, {
            source: article.sourceName,
            ago: formatRelativeTime(article.publishedAt, now, locale, m.time),
            region: article.region === "indonesia" ? m.news.region.id : m.news.region.global,
          })}
        </span>
        <CreditLine sourceSlug={article.sourceSlug} strings={m.news.credit} />
      </CardContent>
    </Card>
  );
}
