import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentLocale, getT } from "@/i18n/dictionaries";
import { parseOpportunityId, parseOpportunityQuery } from "@/lib/opportunities/query";
import { OpportunitiesScreen } from "../screen";

// Not wrapped in a loading boundary (see (list)/loading.tsx): the response is not streamed,
// so an unknown or closed id is answered with HTTP 404.

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await currentLocale());
  return { title: t("page.documentTitle", { page: t("page.title.opportunities") }) };
}

export default async function OpportunityPage({ params, searchParams }: PageProps<"/[locale]/opportunities/[id]">) {
  const id = parseOpportunityId((await params).id);
  if (id === null) notFound();
  return <OpportunitiesScreen query={parseOpportunityQuery(await searchParams)} selectedId={id} />;
}
