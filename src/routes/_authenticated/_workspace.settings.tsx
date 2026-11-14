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
  const { appearance, setAppearance } = useAppearance();
  return (
    <>
      <PageHeader title="Settings" description="Personal preferences for your workspace." />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <p id="appearance-description" className="text-sm text-muted-foreground">
            Choose how Flight Analytics looks. Your choice applies immediately and is saved in this
            browser.
          </p>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-label="Appearance"
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
                  <RadioGroupItem id={`appearance-${value}`} value={value} aria-label={label} />
                </span>
                <span className="font-semibold">{label}</span>
                <span className="text-xs font-normal leading-relaxed text-muted-foreground">
                  {description}
                </span>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>
    </>
  );
}
