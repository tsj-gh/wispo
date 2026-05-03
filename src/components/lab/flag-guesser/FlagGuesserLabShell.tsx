"use client";

import type { CSSProperties } from "react";
import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PairLinkAdSlot } from "@/components/PairLinkAdSlots";
import { GamePageHeader } from "@/components/GamePageHeader";
import { GameQuickInfoNote } from "@/components/lab/GameQuickInfoNote";
import { FlagGuesserPlayfield } from "@/components/lab/flag-guesser/FlagGuesserPlayfield";
import {
  FlagGuesserDebugPanel,
  type FlagGuesserDebugPanelProps,
} from "@/components/lab/flag-guesser/FlagGuesserDebugPanel";
import { GAME_AD_GAP_BEFORE_SLOT_2_PX, GAME_COLUMN_CLASS, GAME_NO_TOP_AD_LAYOUT_OFFSET_PX, GAME_AD_SLOT_MIN_HEIGHT_PX } from "@/lib/gameLayout";

export function FlagGuesserLabShell() {
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const [debugPanelProps, setDebugPanelProps] = useState<FlagGuesserDebugPanelProps | null>(null);
  const onDebugPanelPropsChange = useCallback((p: FlagGuesserDebugPanelProps | null) => {
    setDebugPanelProps(p);
  }, []);

  return (
    <div className={`${GAME_COLUMN_CLASS} flex h-full min-h-0 flex-1 flex-col lg:max-w-none`}>
      <GamePageHeader
        titleEn="Flag Guesser"
        titleJa="フラッグゲッサー"
        breadcrumbs={[
          { label: "ホーム", href: "/" },
          { label: "教材一覧", href: "/#lab-cards" },
          { label: "フラッグゲッサー", href: "/lab/flag-guesser" },
        ]}
      />
      <div className="hidden" aria-hidden>
        <PairLinkAdSlot slotIndex={1} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:min-h-0 lg:flex-row lg:items-stretch lg:gap-5">
        <div
          className="flex min-h-0 w-full flex-1 flex-col lg:max-h-[calc(100dvh-var(--fg-wrap-off)-80px)] lg:min-w-0"
          style={{ "--fg-wrap-off": `${GAME_NO_TOP_AD_LAYOUT_OFFSET_PX}px` } as CSSProperties}
        >
          <section className="relative z-[1] mb-0 flex min-h-[min(52dvh,560px)] flex-1 flex-col rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-4 pb-4 pt-2 backdrop-blur sm:px-5 sm:pb-5 sm:pt-2 lg:mb-0">
            <Suspense fallback={<div className="py-10 text-center text-sm text-[var(--color-muted)]">読み込み中…</div>}>
              <div className="flex min-h-0 flex-1 flex-col">
                <FlagGuesserPlayfield onDebugPanelPropsChange={onDebugPanelPropsChange} />
              </div>
            </Suspense>
          </section>
        </div>

        <aside className="order-2 w-full shrink-0 lg:sticky lg:top-5 lg:max-h-[calc(100dvh-20px)] lg:w-[360px] lg:self-start lg:overflow-y-auto">
          {isDevTj && debugPanelProps ? (
            <div className="mb-3 w-full">
              <FlagGuesserDebugPanel {...debugPanelProps} />
            </div>
          ) : null}
          <div className="mb-2 flex flex-col gap-2 lg:hidden">
            <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
                あそびかた・ねらい（要約）
              </summary>
              <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                <p className="m-0">【ねらい】国旗と領域の対応・地理区分の直感を育てる</p>
                <p className="mt-2 m-0">【対象】小学校高学年〜一般</p>
                <p className="mt-2 m-0">【操作】国旗をドラッグして国に重ねる／タップで戻す</p>
              </div>
            </details>
          </div>
          <section className="mb-3 hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2 lg:block">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">あそびかた（要約）</h3>
            <p className="mt-2 m-0 text-xs leading-relaxed text-[var(--color-muted)]">
              浮かぶ国旗カードを正しい国の位置にドラッグして重ねます。「こたえる」で判定し、つづけて別の地域にもチャレンジできます。
            </p>
          </section>
          <div className="relative z-0 w-full" style={{ minHeight: GAME_AD_SLOT_MIN_HEIGHT_PX, marginTop: GAME_AD_GAP_BEFORE_SLOT_2_PX }}>
            <PairLinkAdSlot slotIndex={2} />
          </div>
        </aside>
      </div>

      <section className="mx-auto mt-6 w-full max-w-3xl">
        <GameQuickInfoNote
          goal="国旗と領域の対応・地理区分の直感"
          target="小学校高学年〜一般"
          operation="ドラッグ＆ドロップ／タップ"
        />
      </section>
    </div>
  );
}
