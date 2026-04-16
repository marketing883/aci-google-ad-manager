import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Ayn brand mark — derivative of the ACI Infotech triangle.
 *
 * Ayn (one syllable) means "eye" and "source" simultaneously in Arabic.
 * The mark is a direct family member of the parent ACI Infotech logo:
 *
 *   - SAME open triangle geometry — the "A" silhouette that reads as ACI
 *   - SAME navy → cyan → navy gradient running through the outline
 *   - SAME V-notch signature detail at the bottom-center
 *   - ADDS an iris nested where the V points, turning the shape into
 *     "the eye inside the ACI triangle" — a visual metaphor for the
 *     platform's all-seeing layer sitting on top of Google Ads.
 *
 * This component is used wherever the AI appears: the topbar chat button,
 * the chat panel header, the /chat page header, the Briefing "Ayn status"
 * card, and the command palette. The wordmark variant pairs the mark with
 * lowercase "ayn" in the same typography register as "aciinfotech".
 */

interface AynMarkProps {
  /** Size in pixels. Default 32. */
  size?: number;
  /** Adds a subtle pulse on the iris for the "listening" state. */
  animated?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function AynMark({
  size = 32,
  animated = false,
  className,
  "aria-label": ariaLabel = "Ayn",
}: AynMarkProps) {
  // Unique gradient ids so multiple marks on the same page don't collide.
  const uid = React.useId();
  const triId = `${uid}-tri`;
  const irisId = `${uid}-iris`;
  const glowId = `${uid}-glow`;

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={cn(className)}
      role="img"
      aria-label={ariaLabel}
      fill="none"
    >
      <defs>
        {/* ACI brand gradient — navy → bright blue → navy */}
        <linearGradient id={triId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0a1530" />
          <stop offset="45%" stopColor="#3a8eff" />
          <stop offset="100%" stopColor="#0a1530" />
        </linearGradient>

        {/* Iris radial gradient — draws the eye toward a bright center */}
        <radialGradient id={irisId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7cb8ff" />
          <stop offset="60%" stopColor="#3a8eff" />
          <stop offset="100%" stopColor="#0a1530" />
        </radialGradient>

        {/* Subtle glow behind the iris */}
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" />
        </filter>
      </defs>

      {/* Open triangle — ACI DNA.
          Points: top-apex (20,4), bottom-right (36,34), bottom-left (4,34).
          The stroke uses a linejoin:round for soft corners matching the parent. */}
      <path
        d="M 20 4 L 36 34 L 4 34 Z"
        stroke={`url(#${triId})`}
        strokeWidth="2.75"
        strokeLinejoin="round"
        fill="none"
      />

      {/* V-notch signature — the ACI detail at the bottom-center.
          Inverted chevron pointing down, anchored where the ACI logo has it. */}
      <path
        d="M 15 34 L 20 28 L 25 34"
        stroke={`url(#${triId})`}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* The eye — iris nested where the V-notch points, making the whole
          mark read as "an eye inside the ACI triangle". This is the Ayn
          signature that distinguishes the derivative from the parent. */}
      <circle
        cx="20"
        cy="21"
        r="4.5"
        fill={`url(#${irisId})`}
        filter={`url(#${glowId})`}
      >
        {animated && (
          <animate
            attributeName="r"
            values="4.5;5;4.5"
            dur="2.4s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* Pupil */}
      <circle cx="20" cy="21" r="1.4" fill="#f9fafb" />

      {/* Tiny highlight — catches light on the pupil */}
      <circle cx="20.7" cy="20.4" r="0.45" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}

/**
 * Wordmark: mark + "Ayn" in the same typography register as the parent
 * ACI "aciinfotech" wordmark (lowercase, geometric sans, tight tracking).
 */
export function AynWordmark({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <AynMark size={size} />
      <span className="text-sm font-semibold lowercase tracking-tight text-foreground">
        ayn
      </span>
    </span>
  );
}
