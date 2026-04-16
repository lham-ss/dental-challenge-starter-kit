"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Camera, CheckCircle2 } from "lucide-react";

import { VIEWS, GUARDRAIL_MESSAGES, GUARDRAIL_COLORS, STEP_OVERLAYS, type CapturePhase } from "./scanning/constants";

import { useCameraStream }  from "./scanning/useCameraStream";
import { useFaceDetection } from "./scanning/useFaceDetection";
import { GuideSvg }         from "./scanning/GuideSvg";
import { ResultsPage }      from "./ResultsPage";

export default function ScanningFlow() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [currentStep,    setCurrentStep]    = useState(0);
  const [phase,          setPhase]          = useState<CapturePhase>("scanning");
  const [lastCaptureUrl, setLastCaptureUrl] = useState<string | null>(null);
  const [prepCountdown,  setPrepCountdown]  = useState<number | null>(null);
  const [scanId,         setScanId]         = useState<string | null>(null);

  const camReady = useCameraStream(videoRef);

  // ── Capture frame ─────────────────────────────────────────────────────────
  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg");
      setLastCaptureUrl(dataUrl);
      setCapturedImages((prev) => [...prev, dataUrl]);
      setCurrentStep((prev) => prev + 1);
      setPhase("captured");
    }
  }, []);

  const { landmarkerReady, guardrail, countdown } = useFaceDetection({
    videoRef,
    camReady,
    phase,
    currentStep,
    onCapture: handleCapture,
  });

  // ── Phase transitions ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "captured") return;
    const t = setTimeout(() => setPhase(currentStep >= 5 ? "done" : "prep"), 800);
    return () => clearTimeout(t);
  }, [phase, currentStep]);

  useEffect(() => {
    if (phase !== "prep") return;
    setPrepCountdown(3);
    const t1 = setTimeout(() => setPrepCountdown(2), 1000);
    const t2 = setTimeout(() => setPrepCountdown(1), 2000);
    const t3 = setTimeout(() => { setPrepCountdown(null); setPhase("scanning"); }, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [phase]);

 
  useEffect(() => {
    if (phase !== "done") return;
    fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: capturedImages }),
    })
      .then((res) => res.json())
      .then((data) => { if (data.scanId) setScanId(data.scanId); })
      .catch((err) => console.error("Failed to save scan:", err));
  }, [phase, capturedImages]);

 
  const overlayColor = GUARDRAIL_COLORS[guardrail];
  const overlay      = STEP_OVERLAYS[Math.min(currentStep, STEP_OVERLAYS.length - 1)];
  const isPulsing    = guardrail === "detecting";
  const isReady      = guardrail === "centered";
  const teethStep    = currentStep === 3 || currentStep === 4;

 
  if (phase === "done") {
    return <ResultsPage capturedImages={capturedImages} scanId={scanId} />;
  }

  return (
    <div className="flex flex-col items-center bg-black min-h-screen text-white">

      {/* Header */}
      <div className="p-4 w-full bg-zinc-900 border-b border-zinc-800 flex justify-between items-center">
        <h1 className="font-bold text-blue-400">DentalScan AI</h1>
        <span className="text-xs text-zinc-500">Step {Math.min(currentStep + 1, 5)} / 5</span>
      </div>

      {/* Step label */}
      {phase === "scanning" && (
        <div className="w-full max-w-md px-4 pt-3 pb-1">
          <p key={currentStep} className="text-md font-semibold uppercase tracking-widest text-zinc-400 animate-fade-slide-down">
            {VIEWS[currentStep].label}
          </p>
        </div>
      )}

      {/* ── Main Viewport ── */}
      <div className="mt-3 relative w-full max-w-md aspect-[3/4] bg-zinc-950 overflow-hidden flex items-center justify-center">
        <>
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />

            {/* Capture flash */}
            {phase === "captured" && lastCaptureUrl && (
              <div className="absolute inset-0">
                <img src={lastCaptureUrl} alt="captured frame" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
                  <div className="w-24 h-24 rounded-full bg-black/50 flex items-center justify-center">
                    <CheckCircle2 size={52} className="text-green-400" />
                  </div>
                </div>
              </div>
            )}

            {/* Prep overlay */}
            {phase === "prep" && (
              <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-5 px-8 text-center animate-fade-in">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Next up</p>
                <h2 key={currentStep} className="text-2xl font-bold animate-fade-slide-up">{VIEWS[currentStep].label}</h2>
                <p key={`inst-${currentStep}`} className="text-xl text-zinc-300 leading-relaxed animate-fade-slide-up" style={{ animationDelay: "60ms" }}>{VIEWS[currentStep].instruction}</p>
                <div className="w-16 h-16 rounded-full border-4 border-blue-400 flex items-center justify-center mt-2">
                  <span key={prepCountdown} className="text-2xl font-bold text-blue-400 animate-fade-scale">{prepCountdown}</span>
                </div>
                <p className="text-xs text-zinc-600">Get into position…</p>
              </div>
            )}

            {/* Scanning overlays */}
            {phase === "scanning" && (
              <>
                <GuideSvg overlay={overlay} color={overlayColor} isPulsing={isPulsing} />

                {/* Countdown ring */}
                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-20 h-20 rounded-full border-4 border-green-500 flex items-center justify-center bg-black/40">
                      <span className="text-3xl font-bold text-green-400">{countdown}</span>
                    </div>
                  </div>
                )}

                {/* Status badge */}
                <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
                  {!landmarkerReady ? (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-700 text-zinc-400 animate-pulse">
                      Loading face detection…
                    </span>
                  ) : (
                    <span
                      key={`${guardrail}-${currentStep}`}
                      className="text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-sm transition-colors duration-300 animate-fade-in"
                      style={{ backgroundColor: `${overlayColor}22`, border: `1px solid ${overlayColor}`, color: overlayColor }}
                    >
                      {guardrail === "detecting" && currentStep === 0
                        ? "Smile for the camera!"
                        : guardrail === "detecting" && teethStep
                        ? "Open your mouth wide"
                        : GUARDRAIL_MESSAGES[guardrail]}
                    </span>
                  )}
                </div>

                {/* Step instruction */}
                <div className="absolute bottom-10 left-0 right-0 p-6 bg-gradient-to-t from-black to-transparent text-center">
                  <p key={currentStep} className="text-sm font-medium animate-fade-slide-up">{VIEWS[currentStep].instruction}</p>
                </div>
              </>
            )}
          </>
      </div>

      {/* Capture button */}
      <div className="p-10 w-full flex justify-center">
        {phase === "scanning" && (
          <button
            onClick={handleCapture}
            disabled={!isReady || countdown !== null}
            className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-300
              ${isReady
                ? "border-green-400 shadow-[0_0_24px_rgba(34,197,94,0.45)] active:scale-90"
                : "border-zinc-700 opacity-40 cursor-not-allowed"}`}
            aria-label="Capture"
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-300 ${isReady ? "bg-green-400" : "bg-zinc-700"}`}>
              <Camera className={isReady ? "text-black" : "text-zinc-500"} />
            </div>
          </button>
        )}
      </div>

      {/* Thumbnails */}
      <div className="flex justify-center gap-2 p-4 overflow-x-auto w-full lg:fixed lg:left-4 lg:top-1/2 lg:-translate-y-1/2 lg:flex-col lg:w-auto lg:overflow-x-visible lg:overflow-y-auto lg:gap-3 lg:p-0 lg:z-50">
        {VIEWS.map((v, i) => (
          <div
            key={i}
            className={`w-16 h-20 lg:w-24 lg:h-28 rounded border-2 shrink-0 overflow-hidden ${i === currentStep ? "border-blue-500 bg-blue-500/10" : "border-zinc-800"}`}
          >
            {capturedImages[i] ? (
              <img src={capturedImages[i]} alt={v.label} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                <span className="text-[10px] lg:text-xs text-zinc-700">{i + 1}</span>
                <span className="text-[8px] lg:text-[10px] text-zinc-800 text-center leading-tight px-1">{v.label}</span>
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}
