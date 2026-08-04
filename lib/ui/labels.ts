/** Human-friendly labels for providers, jobs, correlations, and roles. */

const providerNames: Record<string, string> = {
  github: "GitHub",
  google_analytics: "Google Analytics",
  google_search_console: "Search Console",
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  stripe: "Stripe",
  shopify: "Shopify",
  meta_ads: "Meta Ads",
  meta_social: "Meta Social",
  linkedin: "LinkedIn",
  manual: "Manual import",
  notion: "Notion",
  slack: "Slack",
};

export function providerLabel(id: string | null | undefined) {
  if (!id) return "Platform";
  return providerNames[id] ?? id.replaceAll("_", " ");
}

export function roleLabel(role: string | null | undefined) {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/** Event types that clutter the default timeline for non-technical users. */
export const LOW_SIGNAL_EVENT_TYPES = new Set([
  "git.push",
  "github.push",
  "shopify.discount_created",
  "shopify.discount_disabled",
  "shopify.discount_expired",
]);

export function isLowSignalEventType(eventType: string) {
  return LOW_SIGNAL_EVENT_TYPES.has(eventType) || eventType.endsWith(".push");
}

export function humanEventLabel(source: string, _category: string, eventType: string) {
  const provider = providerLabel(source);
  const type = eventType.includes(".")
    ? eventType.split(".").slice(1).join(" ").replaceAll("_", " ")
    : eventType.replaceAll("_", " ");
  return `${provider} · ${type}`;
}

export function configureIntegrationLabel(
  providerId: string,
  configurationRequired: boolean,
) {
  if (providerId === "slack") {
    return configurationRequired ? "Choose channels" : "Manage channels";
  }
  if (providerId === "gmail") {
    return configurationRequired ? "Mailbox settings" : "Settings";
  }
  if (providerId === "google_calendar") {
    return configurationRequired ? "Choose calendars" : "Calendars";
  }
  if (
    providerId === "google_analytics" ||
    providerId === "google_search_console" ||
    providerId === "meta_ads" ||
    providerId === "meta_social" ||
    providerId === "linkedin"
  ) {
    return configurationRequired ? "Choose account" : "Settings";
  }
  if (providerId === "notion") {
    return configurationRequired ? "Choose databases" : "Databases";
  }
  if (providerId === "stripe" || providerId === "shopify") {
    return configurationRequired ? "Finish setup" : "Settings";
  }
  return configurationRequired ? "Finish setup" : "Settings";
}

const platformJobNames: Record<string, string> = {
  "integration.health": "Check connected tools",
  "correlation.reconcile": "Match related events",
  "maintenance.expired-locks": "Clear stuck locks",
  "maintenance.job-cleanup": "Clean old job history",
  "notification.generate": "Refresh Action Centre",
  "workflow.dispatch": "Continue workflows",
  "workflow.timeout": "Check timed-out workflows",
  "approval.reminders": "Approval reminders",
  "workflow.cleanup": "Clean workflow history",
};

/** Turn job_key like integration.sync:uuid into a plain-English title. */
export function humanJobLabel(
  jobKey: string,
  provider?: string | null,
): {title: string; detail?: string} {
  if (jobKey.startsWith("integration.sync:")) {
    const name = providerLabel(provider);
    return {
      title: `Keep ${name} up to date`,
      detail: "Automatic import of new activity from this connected tool",
    };
  }
  if (platformJobNames[jobKey]) {
    return {
      title: platformJobNames[jobKey],
      detail: jobKey,
    };
  }
  if (jobKey.startsWith("integration.")) {
    return {
      title: `Integration task: ${jobKey.replace("integration.", "").replaceAll("_", " ")}`,
      detail: jobKey,
    };
  }
  return {
    title: jobKey.replaceAll(".", " · ").replaceAll("_", " "),
    detail: jobKey,
  };
}

export function humanScheduleLabel(type: string, value: string | null) {
  if (type === "recurring" && value) {
    const map: Record<string, string> = {
      "5m": "Every 5 minutes",
      "15m": "Every 15 minutes",
      "1h": "Every hour",
      "1d": "Once a day",
      "1w": "Once a week",
    };
    return map[value] ?? `Every ${value}`;
  }
  if (type === "cron" && value) return `Schedule: ${value}`;
  if (type === "manual") return "Manual only";
  if (type === "disabled") return "Paused";
  return `${type}${value ? ` ${value}` : ""}`;
}

export function humanJobState(state: string) {
  const map: Record<string, string> = {
    healthy: "Healthy",
    running: "Running now",
    failing: "Failing",
    overdue: "Behind schedule",
    paused: "Paused",
  };
  return map[state] ?? state;
}

const relationshipNames: Record<string, string> = {
  temporal_sequence: "Happened close together in time",
  same_entity: "Same business object",
  payment_match: "Matching payment activity",
  refund_match: "Matching refund activity",
  attribution: "Marketing attribution link",
  traffic_change: "Related traffic change",
  order_payment: "Order linked to payment",
  ad_to_analytics: "Ads activity near website change",
  email_calendar: "Email near calendar event",
  deployment_traffic: "Deploy near traffic change",
};

export function humanRelationship(type: string) {
  return (
    relationshipNames[type] ??
    type.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function humanStrength(strength: string) {
  const map: Record<string, string> = {
    confirmed: "Strong match",
    strong: "Strong match",
    moderate: "Possible match",
    weak: "Weak match",
  };
  return map[strength] ?? strength;
}

export function humanCategory(category: string) {
  const map: Record<string, string> = {
    background_job: "Automation",
    integration: "Connected tool",
    credential: "Login / access",
    correlation: "Related events",
    financial: "Money",
    task: "Task",
    deployment: "Deploy",
    import: "Import",
    organisation: "Organisation",
    security: "Security",
    system: "System",
  };
  return map[category] ?? category.replaceAll("_", " ");
}

export function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatWhenFriendly(iso: string | null | undefined) {
  if (!iso) return "an unknown time";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * Display-time rewrite so old technical notification titles still make sense.
 * jobById: map of background job id -> {job_key, provider}
 * integrationById: map of integration id -> {provider, name}
 */
export function humanizeNotificationDisplay(input: {
  title: string;
  summary: string | null;
  recommendedAction: string | null;
  explanation?: string | null;
  ruleKey: string;
  sourceType: string;
  sourceId: string;
  jobById?: Map<string, {job_key: string; provider: string | null}>;
  integrationById?: Map<
    string,
    {provider: string; name: string | null}
  >;
}): {title: string; summary: string; recommendedAction: string; explanation?: string} {
  const job = input.jobById?.get(input.sourceId);
  const integration = input.integrationById?.get(input.sourceId);

  let title = input.title;
  let summary = input.summary ?? "";
  let recommendedAction = input.recommendedAction ?? "";
  let explanation = input.explanation ?? undefined;

  // Rewrite technical job-key titles from older evaluations
  if (
    input.sourceType === "background_job" ||
    /integration\.(sync|health)|maintenance\.|correlation\.reconcile|is overdue|is retrying|failed/i.test(
      title,
    )
  ) {
    const jobKey =
      job?.job_key ??
      (title.match(
        /((?:integration|maintenance|correlation|notification|workflow)\.[\w.:-]+)/,
      )?.[1] ??
        "");
    if (jobKey || job) {
      const label = humanJobLabel(jobKey || job!.job_key, job?.provider);
      if (/overdue|behind schedule|stale/i.test(title) || input.ruleKey.includes("stale")) {
        title = `${label.title} is behind schedule`;
        summary =
          summary.replace(
            /Scheduled execution was due [^\n.]+/i,
            (match) => {
              const iso = match.replace(/Scheduled execution was due /i, "").trim();
              return `This automatic task was due ${formatWhenFriendly(iso)}`;
            },
          ) ||
          `This automatic task was supposed to run earlier and has not finished yet.`;
        if (!summary.includes("automatic")) {
          summary = `${summary} Ghost runs this in the background so your tools stay up to date.`;
        }
        recommendedAction =
          "Open Background Jobs and click Run now for this task, or wait for the daily automatic run. You can dismiss this if you only sync tools yourself.";
        explanation =
          explanation?.replace(/dispatcher and job locks/gi, "Background Jobs page") ??
          "Ghost's automatic scheduler has not run this task on time.";
      } else if (/failed/i.test(title)) {
        title = `${label.title} failed`;
        recommendedAction =
          "Open Background Jobs, check the error, then click Retry or Run now.";
      } else if (/retrying/i.test(title)) {
        title = `${label.title} is retrying`;
        recommendedAction = "Wait for the automatic retry, or open Background Jobs and run it now.";
      }
    }
  }

  if (
    input.sourceType === "integration" ||
    /credential expires|integration is /i.test(title)
  ) {
    const provider =
      integration?.provider ??
      title.match(/^([a-z0-9_]+)\s/i)?.[1] ??
      "";
    const name = providerLabel(provider || integration?.provider);
    if (/expires/i.test(title)) {
      title = `${name} access may expire soon`;
      summary = summary.replace(
        /Known expiry:\s*([^\n.]+)/i,
        (_, iso: string) => `Access may stop working after ${formatWhenFriendly(iso.trim())}`,
      );
      recommendedAction =
        "Open Integrations and reconnect this tool if Sync starts failing.";
    } else if (/is (error|expired|disconnected)/i.test(title)) {
      title = `${name} needs attention`;
      recommendedAction = "Open Integrations to reconnect or fix this tool.";
    }
  }

  // Soften remaining technical phrases
  summary = summary
    .replace(/Review the dispatcher and job locks, then run the job when safe\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  recommendedAction = recommendedAction
    .replace(/Review the dispatcher and job locks, then run the job when safe\.?/gi, 
      "Open Background Jobs and click Run now.")
    .trim();

  return {
    title,
    summary: summary || "Open this item for more detail.",
    recommendedAction:
      recommendedAction || "Open this item for the recommended next step.",
    explanation,
  };
}
