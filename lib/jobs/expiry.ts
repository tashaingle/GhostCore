export type ExpiryRow = {
  id: string;
  status: string;
  token_expires_at: string | null;
  refresh_token_encrypted: string | null;
};

/**
 * Connections whose login has truly run out. A past token_expires_at alone isn't enough: Google's
 * access tokens last an hour and are renewed with the stored refresh token on the next sync, so
 * only connections that can't renew themselves (e.g. Meta's long-lived tokens) count as expired.
 */
export function trulyExpired(rows: ExpiryRow[], now = new Date()) {
  return rows.filter(
    (row) =>
      row.status !== "disconnected" &&
      row.token_expires_at !== null &&
      new Date(row.token_expires_at) <= now &&
      !row.refresh_token_encrypted,
  );
}
