import type { ReactNode } from "react";

export function PageHeader({ title, description, badge }: { title: string; description?: string; badge?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">{title}</h1>
        {badge}
      </div>
      {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function DemoBadge({ children = "Placeholder" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-highlight/40 bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">{icon}</div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
