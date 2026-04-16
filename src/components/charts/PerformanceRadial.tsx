"use client";

import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";

export interface RadialMetric {
  name: string;
  /** Normalized 0-100 score for this metric. */
  value: number;
  /** Hex or CSS-var color for this ring. */
  color: string;
  /** Optional raw value to display in a legend below. */
  displayValue?: string;
}

interface PerformanceRadialProps {
  metrics: RadialMetric[];
  /** Height (= width — square) in px. Default 220. */
  size?: number;
}

/**
 * Concentric ring chart. Each metric is a normalized 0-100 score shown as
 * a partial ring with a rounded cap. Premium look because:
 *   - Each ring is a different color from the design system
 *   - Rings are rounded (cornerRadius) so caps aren't flat
 *   - Backgrounds are subtle (muted) so the colored portion pops
 *   - The center is empty — leaves room for a summary number overlay
 *
 * Below the chart, a compact legend shows each metric with its color, name,
 * and raw value.
 */
export function PerformanceRadial({ metrics, size = 220 }: PerformanceRadialProps) {
  // Recharts RadialBarChart stacks rings from innermost to outermost based on data order.
  // Reverse so the first metric in the array becomes the OUTER ring (more prominent).
  const data = [...metrics].reverse();

  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ width: size, height: size }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="30%"
            outerRadius="100%"
            barSize={10}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: "var(--muted)" }}
              dataKey="value"
              cornerRadius={8}
              isAnimationActive={true}
              animationDuration={700}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend below */}
      <div className="flex w-full flex-col gap-1.5">
        {metrics.map((m) => (
          <div
            key={m.name}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: m.color }}
              />
              <span className="truncate text-muted-foreground">{m.name}</span>
            </div>
            <span className="shrink-0 font-mono font-semibold text-foreground">
              {m.displayValue ?? `${Math.round(m.value)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
