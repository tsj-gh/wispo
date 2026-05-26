"use client";

import { AnimatePresence, motion } from "framer-motion";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import jaLocale from "i18n-iso-countries/langs/ja.json";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlagExplorerMap } from "@/components/lab/flag-guesser/FlagExplorerMap";
import {
  collectCountryCodesForRegionalMapFit,
  mergeExplorerCountries,
  type ExplorerCountryRow,
  type FlagDifficultyJsonRow,
} from "@/lib/flag-guesser/flagExplorerDataset";
import { flagUrlForAlpha2 } from "@/lib/flag-guesser/selectRound";
import type { Iso3166Row } from "@/lib/flag-guesser/types";

countries.registerLocale(enLocale);
countries.registerLocale(jaLocale);

const ISO_URL = "/assets/flag-guesser/iso-3166.json";
const DIFF_URL = "/assets/flag-guesser/flag_difficulty.json";
const ASPECT_URL = "/assets/flag-guesser/flag_aspect_ratio.json";

const springPanel = { type: "spring" as const, stiffness: 370, damping: 32 };

/** プロセス内キャッシュ。ページ遷移なしで再オープンしても再 fetch しない */
type CachedExplorerData = {
  isoRows: Iso3166Row[];
  diffRows: FlagDifficultyJsonRow[];
  aspectMeta: Record<string, { ratio: number }> | null;
};
let cachedExplorerData: CachedExplorerData | null = null;
let inflightExplorerData: Promise<CachedExplorerData> | null = null;

async function loadExplorerData(): Promise<CachedExplorerData> {
  if (cachedExplorerData) return cachedExplorerData;
  if (inflightExplorerData) return inflightExplorerData;
  inflightExplorerData = (async () => {
    const [isoRes, diffRes, aspectRes] = await Promise.all([
      fetch(ISO_URL),
      fetch(DIFF_URL),
      fetch(ASPECT_URL).catch(() => null),
    ]);
    if (!isoRes.ok || !diffRes.ok) throw new Error("explorer data fetch failed");
    const isoRows = (await isoRes.json()) as Iso3166Row[];
    const diffRows = (await diffRes.json()) as FlagDifficultyJsonRow[];
    let aspectMeta: Record<string, { ratio: number }> | null = null;
    if (aspectRes && aspectRes.ok) {
      try {
        const j = await aspectRes.json();
        if (j && typeof j === "object") aspectMeta = j as Record<string, { ratio: number }>;
      } catch {
        aspectMeta = null;
      }
    }
    cachedExplorerData = { isoRows, diffRows, aspectMeta };
    return cachedExplorerData;
  })();
  try {
    return await inflightExplorerData;
  } finally {
    inflightExplorerData = null;
  }
}

export type ExplorerCountryDetailOverlayProps = {
  alpha2: string;
  onClose: () => void;
};

/**
 * フラッグゲッサーや他ページから呼ぶ、Explorer の国詳細パネルだけのオーバーレイ。
 * 内部で alpha-2 を持ち、類似一覧から別の国に飛ぶときもページ遷移なしで切り替える。
 */
