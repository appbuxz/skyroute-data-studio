import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { enGB, kk, ru } from "date-fns/locale";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/lib/i18n/language-context";
import { formatInputDate, parseInputDate } from "@/lib/i18n/date-input";

/** Localized presentation; search validation and requests retain ISO calendar dates. */
export function LocalizedDateInput({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : undefined;
  const selected =
    candidate && Number.isFinite(candidate.getTime()) && format(candidate, "yyyy-MM-dd") === value
      ? candidate
      : undefined;
  const locale = { en: enGB, ru, kk }[language];
  return (
    <div className="flex min-w-0 gap-2">
      <Input
        id={id}
        inputMode="numeric"
        lang={language}
        placeholder={t(language === "en" ? "DD/MM/YYYY" : "DD.MM.YYYY")}
        value={formatInputDate(value, language)}
        onChange={(event) => onChange(parseInputDate(event.target.value))}
        aria-invalid={invalid}
        className="min-w-0"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0"
            aria-label={t("Choose date: {label}", { label })}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={locale}
            selected={selected}
            {...(selected ? { defaultMonth: selected } : {})}
            autoFocus
            labels={{
              labelNext: () => t("Next month"),
              labelPrevious: () => t("Previous month"),
              labelDayButton: (date) => format(date, "PPPP", { locale }),
            }}
            onSelect={(date) => {
              onChange(date ? format(date, "yyyy-MM-dd") : "");
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
