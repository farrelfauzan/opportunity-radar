import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { currentLocale, getT } from "@/i18n/dictionaries";
import type { Messages } from "@/i18n/t";

/**
 * A screen that has no content yet: its title and the empty frame. Each
 * feature ticket replaces the page that uses this with the real screen.
 */
export function emptyScreen(screen: keyof Messages["screens"]) {
  async function generateMetadata(): Promise<Metadata> {
    const t = getT(await currentLocale());
    return { title: `${t(`screens.${screen}`)} · Opportunity Radar` };
  }

  async function Page() {
    const t = getT(await currentLocale());
    return (
      <>
        <h1 className="text-[26px] font-bold tracking-tight">{t(`screens.${screen}`)}</h1>
        <Card>
          <CardContent className="text-muted-foreground">{t("shell.empty")}</CardContent>
        </Card>
      </>
    );
  }

  return { generateMetadata, Page };
}
