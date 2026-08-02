import {timingSafeEqual} from "node:crypto";
import {dispatchDueJobs} from "@/lib/jobs/dispatch";

export const maxDuration = 300;

function secretMatches(supplied: string, configured: string | undefined) {
  if (!configured || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

function authorized(request: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
  // Manual/ops calls often use BACKGROUND_JOB_SECRET. Accept either.
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-job-secret") ??
    new URL(request.url).searchParams.get("secret") ??
    "";
  return (
    secretMatches(supplied, process.env.CRON_SECRET) ||
    secretMatches(supplied, process.env.BACKGROUND_JOB_SECRET)
  );
}

async function dispatch(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      {
        error:
          "Unauthorized. Set BACKGROUND_JOB_SECRET or CRON_SECRET and call with Authorization: Bearer <secret>.",
      },
      {status: 401},
    );
  }
  try {
    return Response.json(
      await dispatchDueJobs({
        limit: Number(process.env.BACKGROUND_JOB_BATCH_SIZE ?? 5),
      }),
    );
  } catch (error) {
    console.error("Background dispatch failed", error);
    return Response.json({error: "Background dispatch failed."}, {status: 500});
  }
}

export const GET = dispatch;
export const POST = dispatch;
