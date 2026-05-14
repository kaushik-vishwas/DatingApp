/** Default ceiling for list / screen bootstrap fetches (ms). */
export const SCREEN_FETCH_TIMEOUT_MS = 28000;

/**
 * Races `promise` against a timer so hung requests do not leave spinners forever.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = SCREEN_FETCH_TIMEOUT_MS,
  timeoutMessage = 'Request timed out. Please try again.'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
