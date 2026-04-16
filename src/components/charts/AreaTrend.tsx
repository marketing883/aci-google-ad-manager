"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface AreaTrendProps {
  data: Array<Record<string, number | string>>;
  /** The key on each data row to plot. */
  dataKey: string;
  /** The key on each data row used for the X axis (date string). */
  xKey?: string;
  /** Primary stroke/fill color. */
  color?: string;
  /** Optional formatter for the tooltip value. */
  valueFormatter?: (value: number) => string;
  /** Height in px. Defaults to 220. */
  height?: number;
  /** Unique id for gradient defs so multiple charts don't collide. */
  id: string;
  /** Whether to show axes + grid. Default false — minimal chrome. */
  showAxes?: boolean;
}

function TrendTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: Record<string, number | string> }>;
  label?: string | number;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0].value;
  const formatted = valueFormatter ? valueFormatter(value) : value.toLocaleString();
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-xl">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{formatted}</div>
    </div>
  );
}

/**
 * Gradient-filled area chart with a smooth monotone curve and a subtle glow.
 * Premium-looking because of:
 *   - Tall gradient from ~60% opacity at the top to 0 at the bottom
 *   - Smooth monotone curve (not linear jaggies)
 *   - Optional SVG drop-shadow filter for a soft halo under the stroke
 *   - Minimal axis chrome by default — focus on shape
 *
 * Pairs well with a MetricCard header above it ("Spend trajectory", "$X total").
 */
export function AreaTrend({
  data,
  dataKey,
  xKey = "date",
  color = "var(--accent)",
  valueFormatter,
  height = 220,
  id,
  showAxes = false,
}: AreaTrendProps) {
  const gradientId = `area-trend-gradient-${id}`;
  const glowId = `area-trend-glow-${id}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <stop offset="60%" stopColor={color} stopOpacity={0.1} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {showAxes && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
        )}
        {showAxes && (
          <XAxis
            dataKey={xKey}
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
        )}
        {showAxes && (
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={valueFormatter}
          />
        )}

        <Tooltip
          content={<TrendTooltip valueFormatter={valueFormatter} />}
          cursor={{ stroke: "var(--accent)", strokeWidth: 1, strokeOpacity: 0.4 }}
        />

        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          fillOpacity={1}
          filter={`url(#${glowId})`}
          isAnimationActive={true}
          animationDuration={600}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
