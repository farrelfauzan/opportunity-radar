import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currentLocale, getT } from "@/i18n/dictionaries";

// Blocks in the shape of the Radar; the text is only the accessible label.
export default async function Loading() {
  const t = getT(await currentLocale());

  return (
    <div role="status" aria-label={t("state.loading")} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-5 w-56" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
