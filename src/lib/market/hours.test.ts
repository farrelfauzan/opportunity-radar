import { describe, expect, test } from "vitest";
import { marketState } from "./hours";

// 2026-10-05 is a Monday. WIB is UTC+7, so 09:00 WIB is 02:00Z.
const wib = (day: number, hhmm: string) => new Date(`2026-10-${String(day).padStart(2, "0")}T${hhmm}:00+07:00`);
const MON = 5, TUE = 6, FRI = 9, SAT = 10, SUN = 11;
const minutesBefore = (at: Date, minutes: number) => new Date(at.getTime() - minutes * 60_000);

describe("IHSG (idx): 1 hour, Mon-Fri 09:00-16:00 WIB", () => {
  test("inside the hours: fresh up to exactly 1 hour, stale a minute later", () => {
    const now = wib(TUE, "11:00");
    expect(marketState("idx", minutesBefore(now, 60), now)).toEqual({ closed: false, stale: false });
    expect(marketState("idx", minutesBefore(now, 61), now)).toEqual({ closed: false, stale: true });
    expect(marketState("idx", minutesBefore(now, 5), now)).toEqual({ closed: false, stale: false });
  });

  test("the edges: 09:00 is open, 08:59 closed, 15:59 open, 16:00 closed", () => {
    const old = wib(MON, "00:00");
    expect(marketState("idx", old, wib(TUE, "08:59"))).toEqual({ closed: true, stale: false });
    expect(marketState("idx", old, wib(TUE, "09:00"))).toEqual({ closed: false, stale: true });
    expect(marketState("idx", old, wib(TUE, "15:59"))).toEqual({ closed: false, stale: true });
    expect(marketState("idx", old, wib(TUE, "16:00"))).toEqual({ closed: true, stale: false });
  });

  test("outside the hours it is closed and never stale, however old the run", () => {
    expect(marketState("idx", wib(MON, "00:00"), wib(FRI, "20:00"))).toEqual({ closed: true, stale: false });
    expect(marketState("idx", wib(MON, "00:00"), wib(TUE, "03:00"))).toEqual({ closed: true, stale: false });
  });

  test("Saturday and Sunday are closed all day", () => {
    for (const day of [SAT, SUN]) {
      for (const time of ["00:00", "09:00", "12:00", "15:59"]) {
        expect(marketState("idx", wib(MON, "00:00"), wib(day, time))).toEqual({ closed: true, stale: false });
      }
    }
  });

  test("Monday 09:00 and Friday 15:59 are inside the week's window", () => {
    expect(marketState("idx", null, wib(MON, "09:00")).closed).toBe(false);
    expect(marketState("idx", null, wib(FRI, "15:59")).closed).toBe(false);
    expect(marketState("idx", null, wib(FRI, "16:00")).closed).toBe(true);
  });

  test("a job that never ran is not stale", () => {
    expect(marketState("idx", null, wib(TUE, "11:00"))).toEqual({ closed: false, stale: false });
  });
});

describe("Gold: 1 hour, Mon 05:00 - Sat 04:00 WIB", () => {
  test("fresh up to exactly 1 hour, stale after", () => {
    const now = wib(TUE, "20:00");
    expect(marketState("gold", minutesBefore(now, 60), now)).toEqual({ closed: false, stale: false });
    expect(marketState("gold", minutesBefore(now, 61), now)).toEqual({ closed: false, stale: true });
  });

  test("Monday 05:00 opens it, 04:59 is still the weekend", () => {
    const old = new Date("2026-10-03T00:00:00+07:00"); // the Saturday before
    expect(marketState("gold", old, wib(MON, "04:59"))).toEqual({ closed: true, stale: false });
    expect(marketState("gold", old, wib(MON, "05:00"))).toEqual({ closed: false, stale: true });
  });

  test("Saturday 03:59 is open, 04:00 closes it", () => {
    const old = wib(MON, "00:00");
    expect(marketState("gold", old, wib(SAT, "03:59"))).toEqual({ closed: false, stale: true });
    expect(marketState("gold", old, wib(SAT, "04:00"))).toEqual({ closed: true, stale: false });
  });

  test("the weekend is closed and never stale; late Friday evening and early Saturday are open", () => {
    expect(marketState("gold", wib(MON, "00:00"), wib(SAT, "12:00"))).toEqual({ closed: true, stale: false });
    expect(marketState("gold", wib(MON, "00:00"), wib(SUN, "23:59"))).toEqual({ closed: true, stale: false });
    expect(marketState("gold", wib(FRI, "23:30"), wib(SAT, "00:15")).closed).toBe(false);
  });

  test("it trades on Monday 05:00-09:00 and after 16:00, unlike IDX", () => {
    expect(marketState("gold", null, wib(TUE, "02:00")).closed).toBe(false);
    expect(marketState("gold", null, wib(TUE, "18:00")).closed).toBe(false);
  });
});

describe("Bitcoin (crypto): 1 hour, always", () => {
  test("fresh up to exactly 1 hour, stale after, at any time and day", () => {
    for (const now of [wib(TUE, "11:00"), wib(SAT, "12:00"), wib(SUN, "03:00"), wib(MON, "00:00")]) {
      expect(marketState("crypto", minutesBefore(now, 60), now)).toEqual({ closed: false, stale: false });
      expect(marketState("crypto", minutesBefore(now, 61), now)).toEqual({ closed: false, stale: true });
    }
  });

  test("never closed, and a job that never ran is not stale", () => {
    expect(marketState("crypto", null, wib(SAT, "12:00"))).toEqual({ closed: false, stale: false });
  });
});

describe("USD/IDR (fx): 26 hours on business days", () => {
  test("exactly 26 hours is fresh, a minute more is stale, on a weekday", () => {
    const now = wib(TUE, "12:00");
    expect(marketState("fx", minutesBefore(now, 26 * 60), now)).toEqual({ closed: false, stale: false });
    expect(marketState("fx", minutesBefore(now, 26 * 60 + 1), now)).toEqual({ closed: false, stale: true });
  });

  test("on a weekend it is not stale and not 'closed' (it only shows its date)", () => {
    for (const now of [wib(SAT, "12:00"), wib(SUN, "23:59"), wib(SAT, "00:00")]) {
      expect(marketState("fx", wib(MON, "00:00"), now)).toEqual({ closed: false, stale: false });
    }
  });

  test("Monday 00:00 and Friday 23:59 WIB count as business days", () => {
    expect(marketState("fx", minutesBefore(wib(MON, "00:00"), 26 * 60), wib(MON, "00:00")).stale).toBe(false);
    expect(marketState("fx", minutesBefore(wib(MON, "00:00"), 27 * 60), wib(MON, "00:00")).stale).toBe(true);
    expect(marketState("fx", minutesBefore(wib(FRI, "23:59"), 27 * 60), wib(FRI, "23:59")).stale).toBe(true);
  });
});
