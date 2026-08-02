const styles: Record<string, string> = {
  critical: "badge badge-critical",
  warning: "badge badge-warning",
  info: "badge badge-info",
  good: "badge badge-good",
  confirmed: "badge badge-good",
  strong: "badge badge-warning",
  moderate: "badge badge-info",
};

export function SeverityBadge({value}: {value: string}) {
  return <span className={styles[value] ?? "badge badge-muted"}>{value}</span>;
}
