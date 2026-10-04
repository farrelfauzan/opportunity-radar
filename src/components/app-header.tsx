import Link from "next/link";
import { getT } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { focusRing } from "./focus-ring";
import { LanguageSwitch } from "./language-switch";
import { MainNav } from "./main-nav";

export function AppHeader({ locale }: { locale: Locale }) {
  const t = getT(locale);
  // The first URL segment after the locale; "" is the Radar (home).
  const items = [
    { section: "", label: t("screens.radar") },
    { section: "opportunities", label: t("screens.opportunities") },
    { section: "news", label: t("screens.news") },
    { section: "invest", label: t("screens.invest") },
    { section: "calculators", label: t("screens.calculators") },
  ];

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-glass-border bg-white/6 px-[clamp(16px,3vw,32px)] py-2 backdrop-blur-[18px]">
      <Link href={`/${locale}`} className={`flex items-center gap-2 py-2.5 text-base font-bold ${focusRing}`}>
        <svg
          viewBox="0 0 24 24"
          className="size-[22px] fill-none stroke-primary stroke-2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 12 L19 5" />
        </svg>
        Opportunity Radar
      </Link>
      <MainNav locale={locale} label={t("shell.mainNav")} items={items} />
      <LanguageSwitch locale={locale} label={t("shell.language")} />
    </header>
  );
}
