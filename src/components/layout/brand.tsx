import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-display text-base font-semibold", className)}>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-highlight text-primary">
        <Plane className="h-4 w-4" />
      </span>
      Flight Analytics
    </span>
  );
}
