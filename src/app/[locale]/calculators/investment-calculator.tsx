"use client";

import { useId, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatRupiah, formatRupiahCompact } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { projectInvestment, type InvestmentInput } from "@/lib/calculators/investment";
import { formatNumberInput, validateNumberInput, type NumberRange } from "@/lib/calculators/number-input";

type Field = keyof InvestmentInput;
type Strings = Messages["calc"]["inv"];

const defaults: InvestmentInput = {
  start: 10_000_000,
  monthly: 2_000_000,
  years: 10,
  returnPct: 10,
  spreadPct: 6,
  inflationPct: 3.5,
};

const ranges: Record<Field, NumberRange> = {
  start: { min: 0, max: 1e13 },
  monthly: { min: 0, max: 1e13 },
  years: { min: 1, max: 40, integer: true },
  returnPct: { min: -50, max: 100 },
  spreadPct: { min: 0, max: 50 },
  inflationPct: { min: -10, max: 50 },
};

const fields = Object.keys(ranges) as Field[];

const labelKeys = {
  start: "start",
  monthly: "monthly",
  years: "years",
  returnPct: "return",
  spreadPct: "spread",
  inflationPct: "inflation",
} as const satisfies Record<Field, keyof Strings>;

const presets = [
  { key: "cash", returnPct: 5, spreadPct: 1 },
  { key: "gold", returnPct: 8, spreadPct: 4 },
  { key: "stocks", returnPct: 10, spreadPct: 6 },
  { key: "crypto", returnPct: 15, spreadPct: 20 },
] as const;

// Each line differs in dash pattern and width as well as colour.
const lines = [
  { key: "optimistic", color: "var(--chart-3)", width: 2, dash: "10 4" },
  { key: "base", color: "var(--chart-1)", width: 3, dash: undefined },
  { key: "pessimistic", color: "var(--chart-2)", width: 2, dash: "10 3 2 3" },
  { key: "paid", color: "var(--chart-4)", width: 2, dash: "4 4" },
] as const;

