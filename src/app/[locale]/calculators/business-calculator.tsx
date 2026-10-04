"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatRupiah, formatRupiahCompact } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { projectBusiness, type BusinessInput } from "@/lib/calculators/business";
import type { NumberRange } from "@/lib/calculators/number-input";
import { NumberField, ResultCard, useNumberFields } from "./calculator-parts";

type Field = keyof BusinessInput;
type Strings = Messages["calc"]["biz"];

const defaults: BusinessInput = {
  capital: 150_000_000,
  fixed: 25_000_000,
  revenue: 15_000_000,
  growth: 8,
  margin: 60,
  months: 36,
};

const ranges: Record<Field, NumberRange> = {
  capital: { min: 0, max: 1e13 },
  fixed: { min: 0, max: 1e13 },
  revenue: { min: 0, max: 1e13 },
  growth: { min: -50, max: 100 },
  margin: { min: 0, max: 100 },
  months: { min: 6, max: 120, integer: true },
};

export function BusinessCalculator({
  locale,
  strings,
  errors,
  units,
}: {
  locale: Locale;
  strings: Strings;
  errors: Messages["calc"]["err"];
  units: Messages["calc"]["unit"];
}) {
  const { fields, texts, valid, checks, anyInvalid, update } = useNumberFields(defaults, ranges, locale);

  const result = useMemo(() => projectBusiness(valid), [valid]);
  const data = useMemo(() => result.cash.map((cash) => ({ cash })), [result]);

  const chartConfig: ChartConfig = { cash: { label: strings.chartLabel, color: "var(--chart-1)" } };
  const plural = valid.months === 1 ? "one" : "other";
  const monthText = (month: number | null) =>
    month === null
      ? fill(strings.notWithin[plural], { months: valid.months })
      : fill(strings.month, { n: month });

  return (
    <Card className="gap-4 px-4 py-5 sm:px-6">
      <h2 className="text-lg font-bold">{strings.title}</h2>

      <div className="flex flex-wrap gap-6">
        <div className="grid min-w-0 flex-[1_1_300px] grid-cols-2 content-start gap-3">
          {fields.map((f) => (
            <NumberField
              key={f}
              name={f}
              label={strings[f]}
              value={texts[f]}
              onChange={(value) => update({ [f]: value })}
              check={checks[f]}
              range={ranges[f]}
              locale={locale}
              errors={errors}
            />
          ))}
        </div>

        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-3">
          <p role="status" className="text-xs text-destructive empty:hidden">
            {anyInvalid ? errors.keptPrevious : null}
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <ResultCard
              testId="biz-breakeven"
              label={strings.breakeven}
              value={monthText(result.breakEven)}
              valueClassName="text-primary"
            />
            <ResultCard
              testId="biz-payback"
              label={strings.payback}
              value={monthText(result.payback)}
              valueClassName="text-primary"
            />
            <ResultCard
              testId="biz-lowest"
              label={strings.lowest}
              value={formatRupiahCompact(result.lowest, locale, units)}
              exact={formatRupiah(result.lowest, locale)}
              valueClassName="text-chart-2"
            />
            <ResultCard
              testId="biz-end"
              label={fill(strings.end[plural], { months: valid.months })}
              value={formatRupiahCompact(result.end, locale, units)}
              exact={formatRupiah(result.end, locale)}
            />
          </div>

          <ChartContainer
            config={chartConfig}
            role="img"
            aria-label={strings.chartLabel}
            className="aspect-auto h-[220px] w-full"
          >
            <LineChart data={data} accessibilityLayer={false} margin={{ top: 8, right: 2, bottom: 8, left: 2 }}>
              <CartesianGrid vertical={false} stroke="var(--glass-border)" />
              {/* Zero is always inside the plot, so the dashed line is always drawn. */}
              <YAxis
                hide
                domain={[(dataMin: number) => Math.min(dataMin, 0), (dataMax: number) => Math.max(dataMax, 0)]}
              />
              <ReferenceLine y={0} stroke="var(--chart-4)" strokeDasharray="4 4" />
              <Line
                dataKey="cash"
                type="linear"
                stroke="var(--color-cash)"
                strokeWidth={3}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{strings.axisStart}</span>
            <span>{strings.paybackLine}</span>
            <span>{fill(strings.month, { n: valid.months })}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
