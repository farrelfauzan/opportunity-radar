import Link from "next/link";
import { notFound } from "next/navigation";
import { focusRing } from "@/components/focus-ring";
import { OpportunityPanel } from "@/components/opportunity-detail";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentLocale, getMessages } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { cn } from "@/lib/utils";
import {
  isFiltered,
  opportunitiesHref,
  type OpportunityQuery,
} from "@/lib/opportunities/query";
import {
  horizonKey,
  inLocale,
  isNeverScored,
  opportunityMeta,
  staleBanner,
  trendText,
} from "@/lib/opportunities/view";
import {
  CAPITAL_LEVELS,
  getOpportunity,
  HORIZONS,
  lastScoringRun,
  listOpportunities,
  listOpportunityEvidence,
  SECTORS,
  type ListedOpportunity,
} from "@/server/data";
import { FilterSelect } from "./filter-select";

const heading = "text-[26px] font-bold tracking-tight";

async function load(query: OpportunityQuery, selectedId: number | undefined) {
  const filtered = isFiltered(query);
  const open = listOpportunities({});
  const [all, list, lastRun, named, namedEvidence] = await Promise.all([
    open,
    filtered ? listOpportunities(query) : open,
    lastScoringRun(),
    selectedId === undefined ? null : getOpportunity(selectedId),
    selectedId === undefined ? [] : listOpportunityEvidence(selectedId),
  ]);
  if (selectedId !== undefined) return { all, list, lastRun, picked: named, evidence: namedEvidence };
  // On the list route the first of the list is shown beside it: read its detail and evidence.
  const first = list[0];
  const [picked, evidence] = first
    ? await Promise.all([getOpportunity(first.id), listOpportunityEvidence(first.id)])
    : [null, []];
  return { all, list, lastRun, picked, evidence };
}

/**
 * The Opportunities screen. On a desktop the list sits beside the selected opportunity
 * (the first of the list unless `selectedId` says otherwise); on a phone the list route
 * shows the list only and the detail route (`selectedId`) shows the detail only.
 */
