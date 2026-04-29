"use client";

import { DevLink } from "@/components/DevLink";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BreadcrumbNav } from "@/components/BreadcrumbNav";
import type { BreadcrumbEntry } from "@/lib/breadcrumbs";

/** 各ゲームの GamePageHeader 1行目と同型（■Wispo + JP/EN を同じ高さで横並び） */
type EducationalColumnWispoHeaderProps = {
  breadcrumbs?: BreadcrumbEntry[];
};

export function EducationalColumnWispoHeader({ breadcrumbs }: EducationalColumnWispoHeaderProps) {
  return (
    <header className="mb-8 w-full min-w-0">
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <DevLink
            href="/"
            className="flex min-h-8 min-w-0 shrink-0 items-center gap-3 text-xl font-black leading-none tracking-wider text-[var(--color-text)] no-underline hover:opacity-90 sm:text-2xl"
          >
            <span className="block h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[color-mix(in_srgb,var(--color-accent)_70%,var(--color-primary))]" />
            <span className="truncate">Wispo</span>
          </DevLink>
          {breadcrumbs ? <BreadcrumbNav items={breadcrumbs} /> : null}
        </div>
        <div className="shrink-0 self-center">
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
