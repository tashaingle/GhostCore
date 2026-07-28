import {createHash} from "node:crypto";
export function insightFingerprint(ruleId:string,key:string){return createHash("sha256").update(`${ruleId}|${key}`).digest("hex")}
