import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLanguage } from "@/lib/i18n/language-context";
import { cn } from "@/lib/utils";

/** A named, keyboard-operable disclosure. State stays independent of language and data. */
export function WorkspaceSection({
  title,
  summary,
  children,
  defaultOpen = true,
  label,
  className,
  contentClassName,
  keepMounted = false,
}: {
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  label?: string;
  className?: string;
  contentClassName?: string;
  keepMounted?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section
        aria-label={t(label ?? title)}
        className={cn("min-w-0 rounded-lg border bg-card text-card-foreground", className)}
      >
        <h2 className="px-4 py-3">
          <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold">{t(title)}</span>
              {summary && (
                <span className="text-sm font-normal text-muted-foreground">{summary}</span>
              )}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent
          {...(keepMounted ? { forceMount: true } : {})}
          hidden={keepMounted && !open}
          className={cn("space-y-3 px-4 pb-4", contentClassName)}
        >
          {children}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
