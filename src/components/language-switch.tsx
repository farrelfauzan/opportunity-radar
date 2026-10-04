"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { localeCookie, locales, type Locale } from "@/i18n/locales";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function LanguageSwitch({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  // Everything after the locale segment stays the same in the other language.
  const rest = usePathname().split("/").slice(2).join("/");

  return (
    <div role="group" aria-label={label} className="flex rounded-md border">
      {locales.map((target) => {
        const href = rest ? `/${target}/${rest}` : `/${target}`;
        return (
          <Link
            key={target}
            href={href}
            // Next 16.3.8 re-requests the prefetch of a link to the current path forever when the path holds %27
            // (OR-61); a language switch is a click, so nothing is lost without the prefetch.
            prefetch={false}
            aria-current={target === locale ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              // Remembered so "/" opens in this language next time.
              document.cookie = `${localeCookie}=${target}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
              router.push(href + window.location.search);
            }}
            className="rounded-[5px] p-3 text-xs font-semibold text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=true]:bg-foreground aria-[current=true]:text-background"
          >
            {target.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
