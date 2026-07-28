export function slugify(value: string) {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return slug || "organisation";
}
export function uniqueSlug(name: string, suffix = crypto.randomUUID().slice(0, 8)) {
  return `${slugify(name)}-${suffix}`;
}
