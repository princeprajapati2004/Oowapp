"use client";

import { useCallback, useEffect, useRef } from "react";

// Two-tone (880Hz -> 1320Hz) oscillator beep — no binary asset needed. Same
// shape as the existing Kitchen Display new-order chime (kitchen-display.tsx)
// but extracted here rather than importing from that file, so this stays
// completely decoupled from Kitchen Display's own code.
function playTone(ctx: AudioContext) {
  const start = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = start + i * 0.15;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  });
}

/** Lazily creates/resumes a single AudioContext and unlocks it on the first
 * user gesture (browsers block audio before one), so a sound preference
 * enabled in a prior session actually plays once a real event fires later. */
export function useChime() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  useEffect(() => {
    function unlock() {
      ensureAudioContext();
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureAudioContext]);

  const play = useCallback(() => {
    const ctx = ensureAudioContext();
    if (ctx) playTone(ctx);
  }, [ensureAudioContext]);

  return { play };
}
