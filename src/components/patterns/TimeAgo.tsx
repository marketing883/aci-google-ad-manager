"use client";

import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { absoluteTime, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

interface TimeAgoProps {
  /** ISO string, date, or epoch ms. */
  value: string | number | Date;
  /** Refresh interval in ms. Default 60s. Set to 0 to disable. */
  refreshInterval?: number;
  /** Tag name to render. Default span. */
  as?: "span" | "time" | "div";
  className?: string;
}

/**
 * Relative timestamp with a tooltip showing the absolute time on hover.
 * Auto-refreshes every minute by default so "2m ago" ticks forward.
 * Client component — hydration-safe (renders the absolute value on server,
 * swaps to relative once mounted).
 */
export function TimeAgo({
  value,
  refreshInterval = 60_000,
  as = "span",
  className,
}: TimeAgoProps) {
  const [mounted, setMounted] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    setMounted(true);
    if (refreshInterval === 0) return;
    const id = setInterval(() => force((n) => n + 1), refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval]);

  // On the server and on the first client render, show absolute to avoid
  // hydration mismatch. After mount, swap to relative.
  const display = mounted ? timeAgo(value) : absoluteTime(value);
  const absolute = absoluteTime(value);

  const Tag = as;
  const dateTimeProp =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "number"
        ? new Date(value).toISOString()
        : value;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Tag
          className={cn("cursor-default text-muted-foreground", className)}
          {...(as === "time" ? { dateTime: dateTimeProp } : {})}
        >
          {display}
        </Tag>
      </TooltipTrigger>
      <TooltipContent>{absolute}</TooltipContent>
    </Tooltip>
  );
}
