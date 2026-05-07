"use client";

import { Suspense, useId } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSiteTheme } from "@/components/SiteThemeProvider";
import { SITE_THEMES, SITE_THEME_IDS, type SiteThemeId } from "@/lib/themes";
import { useI18n } from "@/lib/i18n-context";

function DebugThemeSelectorInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { themeId, setThemeId } = useSiteTheme();
  const { t } = useI18n();
  const id = useId();

  if (searchParams.get("devtj") !== "true" || pathname !== "/") return null;

  /** ??????????????????????????????????? */
  const cornerClass = pathname === "/" ? "bottom-3 left-3" : "top-3 left-3";

  return (
    <div
      className={`pointer-events-auto fixed z-[60] w-[min(100vw-1.5rem,220px)] rounded-xl border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_55%,var(--color-bg))] px-2.5 py-2 shadow-lg backdrop-blur-sm ${cornerClass}`}
      role="region"
      aria-label={t("common.debugSiteTheme")}
    >
      <label className="mb-1 block text-[9px] font-medium uppercase tracking-wide text-[var(--color-muted)]" htmlFor={id}>
        {t("common.debugSiteTheme")}
      </label>
      <select
        id={id}
        value={themeId}
        onChange={(e) => setThemeId(e.target.value as SiteThemeId)}
        className="w-full rounded-lg border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_45%,var(--color-bg))] px-2 py-1.5 text-[10px] text-[var(--color-text)]"
      >
        {SITE_THEME_IDS.map((tid) => (
          <option key={tid} value={tid}>
            {SITE_THEMES[tid].name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** `?devtj=true` ???????????????Root Layout ??? */
export function DebugThemeSelector() {
  return (
    <Suspense fallback={null}>
      <DebugThemeSelectorInner />
    </Suspense>
  );
}
