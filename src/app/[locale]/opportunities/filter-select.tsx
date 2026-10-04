"use client";

import { useRouter } from "next/navigation";

type Option = { value: string; label: string; href: string };

/** A native select that opens the Opportunities URL of the chosen value (the other filters are kept in each href). */
export function FilterSelect({ label, value, options }: { label: string; value: string; options: Option[] }) {
  const router = useRouter();

  return (
    <label className="flex min-w-0 items-center gap-2 text-[#E2DDF0]">
      {label}
      <select
        value={value}
        onChange={(event) => router.push(options.find((o) => o.value === event.target.value)!.href)}
        className="min-h-11 min-w-0 rounded-md border border-input bg-black/18 px-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-popover">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
