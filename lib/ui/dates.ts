/**
 * British date formats for everything people read: "10 Oct 2026, 14:30" and "10 Oct 2026".
 * Without these, the server's default can show American month-first dates.
 */
export const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
};
export const DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/London",
};
export const TIME: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
};
