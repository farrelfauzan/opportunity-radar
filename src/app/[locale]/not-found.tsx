import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { focusRing } from "@/components/focus-ring";
import { currentLocale, getT } from "@/i18n/dictionaries";

export default async function NotFound() {
  const locale = await currentLocale();
  const t = getT(locale);

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">{t("notFound.title")}</h1>
      <Card>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">{t("notFound.body")}</p>
          <Link href={`/${locale}`} className={`text-primary underline-offset-4 hover:underline ${focusRing}`}>
            {t("notFound.back")}
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
