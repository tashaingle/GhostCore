import {z} from "zod";

/**
 * Turns what people type ("xufu.co.uk", "www.xufu.co.uk", "https://xufu.co.uk/") into a full web
 * address, adding https:// when it's missing. Returns null if it isn't a plausible website.
 */
export function normaliseWebAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    // Needs a real-looking host such as xufu.co.uk, not "xufu" or "localhost".
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** An optional web address field: empty, or anything normaliseWebAddress accepts. */
export const optionalWebAddress = (message: string) =>
  z.string().transform((value, ctx) => {
    const normalised = normaliseWebAddress(value);
    if (normalised === null) {
      ctx.addIssue({code: "custom", message});
      return z.NEVER;
    }
    return normalised;
  });
