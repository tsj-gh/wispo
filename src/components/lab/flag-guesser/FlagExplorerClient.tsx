"use client";

import { AnimatePresence, motion } from "framer-motion";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import jaLocale from "i18n-iso-countries/langs/ja.json";
import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GamePageHeader } from "@/components/GamePageHeader";
import { FlagExplorerMap } from "@/components/lab/flag-guesser/FlagExplorerMap";
import {
  buildRegionHierarchy,
  collectColorTagOptions,
  displayColorTag,
  displayDesignTag,
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

const springPanel = { type: "spring" as const, stiffness: 420, damping: 36 };
const springItem = { type: "spring" as const, stiffness: 400, damping: 32 };

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

function DifficultyDots({ value }: { value: number }) {
  const n = Math.min(8, Math.max(1, Math.round(value)));
  return (
    <div className="flex items-center gap-0.5" aria-label={`難易度 ${n} / 8`} title={`難易度 ${n} / 8`}>
      {Array.from({ length: 8 }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < n ? "bg-[var(--color-primary)]" : "bg-[color-mix(in_srgb,var(--color-muted)_55%,transparent)]"
          }`}
        />
      ))}
    </div>
  );
}

export function FlagExplorerClient() {
  const [isoRows, setIsoRows] = useState<Iso3166Row[] | null>(null);
  const [diffRows, setDiffRows] = useState<FlagDifficultyJsonRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [region, setRegion] = useState("");
  const [subRegion, setSubRegion] = useState("");
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [diffMin, setDiffMin] = useState(1);
  const [diffMax, setDiffMax] = useState(8);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<ExplorerCountryRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [isoRes, diffRes] = await Promise.all([fetch(ISO_URL), fetch(DIFF_URL)]);
        if (!isoRes.ok || !diffRes.ok) throw new Error("データの取得に失敗しました");
        const iso = (await isoRes.json()) as Iso3166Row[];
        const diff = (await diffRes.json()) as FlagDifficultyJsonRow[];
        if (!cancelled) {
          setIsoRows(iso);
          setDiffRows(diff);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "読み込みエラー");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const merged = useMemo(() => {
    if (!isoRows?.length || !diffRows) return [];
    const jaByA2 = new Map<string, string>();
    for (const row of isoRows) {
      const a2 = row["alpha-2"]?.trim().toUpperCase();
      if (!a2) continue;
      const ja = countries.getName(a2, "ja");
      if (ja) jaByA2.set(a2, ja);
    }
    return mergeExplorerCountries(isoRows, diffRows, jaByA2);
  }, [isoRows, diffRows]);

  const byAlpha3 = useMemo(() => {
    const m = new Map<string, ExplorerCountryRow>();
    for (const r of merged) m.set(r.alpha3, r);
    return m;
  }, [merged]);

  const hierarchy = useMemo(() => {
    if (!isoRows) return new Map<string, Set<string>>();
    return buildRegionHierarchy(isoRows);
  }, [isoRows]);

  const regionOptions = useMemo(() => Array.from(hierarchy.keys()).sort((a, b) => a.localeCompare(b)), [hierarchy]);

  const subRegionOptions = useMemo(() => {
    if (!region) return [];
    const set = hierarchy.get(region);
    return set ? Array.from(set).sort((a, b) => a.localeCompare(b)) : [];
  }, [hierarchy, region]);

  const colorOptions = useMemo(() => collectColorTagOptions(merged), [merged]);

  useEffect(() => {
    if (region && subRegion && !subRegionOptions.includes(subRegion)) {
      setSubRegion("");
    }
  }, [region, subRegion, subRegionOptions]);

  const clampDiff = useCallback((a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { lo: Math.min(8, Math.max(1, lo)), hi: Math.min(8, Math.max(1, hi)) };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = merged;
    if (q) {
      list = list.filter(
        (r) =>
          r.nameJa.toLowerCase().includes(q) ||
          r.nameEn.toLowerCase().includes(q) ||
          r.alpha3.toLowerCase().includes(q)
      );
    }
    if (region) list = list.filter((r) => r.regionLabel === region);
    if (subRegion) list = list.filter((r) => r.subRegionLabel === subRegion);
    if (colorFilter.length > 0) {
      list = list.filter((r) => colorFilter.some((c) => r.colors.includes(c)));
    }
    const { lo, hi } = clampDiff(diffMin, diffMax);
    list = list.filter((r) => r.difficulty >= lo && r.difficulty <= hi);
    return [...list].sort((a, b) => a.nameJa.localeCompare(b.nameJa, "ja"));
  }, [merged, query, region, subRegion, colorFilter, diffMin, diffMax, clampDiff]);

  useBodyScrollLock(Boolean(selected));

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const toggleColor = (c: string) => {
    setColorFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const similarList = useMemo(() => {
    if (!selected) return [];
    const ids = new Set<string>();
    for (const x of selected.confusableColors) ids.add(x);
    for (const x of selected.confusableDesign) ids.add(x);
    ids.delete(selected.alpha3);
    const out: ExplorerCountryRow[] = [];
    for (const id of Array.from(ids)) {
      const row = byAlpha3.get(id);
      if (row) out.push(row);
    }
    return out.sort((a, b) => a.nameJa.localeCompare(b.nameJa, "ja"));
  }, [selected, byAlpha3]);

  const dataReady = isoRows && diffRows && !loadError;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col px-4 py-4 md:py-6">
      <GamePageHeader
        titleEn="Flag Explorer"
        titleJa="国旗エクスプローラー"
        breadcrumbs={[
          { label: "ホーム", href: "/" },
          { label: "教材一覧", href: "/#lab-cards" },
          { label: "フラッグゲッサー", href: "/lab/flag-guesser" },
          { label: "エクスプローラー", href: "/lab/flag-guesser/explorer" },
        ]}
      />

      <p className="mb-4 text-sm leading-relaxed text-[var(--color-muted)]">
        地域・色のタグ・難易度で絞り込み、国旗を一覧します。カードを開くと地図上の位置と、色・意匠が似た旗を比較できます。ゲーム本編は{" "}
        <Link href="/lab/flag-guesser" className="text-[var(--color-primary)] underline-offset-2 hover:underline">
          フラッグゲッサー
        </Link>
        へ。
      </p>

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</div>
      ) : null}

      {!dataReady && !loadError ? (
        <div className="py-16 text-center text-sm text-[var(--color-muted)]">データを読み込み中…</div>
      ) : null}

      {dataReady ? (
        <>
          <section className="mb-6 space-y-4 rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-4 backdrop-blur sm:p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
              <Filter className="h-4 w-4 opacity-80" aria-hidden />
              絞り込み
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-xs text-[var(--color-muted)]">
                <span className="font-medium text-[var(--color-text)]">地域</span>
                <select
                  className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                    setSubRegion("");
                  }}
                >
                  <option value="">（すべて）</option>
                  {regionOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-xs text-[var(--color-muted)]">
                <span className="font-medium text-[var(--color-text)]">サブリージョン</span>
                <select
                  className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] disabled:opacity-50"
                  value={subRegion}
                  disabled={!region}
                  onChange={(e) => setSubRegion(e.target.value)}
                >
                  <option value="">（すべて）</option>
                  {subRegionOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-xs font-medium text-[var(--color-text)]">難易度（含む範囲）</span>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted)]">
                  <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="tabular-nums">
                    {clampDiff(diffMin, diffMax).lo} 〜 {clampDiff(diffMin, diffMax).hi}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                    Min
                    <input
                      type="range"
                      min={1}
                      max={8}
                      value={diffMin}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDiffMin(v);
                        setDiffMax((m) => (m < v ? v : m));
                      }}
                      className="h-2 w-full min-w-0 cursor-pointer accent-[var(--color-primary)]"
                    />
                  </label>
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                    Max
                    <input
                      type="range"
                      min={1}
                      max={8}
                      value={diffMax}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDiffMax(v);
                        setDiffMin((m) => (m > v ? v : m));
                      }}
                      className="h-2 w-full min-w-0 cursor-pointer accent-[var(--color-primary)]"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div>
              <span className="mb-2 block text-xs font-medium text-[var(--color-text)]">カラータグ（いずれかを含む）</span>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((c) => {
                  const on = colorFilter.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleColor(c)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        on
                          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] text-[var(--color-text)]"
                          : "border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
                      }`}
                    >
                      {displayColorTag(c)}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[var(--color-bg)] px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
              <input
                type="search"
                placeholder="国名（日・英）または alpha-3 で検索"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]"
              />
            </label>

            <p className="text-xs text-[var(--color-muted)]">
              該当 <span className="tabular-nums text-[var(--color-text)]">{filtered.length}</span> 件 / 全{" "}
              <span className="tabular-nums">{merged.length}</span> 件
            </p>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">国旗一覧</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.map((c) => (
                  <motion.button
                    key={c.alpha3}
                    type="button"
                    initial={{ opacity: 0, scale: 0.94, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: -4 }}
                    transition={springItem}
                    onClick={() => setSelected(c)}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] text-left shadow-sm transition-shadow hover:border-[color-mix(in_srgb,var(--color-primary)_45%,transparent)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]">
                      <Image
                        src={flagUrlForAlpha2(c.alpha2)}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 50vw, 20vw"
                        className="object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 p-2.5">
                      <span className="line-clamp-2 text-xs font-semibold leading-snug text-[var(--color-text)]">{c.nameJa}</span>
                      <span className="text-[10px] font-medium text-[var(--color-muted)]">{c.alpha3}</span>
                      <DifficultyDots value={c.difficulty} />
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </>
      ) : null}

      <AnimatePresence>
        {selected && isoRows ? (
          <motion.div
            key="flag-explorer-drawer"
            className="fixed inset-0 z-40 flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <button
              type="button"
              aria-label="パネルを閉じる"
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
              onClick={() => setSelected(null)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[var(--color-bg)] shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={springPanel}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-tight text-[var(--color-text)]">{selected.nameJa}</h2>
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">{selected.nameEn}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded-full p-2 text-[var(--color-muted)] transition hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] hover:text-[var(--color-text)]"
                  aria-label="閉じる"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="relative mb-4 aspect-[5/3] w-full overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]">
                  <Image
                    src={flagUrlForAlpha2(selected.alpha2)}
                    alt={`${selected.nameJa}の国旗`}
                    fill
                    className="object-cover"
                    sizes="400px"
                    priority
                  />
                </div>

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-[var(--color-muted)]">alpha-3</dt>
                    <dd className="font-mono text-[var(--color-text)]">{selected.alpha3}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[var(--color-muted)]">地域</dt>
                    <dd className="text-[var(--color-text)]">
                      {selected.regionLabel ?? "—"}
                      {selected.subRegionLabel ? (
                        <>
                          {" "}
                          / {selected.subRegionLabel}
                        </>
                      ) : null}
                      {selected.intermediateRegionLabel ? (
                        <>
                          {" "}
                          <span className="text-[var(--color-muted)]">（{selected.intermediateRegionLabel}）</span>
                        </>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[var(--color-muted)]">難易度</dt>
                    <dd className="flex items-center gap-2 text-[var(--color-text)]">
                      <DifficultyDots value={selected.difficulty} />
                      <span className="tabular-nums text-xs text-[var(--color-muted)]">{selected.difficulty} / 8</span>
                      {!selected.hasDifficultySource ? (
                        <span className="text-xs text-amber-200/90">（推定・データなし）</span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[var(--color-muted)]">タグ</dt>
                    <dd className="text-[var(--color-text)]">
                      色:{" "}
                      {selected.colors.length ? selected.colors.map(displayColorTag).join(", ") : "—"}
                      {" · "}
                      意匠: {displayDesignTag(selected.designLabel)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">地図</h3>
                  <FlagExplorerMap highlightCountryCode={selected.countryCode} isoRows={isoRows} />
                </div>

                <div className="mt-6">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    類似・混同しやすい国旗
                  </h3>
                  {similarList.length === 0 ? (
                    <p className="text-xs text-[var(--color-muted)]">登録された比較候補はありません。</p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {similarList.map((s) => (
                        <li key={s.alpha3}>
                          <button
                            type="button"
                            onClick={() => setSelected(s)}
                            className="flex w-full flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-left transition hover:border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]"
                          >
                            <div className="relative aspect-[4/3] w-full bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]">
                              <Image src={flagUrlForAlpha2(s.alpha2)} alt="" fill className="object-cover" sizes="120px" loading="lazy" />
                            </div>
                            <span className="line-clamp-2 p-2 text-[11px] font-medium leading-snug text-[var(--color-text)]">
                              {s.nameJa}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
