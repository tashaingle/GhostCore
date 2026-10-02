import type {NotificationCategory} from "@/lib/notifications/types";
import {resolvePreference, type Preference} from "@/lib/notifications/preferences";
import {severityRank} from "@/lib/notifications/status";

export type Member = {user_id: string; role: string};

/**
 * Alert emails are opt-in: the recipient's preference must enable email, use immediate
 * delivery (digests are separate), and include this severity.
 */
export function notificationRecipients(
  members: Member[],
  preferences: Preference[],
  notification: {category: string; severity: string},
) {
  return members
    .filter((m) => {
      const p = resolvePreference(
        preferences,
        m.user_id,
        notification.category as NotificationCategory,
      );
      return (
        p.email_enabled &&
        p.digest_mode === "immediate" &&
        severityRank(notification.severity) <= severityRank(p.minimum_severity)
      );
    })
    .map((m) => m.user_id);
}

/**
 * Approval requests are addressed to a person, so they are sent by default. The recipient
 * can opt out with the "Assignment-related" preference.
 */
export function approvalRecipients(
  members: Member[],
  preferences: Preference[],
  approval: {approver_user_id: string | null; approver_role: string | null},
) {
  const addressed = approval.approver_user_id
    ? members.filter((m) => m.user_id === approval.approver_user_id)
    : approval.approver_role
      ? members.filter((m) => m.role === approval.approver_role)
      : [];
  return addressed
    .filter((m) => resolvePreference(preferences, m.user_id, null).assignment_enabled)
    .map((m) => m.user_id);
}
