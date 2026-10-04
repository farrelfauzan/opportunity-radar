import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { currentLocale, getMessages, getT } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { investHref, parseTerm } from "@/lib/invest/query";
import { neverIngested, PRICE_JOBS, watchlistView } from "@/lib/invest/view";
import { firstRunTime } from "@/lib/radar/view";
import { getWatchlist, lastSuccessfulRun, type SignalTerm } from "@/server/data";
import { RiskCards } from "./risk-cards";
import { WatchlistTable } from "./watchlist-table";

// Rendered per request: reading searchParams keeps the page out of every cache, so a new price shows on the next reload.

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await currentLocale());
  return { title: t("page.documentTitle", { page: t("page.title.invest") }) };
}

const heading = "text-[26px] font-bold tracking-tight";
const h2 = "text-base font-semibold";
const staleClass = "rounded-lg border border-glass-border bg-white/8 px-4 py-3 text-foreground";
// The toggle's two links: a segmented control, the current one filled (like the News chips).
const segment =
  "inline-flex min-h-11 items-center px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring aria-[current=true]:bg-foreground aria-[current=true]:text-background";

async function load() {
  const [rows, runs] = await Promise.all([
    getWatchlist(),
    // The last successful run of each job that feeds a price (several rows share one).
    Promise.all(PRICE_JOBS.map(async (job) => [job, await lastSuccessfulRun(job)] as const)).then(Object.fromEntries),
  ]);
  return { rows, runs };
}

export default async function InvestPage({ searchParams }: PageProps<"/[locale]/invest">) {
  const locale = await currentLocale();
  const m = getMessages(locale);
  const params = await searchParams;
  const term = parseTerm(params);
  const now = new Date();

  let data;
  try {
    data = await load();
  } catch (error) {
    // The details stay in the server log; the page shows no host, port or message.
    console.error("Investments: cannot read the store", error);
    return (
      <>
        <h1 className={heading}>{m.page.title.invest}</h1>
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-base font-semibold">{m.state.error.title}</p>
            <p className="text-muted-foreground">{m.state.error.body}</p>
            <a href={investHref(locale, params, term)} className={buttonVariants()}>
              {m.state.error.retry}
            </a>
          </CardContent>
        </Card>
      </>
    );
  }

  const never = neverIngested(data.rows);
  const watchlist = watchlistView(data.rows, data.runs, term, now, locale, m);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className={heading}>{m.page.title.invest}</h1>
          <p className="text-muted-foreground">{m.inv.intro}</p>
        </div>
        <TermToggle term={term} params={params} locale={locale} m={m} />
      </div>

      <section aria-labelledby="inv-classes" className="flex flex-col gap-3">
        <h2 id="inv-classes" className={h2}>
          {m.inv.classes.title}
        </h2>
        <RiskCards term={term} m={m} />
      </section>

      <section aria-labelledby="inv-watchlist">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h2 id="inv-watchlist" className={h2}>
              {m.inv.watchlist.title[term]}
            </h2>
            {never ? (
              <div data-never className="flex flex-col gap-1">
                <p className="text-base font-semibold">{m.state.never.title}</p>
                <p className="text-muted-foreground">{fill(m.state.never.body, { time: firstRunTime(locale) })}</p>
              </div>
            ) : (
              <>
                {watchlist.staleLine && (
                  <p role="status" className={staleClass}>
                    {watchlist.staleLine}
                  </p>
                )}
                {watchlist.anySynthetic && (
                  <div data-sample-note className="flex flex-col gap-0.5">
                    <p aria-describedby="inv-sample-explain" className="font-semibold">
                      {m.sample.label}
                    </p>
                    <p id="inv-sample-explain" className="text-xs text-muted-foreground">
                      {m.sample.explain}
                    </p>
                  </div>
                )}
                <WatchlistTable rows={watchlist.rows} titleId="inv-watchlist" describedBy={watchlist.anySynthetic ? "inv-sample-explain" : undefined} m={m} />
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <p data-disclaimer className="text-xs text-muted-foreground">
        {m.inv.disclaimer}
      </p>
    </>
  );
}

/** Two links, so it works without scripts; the URL holds the term and the other query values stay. */
function TermToggle({ term, params, locale, m }: { term: SignalTerm; params: Record<string, string | string[] | undefined>; locale: Locale; m: Messages }) {
  const items = [
    ["short", m.inv.term.short],
    ["long", m.inv.term.long],
  ] as const;
  return (
    <div data-term-toggle className="flex overflow-hidden rounded-md border border-[#65578F]">
      {items.map(([value, label]) => (
        <Link key={value} href={investHref(locale, params, value)} aria-current={term === value ? "true" : undefined} className={segment}>
          {label}
        </Link>
      ))}
    </div>
  );
}
