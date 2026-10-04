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
    const url = request.nextUrl.clone();
    url.pathname = canonical; // the query string stays
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

// The start page and any path that starts with two letters (a possible locale).
// Static files, /_next and /api never pass through here.
export const config = { matcher: ["/", "/:locale([a-zA-Z]{2})", "/:locale([a-zA-Z]{2})/:path*"] };
