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
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg sm:flex sm:items-center sm:gap-4"
        >
          <p className="text-sm text-zinc-600">
            Can we use analytics cookies to see how people find and use this site? They&apos;re
            never used inside the app.{" "}
            <Link className="underline" href="/privacy">
              Privacy policy
            </Link>
          </p>
          <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
            <button className="button button-secondary" onClick={() => choose("denied")}>
              No thanks
            </button>
            <button className="button" onClick={() => choose("granted")}>
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
