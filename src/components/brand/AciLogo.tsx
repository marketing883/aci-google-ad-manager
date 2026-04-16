import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Primary brand mark — ACI Interactive (a branch of ACI Infotech).
 *
 * This is the TOP-OF-HIERARCHY brand for the product. It appears in the
 * sidebar header, login screens, email reports, and anywhere the company
 * behind the product needs to be credited.
 *
 * The "full" variant uses the canonical PNG straight from aciinfotech.com.
 * The "mark" variant is a hand-drawn SVG of the triangle so it scales
 * cleanly at any size without clipping artifacts (previous approach of
 * clipping the PNG cut off the triangle's left edge at small sizes).
 */

interface AciLogoProps {
  /** "full" = PNG wordmark+mark; "mark" = inline SVG triangle only. */
  variant?: "full" | "mark";
  /** Width in pixels. For "full" the height scales to aspect ratio; for "mark" it's square. */
  width?: number;
  /** Use the white variant of the PNG (only applies to "full"). Default true. */
  inverted?: boolean;
  className?: string;
}

export function AciLogo({
  variant = "full",
  width = 120,
  inverted = true,
  className,
}: AciLogoProps) {
  if (variant === "mark") {
    return <AciMark size={width} className={className} />;
  }

  const src = inverted
    ? "/brand/aci-infotech-logo-white.png"
    : "/brand/aci-infotech-logo.png";

  // Aspect ratio of the canonical file is roughly 620x180 ≈ 3.44:1
  const height = Math.round(width / 3.44);

  return (
    <Image
      src={src}
      alt="ACI Interactive"
      width={width}
      height={height}
      priority
      className={cn("object-contain", className)}
    />
  );
}

/**
 * Inline SVG of the ACI triangle mark. Open "A" silhouette with the
 * signature V-notch at the bottom-center, rendered with the navy → cyan →
 * navy gradient from the parent brand. Stroke-based so it keeps its
 * visual weight at every size and never clips.
 */
export function AciMark({
  size = 32,
  className,
  "aria-label": ariaLabel = "ACI Interactive",
}: {
  size?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const uid = React.useId();
  const gradId = `${uid}-aci-grad`;

  return (
    <svg
      viewBox="0 0 48 44"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={ariaLabel}
      fill="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0a1530" />
          <stop offset="45%" stopColor="#3a8eff" />
          <stop offset="100%" stopColor="#0a1530" />
        </linearGradient>
      </defs>

      {/* Open triangle outline — the "A" silhouette */}
      <path
        d="M 24 4 L 44 40 L 4 40 Z"
        stroke={`url(#${gradId})`}
        strokeWidth="3"
        strokeLinejoin="round"
        fill="none"
      />

      {/* V-notch at the bottom-center — the ACI signature detail */}
      <path
        d="M 17 40 L 24 31 L 31 40"
        stroke={`url(#${gradId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Paired lockup: ACI triangle mark + "ACI Interactive" wordmark.
 * Use this in the sidebar header to reinforce the brand hierarchy.
 */
export function AciInteractiveLockup({
  className,
  markSize = 32,
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <AciMark size={markSize} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          ACI Interactive
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          A branch of ACI Infotech
        </span>
      </div>
    </div>
  );
}
