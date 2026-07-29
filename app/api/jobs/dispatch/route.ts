import{timingSafeEqual}from"node:crypto";import{dispatchDueJobs}from"@/lib/jobs/dispatch";
export const maxDuration=300;
function authorized(request:Request){const configured=process.env.BACKGROUND_JOB_SECRET??process.env.CRON_SECRET;if(!configured)return false;const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??request.headers.get("x-job-secret")??"";const a=Buffer.from(supplied),b=Buffer.from(configured);return a.length===b.length&&timingSafeEqual(a,b)}
async function dispatch(request:Request){if(!authorized(request))return Response.json({error:"Unauthorized."},{status:401});try{return Response.json(await dispatchDueJobs({limit:Number(process.env.BACKGROUND_JOB_BATCH_SIZE??5)}))}catch(error){console.error("Background dispatch failed",error);return Response.json({error:"Background dispatch failed."},{status:500})}}
export const GET=dispatch;export const POST=dispatch;
