/**
 * Runs `worker` over `items` with at most `concurrency` in flight, preserving input order.
 * A worker returning null marks the item as not run (for example, out of time budget).
 */
export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R | null>,
): Promise<{results: R[]; notRun: number}> {
  const slots = new Array<R | null>(items.length).fill(null);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const index = next++;
      slots[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({length: Math.max(1, Math.min(concurrency, items.length))}, lane));
  const results = slots.filter((r): r is R => r !== null);
  return {results, notRun: items.length - results.length};
}
