"use client";
import * as Sentry from "@sentry/nextjs";
import {useEffect} from "react";

/** Shown if the whole app fails to load. The error is sent to Sentry so it can be fixed. */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & {digest?: string};
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en-GB">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 480,
          margin: "80px auto",
          padding: "0 16px",
          color: "#18181b",
        }}
      >
        <title>Something went wrong</title>
        <h1 style={{fontSize: 22}}>Something went wrong</h1>
        <p style={{color: "#52525b"}}>
          We&apos;ve been told about it and will look into it. Please try again, or email
          support@metricmage.co.uk if it keeps happening.
        </p>
        <button
          onClick={() => unstable_retry()}
          style={{
            marginTop: 12,
            padding: "10px 16px",
            borderRadius: 10,
            border: 0,
            background: "#18181b",
            color: "white",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
