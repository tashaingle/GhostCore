"use client";
import * as Sentry from "@sentry/nextjs";
import {useState} from "react";
import {sendServerTestError} from "@/app/sentry-test-actions";

export function SentryTestButtons() {
  const [sent, setSent] = useState(false);
  return (
    <div className="flex flex-wrap gap-3">
      <button
        className="button"
        onClick={async () => {
          Sentry.captureException(new Error("Sentry test from the browser (safe to ignore)"));
          await Sentry.flush(5000);
          setSent(true);
        }}
      >
        {sent ? "Browser test error sent" : "Send a browser test error"}
      </button>
      <form action={sendServerTestError}>
        <button className="button button-secondary">Send a server test error</button>
      </form>
    </div>
  );
}
