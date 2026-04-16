"use client";

import React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { VIEWS } from "./scanning/constants";
import { MessagingSidebar } from "./scanning/MessagingSidebar";

interface Props {
  capturedImages: string[];
  scanId: string | null;
}

export function ResultsPage({ capturedImages, scanId }: Props) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col animate-fade-in">

      {/* Header */}
      <div className="p-4 w-full bg-zinc-900 border-b border-zinc-800 flex items-center gap-3">
        <CheckCircle2 className="text-green-500 shrink-0" size={22} />
        <div>
          <h1 className="font-bold text-white">Scan Results</h1>
          <p className="text-xs text-zinc-500">All {VIEWS.length} views captured</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col lg:flex-row gap-6 p-4 lg:p-8 w-full max-w-5xl mx-auto">

        {/* ── Image grid ── */}
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Captured Scans</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {VIEWS.map((v, i) => (
              <div key={i} className="flex flex-col gap-1.5 animate-fade-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="aspect-[3/4] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
                  {capturedImages[i] ? (
                    <img
                      src={capturedImages[i]}
                      alt={v.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs text-zinc-700">Not captured</span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-zinc-400 text-center font-medium">{v.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Chat ── */}
        <div className="lg:w-80 lg:shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Message Your Clinic</p>
          {scanId ? (
            <MessagingSidebar scanId={scanId} />
          ) : (
            <div className="flex items-center gap-2 text-zinc-500 text-sm py-6 justify-center border border-zinc-800 rounded-xl bg-zinc-900">
              <Loader2 size={16} className="animate-spin" />
              Saving scan…
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
