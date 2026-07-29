import type{Database}from"@/types/database";
export type Job=Database["public"]["Tables"]["background_jobs"]["Row"];
export type JobStatus="queued"|"started"|"completed"|"failed"|"cancelled"|"skipped"|"retrying"|"timed_out";
export type ErrorClass="configuration"|"authentication"|"permission"|"network"|"timeout"|"rate_limit"|"provider_error"|"database"|"internal";
export type JobMetrics={processed:number;created:number;updated:number;skipped:number;metadata?:Record<string,unknown>};
