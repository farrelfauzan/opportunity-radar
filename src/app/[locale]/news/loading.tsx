import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currentLocale, getT } from "@/i18n/dictionaries";

// Blocks in the shape of the News screen; the text is only the accessible label.
export default async function Loading() {
  const t = getT(await currentLocale());

  return (
    <div role="status" aria-label={t("state.loading")} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-24" />
          ))}
        </div>
        <Skeleton className="h-11 w-56" />
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="min-w-0 flex-[1_1_300px]">
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
