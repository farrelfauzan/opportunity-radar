import type { Metadata } from "next";
import { currentLocale, getT } from "@/i18n/dictionaries";
import { parseOpportunityQuery } from "@/lib/opportunities/query";
import { OpportunitiesScreen } from "../screen";

// Rendered per request: reading searchParams keeps the page out of every cache,
// so a newly stored score shows on the next reload.

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await currentLocale());
  return { title: t("page.documentTitle", { page: t("page.title.opportunities") }) };
}

export default async function OpportunitiesPage({ searchParams }: PageProps<"/[locale]/opportunities">) {
  return <OpportunitiesScreen query={parseOpportunityQuery(await searchParams)} />;
}
