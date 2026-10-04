"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/locales";
import { focusRing } from "./focus-ring";

type Item = { section: string; label: string };

export function MainNav({ locale, label, items }: { locale: Locale; label: string; items: Item[] }) {
  // "/en/invest/gold" → "invest"; "/en" → "" (the Radar).
  const current = usePathname().split("/")[2] ?? "";

  return (
    <nav aria-label={label} className="flex flex-1 flex-wrap gap-1 max-sm:basis-full">
      {items.map((item) => (
        <Link
          key={item.section}
          href={item.section ? `/${locale}/${item.section}` : `/${locale}`}
          aria-current={item.section === current ? "page" : undefined}
          className={`px-2.5 py-3 font-medium text-muted-foreground sm:px-3 hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-semibold aria-[current=page]:text-foreground ${focusRing}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
