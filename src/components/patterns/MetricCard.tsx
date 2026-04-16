import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  /** Label shown above the number (e.g. "Total Spend"). */
  label: string;
  /** The main number, pre-formatted (e.g. "$12,450" or "3,500"). */
  value: React.ReactNode;
  /** Optional lucide icon (as a ReactNode element). */
  icon?: React.ReactNode;
  /** Period-over-period change as a percent, e.g. 12.4 or -3.1. */
  deltaPct?: number | null;
  /** Label for the comparison window, e.g. "vs prev 30d". */
  deltaLabel?: string;
  /** Optional sparkline/mini-chart slot shown below the value. */
  chart?: React.ReactNode;
  /** Custom accent color for the icon background. Default: accent. */
  accent?: "accent" | "primary" | "success" | "warning" | "critical" | "muted";
  className?: string;
}

const accentClasses: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  accent: "bg-accent/10 text-accent",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  critical: "bg-critical/10 text-critical",
  muted: "bg-muted text-muted-foreground",
};

/**
 * Unified stat card. Used on Briefing, Portfolio stats, Visibility scores.
 * Supports an optional sparkline slot via the `chart` prop for the premium
 * look the user asked for.
 */
export function MetricCard({
  label,
  value,
  icon,
  deltaPct,
  deltaLabel = "vs prev 30d",
  chart,
  accent = "accent",
  className,
}: MetricCardProps) {
  const deltaDir =
    deltaPct === null || deltaPct === undefined
      ? "flat"
      : deltaPct > 0
        ? "up"
        : deltaPct < 0
          ? "down"
          : "flat";

  const deltaColor =
    deltaDir === "up"
      ? "text-success"
      : deltaDir === "down"
        ? "text-critical"
        : "text-muted-foreground";

  const DeltaIcon =
    deltaDir === "up" ? ArrowUpRight : deltaDir === "down" ? ArrowDownRight : Minus;

  return (
    <Card className={cn("relative overflow-hidden p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          {deltaPct !== null && deltaPct !== undefined && (
            <div className={cn("mt-1 flex items-center gap-1 text-xs", deltaColor)}>
              <DeltaIcon className="h-3 w-3" />
              <span className="font-medium">
                {deltaPct > 0 ? "+" : ""}
                {deltaPct.toFixed(1)}%
              </span>
              <span className="text-muted-foreground">{deltaLabel}</span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
              accentClasses[accent]
            )}
          >
            {icon}
          </div>
        )}
      </div>

      {chart && (
        <div className="mt-3 -mx-1 -mb-1">
          {chart}
        </div>
      )}
    </Card>
  );
}
