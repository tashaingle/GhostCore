/**
 * The repositories this organisation tracks. One GitHub account has a single installation shared
 * by every Metric Mage organisation it connects to, so each organisation keeps its own choice here.
 * Connections made before this existed have no choice saved and track everything they can see.
 */
export function selectedRepositories(settings: Record<string, unknown> | null | undefined) {
  const value = settings?.repositories;
  return Array.isArray(value) ? value.filter((r): r is string => typeof r === "string") : undefined;
}

export function trackedRepositories(available: string[], selection: string[] | undefined) {
  return selection ? available.filter((r) => selection.includes(r)) : available;
}

/**
 * What a fresh connection starts with: the previous choice when reconnecting the same installation,
 * the only repository when there is just one, otherwise nothing until the user chooses.
 */
export function initialSelection(
  available: string[],
  previous: Record<string, unknown> | null | undefined,
  installationId: string,
) {
  const kept =
    previous?.installationId === installationId ? selectedRepositories(previous) : undefined;
  if (kept) return kept.filter((r) => available.includes(r));
  return available.length === 1 ? available : [];
}
