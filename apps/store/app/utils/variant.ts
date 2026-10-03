/** A variant's attributes as a shopper-facing label, e.g. "Color: Red · Size: M". */
export function describeVariant(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${value}`)
    .join(" · ");
}
