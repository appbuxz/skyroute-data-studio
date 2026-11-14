import { useEffect } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { LANGUAGES, parseLanguage } from "@/lib/i18n/language";
import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppearance } from "@/lib/appearance/appearance-context";
import { parseAppearance } from "@/lib/appearance/theme";

export const Route = createFileRoute("/_authenticated/_workspace/settings")({
  head: () => ({ meta: [{ title: "Settings — Flight Analytics" }] }),
  component: Settings,
});

const OPTIONS = [
  {
    value: "light",
    label: "Light",
    description: "A bright workspace with light surfaces.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Graphite surfaces with a cool blue accent.",
    icon: Moon,
  },
  {
    value: "system",
    label: "System",
    description: "Follow your device’s appearance automatically.",
    icon: Monitor,
  },
] as const;

function Settings() {
  const { t, language, setLanguage } = useLanguage();
  useEffect(() => {
    document.title = `${t("Settings")} — Flight Analytics`;
  }, [t]);
  const { appearance, setAppearance } = useAppearance();
  return (
    <>
      <PageHeader
        title={t("Settings")}
        description={t("Personal preferences for your workspace.")}
      />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{t("Appearance")}</CardTitle>
          <p id="appearance-description" className="text-sm text-muted-foreground">
            {t(
              "Choose how Flight Analytics looks. Your choice applies immediately and is saved in this browser.",
            )}
          </p>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-label={t("Appearance")}
            aria-describedby="appearance-description"
            value={appearance}
            onValueChange={(value) => setAppearance(parseAppearance(value))}
            className="gap-3 sm:grid-cols-3"
          >
            {OPTIONS.map(({ value, label, description, icon: Icon }) => (
              <Label
                key={value}
                htmlFor={`appearance-${value}`}
                className="flex cursor-pointer flex-col gap-3 rounded-lg border bg-background p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
              >
                <span className="flex items-center justify-between gap-3">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <RadioGroupItem id={`appearance-${value}`} value={value} aria-label={t(label)} />
                </span>
                <span className="font-semibold">{t(label)}</span>
                <span className="text-xs font-normal leading-relaxed text-muted-foreground">
                  {t(description)}
                </span>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
      <Card className="mt-6 max-w-3xl">
        <CardHeader>
          <CardTitle>{t("Language")}</CardTitle>
          <p id="language-description" className="text-sm text-muted-foreground">
            {t(
              "Choose the language for the workspace menu, settings and flight search. Saved in this browser.",
            )}
          </p>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-label={t("Language")}
            aria-describedby="language-description"
            value={language}
            onValueChange={(value) => setLanguage(parseLanguage(value))}
            className="gap-3 sm:grid-cols-3"
          >
            {LANGUAGES.map((value) => (
              <Label
                key={value}
                htmlFor={`language-${value}`}
                lang={value}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-background p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
              >
                {{ kk: "Қазақша", ru: "Русский", en: "English" }[value]}
                <RadioGroupItem
                  id={`language-${value}`}
                  value={value}
                  aria-label={{ kk: "Қазақша", ru: "Русский", en: "English" }[value]}
                />
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </>
  );
}
