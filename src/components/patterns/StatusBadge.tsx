import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Info,
  type LucideIcon,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SeverityStatus = "critical" | "warning" | "info" | "success";
export type LifecycleStatus =
  | "pending"
  | "approved"
  | "applied"
  | "rejected"
  | "failed"
  | "expired";

type StatusKind = SeverityStatus | LifecycleStatus;

const severityMap: Record<SeverityStatus, { variant: "critical" | "warning" | "info" | "success"; icon: LucideIcon; label: string }> = {
  critical: { variant: "critical", icon: AlertCircle, label: "Critical" },
  warning: { variant: "warning", icon: AlertTriangle, label: "Warning" },
  info: { variant: "info", icon: Info, label: "Info" },
  success: { variant: "success", icon: CheckCircle, label: "Healthy" },
};

const lifecycleMap: Record<LifecycleStatus, { variant: "warning" | "info" | "success" | "critical" | "muted"; icon: LucideIcon; label: string }> = {
  pending: { variant: "warning", icon: Clock, label: "Pending" },
  approved: { variant: "info", icon: CheckCircle, label: "Approved" },
  applied: { variant: "success", icon: CheckCircle, label: "Applied" },
  rejected: { variant: "muted", icon: XCircle, label: "Rejected" },
  failed: { variant: "critical", icon: AlertCircle, label: "Failed" },
  expired: { variant: "muted", icon: Clock, label: "Expired" },
};

interface StatusBadgeProps {
  status: StatusKind;
  /** Override the default label (e.g. "Needs review" instead of "Pending"). */
  label?: string;
  /** Hide the icon for compact rows. */
  hideIcon?: boolean;
  className?: string;
}

/**
 * Single source of truth for severity and lifecycle status pills.
 * Pairs an icon with a text label so state isn't conveyed by color alone
 * (accessibility baseline). Every variant maps to a design system token,
 * never a raw Tailwind color class.
 */
export function StatusBadge({
  status,
  label,
  hideIcon = false,
  className,
}: StatusBadgeProps) {
  const isSeverity = status in severityMap;
  const config = isSeverity
    ? severityMap[status as SeverityStatus]
    : lifecycleMap[status as LifecycleStatus];

  const Icon = config.icon;
  const text = label ?? config.label;

  return (
    <Badge variant={config.variant} className={cn("normal-case", className)}>
      {!hideIcon && <Icon className="h-3 w-3" />}
      {text}
    </Badge>
  );
}
