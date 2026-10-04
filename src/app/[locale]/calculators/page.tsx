import type { Metadata } from "next";
import { currentLocale, getMessages, getT } from "@/i18n/dictionaries";
import { BusinessCalculator } from "./business-calculator";
import { InvestmentCalculator } from "./investment-calculator";

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await currentLocale());
  return { title: t("page.documentTitle", { page: t("calc.title") }) };
}

export default async function CalculatorsPage() {
  const locale = await currentLocale();
  const { calc } = getMessages(locale);

  return (
    <>
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">{calc.title}</h1>
        <p className="text-muted-foreground">{calc.intro}</p>
      </div>
      <InvestmentCalculator locale={locale} strings={calc.inv} errors={calc.err} units={calc.unit} beyond={calc.result.beyond} />
      <BusinessCalculator locale={locale} strings={calc.biz} errors={calc.err} units={calc.unit} beyond={calc.result.beyond} />
      <p className="text-xs text-muted-foreground">{calc.disclaimer}</p>
    </>
  );
}
