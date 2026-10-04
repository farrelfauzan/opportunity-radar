/**
 * The "Why it matters" label with the small AI mark: the text beside it was written by the AI from the
 * article, not by the publisher (copy.md §3, news.whyAi / news.whyAiSr). The mark has a solid outline;
 * the dashed outline is reserved for the sample-data badge.
 */
export function WhyLabel({ label, ai, aiSr }: { label: string; ai: string; aiSr: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 pt-px text-xs font-semibold text-[#2DD4BF]">
      <span>{label}</span>
      <span title={aiSr} className="rounded-sm border border-[#C1B9DA] px-1 text-[10px] leading-4 font-medium text-muted-foreground">
        <span aria-hidden="true">{ai}</span>
        <span className="sr-only">{aiSr}</span>
      </span>
    </span>
  );
}
