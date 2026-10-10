"use client";
import {useSyncExternalStore} from "react";
import Script from "next/script";
import Link from "next/link";
import {usePathname} from "next/navigation";

const MEASUREMENT_ID = "G-3HQLPWLWEG";
const CONSENT_KEY = "metric-mage-analytics-consent";
// Only public marketing pages: never inside the app, where page titles hold business data.
const PUBLIC_PAGES = ["/", "/login", "/register", "/privacy", "/terms", "/data-deletion"];

type Consent = "granted" | "denied" | null;
const CHANGED = "metric-mage-consent-changed";

function readConsent(): Consent {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/**
 * Google Analytics for the public site. UK rules (PECR) need agreement before analytics cookies are
 * set, so nothing loads until the visitor clicks Allow, and it only runs on the live domain.
 */
export function Analytics() {
  const pathname = usePathname();
  // Browser-only: renders nothing on the server, then reads the saved choice once in the browser.
  const snapshot = useSyncExternalStore(
    subscribe,
    () =>
      window.location.hostname.endsWith("metricmage.co.uk") ? (readConsent() ?? "unset") : "off",
    () => "off",
  );
  if (snapshot === "off" || !PUBLIC_PAGES.includes(pathname)) return null;
  const consent: Consent = snapshot === "unset" ? null : (snapshot as Consent);

  const choose = (value: "granted" | "denied") => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {}
    window.dispatchEvent(new Event(CHANGED));
  };

  return (
    <>
      {consent === "granted" && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${MEASUREMENT_ID}');`}
          </Script>
        </>
      )}
      {consent === null && (
        <div
          role="dialog"
          aria-label="Cookies"
          className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t border-zinc-200 bg-white/95 px-4 py-2.5 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-sm sm:flex-col sm:items-start sm:rounded-2xl sm:border sm:p-4"
        >
          <p className="min-w-0 flex-1 text-xs leading-snug text-zinc-600 sm:text-sm">
            Analytics cookies help us see how people find this site. Never used in the app.{" "}
            <Link className="underline" href="/privacy">
              More
            </Link>
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 sm:text-sm"
              onClick={() => choose("denied")}
            >
              No thanks
            </button>
            <button
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 sm:text-sm"
              onClick={() => choose("granted")}
            >
              Allow
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Lets a visitor change their answer to the cookie banner. */
export function CookieChoiceButton() {
  return (
    <button
      className="underline"
      onClick={() => {
        try {
          localStorage.removeItem(CONSENT_KEY);
        } catch {}
        window.location.reload();
      }}
    >
      Change your cookie choice
    </button>
  );
}
