import { describe, expect, test } from "vitest";
import { isDeadlock, retryOnDeadlock } from "../../e2e/retry";

const deadlock = () => Object.assign(new Error("Command failed"), { stderr: "deadlock detected\n" });

describe("retryOnDeadlock", () => {
  test("runs again after a deadlock, pausing 100 ms and then doubling, and returns the first success", () => {
    const pauses: number[] = [];
    let calls = 0;
    const result = retryOnDeadlock(
      () => {
        if (++calls < 4) throw deadlock();
        return "ok";
      },
      (ms) => pauses.push(ms),
    );
    expect(result).toBe("ok");
    expect(calls).toBe(4);
    expect(pauses).toEqual([100, 200, 400]);
  });

  test("gives up after the given number of tries and throws the deadlock", () => {
    let calls = 0;
    expect(() =>
      retryOnDeadlock(
        () => {
          calls++;
          throw deadlock();
        },
        () => {},
        3,
      ),
    ).toThrow("Command failed");
    expect(calls).toBe(3);
  });

  test("any other error is thrown at once, without a second try or a pause", () => {
    let calls = 0;
    const pauses: number[] = [];
    expect(() =>
      retryOnDeadlock(
        () => {
          calls++;
          throw new Error("connect ECONNREFUSED");
        },
        (ms) => pauses.push(ms),
      ),
    ).toThrow("ECONNREFUSED");
    expect(calls).toBe(1);
    expect(pauses).toEqual([]);
  });

  test("recognises Postgres' wording and its error code", () => {
    expect(isDeadlock("error: deadlock detected")).toBe(true);
    expect(isDeadlock("code 40P01")).toBe(true);
    expect(isDeadlock("relation does not exist")).toBe(false);
  });
});
