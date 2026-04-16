"use client";

import * as React from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle,
  Loader2,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "./EmptyState";
import { TimeAgo } from "./TimeAgo";
import { cn } from "@/lib/utils";

export type ActivityKind =
  | "action"
  | "ai_decision"
  | "user_edit"
  | "system"
  | "error";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** Short, human-readable summary (e.g. "Paused campaign 'Dynamics 365'"). */
  title: string;
  /** Optional details (model name, before/after, reason). */
  description?: React.ReactNode;
  /** ISO timestamp. */
  timestamp: string | Date;
  /** Who performed it — agent name, user email, or "system". */
  actor?: string;
  /** Optional status label rendered as a badge. */
  status?: string;
}

const KIND_CONFIG: Record<
  ActivityKind,
  { icon: LucideIcon; dot: string; tint: string }
> = {
  action: {
    icon: CheckCircle,
    dot: "bg-success",
    tint: "bg-success/10 text-success",
  },
  ai_decision: {
    icon: Sparkles,
    dot: "bg-accent",
    tint: "bg-accent/10 text-accent",
  },
  user_edit: {
    icon: User,
    dot: "bg-info",
    tint: "bg-info/10 text-info",
  },
  system: {
    icon: Loader2,
    dot: "bg-muted-foreground",
    tint: "bg-muted text-muted-foreground",
  },
  error: {
    icon: AlertCircle,
    dot: "bg-critical",
    tint: "bg-critical/10 text-critical",
  },
};

interface ActivityTimelineProps {
  entries: ActivityEntry[];
  /** Empty state when there are no entries yet. */
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/**
 * Vertical timeline of activity events. Each entry gets an icon, a colored
 * dot on the rail, a title, optional description, and a relative timestamp.
 *
 * Used on Portfolio detail to show "what the system did to this campaign",
 * and reusable for any other per-entity audit trail.
 */
export function ActivityTimeline({
  entries,
  emptyTitle = "No activity yet",
  emptyDescription = "Actions taken by agents or users will appear here with full history.",
  className,
}: ActivityTimelineProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        bare
        icon={<Bot className="h-6 w-6" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Rail */}
      <div
        className="absolute bottom-2 left-[15px] top-2 w-px bg-border"
        aria-hidden="true"
      />

      <ol className="space-y-4">
        {entries.map((entry) => {
          const config = KIND_CONFIG[entry.kind];
          const Icon = config.icon;
          return (
            <li key={entry.id} className="relative flex gap-4 pl-0">
              {/* Dot + icon */}
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
                <div
                  className={cn(
                    "absolute inset-0 rounded-full border-2 border-background",
                    config.dot,
                    entry.kind === "system" && "animate-pulse",
                  )}
                />
                <Icon
                  className={cn(
                    "relative h-3.5 w-3.5 text-background",
                    entry.kind === "system" && "animate-spin",
                  )}
                />
              </div>

              {/* Content */}
              <Card className="flex-1 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {entry.title}
                      </p>
                      {entry.status && (
                        <Badge
                          variant={
                            entry.kind === "error"
                              ? "critical"
                              : entry.kind === "action"
                                ? "success"
                                : entry.kind === "ai_decision"
                                  ? "accent"
                                  : "muted"
                          }
                        >
                          {entry.status}
                        </Badge>
                      )}
                    </div>
                    {entry.description && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {entry.description}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {entry.actor && (
                        <>
                          <span className="flex items-center gap-1">
                            {entry.kind === "ai_decision" ||
                            entry.kind === "action" ? (
                              <Bot className="h-3 w-3" />
                            ) : entry.kind === "user_edit" ? (
                              <User className="h-3 w-3" />
                            ) : null}
                            {entry.actor}
                          </span>
                          <span>·</span>
                        </>
                      )}
                      <TimeAgo value={entry.timestamp} className="text-[10px]" />
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
