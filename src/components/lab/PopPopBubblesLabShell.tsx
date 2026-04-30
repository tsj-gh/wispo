"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { PairLinkAdSlot } from "@/components/PairLinkAdSlots";
import { GamePageHeader } from "@/components/GamePageHeader";
import { GameQuickInfoNote } from "@/components/lab/GameQuickInfoNote";
import {
  GAME_AD_GAP_BEFORE_SLOT_2_PX,
  GAME_AD_SLOT_MIN_HEIGHT_PX,
  GAME_COLUMN_CLASS,
  GAME_NO_TOP_AD_LAYOUT_OFFSET_PX,
} from "@/lib/gameLayout";
import { PopPopBubblesScene, type PopPopBubblesBgPaletteMode } from "@/lib/pop-pop-bubbles/PopPopBubblesScene";

const CONTENT_IMAGE_PATHS = [
  ...Array.from({ length: 12 }, (_, i) => `/assets/tap-coloring/Pictures/SVG/Picture_Animal_${String(i + 1).padStart(2, "0")}.svg`),
  ...Array.from({ length: 10 }, (_, i) => `/assets/tap-coloring/Pictures/SVG/Picture_Produce_${String(i + 1).padStart(2, "0")}.svg`),
  ...Array.from({ length: 12 }, (_, i) => `/assets/tap-coloring/Pictures/SVG/Picture_Vehicle_${String(i + 1).padStart(2, "0")}.svg`),
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

function playFallbackPop(audioCtxRef: { current: AudioContext | null }): void {
  if (typeof window === "undefined") return;
  const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = audioCtxRef.current ?? new Ctx();
  audioCtxRef.current = ctx;

  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(740, t0);
  osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.09);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.13);
}

