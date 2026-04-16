"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: Array<{ value: number }> | number[];
  /** Stroke/gradient color. Defaults to cyan accent. */
  color?: string;
  /** Height in px. Defaults to 36. */
  height?: number;
  /** Unique id suffix so multiple sparklines can coexist on one page without gradient collision. */
  id: string;
  /** Accessible label — describes the trend to screen readers. */
  ariaLabel?: string;
}

/**
 * Tiny inline area chart designed to sit inside a MetricCard.
 * No axes, no grid, no tooltip — just the shape of the trend.
 * Uses a vertical gradient fill (full color at top → transparent at bottom)
 * and a smooth monotone curve for the premium feel.
 */
export function Sparkline({
  data,
  color = "var(--accent)",
  height = 36,
  id,
  ariaLabel,
}: SparklineProps) {
  // Accept either raw numbers or objects — normalize to recharts shape.
  const series = Array.isArray(data) && typeof data[0] === "number"
    ? (data as number[]).map((v) => ({ value: v }))
    : (data as Array<{ value: number }>);

  const gradientId = `sparkline-gradient-${id}`;

  return (
    <div
      role="img"
      aria-label={ariaLabel || "Trend chart"}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.6} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.75}
          fill={`url(#${gradientId})`}
          fillOpacity={1}
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
