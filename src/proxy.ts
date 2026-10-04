import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, hasLocale, localeCookie } from "@/i18n/locales";

// "/" goes to the language the user last picked, or to English. The browser's
// Accept-Language is ignored on purpose (English is the default language).
export function proxy(request: NextRequest) {
  const picked = request.cookies.get(localeCookie)?.value;
  const locale = hasLocale(picked) ? picked : defaultLocale;
  return NextResponse.redirect(new URL(`/${locale}`, request.url), 307);
}

// Only the start page: static files, /_next, /api and unknown paths never pass through here.
export const config = { matcher: "/" };
