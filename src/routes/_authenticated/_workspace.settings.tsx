import { useEffect } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { LANGUAGES, parseLanguage } from "@/lib/i18n/language";
import { createFileRoute } from "@tanstack/react-router";
import { AppearanceOptions } from "@/components/common/appearance-options";
import { useAppearance } from "@/lib/appearance/appearance-context";
import { COLOR_PALETTES, parseColorPalette, type ColorPalette } from "@/lib/appearance/theme";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const Route = createFileRoute("/_authenticated/_workspace/settings")({
  head: () => ({ meta: [{ title: "Settings — Flight Analytics" }] }),
  component: Settings,
});

const PALETTE_LABELS = {
  cobalt: "Cobalt",
  jade: "Jade",
  violet: "Violet",
  graphite: "Graphite",
  "candy-rose": "Candy Rose",
  original: "Original colors",
} as const satisfies Record<ColorPalette, string>;

function Settings() {
  const { t, language, setLanguage } = useLanguage();
  const { colorPalette, setColorPalette } = useAppearance();
  useEffect(() => {
    document.title = `${t("Settings")} — Flight Analytics`;
  }, [t]);
  return (
    <>
      <PageHeader
        title={t("Settings")}
        description={t("Personal preferences for your workspace.")}
      />
      <div className="workspace-settings-layout space-y-6">
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>{t("Appearance")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t(
                "Choose how Flight Analytics looks. Your choice applies immediately and is saved in this browser.",
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p id="color-palette-label" className="text-sm font-medium">{t("Color palette")}</p>
              <RadioGroup
                aria-labelledby="color-palette-label"
                value={colorPalette}
                onValueChange={(value) => setColorPalette(parseColorPalette(value))}
                className="grid-cols-2 sm:grid-cols-3"
              >
                {COLOR_PALETTES.map((palette) => (
                  <RadioGroupItem
                    key={palette}
                    value={palette}
                    className="flex aspect-auto min-h-11 h-auto w-full items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-left text-sm data-[state=checked]:border-ring data-[state=checked]:bg-accent sm:px-3"
                  >
                    <span
                      aria-hidden="true"
                      data-palette-swatch={palette}
                      className="size-3 shrink-0 rounded-full"
                    />
                    <span>{t(PALETTE_LABELS[palette])}</span>
                  </RadioGroupItem>
                ))}
              </RadioGroup>
            </div>
            <AppearanceOptions />
          </CardContent>
        </Card>
        <Card className="max-w-3xl">
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
      </div>
    </>
  );
}
