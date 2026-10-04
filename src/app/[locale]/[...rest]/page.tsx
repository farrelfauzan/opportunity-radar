import { notFound } from "next/navigation";

// Any path that no screen claims shows the localised not-found page.
export default function UnknownPage() {
  notFound();
}
