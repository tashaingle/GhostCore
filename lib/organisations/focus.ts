/** Left out of the working list for now. The organisations and their data stay. */
const PARKED_NAMES = new Set(["tash", "rabbit care", "unhinged clothing"]);

export function isParkedOrganisation(name: string) {
  return PARKED_NAMES.has(name.trim().toLowerCase());
}
