import { NextResponse, type NextRequest } from "next/server";
import { canonicalLocalePath, defaultLocale, hasLocale, localeCookie } from "@/i18n/locales";

// "/" goes to the language the user last picked, or to English. The browser's
// Accept-Language is ignored on purpose (English is the default language).
// "/EN", "/Id/news" and other spellings in the wrong case go to the lowercase
// path before anything is rendered (OR-55: see canonicalLocalePath).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const picked = request.cookies.get(localeCookie)?.value;
    const locale = hasLocale(picked) ? picked : defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}`, request.url), 307);
  }

  const canonical = canonicalLocalePath(pathname);
  if (canonical) {
    // The query goes along. Next.js writes a space in it as "+" (the same query).
    return NextResponse.redirect(new URL(canonical + request.nextUrl.search, request.url), 308);
  }
  return NextResponse.next();
}

// Every page request: the first segment can be percent-encoded ("/%45N"), so it cannot be
// matched by its letters. /api, /_next and anything with a file extension never pass through here.
export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
