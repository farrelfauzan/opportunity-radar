"use client";

import { useId, useState } from "react";
import { formatRupiah } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import {
  formatNumberInput,
  validateNumberInput,
  type NumberInputResult,
  type NumberRange,
} from "@/lib/calculators/number-input";

/**
 * The typed text of each field, its validation, and the last set of inputs
 * that were all valid: results and charts are drawn from that set.
 */
export function useNumberFields<T extends Record<string, number>>(
  defaults: T,
  ranges: Record<keyof T, NumberRange>,
  locale: Locale,
) {
  type Field = keyof T & string;
  const fields = Object.keys(ranges) as Field[];
  const [texts, setTexts] = useState(
    () => Object.fromEntries(fields.map((f) => [f, formatNumberInput(defaults[f], locale)])) as Record<Field, string>,
  );
  const [valid, setValid] = useState(defaults);

  const checks = Object.fromEntries(
    fields.map((f) => [f, validateNumberInput(texts[f], locale, ranges[f])]),
  ) as Record<Field, NumberInputResult>;
  const anyInvalid = fields.some((f) => "error" in checks[f]);

  function update(changes: Partial<Record<Field, string>>) {
    const next = { ...texts, ...changes };
    setTexts(next);
    const values: Record<string, number> = {};
    for (const f of fields) {
      const check = validateNumberInput(next[f], locale, ranges[f]);
      if ("error" in check) return;
      values[f] = check.value;
    }
    setValid(values as T);
  }

  return { fields, texts, valid, checks, anyInvalid, update };
}

export function NumberField({
  name,
  label,
  value,
  onChange,
  check,
  range,
  locale,
  errors,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  check: NumberInputResult;
  range: NumberRange;
  locale: Locale;
  errors: Messages["calc"]["err"];
}) {
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-1 flex-col justify-between gap-1 text-[13px]">
        {label}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
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
                min: formatNumberInput(range.min, locale),
                max: formatNumberInput(range.max, locale),
              })}
        </span>
      )}
    </div>
  );
}

/** A label, a large value and, for amounts, the exact value under it. The test id sits on the exact value when there is one. */
/** The exact rupiah figure, or null above 2^53, where a number cannot hold every digit. */
export function exactRupiah(value: number, locale: Locale): string | null {
  return Math.abs(value) <= Number.MAX_SAFE_INTEGER ? formatRupiah(value, locale) : null;
}

export function ResultCard({
  label,
  value,
  exact,
  testId,
  valueClassName = "",
}: {
  label: string;
  value: string;
  /** The exact figure under the short one; null hides it; left out, the short figure carries the test id. */
  exact?: string | null;
  testId: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-black/18 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        data-testid={exact === undefined ? testId : undefined}
        className={`font-mono text-base font-medium [overflow-wrap:anywhere] sm:text-xl ${valueClassName}`}
      >
        {value}
      </div>
      {exact !== undefined && exact !== null && (
        <div data-testid={testId} className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {exact}
        </div>
      )}
    </div>
  );
}
