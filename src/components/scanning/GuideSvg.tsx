import React from "react";
import type { STEP_OVERLAYS } from "./constants";

type Overlay = (typeof STEP_OVERLAYS)[number];

interface Props {
  overlay:   Overlay;
  color:     string;
  isPulsing: boolean;
}

export function GuideSvg({ overlay, color, isPulsing }: Props) {
  const { faceCx, faceCy, faceRx, faceRy, mouthCx, mouthCy, mouthRx, mouthRy } = overlay;

  const bracketStyle = { transition: "stroke 0.4s" };
  const bracketProps = {
    fill:            "none",
    stroke:          color,
    strokeWidth:     1.2,
    strokeLinecap:   "round"  as const,
    strokeLinejoin:  "round"  as const,
    style:           bracketStyle,
  };

  return (
    <svg
      viewBox="0 0 100 133"
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <mask id="faceMask">
          <rect width="100" height="133" fill="white" />
          <ellipse cx={faceCx} cy={faceCy} rx={faceRx} ry={faceRy} fill="black" />
        </mask>
      </defs>

      {/* Vignette outside the face guide */}
      <rect width="100" height="133" fill="rgba(0,0,0,0.50)" mask="url(#faceMask)" />

      {/* Face oval */}
      <ellipse
        cx={faceCx} cy={faceCy} rx={faceRx} ry={faceRy}
        fill="none" stroke={color} strokeWidth="0.8"
        opacity={isPulsing ? 0.6 : 1}
        className={isPulsing ? "animate-pulse" : ""}
        style={{ transition: "stroke 0.4s, opacity 0.4s" }}
      />

      {/* Mouth region — dashed inner guide */}
      <ellipse
        cx={mouthCx} cy={mouthCy} rx={mouthRx} ry={mouthRy}
        fill="none" stroke={color} strokeWidth="0.5"
        strokeDasharray="2 1.5" opacity={0.75}
        style={{ transition: "stroke 0.4s" }}
      />

      {/* Corner brackets */}
      <path d={`M ${faceCx - faceRx + 2} ${faceCy - 10} L ${faceCx - faceRx + 2} ${faceCy - faceRy + 2} L ${faceCx - 10} ${faceCy - faceRy + 2}`} {...bracketProps} />
      <path d={`M ${faceCx + 10} ${faceCy - faceRy + 2} L ${faceCx + faceRx - 2} ${faceCy - faceRy + 2} L ${faceCx + faceRx - 2} ${faceCy - 10}`} {...bracketProps} />
      <path d={`M ${faceCx - faceRx + 2} ${faceCy + 10} L ${faceCx - faceRx + 2} ${faceCy + faceRy - 2} L ${faceCx - 10} ${faceCy + faceRy - 2}`} {...bracketProps} />
      <path d={`M ${faceCx + 10} ${faceCy + faceRy - 2} L ${faceCx + faceRx - 2} ${faceCy + faceRy - 2} L ${faceCx + faceRx - 2} ${faceCy + 10}`} {...bracketProps} />
    </svg>
  );
}
