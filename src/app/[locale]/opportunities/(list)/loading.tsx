import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currentLocale, getT } from "@/i18n/dictionaries";

// Blocks in the shape of the Opportunities screen; the text is only the accessible label.
// Only the list route has one: a loading boundary would make the detail route answer 200 for an unknown id.
export default async function Loading() {
  const t = getT(await currentLocale());

  return (
    <div role="status" aria-label={t("state.loading")} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-44 max-w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-2 lg:w-[360px] lg:shrink-0">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Card className="hidden min-w-0 flex-1 lg:flex">
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