export function InvestmentCalculator({
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
  const id = useId();
  const [texts, setTexts] = useState(
    () => Object.fromEntries(fields.map((f) => [f, formatNumberInput(defaults[f], locale)])) as Record<Field, string>,
  );
  // The last set of inputs that were all valid: results and chart are drawn from it.
  const [valid, setValid] = useState(defaults);
  const [preset, setPreset] = useState<string | null>("stocks");

  const checks = Object.fromEntries(
    fields.map((f) => [f, validateNumberInput(texts[f], locale, ranges[f])]),
  ) as Record<Field, ReturnType<typeof validateNumberInput>>;
  const anyInvalid = fields.some((f) => "error" in checks[f]);

  function update(changes: Partial<Record<Field, string>>, nextPreset: string | null) {
    const next = { ...texts, ...changes };
    setTexts(next);
    setPreset(nextPreset);
    const values: Partial<InvestmentInput> = {};
    for (const f of fields) {
      const check = validateNumberInput(next[f], locale, ranges[f]);
      if ("error" in check) return;
      values[f] = check.value;
    }
    setValid(values as InvestmentInput);
  }

  const result = useMemo(() => projectInvestment(valid), [valid]);
  const months = valid.years * 12;
  const data = useMemo(
    () =>
      result.base.map((base, month) => ({
        base,
        optimistic: result.optimistic[month],
        pessimistic: result.pessimistic[month],
        paid: result.paid[month],
      })),
    [result],
  );

  const lineNames = {
    optimistic: strings.optimistic,
    base: strings.base,
    pessimistic: strings.pessimistic,
    paid: strings.paidLine,
  };
  const chartConfig: ChartConfig = Object.fromEntries(
    lines.map((line) => [line.key, { label: lineNames[line.key], color: line.color }]),
  );

  const cards = [
    {
      testId: "result-base",
      label: fill(valid.years === 1 ? strings.valueAfter.one : strings.valueAfter.other, { years: valid.years }),
      value: result.base[months],
      accent: true,
    },
    { testId: "result-pessimistic", label: strings.pessimistic, value: result.pessimistic[months] },
    { testId: "result-optimistic", label: strings.optimistic, value: result.optimistic[months] },
    { testId: "result-paid", label: strings.paid, value: result.paid[months] },
    { testId: "result-real", label: strings.real, value: result.real },
  ];

  return (
    <Card className="gap-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 className="text-lg font-bold">{strings.title}</h2>
        <div role="group" aria-label={strings.presetGroup} className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={preset === p.key}
              onClick={() =>
                update(
                  {
                    returnPct: formatNumberInput(p.returnPct, locale),
                    spreadPct: formatNumberInput(p.spreadPct, locale),
                  },
                  p.key,
                )
              }
              className="min-h-11 cursor-pointer rounded-md border border-input bg-black/18 px-3.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {strings.preset[p.key]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="grid min-w-0 flex-[1_1_300px] grid-cols-2 content-start gap-3">
          {fields.map((f) => {
            const check = checks[f];
            const errorId = `${id}-${f}-error`;
            return (
              <div key={f} className="flex flex-col gap-1">
                <label className="flex flex-1 flex-col justify-between gap-1 text-[13px]">
                  {strings[labelKeys[f]]}
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    name={f}
                    value={texts[f]}
                    onChange={(event) => update({ [f]: event.target.value }, null)}
                    aria-invalid={"error" in check || undefined}
                    aria-describedby={"error" in check ? errorId : undefined}
                    className="min-h-11 w-full rounded-md border border-input bg-black/18 px-2.5 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive"
                  />
                </label>
                {"error" in check && (
                  <span id={errorId} className="text-xs text-destructive">
                    {check.error === "required"
                      ? errors.required
                      : fill(errors.range, {
                          min: formatNumberInput(ranges[f].min, locale),
                          max: formatNumberInput(ranges[f].max, locale),
                        })}
                  </span>
                )}
              </div>
            );
          })}
          <p className="col-span-full text-xs text-muted-foreground">{strings.presetNote}</p>
        </div>

        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-3">
          <p role="status" className="text-xs text-destructive empty:hidden">
            {anyInvalid ? errors.keptPrevious : null}
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {cards.map((card) => (
              <div key={card.testId} className="min-w-0 rounded-lg bg-black/18 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">{card.label}</div>
                <div className={`font-mono text-base font-medium [overflow-wrap:anywhere] sm:text-xl ${card.accent ? "text-primary" : ""}`}>
                  {formatRupiahCompact(card.value, locale, units)}
                </div>
                {/* Above 2^53 a number cannot hold every digit, so no exact line is shown. */}
                {Math.abs(card.value) <= Number.MAX_SAFE_INTEGER && (
                  <div
                    data-testid={card.testId}
                    className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]"
                  >
                    {formatRupiah(card.value, locale)}
                  </div>
                )}
              </div>
            ))}
          </div>

          <ChartContainer
            config={chartConfig}
            role="img"
            aria-label={strings.chartLabel}
            className="aspect-auto h-[220px] w-full"
          >
            <LineChart data={data} accessibilityLayer={false} margin={{ top: 8, right: 2, bottom: 8, left: 2 }}>
              <CartesianGrid vertical={false} stroke="var(--glass-border)" />
              <YAxis hide domain={[0, "dataMax"]} />
              {lines.map((line) => (
                <Line
                  key={line.key}
                  dataKey={line.key}
                  type="linear"
                  stroke={`var(--color-${line.key})`}
                  strokeWidth={line.width}
                  strokeDasharray={line.dash}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{strings.axisNow}</span>
            <span>{fill(strings.axisYear, { years: valid.years })}</span>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center gap-1.5">
                <svg width="28" height="6" aria-hidden="true">
                  <line
                    x1="0"
                    y1="3"
                    x2="28"
                    y2="3"
                    stroke={line.color}
                    strokeWidth={line.width}
                    strokeDasharray={line.dash}
                  />
                </svg>
                {lineNames[line.key]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
