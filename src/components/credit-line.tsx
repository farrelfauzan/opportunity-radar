import { fill, type Messages } from "@/i18n/t";
import { creditFor } from "@/lib/news/credit";

/**
 * The publisher's credit for an item from a licensed source, e.g.
 * "Source: The Conversation · CC BY-ND 4.0" (licence linked to its deed). Renders
 * nothing for any other source. Shown wherever such an item appears: the News list,
 * opportunity evidence, the Radar, the venture view. The headline already links to
 * the original; The Conversation's summary is always shown exactly as stored.
 */
export function CreditLine({ sourceSlug, strings }: { sourceSlug: string; strings: Messages["news"]["credit"] }) {
  const credit = creditFor(sourceSlug);
  if (!credit) return null;
  const publisher = strings.publisher[credit.publisher];
  if (!credit.licence) {
    return <p className="text-xs text-muted-foreground">{fill(strings.line, { publisher })}</p>;
  }
  // The licence name is a link in the middle of the translated line.
  const [before, after] = fill(strings.lineLicence, { publisher, licence: "\u0000" }).split("\u0000");
  return (
    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
      {before}
      <a
        href={credit.licence.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {strings.licence[credit.licence.key]}
      </a>
      {after}
    </p>
  );
}
