"use client";

import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessages } from "@/i18n/client-messages";
import { defaultLocale, hasLocale } from "@/i18n/locales";

// Shows no error details: the message and stack stay in the server log.
export default function ErrorPage({ retry }: { error: Error; retry: () => void }) {
  const segment = usePathname().split("/")[1];
  const messages = errorMessages[hasLocale(segment) ? segment : defaultLocale];

  return (
    <>
      <h1 className="text-[26px] font-bold tracking-tight">{messages.title}</h1>
      <Card>
        <CardContent>
          <Button onClick={() => retry()}>{messages.retry}</Button>
        </CardContent>
      </Card>
    </>
  );
}
