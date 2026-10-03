/**
 * Where to send someone after signing in. Only paths on this site are allowed: "//x" and "/\x"
 * are treated by browsers as other websites, so they fall back too.
 */
export function safeNext(value: unknown, fallback = "/app") {
  return typeof value === "string" && /^\/(?![\/\\])/.test(value) ? value : fallback;
}
