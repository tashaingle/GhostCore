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

type EmailContent = {
  heading: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  /** Link to notification preferences, for emails people can switch off. */
  footerUrl?: string;
  /** Shown instead, for one-off emails such as invitations. */
  footerText?: string;
  /** Bulleted groups, e.g. "Going well" and "Needs a look". */
  sections?: {title: string; colour: string; items: string[]}[];
  /** Key numbers as a small table. */
  figures?: {label: string; value: string; change: string; colour: string}[];
  /** One-click link to stop this kind of email. */
  unsubscribeUrl?: string;
};

function layout(input: EmailContent) {
  const footer = input.footerUrl
    ? `You can change which emails you receive in <a href="${escapeHtml(input.footerUrl)}" style="color:#71717a">notification preferences</a>.`
    : escapeHtml(input.footerText ?? "");
  const sections = (input.sections ?? [])
    .filter((s) => s.items.length)
    .map(
      (
        s,
      ) => `<p style="margin:20px 0 8px;font-size:14px;font-weight:700;color:${s.colour}">${escapeHtml(s.title)}</p>
<ul style="margin:0 0 8px;padding-left:20px;line-height:1.5">${s.items.map((i) => `<li style="margin:0 0 6px">${escapeHtml(i)}</li>`).join("")}</ul>`,
    )
    .join("");
  const figures = input.figures?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;border-top:1px solid #e4e4e7;font-size:14px">${input.figures
        .map(
          (f) =>
            `<tr><td style="padding:9px 0;border-bottom:1px solid #e4e4e7;color:#52525b">${escapeHtml(f.label)}</td><td align="right" style="padding:9px 0;border-bottom:1px solid #e4e4e7;font-weight:600">${escapeHtml(f.value)}</td><td align="right" width="70" style="padding:9px 0;border-bottom:1px solid #e4e4e7;color:${f.colour}">${escapeHtml(f.change)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const body =
    input.paragraphs
      .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`)
      .join("") +
    sections +
    figures;
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:0.04em;color:#1d66b8">METRIC MAGE</p>
<h1 style="margin:0 0 20px;font-size:20px;line-height:1.3">${escapeHtml(input.heading)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#0b1830;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(input.actionLabel)}</a></p>
</td></tr></table>
<p style="font-size:12px;color:#71717a;margin:16px 0 0;max-width:560px">${footer}${input.unsubscribeUrl ? ` <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#71717a">Stop these emails</a>.` : ""}</p>
</td></tr></table></body></html>`;
}

function plainText(input: EmailContent) {
  return [
    input.heading,
    "",
    ...input.paragraphs.flatMap((p) => [p, ""]),
    ...(input.sections ?? [])
      .filter((s) => s.items.length)
      .flatMap((s) => [s.title, ...s.items.map((i) => `- ${i}`), ""]),
    ...(input.figures?.length
      ? [...input.figures.map((f) => `${f.label}: ${f.value} (${f.change})`), ""]
      : []),
    `${input.actionLabel}: ${input.actionUrl}`,
    "",
    input.footerUrl
      ? `Change which emails you receive: ${input.footerUrl}`
      : (input.footerText ?? ""),
    ...(input.unsubscribeUrl ? [`Stop these emails: ${input.unsubscribeUrl}`] : []),
  ].join("\n");
}

function render(subject: string, content: EmailContent): RenderedEmail {
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

const ROLE_SUMMARY: Record<string, string> = {
  admin: "As an admin you can connect tools, change settings and manage the team.",
  manager: "As a manager you can handle alerts, tasks and approvals.",
  member: "As a member you can work on tasks and alerts.",
  viewer: "As a viewer you can see everything without changing anything.",
};

export function invitationEmail(input: {
  organisationName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: string;
}): RenderedEmail {
  const expires = new Date(input.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
  return render(
    `${input.inviterName} invited you to join ${input.organisationName} on Metric Mage`,
    {
      heading: `Join ${input.organisationName} on Metric Mage`,
      paragraphs: [
        `${input.inviterName} has invited you to ${input.organisationName}'s Metric Mage, where the team sees what's going well, what needs a look and what to do next across their business tools.`,
        ROLE_SUMMARY[input.role] ?? "",
        `Sign in or create an account with this email address to accept. The invitation works until ${expires}.`,
      ].filter(Boolean),
      actionLabel: "Accept invitation",
      actionUrl: input.acceptUrl,
      footerText: `You're getting this because ${input.inviterName} invited this email address. If you weren't expecting it, you can ignore it.`,
    },
  );
}

export type WeeklyFigure = {
  label: string;
  value: string;
  change: number | null;
  good: boolean | null;
};

/** "▲ 12%" / "▼ 8%" / "–", coloured by whether the move is good for the business. */
function changeCell(f: WeeklyFigure) {
  if (f.change === null || !Number.isFinite(f.change)) return {change: "–", colour: "#71717a"};
  const rounded = Math.round(f.change),
    better = f.good === null ? null : f.good ? rounded >= 0 : rounded <= 0;
  return {
    change: rounded === 0 ? "0%" : `${rounded > 0 ? "▲" : "▼"} ${Math.abs(rounded)}%`,
    colour: rounded === 0 || better === null ? "#71717a" : better ? "#047857" : "#b45309",
  };
}

/** The Monday email: last week in a few lines, then a link to see more. */
export function weeklySummaryEmail(input: {
  appUrl: string;
  organisationName: string;
  firstName: string | null;
  weekLabel: string;
  goingWell: string[];
  needsLook: string[];
  figures: WeeklyFigure[];
  waiting: number;
  unsubscribeUrl: string;
}): RenderedEmail {
  // The opening line already says it's compared with the week before.
  const trim = (items: string[]) => items.map((i) => i.replace(/ compared with last week$/, "")),
    goingWell = trim(input.goingWell),
    needsLook = trim(input.needsLook);
  const lead = goingWell[0] ?? needsLook[0] ?? null;
  const subject = lead
    ? `Your week at ${input.organisationName}: ${lead[0].toLowerCase()}${lead.slice(1)}`
    : `Your week at ${input.organisationName}`;
  return render(subject, {
    heading: `Your week at ${input.organisationName}`,
    paragraphs: [
      `${input.firstName ? `Morning ${input.firstName}. ` : ""}Here's how ${input.weekLabel} went, compared with the week before.`,
      ...(input.waiting
        ? [
            `${input.waiting} thing${input.waiting === 1 ? " is" : "s are"} waiting for you in the Action Centre.`,
          ]
        : []),
    ],
    sections: [
      {title: "Going well", colour: "#047857", items: goingWell.slice(0, 4)},
      {title: "Needs a look", colour: "#b45309", items: needsLook.slice(0, 4)},
    ],
    figures: input.figures
      .slice(0, 6)
      .map((f) => ({label: f.label, value: f.value, ...changeCell(f)})),
    actionLabel: "See the full picture",
    actionUrl: `${input.appUrl}/app`,
    footerText: "You get this every Monday.",
    unsubscribeUrl: input.unsubscribeUrl,
  });
}
