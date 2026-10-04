import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { currentLocale, getT } from "@/i18n/dictionaries";
import type { Messages } from "@/i18n/t";

/**
 * A screen that has no content yet: its title and the empty frame. Each
 * feature ticket replaces the page that uses this with the real screen.
 */
export function emptyScreen(screen: keyof Messages["page"]["title"]) {
  async function generateMetadata(): Promise<Metadata> {
    const t = getT(await currentLocale());
    return { title: t("page.documentTitle", { page: t(`page.title.${screen}`) }) };
  }

  async function Page() {
    const t = getT(await currentLocale());
    return (
      <>
        <h1 className="text-[26px] font-bold tracking-tight">{t(`page.title.${screen}`)}</h1>
        <Card>
          <CardContent className="text-muted-foreground">{t("page.emptyFrame")}</CardContent>
        </Card>
      </>
    );
  }

  return { generateMetadata, Page };
}
