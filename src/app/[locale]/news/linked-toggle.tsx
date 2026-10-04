"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * A native checkbox that opens the News URL with the filter switched on or off; the URL stays the source of
 * truth. The box flips at once on a click (it keeps its own state until the new URL arrives, then follows it).
 */
export function LinkedToggle({ label, checked, href }: { label: string; checked: boolean; href: string }) {
  const router = useRouter();
  const [on, setOn] = useState(checked);
  const [seen, setSeen] = useState(checked);
  if (seen !== checked) {
    setSeen(checked);
    setOn(checked);
  }

  return (
    <label className="flex min-h-11 items-center gap-2 text-[#E2DDF0]">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => {
          setOn(event.target.checked);
          router.push(href);
        }}
        className="size-[18px] accent-[#2DD4BF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      {label}
    </label>
  );
}
