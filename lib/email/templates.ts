export type RenderedEmail = {subject: string; html: string; text: string};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Subjects are single-line; strip control characters so provider text cannot inject headers.
const subjectLine = (value: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

const severityLabel: Record<string, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

function layout(input: {
  heading: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  footerUrl: string;
}) {
  const body = input.paragraphs
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 20px;font-size:20px;line-height:1.3">${escapeHtml(input.heading)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(input.actionLabel)}</a></p>
</td></tr></table>
<p style="font-size:12px;color:#71717a;margin:16px 0 0">You can change which emails you receive in <a href="${escapeHtml(input.footerUrl)}" style="color:#71717a">notification preferences</a>.</p>
</td></tr></table></body></html>`;
}

function plainText(input: {
  heading: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  footerUrl: string;
}) {
  return [
    input.heading,
    "",
    ...input.paragraphs.flatMap((p) => [p, ""]),
    `${input.actionLabel}: ${input.actionUrl}`,
    "",
    `Change which emails you receive: ${input.footerUrl}`,
  ].join("\n");
}

function render(subject: string, content: Parameters<typeof layout>[0]): RenderedEmail {
  return {subject: subjectLine(subject), html: layout(content), text: plainText(content)};
}

export function notificationEmail(input: {
  appUrl: string;
  organisationName: string;
  notification: {
    id: string;
    title: string;
    summary: string;
    recommended_action: string;
    severity: string;
  };
}): RenderedEmail {
  const n = input.notification,
    severity = severityLabel[n.severity] ?? "Alert";
  return render(`[${severity}] ${n.title} · ${input.organisationName}`, {
    heading: n.title,
    paragraphs: [
      `${severity} alert for ${input.organisationName}.`,
      n.summary,
      ...(n.recommended_action ? [`Recommended action: ${n.recommended_action}`] : []),
    ],
    actionLabel: "Open in Action Centre",
    actionUrl: `${input.appUrl}/app/action-centre/${n.id}`,
    footerUrl: `${input.appUrl}/app/action-centre/preferences`,
  });
}

export function approvalEmail(input: {
  appUrl: string;
  organisationName: string;
  workflowName: string | null;
  approval: {id: string; due_at: string | null};
}): RenderedEmail {
  const workflow = input.workflowName ?? "A workflow",
    due = input.approval.due_at
      ? `Please decide by ${new Date(input.approval.due_at).toUTCString()}.`
      : null;
  return render(`Approval needed: ${workflow} · ${input.organisationName}`, {
    heading: "Your approval is needed",
    paragraphs: [
      `${workflow} in ${input.organisationName} is waiting for your approval before it can continue.`,
      ...(due ? [due] : []),
    ],
    actionLabel: "Review approval",
    actionUrl: `${input.appUrl}/app/approvals/${input.approval.id}`,
    footerUrl: `${input.appUrl}/app/action-centre/preferences`,
  });
}
