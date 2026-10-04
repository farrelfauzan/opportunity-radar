// When a market row is stale or its market is closed (docs/design/copy.md §2.3). Pure: `now` comes from the caller.

/** The kinds of price the Radar shows, by how often they update and when their market trades. */
export type MarketKind = "idx" | "us" | "gold" | "crypto" | "fx";

const HOUR_MS = 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * HOUR_MS;

/** Stale after 1 hour (26 hours for the daily USD/IDR rate), counted from the last successful run of the feeding job. */
const STALE_AFTER_MS: Record<MarketKind, number> = { idx: HOUR_MS, us: HOUR_MS, gold: HOUR_MS, crypto: HOUR_MS, fx: 26 * HOUR_MS };

/** Whether two instants fall on the same WIB calendar day. */
export function sameWibDay(a: Date, b: Date): boolean {
  const day = (at: Date) => new Date(at.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
  return day(a) === day(b);
}

/** WIB weekday (0 = Monday … 6 = Sunday) and minutes since WIB midnight. */
function wibWeek(now: Date) {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  return {
    weekday: (shifted.getUTCDay() + 6) % 7,
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

const newYorkTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** New York weekday (0 = Monday … 6 = Sunday) and minutes since local midnight, with the daylight-saving rule of that date. */
function newYorkWeek(now: Date) {
  const parts = newYorkTime.formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(part("weekday")),
    minute: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

/**
 * Whether the market of this kind is trading (so its freshness rule applies), in WIB:
 * - idx: Monday to Friday, 09:00 up to (not including) 16:00. No holiday list yet, so weekdays count as trading days.
 * - us: Monday to Friday, 09:30 up to (not including) 16:00 New York time (EST or EDT as the date has it); weekdays
 *   count as trading days, as for idx.
 * - gold: from Monday 05:00 up to (not including) Saturday 04:00.
 * - crypto: always. fx: Monday to Friday (a business day), all day.
 */
function applies(kind: MarketKind, now: Date): boolean {
  const { weekday, minute } = wibWeek(now);
  switch (kind) {
    case "idx":
      return weekday <= 4 && minute >= 9 * 60 && minute < 16 * 60;
    case "us": {
      const ny = newYorkWeek(now);
      return ny.weekday <= 4 && ny.minute >= 9 * 60 + 30 && ny.minute < 16 * 60;
    }
    case "gold": {
      const sinceMonday = weekday * 24 * 60 + minute;
      return sinceMonday >= 5 * 60 && sinceMonday < 5 * 24 * 60 + 4 * 60;
    }
    case "crypto":
      return true;
    case "fx":
      return weekday <= 4;
  }
}

export type MarketState = {
  /** The market is shut: show the last close with state.marketClosed. Only idx, us and gold ever close. */
  closed: boolean;
  /** The data is out of date. Never while closed, and never for a run that has not happened (null). */
  stale: boolean;
};

/**
 * The state of a market row. `lastRun` is the last successful run of the job that feeds it (the caller passes
 * the quote's stored time when the job has never run). Stale means strictly more than the threshold ago:
 * exactly 1 hour (26 for fx) is still fresh. Outside its trading hours a row is not stale; only idx and gold
 * are "closed" there (fx is a daily rate: it just shows its date; crypto never closes).
 */
export function marketState(kind: MarketKind, lastRun: Date | null, now: Date): MarketState {
  const open = applies(kind, now);
  const closed = !open && (kind === "idx" || kind === "us" || kind === "gold");
  const stale = open && lastRun !== null && now.getTime() - lastRun.getTime() > STALE_AFTER_MS[kind];
  return { closed, stale };
}
