import type { Place } from "../types";

/**
 * A small LRU over address lookups. Typing "Joli", "Jolie", "Joliet" issues
 * three requests; backspacing to "Jolie" should issue none.
 */
export class PlaceCache {
  private readonly entries = new Map<string, { places: Place[]; at: number }>();

  constructor(
    private readonly maxEntries = 200,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
  ) {}

  private key(query: string, suffix = ""): string {
    return `${query.trim().toLowerCase()}|${suffix}`;
  }

  get(query: string, suffix = ""): Place[] | null {
    const key = this.key(query, suffix);
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    // Re-insert to mark as most recently used.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.places;
  }

  set(query: string, places: Place[], suffix = ""): void {
    const key = this.key(query, suffix);
    this.entries.delete(key);
    this.entries.set(key, { places, at: Date.now() });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Trailing debounce that also cancels the in-flight request it supersedes.
 *
 * Two guards, because either one alone leaks stale results into the list:
 *
 *  - The abort signal cancels the request that is already in flight.
 *  - A generation counter discards whatever a superseded call eventually
 *    returns. Aborting is a request to stop, not a guarantee of stopping: a
 *    caller that resolves from its own cache, or simply does not check the
 *    signal, would otherwise still land after a newer query and overwrite it.
 *
 * A superseded call resolves to null rather than rejecting, so callers can
 * treat "no longer the current query" as an ordinary non-result.
 */
export function createDebouncedSearch<T>(
  fn: (query: string, signal: AbortSignal) => Promise<T>,
  waitMs = 300,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let generation = 0;

  const run = (query: string): Promise<T | null> =>
    new Promise((resolve, reject) => {
      if (timer) clearTimeout(timer);
      controller?.abort();
      const mine = ++generation;

      timer = setTimeout(() => {
        controller = new AbortController();
        fn(query, controller.signal).then(
          (value) => resolve(mine === generation ? value : null),
          (error: unknown) => {
            if (mine !== generation || (error as Error)?.name === "AbortError") resolve(null);
            else reject(error);
          },
        );
      }, waitMs);
    });

  run.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    generation += 1;
    controller?.abort();
    controller = null;
  };

  return run;
}