export function ExplorerCountryDetailOverlay({
  alpha2,
  onClose,
}: ExplorerCountryDetailOverlayProps) {
  const [data, setData] = useState<CachedExplorerData | null>(cachedExplorerData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentAlpha2, setCurrentAlpha2] = useState<string>(alpha2.trim().toUpperCase());

  useEffect(() => {
    setCurrentAlpha2(alpha2.trim().toUpperCase());
  }, [alpha2]);

  useEffect(() => {
    if (cachedExplorerData) {
      if (!data) setData(cachedExplorerData);
      return;
    }
    let cancelled = false;
    loadExplorerData()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "読み込みエラー");
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const merged = useMemo<ExplorerCountryRow[]>(() => {
    if (!data) return [];
    const jaByA2 = new Map<string, string>();
    for (const row of data.isoRows) {
      const a2 = row["alpha-2"]?.trim().toUpperCase();
      if (!a2) continue;
      const ja = countries.getName(a2, "ja");
      if (ja) jaByA2.set(a2, ja);
    }
    return mergeExplorerCountries(data.isoRows, data.diffRows, jaByA2);
  }, [data]);

  const byAlpha3 = useMemo(() => {
    const m = new Map<string, ExplorerCountryRow>();
    for (const r of merged) m.set(r.alpha3, r);
    return m;
  }, [merged]);

  const selected = useMemo<ExplorerCountryRow | null>(() => {
    if (!currentAlpha2) return null;
    return merged.find((r) => r.alpha2.toUpperCase() === currentAlpha2) ?? null;
  }, [merged, currentAlpha2]);

  const similarList = useMemo<ExplorerCountryRow[]>(() => {
    if (!selected) return [];
    const ids = new Set<string>([...selected.confusableColors, ...selected.confusableDesign]);
    ids.delete(selected.alpha3);
    const out: ExplorerCountryRow[] = [];
    for (const id of Array.from(ids)) {
      const row = byAlpha3.get(id);
      if (row) out.push(row);
    }
    return out.sort((a, b) => a.nameJa.localeCompare(b.nameJa, "ja"));
  }, [selected, byAlpha3]);

  const mapRegionFitCodes = useMemo(() => {
    if (!selected || !data?.isoRows?.length) return null;
    const codes = collectCountryCodesForRegionalMapFit(selected, data.isoRows);
    return codes.length > 0 ? codes : null;
  }, [selected, data]);

  const getAspectRatio = useCallback(
    (a2: string): number => {
      const v = data?.aspectMeta?.[a2.toUpperCase()]?.ratio;
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        return Math.min(3, Math.max(0.5, v));
      }
      return 1.5;
    },
    [data]
  );

  return (
    <AnimatePresence>
      <motion.div
        key="fg-detail-overlay"
        className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button
          type="button"
          aria-label="閉じる"
          className="absolute inset-0 bg-black/45"
          onClick={onClose}
        />
        <motion.aside
          role="dialog"
          aria-modal="true"
          className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[var(--color-bg)] text-[var(--color-text)] shadow-2xl"
          initial={{ y: 24, scale: 0.98, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 20, scale: 0.98, opacity: 0 }}
          transition={springPanel}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{selected?.nameJa ?? "—"}</h2>
              <p className="truncate text-sm text-[var(--color-muted)]">{selected?.nameEn ?? ""}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]"
              aria-label="閉じる"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {loadError ? (
              <p className="text-sm text-rose-500">読み込みに失敗しました: {loadError}</p>
            ) : !data ? (
              <p className="text-sm text-[var(--color-muted)]">読み込み中…</p>
            ) : !selected ? (
              <p className="text-sm text-[var(--color-muted)]">
                {currentAlpha2} の詳細データが見つかりませんでした。
              </p>
            ) : (
              <>
                <div className="mb-4 flex h-56 w-full items-center justify-center overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-bg))] p-3 sm:h-64">
                  <div
                    className="h-full max-w-full"
                    style={{ aspectRatio: getAspectRatio(selected.alpha2) }}
                  >
                    <img
                      src={flagUrlForAlpha2(selected.alpha2)}
                      alt={`${selected.nameJa}の国旗`}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">alpha-3</dt>
                    <dd className="font-mono">{selected.alpha3}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">地域</dt>
                    <dd>
                      {selected.regionLabel ?? "—"}
                      {selected.subRegionLabel ? ` / ${selected.subRegionLabel}` : ""}
                      {selected.intermediateRegionLabel
                        ? ` / ${selected.intermediateRegionLabel}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--color-muted)]">難易度</dt>
                    <dd className="tabular-nums">{selected.difficulty} / 8</dd>
                  </div>
                </dl>

                <div className="mt-6">
                  <h3 className="mb-2 text-xs text-[var(--color-muted)]">地図</h3>
                  <FlagExplorerMap
                    highlightCountryCode={selected.countryCode}
                    isoRows={data.isoRows}
                    regionFitCountryCodes={mapRegionFitCodes}
                  />
                </div>

                <div className="mt-6">
                  <h3 className="mb-2 text-xs text-[var(--color-muted)]">色使いや形が似ている国旗</h3>
                  {similarList.length === 0 ? (
                    <p className="text-xs text-[var(--color-muted)]">比較候補なし</p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {similarList.map((s) => (
                        <li key={s.alpha3}>
                          <button
                            type="button"
                            onClick={() => setCurrentAlpha2(s.alpha2.toUpperCase())}
                            className="flex w-full flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] text-left transition hover:bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]"
                          >
                            <div className="flex h-24 w-full items-center justify-center bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-bg))] p-1">
                              <div
                                className="h-full max-w-full"
                                style={{ aspectRatio: getAspectRatio(s.alpha2) }}
                              >
                                <img
                                  src={flagUrlForAlpha2(s.alpha2)}
                                  alt={`${s.nameJa}の国旗`}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-contain"
                                />
                              </div>
                            </div>
                            <span className="line-clamp-2 p-2 text-[11px]">{s.nameJa}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
