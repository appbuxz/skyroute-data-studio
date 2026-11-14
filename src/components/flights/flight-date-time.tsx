import { useLanguage } from "@/lib/i18n/language-context";
/** Format the supplied wall clock and offset, never the browser's timezone. */
export function FlightDateTime({ value }: { value: string }) {
  const { t, date } = useLanguage();
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const month = parts ? Number(parts[2]) : 0;
  if (!parts || month < 1 || month > 12 || !Number.isFinite(Date.parse(value))) {
    return <span>{t("Date/time unavailable")}</span>;
  }
  const [, year, , day, hour, minute, offset] = parts;
  const formattedDate = date(new Date(`${year}-${parts[2]}-${day}T00:00:00Z`), "UTC");
  return (
    <time dateTime={value}>
      {formattedDate} · {hour}:{minute} (UTC{offset === "Z" ? "+00:00" : offset})
    </time>
  );
}
