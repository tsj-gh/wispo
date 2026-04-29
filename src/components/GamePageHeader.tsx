"use client";

import type { ReactNode } from "react";
import { BreadcrumbNav } from "@/components/BreadcrumbNav";
import { DevLink } from "@/components/DevLink";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { BreadcrumbEntry } from "@/lib/breadcrumbs";
import { useI18n } from "@/lib/i18n-context";

export type GamePageHeaderProps = {
  /** 英語表記（例: Pair-Link） */
  titleEn: string;
  /** 日本語表記（括弧内に表示） */
  titleJa: string;
  homeHref?: string;
  trailing?: ReactNode;
  breadcrumbs?: BreadcrumbEntry[];
  /** 既定: w-full（親の GAME_COLUMN_CLASS 等で幅を与える） */
  maxWidthClassName?: string;
  /** 追加クラス（例: px-4 border-b） */
  className?: string;
};

export function GamePageHeader({
  titleEn,
  titleJa,
  homeHref = "/",
  trailing,
  breadcrumbs,
  maxWidthClassName = "w-full",
  className = "",
}: GamePageHeaderProps) {
  const { locale } = useI18n();

  return (
    <header
      className={`mb-4 flex w-full flex-col gap-2 sm:gap-3 ${maxWidthClassName} ${className}`.trim()}
    >
      {/* 1行目: ■Wispo と JP/EN（＋タイマー等）を同じベースライン付近・h-8 で揃える。ゲーム名より上。 */}
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <DevLink
            href={homeHref}
            className="flex min-h-8 min-w-0 shrink-0 items-center gap-2 self-center text-xl font-black leading-none tracking-wider text-[var(--color-text)] no-underline hover:opacity-90 sm:gap-3 sm:text-2xl"
          >
            <span className="block h-8 w-8 shrink-0 rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-[color-mix(in_srgb,var(--color-accent)_70%,var(--color-primary))]" />
            <span className="truncate">Wispo</span>
          </DevLink>
          {breadcrumbs ? <BreadcrumbNav items={breadcrumbs} /> : null}
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 self-center">
          <LanguageToggle />
          {trailing != null ? (
            <div className="flex shrink-0 items-center gap-2 text-sm leading-none text-[var(--color-muted)]">{trailing}</div>
          ) : null}
        </div>
      </div>

      {/* 2行目: アプリ名（言語切替より下に回らないよう常にこの順） */}
      <h1 className="min-w-0 max-w-full break-words text-left text-xl font-black leading-tight tracking-tight text-[var(--color-text)] sm:text-2xl">
        <span className="text-[var(--color-text)]">{titleEn}</span>
        {locale === "ja" ? <span className="text-[var(--color-muted)]">（{titleJa}）</span> : null}
      </h1>
    </header>
  );
}