export async function OpportunitiesScreen({
  query,
  selectedId,
}: {
  query: OpportunityQuery;
  selectedId?: number;
}) {
  const locale = await currentLocale();
  const m = getMessages(locale);
  const now = new Date();
  const detail = selectedId !== undefined;

  let data;
  try {
    data = await load(query, selectedId);
  } catch (error) {
    // The details stay in the server log; the page shows no host, port or message.
    console.error("Opportunities: cannot read the store", error);
    return (
      <>
        <h1 className={heading}>{m.page.title.opportunities}</h1>
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-base font-semibold">{m.state.error.title}</p>
            <p className="text-muted-foreground">{m.state.error.body}</p>
            <a href={opportunitiesHref(locale, query, selectedId)} className={buttonVariants()}>
              {m.state.error.retry}
            </a>
          </CardContent>
        </Card>
      </>
    );
  }

  const { all, list, lastRun, picked, evidence } = data;
  // An unknown or closed id is a 404 (the page is not streamed, so the status is real).
  if (detail && (!picked || picked.status !== "open")) notFound();
  const selected = picked;

  if (isNeverScored(lastRun, all.length)) {
    return (
      <>
        <h1 className={heading}>{m.page.title.opportunities}</h1>
        <Card>
          <CardContent className="font-semibold">{m.opp.never}</CardContent>
        </Card>
      </>
    );
  }

  const banner = staleBanner(lastRun, now, locale, m.state.stale);
  // The filters, each option linking to the list with the other filters kept.
  const href = (change: Partial<OpportunityQuery>) => opportunitiesHref(locale, { ...query, ...change });
  const filters = [
    {
      key: "region",
      label: m.opp.filter.region.label,
      value: query.region ?? "all",
      options: [
        { value: "all", label: m.opp.filter.region.all, href: href({ region: undefined }) },
        { value: "indonesia", label: m.opp.filter.region.id, href: href({ region: "indonesia" }) },
        { value: "global", label: m.opp.filter.region.global, href: href({ region: "global" }) },
      ],
    },
    {
      key: "sector",
      label: m.opp.filter.sector.label,
      value: query.sector ?? "all",
      options: [
        { value: "all", label: m.opp.filter.sector.all, href: href({ sector: undefined }) },
        ...SECTORS.map((sector) => ({ value: sector, label: m.opp.sector[sector], href: href({ sector }) })),
      ],
    },
    {
      key: "horizon",
      label: m.opp.filter.horizon,
      value: query.horizon ?? "all",
      options: [
        { value: "all", label: m.opp.filter.any, href: href({ horizon: undefined }) },
        ...HORIZONS.map((horizon) => ({
          value: horizon,
          label: m.opp.horizon[horizonKey[horizon]],
          href: href({ horizon }),
        })),
      ],
    },
    {
      key: "capital",
      label: m.opp.filter.capital,
      value: query.capital ?? "all",
      options: [
        { value: "all", label: m.opp.filter.any, href: href({ capital: undefined }) },
        ...CAPITAL_LEVELS.map((capital) => ({ value: capital, label: m.opp.capital[capital], href: href({ capital }) })),
      ],
    },
  ];

  return (
    <>
      {/* On a phone the detail is a view of its own: no summary, no filters, only a back link. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={heading}>{m.page.title.opportunities}</h1>
        <p className={cn("text-muted-foreground", detail && "hidden lg:block")}>{fill(m.opp.summary, { n: all.length })}</p>
      </div>

      {banner && (
        <p role="status" className="rounded-lg border border-glass-border bg-white/8 px-4 py-3 text-foreground">
          {banner}
        </p>
      )}

      <div className={cn("flex-wrap items-center gap-x-6 gap-y-2", detail ? "hidden lg:flex" : "flex")}>
        {filters.map(({ key, ...filter }) => (
          <FilterSelect key={key} {...filter} />
        ))}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className={cn("min-w-0 flex-col gap-2 lg:w-[360px] lg:shrink-0", detail ? "hidden lg:flex" : "flex")}>
          {list.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground">{m.opp.empty}</CardContent>
            </Card>
          ) : (
            <ol aria-label={m.page.title.opportunities} className="flex flex-col gap-2">
              {list.map((item) => (
                <li key={item.id}>
                  <Item
                    item={item}
                    selected={item.id === selected?.id}
                    current={detail && item.id === selected?.id}
                    query={query}
                    locale={locale}
                    m={m}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>

        {selected && (
          <article className={cn("min-w-0 flex-1 flex-col gap-4", detail ? "flex" : "hidden lg:flex")}>
            <Card>
              <CardContent className="flex flex-col gap-4">
                <Link
                  href={opportunitiesHref(locale, query)}
                  className={`self-start text-primary underline-offset-4 hover:underline lg:hidden ${focusRing}`}
                >
                  {m.opp.detail.back}
                </Link>
                <OpportunityPanel item={selected} evidence={evidence} locale={locale} m={m} now={now} />
              </CardContent>
            </Card>
          </article>
        )}
      </div>
    </>
  );
}

// Every opportunity text below is rendered as text, never as markup.
function Item({
  item,
  selected,
  current,
  query,
  locale,
  m,
}: {
  item: ListedOpportunity;
  /** Shown beside the list (the first item by default on a desktop): a visual mark, from lg up only. */
  selected: boolean;
  /** The URL names this opportunity: the page really is about it, so assistive technology is told. */
  current: boolean;
  query: OpportunityQuery;
  locale: Locale;
  m: Messages;
}) {
  const trend = trendText(item.trend, m.opp.trend);

  return (
    <Link
      href={opportunitiesHref(locale, query, item.id)}
      aria-current={current ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      className={cn(
        // The selection is marked from lg up only: on a phone the list is shown without a detail beside it.
        "flex items-center gap-3 rounded-lg border border-glass-border bg-card px-4 py-3 shadow-glass backdrop-blur-[18px] lg:data-[selected=true]:border-foreground lg:data-[selected=true]:ring-1 lg:data-[selected=true]:ring-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <span className="w-10 shrink-0 font-mono text-xl font-medium text-primary">{item.currentScore}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold [overflow-wrap:anywhere]">{inLocale(locale, item.titleEn, item.titleId)}</span>
        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{opportunityMeta(item, m)}</span>
      </span>
      <span
        data-trend={trend.direction}
        className={cn(
          "shrink-0 text-xs font-semibold",
          trend.direction === "up" && "text-primary",
          trend.direction === "down" && "text-destructive",
          (trend.direction === "flat" || trend.direction === "new") && "text-muted-foreground",
        )}
      >
        {trend.text}
      </span>
    </Link>
  );
}
