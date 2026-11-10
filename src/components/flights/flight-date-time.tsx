const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format the supplied wall clock and offset, never the browser's timezone. */
export function FlightDateTime({ value }: { value: string }) {
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const month = parts ? MONTHS[Number(parts[2]) - 1] : undefined;
  if (!parts || !month || !Number.isFinite(Date.parse(value))) {
    return <span>Date/time unavailable</span>;
  }
  const [, year, , day, hour, minute, offset] = parts;
  return (
    <time dateTime={value}>
      {Number(day)} {month} {year} · {hour}:{minute} (UTC{offset === "Z" ? "+00:00" : offset})
    </time>
  );
}
