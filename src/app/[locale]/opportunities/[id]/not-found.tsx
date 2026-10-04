import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { focusRing } from "@/components/focus-ring";
import { currentLocale, getT } from "@/i18n/dictionaries";

// An unknown or closed opportunity. OR-18 refines the text for a closed one.
export default async function OpportunityNotFound() {
  const locale = await currentLocale();
  const t = getT(locale);

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">{t("page.title.opportunities")}</h1>
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">{t("opp.detail.closed")}</p>
          <Link href={`/${locale}/opportunities`} className={`text-primary underline-offset-4 hover:underline ${focusRing}`}>
            {t("opp.detail.back")}
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
