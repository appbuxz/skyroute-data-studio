import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppearance } from "@/lib/appearance/appearance-context";
import { INTERFACE_STYLES, parseAppearance, parseInterfaceStyle } from "@/lib/appearance/theme";
import { useLanguage } from "@/lib/i18n/language-context";

const STYLE_LABELS = { current: "Current", "client-first": "Client First" } as const;
const MODE_LABELS = { system: "System", light: "Light", dark: "Dark" } as const;
const MODES = ["system", "light", "dark"] as const;

export function AppearanceOptions() {
  const { t } = useLanguage();
  const id = useId();
  const { appearance, setAppearance, interfaceStyle, setInterfaceStyle } = useAppearance();

  const groups = [
    {
      label: "Style",
      value: interfaceStyle,
      onChange: (value: string) => setInterfaceStyle(parseInterfaceStyle(value)),
      options: INTERFACE_STYLES.map((value) => ({ value, label: STYLE_LABELS[value] })),
    },
    {
      label: "Mode",
      value: appearance,
      onChange: (value: string) => setAppearance(parseAppearance(value)),
      options: MODES.map((value) => ({ value, label: MODE_LABELS[value] })),
    },
  ];

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {groups.map(({ label, value, onChange, options }) => (
        <div key={label} className="min-w-0 space-y-1">
          <p id={`${id}-${label}`} className="text-xs font-medium">
            {t(label)}
          </p>
          <RadioGroup
            aria-labelledby={`${id}-${label}`}
            value={value}
            onValueChange={onChange}
            className="flex flex-wrap gap-1 rounded-lg border border-current/25 p-1"
          >
            {options.map((option) => (
              <RadioGroupItem
                key={option.value}
                value={option.value}
                className="appearance-option flex aspect-auto h-auto min-h-7 w-auto items-center rounded-md border-0 px-2 text-xs text-inherit shadow-none"
              >
                {t(option.label)}
              </RadioGroupItem>
            ))}
          </RadioGroup>
        </div>
      ))}
    </div>
  );
}
