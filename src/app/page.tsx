import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Placeholder start page: the target for the theme checks in OR-1.
// OR-2 and OR-3 replace it with the localised app shell.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-[clamp(16px,3vw,32px)] pt-6 pb-12">
      <Card>
        <CardHeader>
          <CardTitle>Opportunity Radar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p>Business opportunities and investment signals from the news.</p>
          <p className="text-muted-foreground">The screens arrive with the next tickets.</p>
          <p className="font-mono text-2xl" data-testid="sample-number">
            1,935,000
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