export function PopPopBubblesLabShell() {
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PopPopBubblesScene | null>(null);
  const popAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [collisionCount, setCollisionCount] = useState(0);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(true);
  const [isBubbleParamsExpanded, setIsBubbleParamsExpanded] = useState(true);
  const [isBurstFxExpanded, setIsBurstFxExpanded] = useState(true);
  const [bubbleCount, setBubbleCount] = useState(4);
  const [bubbleSpeedScale, setBubbleSpeedScale] = useState(1);
  const [animalFallGravity, setAnimalFallGravity] = useState(500);
  const [bubbleRestitution, setBubbleRestitution] = useState(0.86);
  const [burstParticleSizeScale, setBurstParticleSizeScale] = useState(3.5);
  const [burstParticleSpeedScale, setBurstParticleSpeedScale] = useState(1.75);
  const [mobileBubbleScaleCompensation, setMobileBubbleScaleCompensation] = useState(0.55);
  const [fallingAnimalSizeScale, setFallingAnimalSizeScale] = useState(1.5);
  const [burstRingLineWidthScale, setBurstRingLineWidthScale] = useState(0.6);
  const [burstRingExpandSpeedScale, setBurstRingExpandSpeedScale] = useState(0.9);
  const [burstRingShadowBlurPx, setBurstRingShadowBlurPx] = useState(10);
  const [bgPaletteMode, setBgPaletteMode] = useState<PopPopBubblesBgPaletteMode>("vivid");

  useEffect(() => {
    if (!isDevTj) setIsDebugMode(false);
  }, [isDevTj]);

  useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    let ro: ResizeObserver | null = null;
    let onPointerDown: ((event: PointerEvent) => void) | null = null;

    popAudioRef.current = new Audio("/assets/pop-pop-bubbles/pop_se.mp3");
    popAudioRef.current.preload = "auto";
    popAudioRef.current.volume = 0.42;

    Promise.all(CONTENT_IMAGE_PATHS.map((src) => loadImage(src)))
      .then((animalImages) => {
        if (disposed) return;
        const playPop = () => {
          const base = popAudioRef.current;
          if (base?.src) {
            const clone = base.cloneNode(true) as HTMLAudioElement;
            clone.volume = base.volume;
            clone.play().catch(() => playFallbackPop(audioCtxRef));
            return;
          }
          playFallbackPop(audioCtxRef);
        };

        const scene = new PopPopBubblesScene({
          canvas,
          animalImages,
          onPlayPop: playPop,
          onBubbleCollision: () => setCollisionCount((n) => n + 1),
        });
        sceneRef.current = scene;
        scene.setDebugConfig({
          bubbleCount,
          bubbleSpeedScale,
          animalFallGravity,
          bubbleRestitution,
          burstParticleSizeScale,
          burstParticleSpeedScale,
          mobileBubbleScaleCompensation,
          fallingAnimalSizeScale,
          burstRingLineWidthScale,
          burstRingExpandSpeedScale,
          burstRingShadowBlurPx,
          bgPaletteMode,
        });

        const resize = () => {
          const rect = stage.getBoundingClientRect();
          scene.resize(rect.width, rect.height);
        };
        resize();

        ro = new ResizeObserver(resize);
        ro.observe(stage);
        scene.start();
        setIsReady(true);

        onPointerDown = (event: PointerEvent) => {
          scene.handlePointerDown(event.clientX, event.clientY);
        };
        canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
      })
      .catch(() => {
        if (!disposed) setIsReady(false);
      });

    return () => {
      disposed = true;
      if (onPointerDown) canvas.removeEventListener("pointerdown", onPointerDown);
      ro?.disconnect();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setDebugConfig({
      bubbleSpeedScale,
      animalFallGravity,
      bubbleRestitution,
      burstParticleSizeScale,
      burstParticleSpeedScale,
      mobileBubbleScaleCompensation,
      fallingAnimalSizeScale,
      burstRingLineWidthScale,
      burstRingExpandSpeedScale,
      burstRingShadowBlurPx,
      bgPaletteMode,
    });
  }, [
    bubbleSpeedScale,
    animalFallGravity,
    bubbleRestitution,
    burstParticleSizeScale,
    burstParticleSpeedScale,
    mobileBubbleScaleCompensation,
    fallingAnimalSizeScale,
    burstRingLineWidthScale,
    burstRingExpandSpeedScale,
    burstRingShadowBlurPx,
    bgPaletteMode,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setDebugConfig({ bubbleCount });
    scene.respawnWaveNow();
  }, [bubbleCount]);

  useEffect(() => {
    const onLoad = () => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        })
      );
    };
    if (typeof document === "undefined") return;
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return (
    <div className={`${GAME_COLUMN_CLASS} flex min-h-0 flex-1 flex-col lg:max-w-none`}>
      {isDevTj && !isDebugMode && (
        <div className="fixed right-4 top-4 z-50">
          <button
            type="button"
            onClick={() => setIsDebugMode(true)}
            className="rounded border border-[color-mix(in_srgb,var(--color-text)_22%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_84%,var(--color-bg))] px-2 py-1 font-mono text-xs text-[var(--color-text)] shadow-sm"
          >
            DEBUG OFF
          </button>
        </div>
      )}
      {isDevTj && isDebugMode && (
        <div className="fixed right-4 top-4 z-50 max-h-[90vh] w-[min(92vw,300px)] overflow-y-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_90%,var(--color-bg))] p-3 text-left text-xs text-[var(--color-text)] shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            {isDebugPanelExpanded && <span className="font-bold text-[var(--color-primary)]">はじけて！バブル DEBUG</span>}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsDebugMode(false)}
                className="rounded border border-[color-mix(in_srgb,var(--color-text)_22%,transparent)] bg-[var(--color-primary)] px-2 py-1 text-[10px] font-semibold text-[var(--color-on-primary)]"
              >
                DEBUG ON
              </button>
              <button
                type="button"
                onClick={() => setIsDebugPanelExpanded((v) => !v)}
                className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] p-1 text-[var(--color-muted)]"
                aria-expanded={isDebugPanelExpanded}
              >
                {isDebugPanelExpanded ? "▲" : "▼"}
              </button>
            </div>
          </div>
          <div className="mb-2 rounded border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] px-2 py-1 text-[10px] text-[var(--color-muted)]">
            衝突検知: <span className="tabular-nums">{collisionCount}</span>
          </div>
          {isDebugPanelExpanded && (
            <div className="space-y-3 text-[10px] text-[var(--color-muted)]">
              <label className="block rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-2">
                <div className="mb-1 font-semibold text-[var(--color-text)]">背景色パレット</div>
                <select
                  value={bgPaletteMode}
                  onChange={(e) => setBgPaletteMode(e.target.value as PopPopBubblesBgPaletteMode)}
                  className="w-full rounded border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-bg))] px-2 py-1 text-[10px] text-[var(--color-text)]"
                >
                  <option value="vivid">A: ビビッド（既定）</option>
                  <option value="pastel">B: パステル</option>
                </select>
                <p className="mt-1 text-[9px] leading-snug text-[var(--color-muted)]">
                  切替で抽選プールが即座に変わり、現在の背景も新プールから再抽選されます。
                </p>
              </label>
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-2">
                <button
                  type="button"
                  onClick={() => setIsBubbleParamsExpanded((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                  aria-expanded={isBubbleParamsExpanded}
                >
                  <span className="font-semibold text-[var(--color-text)]">バブル</span>
                  <span className="text-[var(--color-muted)]">{isBubbleParamsExpanded ? "▲" : "▼"}</span>
                </button>
                {isBubbleParamsExpanded && (
                  <div className="mt-2 space-y-2">
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">バブル数</div>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        step={1}
                        value={bubbleCount}
                        onChange={(e) => setBubbleCount(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{bubbleCount}</div>
                    </label>
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">バブル速度倍率</div>
                      <input
                        type="range"
                        min={0.3}
                        max={3}
                        step={0.1}
                        value={bubbleSpeedScale}
                        onChange={(e) => setBubbleSpeedScale(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{bubbleSpeedScale.toFixed(1)}x</div>
                    </label>
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">モバイル時バブル縮小補正</div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={mobileBubbleScaleCompensation}
                        onChange={(e) => setMobileBubbleScaleCompensation(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{mobileBubbleScaleCompensation.toFixed(2)}</div>
                    </label>
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">バブル弾性（ぷにん反発）</div>
                      <input
                        type="range"
                        min={0.55}
                        max={0.98}
                        step={0.01}
                        value={bubbleRestitution}
                        onChange={(e) => setBubbleRestitution(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{bubbleRestitution.toFixed(2)}</div>
                    </label>
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-2">
                <button
                  type="button"
                  onClick={() => setIsBurstFxExpanded((v) => !v)}
                  className="flex w-full items-center justify-between text-left"
                  aria-expanded={isBurstFxExpanded}
                >
                  <span className="font-semibold text-[var(--color-text)]">破裂表現・内容物</span>
                  <span className="text-[var(--color-muted)]">{isBurstFxExpanded ? "▲" : "▼"}</span>
                </button>
                {isBurstFxExpanded && (
                  <div className="mt-2 space-y-2">
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">はじけパーティクル大きさ（基準0.5pxに対する倍率）</div>
                      <input
                        type="range"
                        min={0.25}
                        max={4}
                        step={0.05}
                        value={burstParticleSizeScale}
                        onChange={(e) => setBurstParticleSizeScale(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{burstParticleSizeScale.toFixed(2)}x</div>
                    </label>
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">はじけパーティクル初速</div>
                      <input
                        type="range"
                        min={0.25}
                        max={4}
                        step={0.05}
                        value={burstParticleSpeedScale}
                        onChange={(e) => setBurstParticleSpeedScale(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{burstParticleSpeedScale.toFixed(2)}x</div>
                    </label>
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">内容物の落下速度（重力）</div>
                      <input
                        type="range"
                        min={120}
                        max={900}
                        step={10}
                        value={animalFallGravity}
                        onChange={(e) => setAnimalFallGravity(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{animalFallGravity.toFixed(0)}</div>
                    </label>
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">内容物サイズ倍率</div>
                      <input
                        type="range"
                        min={0.5}
                        max={3.5}
                        step={0.05}
                        value={fallingAnimalSizeScale}
                        onChange={(e) => setFallingAnimalSizeScale(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{fallingAnimalSizeScale.toFixed(2)}x</div>
                    </label>
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">リング太さ倍率</div>
                      <input
                        type="range"
                        min={0.25}
                        max={3}
                        step={0.05}
                        value={burstRingLineWidthScale}
                        onChange={(e) => setBurstRingLineWidthScale(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{burstRingLineWidthScale.toFixed(2)}x</div>
                    </label>
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">リング広がり速度</div>
                      <input
                        type="range"
                        min={0.25}
                        max={3}
                        step={0.05}
                        value={burstRingExpandSpeedScale}
                        onChange={(e) => setBurstRingExpandSpeedScale(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{burstRingExpandSpeedScale.toFixed(2)}x</div>
                    </label>
                    <label className="block">
                      <div className="mb-1 font-semibold text-[var(--color-text)]">リング残像（shadowBlur）</div>
                      <input
                        type="range"
                        min={0}
                        max={28}
                        step={1}
                        value={burstRingShadowBlurPx}
                        onChange={(e) => setBurstRingShadowBlurPx(Number(e.target.value))}
                        className="w-full accent-[var(--color-primary)]"
                      />
                      <div className="tabular-nums">{burstRingShadowBlurPx.toFixed(0)}px</div>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <GamePageHeader
        titleEn="Pop-Pop Bubbles"
        titleJa="はじけて！バブル"
        breadcrumbs={[
          { label: "ホーム", href: "/" },
          { label: "教材一覧", href: "/#lab-cards" },
          { label: "はじけて！バブル", href: "/lab/pop-pop-bubbles" },
        ]}
      />
      <div className="hidden" aria-hidden>
        <PairLinkAdSlot slotIndex={1} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:gap-5">
        <div className="flex min-h-0 w-full flex-1 flex-col lg:max-h-[calc(100dvh-var(--pop-wrap-off)-80px)] lg:min-w-0 lg:justify-center">
          <section
            className="relative z-[1] mb-0 w-full rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-4 pb-4 pt-2 backdrop-blur sm:px-5 sm:pb-5 sm:pt-2 lg:mb-0"
            style={
              { "--pop-wrap-off": `${GAME_NO_TOP_AD_LAYOUT_OFFSET_PX}px` } as CSSProperties
            }
          >
            <div
              ref={stageRef}
              className="relative mx-auto aspect-square w-full max-w-[min(460px,92vw,calc(100dvh-var(--pop-wrap-off)-120px))] min-h-0 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[radial-gradient(circle_at_20%_18%,color-mix(in_srgb,var(--color-primary)_14%,transparent),transparent_52%),linear-gradient(180deg,color-mix(in_srgb,var(--color-bg)_92%,white_8%),color-mix(in_srgb,var(--color-bg)_98%,transparent))]"
            >
              <canvas ref={canvasRef} className="h-full w-full touch-none" />
              {!isReady && (
                <div className="absolute inset-0 grid place-items-center text-sm text-[var(--color-muted)]">読み込み中…</div>
              )}
            </div>
          </section>
        </div>

        <aside className="order-2 w-full shrink-0 lg:sticky lg:top-5 lg:max-h-[calc(100dvh-20px)] lg:w-[360px] lg:self-start lg:overflow-y-auto">
          <div className="mb-2 flex flex-col gap-2 lg:hidden">
            <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
                あそびかた・ねらい（要約）
              </summary>
              <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                <p className="m-0">【ねらい】手眼協調・注意の切替・反応速度の基礎づくり</p>
                <p className="mt-2 m-0">【対象】幼児〜小学校低学年</p>
                <p className="mt-2 m-0">【操作】タップ中心の直感操作</p>
              </div>
            </details>
          </div>
          <section className="mb-3 hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2 lg:block">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">あそびかた（要約）</h3>
            <p className="mt-2 m-0 text-xs leading-relaxed text-[var(--color-muted)]">タップでバブルを割り、落ちてくる内容物をキャッチする直感操作です。</p>
          </section>
          <div
            className="relative z-0 w-full"
            style={{ minHeight: GAME_AD_SLOT_MIN_HEIGHT_PX, marginTop: GAME_AD_GAP_BEFORE_SLOT_2_PX }}
          >
            <PairLinkAdSlot slotIndex={2} />
          </div>
        </aside>
      </div>

      <section className="mx-auto mt-6 w-full max-w-3xl">
        <GameQuickInfoNote
          goal="手眼協調・注意の切替・反応速度の基礎づくり"
          target="幼児〜小学校低学年"
          operation="タップ中心の直感操作"
        />
      </section>
    </div>
  );
}
