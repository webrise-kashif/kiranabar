/** A short, shopper-facing order reference: "#" + the id's last 8 hex digits. */
export function orderReference(id: string): string {
  return `#${id.replaceAll("-", "").slice(-8).toUpperCase()}`;
}

/** "PLACED" -> "Placed". */
export function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function formatOrderDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
}
