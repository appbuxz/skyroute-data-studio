
export function localDateTimeToIso(
  date: string,
  time: string,
  timeZone: string,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid date format");
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) {
    throw new Error("Invalid time format");
  }

  const dateParts = date.split("-").map(Number);
  const timeParts = time.split(":").map(Number);

  const [year, month, day] = dateParts;
  const [hour, minute, second] = timeParts;

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new Error("Invalid datetime");
  }

  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const checkDate = new Date(naiveUtc);

  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date");
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const getLocalParts = (timestamp: number) => {
    const values: Record<string, string> = {};

    for (const part of formatter.formatToParts(new Date(timestamp))) {
      values[part.type] = part.value;
    }

    return {
      year: Number(values["year"]),
      month: Number(values["month"]),
      day: Number(values["day"]),
      hour: Number(values["hour"]),
      minute: Number(values["minute"]),
      second: Number(values["second"]),
    };
  };

  const possibleOffsets = new Set<number>();

  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const timestamp = naiveUtc + hours * 3600000;
    const parts = getLocalParts(timestamp);

    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );

    possibleOffsets.add(representedUtc - timestamp);
  }

  const candidates = [...possibleOffsets]
    .map((offset) => naiveUtc - offset)
    .filter((timestamp) => {
      const parts = getLocalParts(timestamp);

      return (
        parts.year === year &&
        parts.month === month &&
        parts.day === day &&
        parts.hour === hour &&
        parts.minute === minute &&
        parts.second === second
      );
    });

  if (candidates.length !== 1) {
    throw new Error(
      candidates.length === 0
        ? "Local datetime does not exist in this timezone"
        : "Local datetime is ambiguous in this timezone",
    );
  }

  const candidate = candidates[0];

  if (candidate === undefined) {
    throw new Error("Unable to resolve local datetime");
  }

  const offsetMinutes = (naiveUtc - candidate) / 60000;

  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);

  const offsetHours = String(
    Math.floor(absoluteOffset / 60),
  ).padStart(2, "0");

  const offsetMins = String(
    absoluteOffset % 60,
  ).padStart(2, "0");

  return `${date}T${time}${sign}${offsetHours}:${offsetMins}`;
}
