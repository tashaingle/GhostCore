import type {NextConfig} from "next";
import {withSentryConfig} from "@sentry/nextjs/config";

const nextConfig: NextConfig = {/* config options here */};

// Readable stack traces need source maps uploaded, which only happens when Vercel has a Sentry
// auth token; without one the build carries on as normal.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: {disable: !process.env.SENTRY_AUTH_TOKEN},
  telemetry: false,
});
