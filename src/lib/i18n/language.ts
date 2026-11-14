import { messages } from "./messages";
export const LANGUAGE_KEY = "flight-analytics:language";
export const LANGUAGES = ["kk", "ru", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LOCALES: Record<Language, string> = { en: "en-GB", ru: "ru-RU", kk: "kk-KZ" };
export function parseLanguage(value: string | null): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : "en";
}
export function readLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    return parseLanguage(window.localStorage.getItem(LANGUAGE_KEY));
  } catch {
    return "en";
  }
}
export function createTranslator(language: Language) {
  const locale = LOCALES[language];
  const number = (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale, options)
      .formatToParts(value)
      .map((part) =>
        language === "kk" && part.type === "group"
          ? "\u00a0"
          : language === "kk" && part.type === "decimal"
            ? ","
            : part.value,
      )
      .join("");
  const date = (value: Date, timeZone?: string) => {
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    };
    if (language !== "kk") return new Intl.DateTimeFormat(locale, options).format(value);
    // Some Chromium ICU builds advertise kk but return generic month names like M12.
    const months = [
      "қаң.",
      "ақп.",
      "нау.",
      "сәу.",
      "мам.",
      "мау.",
      "шіл.",
      "там.",
      "қыр.",
      "қаз.",
      "қар.",
      "жел.",
    ];
    const parts = new Intl.DateTimeFormat("en-GB", { ...options, month: "numeric" }).formatToParts(
      value,
    );
    const part = (type: string) => parts.find((item) => item.type === type)!.value;
    return `${part("year")} ж. ${number(Number(part("day")))} ${months[Number(part("month")) - 1]}`;
  };
  const t = (source: string, values: Record<string, string | number> = {}) => {
    const translated =
      language === "en" ? source : (messages[source]?.[language === "ru" ? 0 : 1] ?? source);
    return translated.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
  };
  return {
    language,
    locale,
    t,
    number,
    date,
    dateTime: (value: string) =>
      language === "kk"
        ? `${date(new Date(value))}, ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value))}`
        : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(
            new Date(value),
          ),
    groupsLabel: (count: number) =>
      language === "ru"
        ? `${number(count)} ${({ one: "группа сравнения", few: "группы сравнения", many: "групп сравнения", other: "группы сравнения" } as Record<string, string>)[new Intl.PluralRules(locale).select(count)]}`
        : language === "kk"
          ? `${number(count)} салыстыру тобы`
          : `${number(count)} comparison ${count === 1 ? "group" : "groups"}`,
    message: (source: string) =>
      messages[source]
        ? t(source)
        : source.startsWith("Travelport returned no supported flight offers")
          ? t("No supported flight offers were returned.")
          : source.startsWith("Expected integer")
            ? t("Enter a whole number")
            : t("Unable to complete the flight search request. Please try again."),
  };
}
export const LANGUAGE_INIT_SCRIPT = `(()=>{let language='en';try{const saved=localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)});if(['kk','ru','en'].includes(saved))language=saved;}catch{}document.documentElement.lang=language;})();`;
