import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** If true, renders without the outer Card border — use when already inside one. */
  bare?: boolean;
}

/**
 * Standardized empty state. Icon + title + description + optional CTA.
 * Replaces the ~6 hand-rolled empty states across briefing, approvals, logs,
 * portfolio, visibility, intelligence.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  bare = false,
}: EmptyStateProps) {
  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );

  return bare ? content : <Card>{content}</Card>;
}
