"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";

/**
 * While `active` (e.g. a background sync is running), re-fetches the page's server data every
 * few seconds so results appear without a manual reload. Gives up after `maxMs` as a safety net.
 */
export function AutoRefresh({
  active,
  intervalMs = 4000,
  maxMs = 180_000,
}: {
  active: boolean;
  intervalMs?: number;
  maxMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const started = Date.now(),
      timer = setInterval(() => {
        if (Date.now() - started > maxMs) clearInterval(timer);
        else router.refresh();
      }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, maxMs, router]);
  return null;
}
