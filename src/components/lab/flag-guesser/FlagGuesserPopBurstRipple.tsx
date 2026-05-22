"use client";

import { useEffect, useRef } from "react";

/** PopPopBubblesScene のバーストリングと同系（白リング・拡大・短時間フェード） */
const BURST_EFFECT_COLOR = "#FFFFFF";

type RingState = {
  radius: number;
  lineWidth: number;
  alpha: number;
};

export type FlagGuesserPopBurstRippleProps = {
  /** 画面座標（zoomHost 基準） */
  screenX: number;
  screenY: number;
  /** 国旗アイコンの半径（px）。CARD_DIAM / 2 相当 */
  flagRadiusPx: number;
};

/**
 * はじけてバブルの泡タップ時と同様の拡張リング（国旗サイズ基準）。
 */
export function FlagGuesserPopBurstRipple({ screenX, screenY, flagRadiusPx }: FlagGuesserPopBurstRippleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || flagRadiusPx < 2) return;

    const size = Math.ceil(flagRadiusPx * 4.5);
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.max(1, Math.round(size * dpr));
    canvas.height = Math.max(1, Math.round(size * dpr));
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const ring: RingState = {
      radius: flagRadiusPx * 0.72,
      lineWidth: Math.max(2.5, flagRadiusPx * 0.12),
      alpha: 0.96,
    };
    const expandPerSec = Math.max(90, flagRadiusPx * 3.2);
    const fadePerSec = 5.2;

    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ring.radius += expandPerSec * dt;
      ring.alpha -= fadePerSec * dt;
      ring.lineWidth *= Math.pow(0.985, dt * 60);

      ctx.clearRect(0, 0, size, size);
      const prevComposite = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "screen";
      ctx.save();
      ctx.globalAlpha = Math.max(0, ring.alpha);
      ctx.strokeStyle = BURST_EFFECT_COLOR;
      ctx.lineWidth = ring.lineWidth;
      ctx.shadowColor = BURST_EFFECT_COLOR;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = prevComposite;

      if (ring.alpha > 0.01) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [screenX, screenY, flagRadiusPx]);

  const size = Math.ceil(flagRadiusPx * 4.5);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute z-[25]"
      style={{
        left: screenX - size / 2,
        top: screenY - size / 2,
      }}
      aria-hidden
    />
  );
}
