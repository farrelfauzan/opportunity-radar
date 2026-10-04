/**
 * The word "Sample" in muted text with a dashed outline, next to a price that is made-up (synthetic) data
 * (copy.md §8.2, sample.badge). The dashed outline is reserved for this badge (the AI mark in WhyLabel is solid);
 * the word, never the outline or a colour alone, is what says it.
 */
export function SampleBadge({ label }: { label: string }) {
  return (
    <span
      data-sample-badge
      className="inline-block rounded-full border border-dashed border-[#C1B9DA] px-2.5 py-0.5 text-xs leading-4 text-[#D4CEE6]"
    >
      {label}
    </span>
  );
}
