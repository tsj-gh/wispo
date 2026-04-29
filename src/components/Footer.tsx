"use client";

import { Suspense } from "react";
import { DevLink } from "./DevLink";
import { useI18n } from "@/lib/i18n-context";

function FooterNav() {
  const { t } = useI18n();

  return (
    <nav
      className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 mb-4"
      aria-label="フッターナビゲーション"
    >
      <DevLink
        href="/"
        className="text-[13px] text-[var(--color-muted)] no-underline transition-colors hover:text-[var(--color-text)]"
      >
        {t("footer.top")}
      </DevLink>
      <span className="text-[color-mix(in_srgb,var(--color-muted)_50%,transparent)]" aria-hidden="true">|</span>
      <DevLink
        href="/privacy"
        className="text-[13px] text-[var(--color-muted)] no-underline transition-colors hover:text-[var(--color-text)]"
      >
        {t("footer.privacy")}
      </DevLink>
      <span className="text-[color-mix(in_srgb,var(--color-muted)_50%,transparent)]" aria-hidden="true">|</span>
      <DevLink
        href="/contact"
        className="text-[13px] text-[var(--color-muted)] no-underline transition-colors hover:text-[var(--color-text)]"
      >
        {t("footer.contact")}
      </DevLink>
      <span className="text-[color-mix(in_srgb,var(--color-muted)_50%,transparent)]" aria-hidden="true">|</span>
      <DevLink
        href="/columns/educational-value"
        className="text-[13px] text-[var(--color-muted)] no-underline transition-colors hover:text-[var(--color-text)]"
      >
        {t("footer.column")}
      </DevLink>
      <span className="text-[color-mix(in_srgb,var(--color-muted)_50%,transparent)]" aria-hidden="true">|</span>
      <DevLink
        href="/operator"
        className="text-[13px] text-[var(--color-muted)] no-underline transition-colors hover:text-[var(--color-text)]"
      >
        {t("footer.operator")}
      </DevLink>
      <span className="text-[color-mix(in_srgb,var(--color-muted)_50%,transparent)]" aria-hidden="true">|</span>
      <DevLink
        href="/updates"
        className="text-[13px] text-[var(--color-muted)] no-underline transition-colors hover:text-[var(--color-text)]"
      >
        {t("footer.updates")}
      </DevLink>
    </nav>
  );
}

export default function Footer() {
  return (
    <footer
      className="mt-auto border-t border-[var(--wit-border)] py-10 px-6"
      role="contentinfo"
    >
      <Suspense fallback={<nav className="flex justify-center gap-4 mb-4" aria-label="フッターナビゲーション" />}>
        <FooterNav />
      </Suspense>
      <p className="text-center text-sm text-[var(--color-muted)]">
        &copy; 2026 Wispo (wispo.pages.dev). All rights reserved.
      </p>
    </footer>
  );
}
