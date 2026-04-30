"use client";

import { useEffect, useRef, useState } from "react";

const DOUBLE_TAP_MS = 360;
const HINT_HIDE_MS = 3000;

export function SmartGuardLock() {
  const [isLocked, setIsLocked] = useState(true);
  const [hintText, setHintText] = useState("誤操作防止ロック中（2回タップで解除）");
  const [showHint, setShowHint] = useState(true);
  const lastTapAtRef = useRef(0);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    const body = document.body;
    if (prevOverflowRef.current == null) prevOverflowRef.current = body.style.overflow;

    if (isLocked) {
      body.style.overflow = "hidden";
      body.classList.add("smart-guard-lock");
    } else {
      body.style.overflow = prevOverflowRef.current ?? "";
      body.classList.remove("smart-guard-lock");
    }

    const stop = (event: Event) => {
      if (!isLocked) return;
      event.preventDefault();
    };

    document.addEventListener("contextmenu", stop, { capture: true });
    document.addEventListener("selectstart", stop, { capture: true });
    document.addEventListener("gesturestart", stop as EventListener, { capture: true });
    document.addEventListener("gesturechange", stop as EventListener, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", stop, { capture: true });
      document.removeEventListener("selectstart", stop, { capture: true });
      document.removeEventListener("gesturestart", stop as EventListener, { capture: true });
      document.removeEventListener("gesturechange", stop as EventListener, { capture: true });
    };
  }, [isLocked]);

  useEffect(() => {
    if (!showHint) return;
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      setShowHint(false);
      hintTimerRef.current = null;
    }, HINT_HIDE_MS);
    return () => {
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
    };
  }, [showHint, hintText]);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      document.body.style.overflow = prevOverflowRef.current ?? "";
      document.body.classList.remove("smart-guard-lock");
    };
  }, []);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapAtRef.current > DOUBLE_TAP_MS) {
      lastTapAtRef.current = now;
      return;
    }
    lastTapAtRef.current = 0;
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    setHintText(nextLocked ? "誤操作防止ロックを有効にしました" : "スクロール制限を解除しました");
    setShowHint(true);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9998] flex select-none flex-col items-end">
      {showHint && (
        <div className="mb-2 max-w-[240px] rounded-lg border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-bg))] px-3 py-1.5 text-xs text-[var(--color-muted)] shadow-lg">
          {hintText}
        </div>
      )}
      <button
        type="button"
        onClick={handleTap}
        className="grid h-12 w-12 place-items-center rounded-full border border-[color-mix(in_srgb,var(--color-text)_22%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_18%,var(--color-bg))] text-xl shadow-lg backdrop-blur"
        aria-label={isLocked ? "誤操作防止ロック中。2回タップで解除" : "ロック解除中。2回タップで再ロック"}
        title={isLocked ? "誤操作防止ロック中（2回タップで解除）" : "ロック解除中（2回タップで再ロック）"}
      >
        {isLocked ? (
          <span aria-hidden>🔒</span>
        ) : (
          <span className="grayscale opacity-90" aria-hidden>
            🔓
          </span>
        )}
      </button>
    </div>
  );
}
