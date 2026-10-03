import type {NormalisedEventInput} from "@/types/events";
import type {TranslationContext} from "../connector";
import type {OutlookAddress, OutlookRecord, OutlookSettings} from "./types";

const clean = (value: string, max: number) =>
  value
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const person = (a?: OutlookAddress | null) => ({
  name: clean(a?.emailAddress?.name ?? "", 100),
  email: (a?.emailAddress?.address ?? "").toLowerCase(),
});

/** Internal when everyone on the other side shares the mailbox's own domain. */
export function outlookDirection(
  record: OutlookRecord,
  mailbox: string,
): "inbound" | "outbound" | "internal" {
  const domain = mailbox.toLowerCase().split("@")[1];
  const others =
    record.folder === "sentitems"
      ? [...(record.message.toRecipients ?? []), ...(record.message.ccRecipients ?? [])]
      : [record.message.from ?? {}];
  const emails = others.map((a) => person(a).email).filter(Boolean);
  if (domain && emails.length && emails.every((e) => e.endsWith(`@${domain}`))) return "internal";
  return record.folder === "sentitems" ? "outbound" : "inbound";
}

export function translateOutlook(
  record: OutlookRecord,
  context: TranslationContext,
  mailbox: string,
  settings: OutlookSettings,
): NormalisedEventInput | null {
  const {message, folder} = record;
  const sent = folder === "sentitems";
  if ((sent && settings.includeSent === false) || (!sent && settings.includeReceived === false))
    return null;
  const at = sent ? message.sentDateTime : message.receivedDateTime;
  if (!at) return null;
  const from = person(message.from),
    recipients = [...(message.toRecipients ?? []), ...(message.ccRecipients ?? [])].map(person),
    first = recipients[0],
    subject = clean(message.subject || "(no subject)", 300),
    direction = outlookDirection(record, mailbox),
    type = sent ? "outlook.message_sent" : "outlook.message_received",
    peer = sent ? first?.name || first?.email : from.name || from.email;
  return {
    organisationId: context.organisationId,
    integrationId: context.integrationId,
    source: "outlook",
    category: "communication",
    eventType: type,
    title: clean(
      sent ? `Email sent to ${peer || "recipient"}` : `Email received from ${peer || "sender"}`,
      300,
    ),
    description: subject,
    severity: "info",
    occurredAt: new Date(at).toISOString(),
    externalId: `outlook:${context.integrationId}:${message.id}:${type}`,
    metadata: {
      messageId: message.id,
      threadId: message.conversationId ?? null,
      subject,
      senderName: from.name,
      senderEmail: from.email,
      recipientCount: recipients.length,
      direction,
      unread: settings.includeUnread !== false && message.isRead === false,
      flagged: message.flag?.flagStatus === "flagged",
      important: message.importance === "high",
      hasAttachments: settings.includeAttachments !== false && message.hasAttachments === true,
      mailbox,
      mailboxDomain: mailbox.split("@")[1] ?? null,
    },
    rawPayload: {messageId: message.id, conversationId: message.conversationId ?? null},
  };
}
