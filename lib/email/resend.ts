import "server-only";

export type Env = Record<string, string | undefined>;
export type EmailConfig = {apiKey: string; from: string; appUrl: string};

/** Delivery is enabled only when both RESEND_API_KEY and EMAIL_FROM are set. */
export function emailConfig(env: Env = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim(),
    from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return {
    apiKey,
    from,
    appUrl: (env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, ""),
  };
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export class EmailError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 15_000;

export async function sendEmail(
  config: EmailConfig,
  message: EmailMessage,
  request: typeof fetch = fetch,
): Promise<{id: string}> {
  let response: Response;
  try {
    response = await request(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        // Resend ignores a repeated key for 24 hours, so a retry after a lost response never double-sends.
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new EmailError("Email provider could not be reached.", true);
  }
  const body = (await response.json().catch(() => null)) as {
    id?: unknown;
    message?: unknown;
  } | null;
  if (response.ok && typeof body?.id === "string") return {id: body.id};
  const detail = typeof body?.message === "string" ? body.message.slice(0, 200) : "";
  if (response.status === 429 || response.status >= 500)
    throw new EmailError(`Email provider is temporarily unavailable (${response.status}).`, true);
  throw new EmailError(
    `Email was rejected (${response.status})${detail ? `: ${detail}` : "."}`,
    false,
  );
}
