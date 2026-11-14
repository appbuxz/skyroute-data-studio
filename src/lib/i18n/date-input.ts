import type { Language } from "./language";

export function formatInputDate(value: string, language: Language) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return [match[3], match[2], match[1]].join(language === "en" ? "/" : ".");
}

export function parseInputDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match =
    /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(value) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(value);
  return match &&
    Number(match[1]) >= 1 &&
    Number(match[1]) <= 31 &&
    Number(match[2]) >= 1 &&
    Number(match[2]) <= 12
    ? `${match[3]}-${match[2]}-${match[1]}`
    : value;
}
