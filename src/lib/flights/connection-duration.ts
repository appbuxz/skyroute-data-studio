function timestampWithOffset(value: string): number {
  const date = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.exec(value)?.[1];
  if (!date) return NaN;
  const midnight = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== date) {
    return NaN;
  }
  return Date.parse(value);
}

export function connectionDuration(arrival: string, departure: string): number | undefined {
  const elapsed = timestampWithOffset(departure) - timestampWithOffset(arrival);
  if (Number.isFinite(elapsed) && elapsed >= 0) return Math.floor(elapsed / 60_000);
}
