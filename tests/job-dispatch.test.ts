import {describe, expect, it} from "vitest";
import {runPool} from "@/lib/jobs/pool";
import {clampConcurrency, DEFAULT_CONCURRENCY} from "@/lib/jobs/dispatch";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("job pool", () => {
  it("never exceeds the concurrency limit", async () => {
    let active = 0,
      peak = 0;
    const {results} = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(results).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  it("runs faster than one at a time", async () => {
    const started = Date.now();
    await runPool(Array.from({length: 8}), 4, async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return true;
    });
    // Sequential would take ~320ms; four lanes take ~80ms.
    expect(Date.now() - started).toBeLessThan(250);
  });

  it("counts items the worker declined to run", async () => {
    const {results, notRun} = await runPool([1, 2, 3, 4], 2, async (n) => (n > 2 ? null : n));
    expect(results).toEqual([1, 2]);
    expect(notRun).toBe(2);
  });

  it("handles an empty list", async () => {
    await expect(runPool([], 4, async () => 1)).resolves.toEqual({results: [], notRun: 0});
  });
});

describe("dispatch concurrency setting", () => {
  it("defaults when unset or invalid and clamps to 1-8", () => {
    expect(clampConcurrency(undefined)).toBe(DEFAULT_CONCURRENCY);
    expect(clampConcurrency("abc")).toBe(DEFAULT_CONCURRENCY);
    expect(clampConcurrency(0)).toBe(DEFAULT_CONCURRENCY);
    expect(clampConcurrency(1)).toBe(1);
    expect(clampConcurrency(50)).toBe(8);
    expect(clampConcurrency("3")).toBe(3);
  });
});
