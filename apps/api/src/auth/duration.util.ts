const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

const UNIT_MS = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

type DurationUnit = keyof typeof UNIT_MS;

/**
 * Parses the simple "15m" / "30d" style durations used by
 * AUTH_JWT_ACCESS_TTL / AUTH_JWT_REFRESH_TTL into milliseconds. Not a
 * general-purpose duration library -- this project only ever needs a
 * single numeric amount plus one unit, so a tiny local parser avoids
 * adding a dependency for it.
 */
export function parseDurationMs(duration: string): number {
  const match = DURATION_PATTERN.exec(duration.trim());

  if (!match) {
    throw new Error(`Invalid duration "${duration}". Expected a pattern like "15m" or "30d".`);
  }

  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit as DurationUnit];
}
