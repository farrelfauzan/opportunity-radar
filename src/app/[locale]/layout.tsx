import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getT } from "@/i18n/dictionaries";
import { hasLocale, locales } from "@/i18n/locales";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// /en and /id are prerendered; any other first segment hits notFound() below.
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return { title: "Opportunity Radar", description: getT(locale)("meta.description") };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-sm">
        <AppHeader locale={locale} />
        <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-[clamp(16px,3vw,32px)] pt-6 pb-12">
          {children}
        </main>
      </body>
    </html>
  );
}
