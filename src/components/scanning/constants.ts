// ─── Types ────────────────────────────────────────────────────────────────────

export type GuardrailState =
  | "idle" | "detecting" | "centered" | "not_centered" | "too_close"
  | "tilt_left" | "tilt_right" | "turn_more" | "chin_up" | "chin_down";

export type CapturePhase = "scanning" | "captured" | "prep" | "done";

// ─── Views ────────────────────────────────────────────────────────────────────

export const VIEWS = [
  { label: "Front View",    instruction: "Smile and look straight at the camera." },
  { label: "Left View",     instruction: "Turn your head to the left." },
  { label: "Right View",    instruction: "Turn your head to the right." },
  { label: "Upper Teeth",   instruction: "Tilt your head back and open wide." },
  { label: "Lower Teeth",   instruction: "Tilt your head down and open wide." },
];

// ─── Guardrail display ────────────────────────────────────────────────────────

export const GUARDRAIL_MESSAGES: Record<GuardrailState, string> = {
  idle:         "Position your face in the guide",
  detecting:    "Open your mouth wide",
  centered:     "Perfect — ready to capture",
  not_centered: "Move your face into the guide",
  too_close:    "Move back a little",
  tilt_left:    "Tilt your head right",
  tilt_right:   "Tilt your head left",
  turn_more:    "Turn your head a little more",
  chin_up:      "Tilt your chin up",
  chin_down:    "Tilt your chin down",
};

export const GUARDRAIL_COLORS: Record<GuardrailState, string> = {
  idle:         "#52525b",
  detecting:    "#f59e0b",
  centered:     "#22c55e",
  not_centered: "#ef4444",
  too_close:    "#f97316",
  tilt_left:    "#f59e0b",
  tilt_right:   "#f59e0b",
  turn_more:    "#f59e0b",
  chin_up:      "#f59e0b",
  chin_down:    "#f59e0b",
};

// ─── SVG guide overlay params per step (viewBox "0 0 100 133") ─────────────────

export const STEP_OVERLAYS = [
  { faceCx: 50, faceCy: 50, faceRx: 34, faceRy: 42, mouthCx: 50, mouthCy: 76, mouthRx: 18, mouthRy:  7 },
  { faceCx: 55, faceCy: 50, faceRx: 30, faceRy: 42, mouthCx: 55, mouthCy: 76, mouthRx: 16, mouthRy:  7 },
  { faceCx: 45, faceCy: 50, faceRx: 30, faceRy: 42, mouthCx: 45, mouthCy: 76, mouthRx: 16, mouthRy:  7 },
  { faceCx: 50, faceCy: 50, faceRx: 34, faceRy: 42, mouthCx: 50, mouthCy: 78, mouthRx: 24, mouthRy: 11 },
  { faceCx: 50, faceCy: 50, faceRx: 34, faceRy: 42, mouthCx: 50, mouthCy: 78, mouthRx: 24, mouthRy: 11 },
];
