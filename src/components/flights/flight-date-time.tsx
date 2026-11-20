import { useLanguage } from "@/lib/i18n/language-context";
/** Format the supplied wall clock and offset, never the browser's timezone. */
export function FlightDateTime({ value, compact = false }: { value: string; compact?: boolean }) {
  const { t, date } = useLanguage();
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const month = parts ? Number(parts[2]) : 0;
  if (!parts || month < 1 || month > 12 || !Number.isFinite(Date.parse(value))) {
    return <span>{t("Date/time unavailable")}</span>;
  }
  const [, year, , day, hour, minute, offset] = parts;
  const formattedDate = date(new Date(`${year}-${parts[2]}-${day}T00:00:00Z`), "UTC");
  const time = `${hour}:${minute}`;
  const full = `${formattedDate} · ${time} (UTC${offset === "Z" ? "+00:00" : offset})`;
  return (
    <time dateTime={value} title={compact ? full : undefined}>
      {compact ? time : full}
    </time>
  );
}
