"use client";

import { BreadcrumbNav } from "./BreadcrumbNav";
import { DevLink } from "./DevLink";
import { LanguageToggle } from "./LanguageToggle";
import type { BreadcrumbEntry } from "@/lib/breadcrumbs";
import { useI18n } from "@/lib/i18n-context";

type PageHeaderWithDevLinksProps = {
  backLabel?: string;
  breadcrumbs?: BreadcrumbEntry[];
};

/**
 * 共通ページヘッダー（devtj パラメータ維持）
 */
export function PageHeaderWithDevLinks({ backLabel, breadcrumbs }: PageHeaderWithDevLinksProps) {
  const { t } = useI18n();
  const label = backLabel ?? t("common.backToTopArrow");

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 py-8">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <DevLink
          href="/"
          className="flex items-center gap-3 text-[28px] font-black tracking-[2px] text-[var(--color-text)] no-underline hover:opacity-90"
        >
          <span className="block h-8 w-8 rounded-2xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] shadow-[0_0_15px_var(--wit-accent-glow)]" />
          Wispo
        </DevLink>
        {breadcrumbs ? <BreadcrumbNav items={breadcrumbs} /> : null}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <LanguageToggle size="comfortable" />
        <DevLink
          href="/"
          className="text-[var(--color-muted)] text-sm no-underline hover:text-[var(--color-text)] transition-colors"
        >
          {label}
        </DevLink>
      </div>
    </header>
  );
}
