import type { Locale } from "./locales";

// The error boundary is a client component, so it cannot read the server-only
// dictionaries. These are the only strings kept outside them.
export const errorMessages: Record<Locale, { title: string; retry: string }> = {
  en: { title: "Something went wrong", retry: "Try again" },
  id: { title: "Terjadi kesalahan", retry: "Coba lagi" },
};
