import type { EventHandler } from "./events.js";

/** Retry transient failures (network blips, 5xx) with simple backoff. */
export async function withRetry<T>(
  label: string,
  emit: EventHandler,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      const delayMs = 1000 * 2 ** (attempt - 1);
      emit({
        type: "retry",
        label,
        attempt,
        attempts,
        delayMs,
        message: err instanceof Error ? err.message : String(err),
      });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
