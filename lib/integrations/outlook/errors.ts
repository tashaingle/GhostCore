export type OutlookErrorKind = "unauthorized" | "scope" | "rate_limit" | "network" | "provider";
export class OutlookError extends Error {
  constructor(
    public kind: OutlookErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "OutlookError";
  }
}
