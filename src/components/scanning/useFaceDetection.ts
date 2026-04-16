import { useEffect, useRef, useState, type RefObject } from "react";

// went with MediaPipe's FaceLandmarker for this since it provides both 3D landmarks (for better guardrail logic for UX/UI instructions) 
// and blendshape detection (for smile detection in step 1). The newer FaceMesh model only provides 2D landmarks and doesn't include 
// blendshapes, which makes it harder to implement robust guardrails for the various head poses and expressions we want to detect in each step.
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";

import type { CapturePhase, GuardrailState } from "./constants";

interface Options {
  videoRef:     RefObject<HTMLVideoElement>;
  camReady:     boolean;
  phase:        CapturePhase;
  currentStep:  number;
  onCapture:    () => void;
}

interface Result {
  landmarkerReady: boolean;
  guardrail:       GuardrailState;
  countdown:       number | null;
}

export function useFaceDetection({ videoRef, camReady, phase, currentStep, onCapture }: Options): Result {
  const landmarkerRef  = useRef<FaceLandmarker | null>(null);
  const rafRef         = useRef<number>(0);
  const stepRef        = useRef(currentStep);
  const onCaptureRef   = useRef(onCapture);
  const guardrailRef   = useRef<GuardrailState>("idle");

  const [landmarkerReady, setLandmarkerReady] = useState(false);
  const [guardrail,       setGuardrail]       = useState<GuardrailState>("idle");
  const [countdown,       setCountdown]       = useState<number | null>(null);

  // Keep mutable refs in sync with latest values
  useEffect(() => { stepRef.current     = currentStep; }, [currentStep]);
  useEffect(() => { onCaptureRef.current = onCapture;   }, [onCapture]);

  // Only trigger a React re-render when the guardrail state actually changes
  const setGuardrailIfChanged = (next: GuardrailState) => {
    if (guardrailRef.current !== next) {
      guardrailRef.current = next;
      setGuardrail(next);
    }
  };

  // ── MediaPipe init ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const lm = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode:          "VIDEO",
          numFaces:             1,
          outputFaceBlendshapes: true,
        });
        if (!cancelled) {
          landmarkerRef.current = lm;
          setLandmarkerReady(true);
        } else {
          lm.close();
        }
      } catch (err) {
        console.error("FaceLandmarker init failed", err);
      }
    }

    init();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
    };
  }, []);

  // ── rAF detection loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!landmarkerReady || !camReady || phase !== "scanning") {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    setGuardrail("idle");
    setCountdown(null);

    const teethSteps = new Set([3, 4]);

    function detectFrame() {
      const video = videoRef.current;
      const lm    = landmarkerRef.current;

      if (!video || !lm || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detectFrame);
        return;
      }

      let result: FaceLandmarkerResult;
      try {
        result = lm.detectForVideo(video, performance.now());
      } catch {
        rafRef.current = requestAnimationFrame(detectFrame);
        return;
      }

      const step = stepRef.current;

      if (!result.faceLandmarks.length) {
        setGuardrailIfChanged("not_centered");
      } else {
        const pts  = result.faceLandmarks[0];
        const xs   = pts.map((p) => p.x);
        const ys   = pts.map((p) => p.y);
        const xMin = Math.min(...xs), xMax = Math.max(...xs);
        const yMin = Math.min(...ys), yMax = Math.max(...ys);
        const faceW  = xMax - xMin;
        const faceCx = (xMin + xMax) / 2;
        const faceCy = (yMin + yMax) / 2;

        const centered  = Math.abs(faceCx - 0.5) < 0.14 && Math.abs(faceCy - 0.5) < 0.14;
        const tooClose  = faceW > 0.70;
        const mouthOpen = Math.abs(pts[14].y - pts[13].y) > 0.03;

        const blendshapes = result.faceBlendshapes[0]?.categories ?? [];
        const smileLeft   = blendshapes.find((b) => b.categoryName === "mouthSmileLeft")?.score  ?? 0;
        const smileRight  = blendshapes.find((b) => b.categoryName === "mouthSmileRight")?.score ?? 0;
        const isSmiling   = (smileLeft + smileRight) / 2 > 0.3;

        const leftEye  = pts[33];
        const rightEye = pts[263];
        const rollDeg  = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

        const noseTip   = pts[1];
        const yawOffset = noseTip.x - faceCx;

        // Pitch: nose position between forehead (lm 10) and chin (lm 152).
        // Chin UP  → nose moves DOWN in image → noseRatio DECREASES
        // Chin DOWN → nose moves UP in image  → noseRatio INCREASES
        const forehead   = pts[10];
        const chinLm     = pts[152];
        const faceHeight = chinLm.y - forehead.y;
        const noseRatio  = faceHeight > 0 ? (noseTip.y - forehead.y) / faceHeight : 0.55;

        if (step === 3 || step === 4) console.log("[pitch] noseRatio:", noseRatio.toFixed(3));

        if (tooClose) {
          setGuardrailIfChanged("too_close");
        } else if (!centered) {
          setGuardrailIfChanged("not_centered");
        } else if (Math.abs(rollDeg) > 8) {
          setGuardrailIfChanged(rollDeg > 0 ? "tilt_left" : "tilt_right");
        } else if (step === 1 && yawOffset > -0.04) {
          setGuardrailIfChanged("turn_more");
        } else if (step === 2 && yawOffset < 0.04) {
          setGuardrailIfChanged("turn_more");
        } else if (step === 3 && noseRatio > 0.50) {
          setGuardrailIfChanged("chin_up");
        } else if (step === 4 && noseRatio < 0.50) {
          setGuardrailIfChanged("chin_down");
        } else if (step === 0 && !isSmiling) {
          setGuardrailIfChanged("detecting");
        } else if (teethSteps.has(step) && !mouthOpen) {
          setGuardrailIfChanged("detecting");
        } else {
          setGuardrailIfChanged("centered");
        }
      }

      rafRef.current = requestAnimationFrame(detectFrame);
    }

    rafRef.current = requestAnimationFrame(detectFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [landmarkerReady, camReady, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset guardrail on step change ─────────────────────────────────────────
  useEffect(() => {
    guardrailRef.current = "idle";
    setGuardrail("idle");
    setCountdown(null);
  }, [currentStep]);

  // ── Countdown + auto-capture when locked on ────────────────────────────────
  useEffect(() => {
    if (guardrail !== "centered") {
      setCountdown(null);
      return;
    }
    setCountdown(3);
    const t1 = setTimeout(() => setCountdown(2), 1000);
    const t2 = setTimeout(() => setCountdown(1), 2000);
    const t3 = setTimeout(() => { setCountdown(null); onCaptureRef.current(); }, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [guardrail]);

  return { landmarkerReady, guardrail, countdown };
}
