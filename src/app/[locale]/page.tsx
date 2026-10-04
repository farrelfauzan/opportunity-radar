import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getT } from "@/i18n/dictionaries";
import { formatRupiah } from "@/i18n/format";
import { hasLocale } from "@/i18n/locales";

// Placeholder start page: the target for the theme and language checks.
// OR-3 replaces it with the app shell.
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const t = getT(locale);

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-[clamp(16px,3vw,32px)] pt-6 pb-12">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{t("home.heading")}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p>{t("home.intro")}</p>
          <p className="text-muted-foreground">{t("home.note")}</p>
          <p className="font-mono text-2xl" data-testid="sample-number">
            {formatRupiah(1935000, locale)}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
