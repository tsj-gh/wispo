"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PairLinkAdSlot } from "@/components/PairLinkAdSlots";
import { GamePageHeader } from "@/components/GamePageHeader";
import {
  ColoringCanvas,
  type ColoringCanvasHandle,
  type TapColoringHistoryEditChrome,
} from "@/components/lab/ColoringCanvas";
import { TapColoringGallery } from "@/components/lab/TapColoringGallery";
import { GameQuickInfoNote } from "@/components/lab/GameQuickInfoNote";
import { readTapColoringHistory, type TapColoringHistoryEntry } from "@/lib/tapColoringHistory";
import {
  GAME_AD_GAP_BEFORE_SLOT_2_PX,
  GAME_AD_SLOT_MIN_HEIGHT_PX,
  GAME_COLUMN_CLASS,
} from "@/lib/gameLayout";

/**
 * 他ラボゲームと同型のヘッダー・列幅。広告#1 は出さず、#2 のみ Pair-Link と同一コンポーネントで配置（GPT 用に #1 は DOM のみ非表示）。
 */
export function TapColoringLabShell() {
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const coloringRef = useRef<ColoringCanvasHandle | null>(null);
  const tapDebugOnButtonRef = useRef<HTMLButtonElement>(null);
  const [canvasDebugMode, setCanvasDebugMode] = useState(false);
  const [histTick, setHistTick] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<TapColoringHistoryEntry[]>([]);
  const [tapToast, setTapToast] = useState<string | null>(null);
  const [shakeEntryId, setShakeEntryId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [sceneBgColor, setSceneBgColor] = useState("#fafaf9");
  const [historyEditChrome, setHistoryEditChrome] = useState<TapColoringHistoryEditChrome>({
    editingId: null,
    exitReady: false,
  });
  const onHistorySequenceInteractionChange = useCallback((allowed: boolean) => {
    setIsLocked(!allowed);
  }, []);

  useEffect(() => {
    setHistoryEntries(readTapColoringHistory());
  }, [histTick]);

  useEffect(() => {
    if (!tapToast) return;
    const t = window.setTimeout(() => setTapToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [tapToast]);

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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setIsMobileLayout(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className={`${GAME_COLUMN_CLASS} relative flex min-h-0 flex-1 flex-col lg:max-w-none`}>
      {tapToast && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[60] max-w-[min(92vw,320px)] -translate-x-1/2 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_95%,transparent)] px-4 py-2 text-center text-xs font-medium text-[var(--color-text)] shadow-lg backdrop-blur"
        >
          {tapToast}
        </div>
      )}
      <GamePageHeader
        titleEn="Tap Coloring"
        titleJa="タップぬりえ"
        breadcrumbs={[
          { label: "ホーム", href: "/" },
          { label: "教材一覧", href: "/#lab-cards" },
          { label: "タップぬりえ", href: "/lab/tap-coloring" },
        ]}
      />
      {isDevTj && (
        <div
          className={`fixed right-3 top-14 z-[55] sm:right-4 sm:top-16 ${canvasDebugMode ? "pointer-events-none" : ""}`}
        >
          <button
            ref={tapDebugOnButtonRef}
            type="button"
            disabled={canvasDebugMode}
            aria-hidden={canvasDebugMode}
            onClick={() => coloringRef.current?.setDebugMode(true)}
            className={`rounded border border-stone-300 bg-white/90 px-2 py-1 font-mono text-xs text-stone-800 shadow-sm ${
              canvasDebugMode ? "opacity-0" : ""
            }`}
            title="デバッグを開始"
            aria-label="デバッグを開始"
          >
            DEBUG OFF
          </button>
        </div>
      )}
      <div className="hidden" aria-hidden>
        <PairLinkAdSlot slotIndex={1} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:gap-5">
        <div className="flex min-h-0 w-full flex-1 flex-col lg:min-w-0 lg:justify-start lg:overflow-visible">
          <div className="w-full">
            <section
              className="relative z-[1] mb-0 w-full rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-4 pb-4 pt-4 backdrop-blur sm:px-5 sm:pb-5 sm:pt-4 lg:mb-0"
              style={
                isMobileLayout
                  ? { backgroundColor: sceneBgColor, transition: "background-color 1000ms linear" }
                  : undefined
              }
            >
              {historyEditChrome.exitReady && !isMobileLayout && (
                <button
                  type="button"
                  onClick={() => coloringRef.current?.exitHistoryEditing()}
                  className="absolute right-3 top-3 z-20 min-w-[8.5rem] rounded-xl border-2 border-orange-950/30 bg-orange-600 px-4 py-2.5 text-base font-bold text-white shadow-lg transition hover:bg-orange-500 active:scale-[0.98] sm:right-4 sm:top-4 sm:min-w-[9.5rem] sm:px-5 sm:py-3 sm:text-lg"
                >
                  編集終了
                </button>
              )}
              <div className="max-h-none lg:max-h-none lg:overflow-visible">
                <ColoringCanvas
                  ref={coloringRef}
                  deferSceneBackgroundToShell={isMobileLayout}
                  debugOnControlRef={tapDebugOnButtonRef}
                  onDebugModeChange={setCanvasDebugMode}
                  onSceneBgColorChange={setSceneBgColor}
                  onHistoryEditChromeChange={setHistoryEditChrome}
                  onHistoryUpdated={() => setHistTick((t) => t + 1)}
                  onHistoryEntryReplaced={(id) => {
                    setShakeEntryId(id);
                    setHistTick((t) => t + 1);
                    window.setTimeout(() => setShakeEntryId(null), 700);
                  }}
                  onHistorySequenceInteractionChange={onHistorySequenceInteractionChange}
                />
              </div>
            </section>
          </div>
        </div>

        {historyEditChrome.exitReady && isMobileLayout && (
          <button
            type="button"
            onClick={() => coloringRef.current?.exitHistoryEditing()}
            className="w-full shrink-0 rounded-xl border-2 border-orange-950/30 bg-orange-600 px-4 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-orange-500 active:scale-[0.99] sm:py-4 sm:text-xl"
          >
            編集終了
          </button>
        )}

        <TapColoringGallery
          className="w-full shrink-0 lg:hidden"
          entries={historyEntries}
          coloringRef={coloringRef}
          editingHistoryEntryId={historyEditChrome.editingId}
          shakeEntryId={shakeEntryId}
          onToast={setTapToast}
          isLocked={isLocked}
          onHistorySaved={() => setHistTick((t) => t + 1)}
        />

        <aside className="order-2 w-full shrink-0 lg:sticky lg:top-5 lg:max-h-[calc(100dvh-20px)] lg:w-[360px] lg:self-start lg:overflow-y-auto">
          <div className="mb-2 flex flex-col gap-2 lg:hidden">
            <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
                あそびかた
              </summary>
              <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                <p className="m-0">
                  パレットから色を選んでタップで塗りつぶし。重なった部分は鮮やかに混ざります。額縁や背景などを飾って保存や送信ができます。
                </p>
              </div>
            </details>
          </div>
          <section className="mb-1.5 hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2 lg:block">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">あそびかた</h3>
            <p className="mt-2 m-0 text-xs leading-relaxed text-[var(--color-muted)]">
              パレットから色を選んでタップで塗りつぶし。重なった部分は鮮やかに混ざります。額縁や背景などを飾って保存や送信ができます。
            </p>
          </section>
          <div
            className="relative z-0 w-full"
            style={{ minHeight: GAME_AD_SLOT_MIN_HEIGHT_PX, marginTop: GAME_AD_GAP_BEFORE_SLOT_2_PX / 2 }}
          >
            <PairLinkAdSlot slotIndex={2} />
          </div>
          <TapColoringGallery
            className="mt-3 hidden lg:block"
            entries={historyEntries}
            coloringRef={coloringRef}
            editingHistoryEntryId={historyEditChrome.editingId}
            shakeEntryId={shakeEntryId}
            onToast={setTapToast}
            isLocked={isLocked}
            onHistorySaved={() => setHistTick((t) => t + 1)}
          />
        </aside>
      </div>

      <section className="mx-auto mt-6 w-full max-w-3xl">
        <GameQuickInfoNote
          goal="色彩認知・原因と結果の理解・手眼協調の向上"
          target="幼児〜小学校低学年"
          operation="タップ中心の直感操作"
        />
      </section>
    </div>
  );
}
