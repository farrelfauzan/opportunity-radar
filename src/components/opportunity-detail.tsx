import type { ReactNode } from "react";
import { CreditLine } from "@/components/credit-line";
import { formatRelativeTime } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { safeHref } from "@/lib/news/view";
import { barPercent, factorRows, inLocale, opportunityMeta, trendText } from "@/lib/opportunities/view";
import type { ArticleWithSource, OpportunityDetail } from "@/server/data";
import { cn } from "@/lib/utils";

// Every text below (the opportunity's and the articles') is rendered as text, never as markup.
const wrap = "[overflow-wrap:anywhere]";
const h3 = "text-sm font-semibold";

/** A titled section. Used for every part of the detail so a part without content can leave out its title. */
function Section({ id, title, className, children }: { id: string; title: string; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-2", className)}>
      <h3 id={id} className={h3}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A list of texts under its title; renders nothing at all (no title either) when the list is empty. */
export function TextList({ id, title, items, ordered }: { id: string; title: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <Section id={id} title={title} className="flex-[1_1_280px]">
      <List className={cn("flex flex-col gap-1.5 pl-[18px] text-[#E2DDF0]", ordered ? "list-decimal" : "list-disc")}>
        {items.map((text, index) => (
          <li key={index} className={wrap}>
            {text}
          </li>
        ))}
      </List>
    </Section>
  );
}

/** Five bars, each with its number printed beside it: the number, not the colour, carries the value. */
export function ScoreBreakdown({ score, m }: { score: OpportunityDetail["latestScore"]; m: Messages }) {
  const rows = factorRows(score);
  if (rows.length === 0) return null;
  return (
    <Section id="opp-breakdown" title={m.opp.detail.breakdown} className="flex-[1_1_280px]">
      <ul className="flex flex-col gap-2.5">
        {rows.map(({ factor, value }) => (
          <li key={factor} className="flex items-center gap-3">
            <span className={cn("w-[132px] shrink-0 text-[#E2DDF0]", wrap)}>{m.opp.factor[factor]}</span>
            <span
              role="meter"
              aria-label={m.opp.factor[factor]}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value}
              className="block h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-[#4B3E75]"
            >
              <span className="block h-2 bg-primary" style={{ width: `${barPercent(value)}%` }} />
            </span>
            <span className="w-7 shrink-0 text-right font-mono text-[13px]">{value}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{m.opp.detail.breakdownNote}</p>
      <p className="text-xs text-muted-foreground">{m.opp.detail.aiNote}</p>
    </Section>
  );
}

function QuickFacts({ item, locale, m }: { item: OpportunityDetail; locale: Locale; m: Messages }) {
  const trend = trendText(item.trend, m.opp.trend);
  const reason = inLocale(locale, item.capitalReasonEn, item.capitalReasonId);
  return (
    <Section id="opp-facts" title={m.opp.detail.facts} className="flex-[1_1_280px]">
      <dl className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        <dt className="text-muted-foreground">{m.opp.detail.capital}</dt>
        <dd className={wrap}>{`${m.opp.capital[item.capitalLevel]} (${reason})`}</dd>
        <dt className="text-muted-foreground">{m.opp.detail.buyer}</dt>
        <dd className={wrap}>{inLocale(locale, item.buyerEn, item.buyerId)}</dd>
        <dt className="text-muted-foreground">{m.opp.detail.model}</dt>
        <dd className={wrap}>{inLocale(locale, item.modelEn, item.modelId)}</dd>
        <dt className="text-muted-foreground">{m.opp.detail.trend30}</dt>
        <dd
          data-trend={trend.direction}
          className={cn(
            "font-semibold",
            trend.direction === "up" && "text-primary",
            trend.direction === "down" && "text-destructive",
            (trend.direction === "flat" || trend.direction === "new") && "text-muted-foreground",
          )}
        >
          {trend.text}
        </dd>
      </dl>
    </Section>
  );
}

/** The cited articles, newest first (the store read gives that order). Nothing to show leaves the section out. */
export function Evidence({
  articles,
  now,
  locale,
  m,
}: {
  articles: ArticleWithSource[];
  now: Date;
  locale: Locale;
  m: Messages;
}) {
  if (articles.length === 0) return null;
  return (
    <Section id="opp-evidence" title={m.opp.detail.evidence}>
      <ul className="flex flex-col gap-2">
        {articles.map((article) => {
          const href = safeHref(article.link);
          return (
            <li key={article.id} className="flex min-w-0 flex-col gap-1 rounded-lg border border-[#4B3E75] px-3 py-2.5">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    wrap,
                  )}
                >
                  {article.headline}
                  <span className="sr-only">. {m.news.item.openExternal}</span>
                </a>
              ) : (
                <span className={cn("font-medium", wrap)}>{article.headline}</span>
              )}
              <span className={cn("text-xs text-muted-foreground", wrap)}>
                {fill(m.opp.detail.evidenceMeta, {
                  source: article.sourceName,
                  ago: formatRelativeTime(article.publishedAt, now, locale, m.time),
                })}
              </span>
              <CreditLine sourceSlug={article.sourceSlug} strings={m.news.credit} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The whole detail of one opportunity (everything but the back link). */
export function OpportunityPanel({
  item,
  evidence,
  locale,
  m,
  now,
}: {
  item: OpportunityDetail;
  /** Already filtered to visible sources, newest first: listOpportunityEvidence. */
  evidence: ArticleWithSource[];
  locale: Locale;
  m: Messages;
  now: Date;
}) {
  const related = inLocale(locale, item.relatedExposureEn ?? "", item.relatedExposureId ?? "");
  const risks = locale === "id" ? item.risksId : item.risksEn;
  const steps = locale === "id" ? item.firstStepsId : item.firstStepsEn;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-[1_1_320px]">
          <p className={cn("text-xs text-muted-foreground", wrap)}>{opportunityMeta(item, m)}</p>
          <h2 className={cn("mt-1 text-[22px] font-bold tracking-tight", wrap)}>
            {inLocale(locale, item.titleEn, item.titleId)}
          </h2>
        </div>
        <div className="shrink-0">
          <p className="font-mono text-[34px] leading-none font-medium text-primary">{item.currentScore}</p>
          <p className="text-xs text-muted-foreground">{m.opp.detail.score}</p>
        </div>
      </div>
      <p className={cn("text-[15px]", wrap)}>{inLocale(locale, item.thesisEn, item.thesisId)}</p>

      <div className="flex flex-wrap gap-6">
        <ScoreBreakdown score={item.latestScore} m={m} />
        <QuickFacts item={item} locale={locale} m={m} />
      </div>

      <Evidence articles={evidence} now={now} locale={locale} m={m} />

      <div className="flex flex-wrap gap-6">
        <TextList id="opp-risks" title={m.opp.detail.risks} items={risks} />
        <TextList id="opp-steps" title={m.opp.detail.steps} items={steps} ordered />
      </div>

      {related && <p className={cn("text-muted-foreground", wrap)}>{fill(m.opp.detail.related, { text: related })}</p>}
    </>
  );
}
