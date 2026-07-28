export type GmailErrorKind="unauthorized"|"scope"|"rate_limit"|"network"|"provider";
export class GmailError extends Error{constructor(public kind:GmailErrorKind,message:string){super(message);this.name="GmailError"}}
