/** Postgres picked this command as the victim of a deadlock (error 40P01). */
export const isDeadlock = (text: string): boolean => /deadlock detected|40P01/.test(text);

/**
 * Runs `run`, and again after a pause when it fails with a deadlock: 100 ms, then doubling, at most `attempts`
 * tries in all. Any other error, and the last deadlock, is thrown. `sleep` is injected so a test needs no clock.
 */
export function retryOnDeadlock<T>(run: () => T, sleep: (ms: number) => void, attempts = 5): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return run();
    } catch (error) {
      const text = `${(error as { stderr?: string }).stderr ?? ""}${(error as Error).message}`;
      if (attempt >= attempts || !isDeadlock(text)) throw error;
      sleep(100 * 2 ** (attempt - 1));
    }
  }
}
