export type MailchimpErrorKind = "unauthorized" | "rate_limit" | "network" | "provider";
export class MailchimpError extends Error {
  constructor(
    public kind: MailchimpErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "MailchimpError";
  }
}
