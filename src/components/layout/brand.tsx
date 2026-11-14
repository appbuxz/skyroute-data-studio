import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2 font-display text-base font-semibold", className)}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Plane className="h-4 w-4" />
      </span>
      <span className={compact ? "md:sr-only" : undefined}>Flight Analytics</span>
    </span>
  );
}
