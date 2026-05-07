"use client";

import { AnimatePresence, motion } from "framer-motion";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import jaLocale from "i18n-iso-countries/langs/ja.json";
import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PairLinkAdSlot } from "@/components/PairLinkAdSlots";
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
import { GAME_AD_GAP_BEFORE_SLOT_2_PX, GAME_AD_SLOT_MIN_HEIGHT_PX } from "@/lib/gameLayout";

countries.registerLocale(enLocale);
countries.registerLocale(jaLocale);

const ISO_URL = "/assets/flag-guesser/iso-3166.json";
const DIFF_URL = "/assets/flag-guesser/flag_difficulty.json";
const ASPECT_URL = "/assets/flag-guesser/flag_aspect_ratio.json";
const springPanel = { type: "spring" as const, stiffness: 370, damping: 32 };
const springItem = { type: "spring" as const, stiffness: 400, damping: 32 };

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

function FlagImage({ alpha2, alt, className = "" }: { alpha2: string; alt: string; className?: string }) {
  return (
    <img
      src={flagUrlForAlpha2(alpha2)}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`h-full w-full object-contain ${className}`.trim()}
    />
  );
}

export function FlagExplorerClient() {
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const debugOnButtonRef = useRef<HTMLButtonElement | null>(null);

  const [isoRows, setIsoRows] = useState<Iso3166Row[] | null>(null);
  const [diffRows, setDiffRows] = useState<FlagDifficultyJsonRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [region, setRegion] = useState("");
  const [subRegion, setSubRegion] = useState("");
  const [intermediateRegion, setIntermediateRegion] = useState("");
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  const [diffMin, setDiffMin] = useState(1);
  const [diffMax, setDiffMax] = useState(8);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ExplorerCountryRow | null>(null);
  const [aspectMeta, setAspectMeta] = useState<Record<string, { ratio: number }> | null>(null);

  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(true);
  const [cardScale, setCardScale] = useState(1);

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

  useEffect(() => {
    let cancelled = false;
    fetch(ASPECT_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j && typeof j === "object") setAspectMeta(j as Record<string, { ratio: number }>);
      })
      .catch(() => {
        if (!cancelled) setAspectMeta(null);
      });
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

  const hierarchy = useMemo(() => (!isoRows ? new Map<string, Set<string>>() : buildRegionHierarchy(isoRows)), [isoRows]);
  const regionOptions = useMemo(() => Array.from(hierarchy.keys()).sort((a, b) => a.localeCompare(b)), [hierarchy]);
  const subRegionOptions = useMemo(() => {
    if (!region) return [];
    const set = hierarchy.get(region);
    return set ? Array.from(set).sort((a, b) => a.localeCompare(b)) : [];
  }, [hierarchy, region]);
  const intermediateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of merged) {
      if (region && r.regionLabel !== region) continue;
      if (subRegion && r.subRegionLabel !== subRegion) continue;
      if (r.intermediateRegionLabel) set.add(r.intermediateRegionLabel);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [merged, region, subRegion]);

  const colorOptions = useMemo(() => collectColorTagOptions(merged), [merged]);
  useEffect(() => {
    if (region && subRegion && !subRegionOptions.includes(subRegion)) setSubRegion("");
  }, [region, subRegion, subRegionOptions]);
  useEffect(() => {
    if (intermediateRegion && !intermediateOptions.includes(intermediateRegion)) setIntermediateRegion("");
  }, [intermediateRegion, intermediateOptions]);

  const clampDiff = useCallback((a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return { lo: Math.min(8, Math.max(1, lo)), hi: Math.min(8, Math.max(1, hi)) };
  }, []);

  const resetFilters = useCallback(() => {
    setRegion("");
    setSubRegion("");
    setIntermediateRegion("");
    setColorFilter([]);
    setDiffMin(1);
    setDiffMax(8);
    setQuery("");
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = merged;
    if (q) list = list.filter((r) => r.nameJa.toLowerCase().includes(q) || r.nameEn.toLowerCase().includes(q) || r.alpha3.toLowerCase().includes(q));
    if (region) list = list.filter((r) => r.regionLabel === region);
    if (subRegion) list = list.filter((r) => r.subRegionLabel === subRegion);
    if (intermediateRegion) list = list.filter((r) => r.intermediateRegionLabel === intermediateRegion);
    if (colorFilter.length > 0) {
      // 色タグは OR ではなく AND（選択した色をすべて含む）
      list = list.filter((r) => colorFilter.every((c) => r.colors.includes(c)));
    }
    const { lo, hi } = clampDiff(diffMin, diffMax);
    return Array.from(list).filter((r) => r.difficulty >= lo && r.difficulty <= hi).sort((a, b) => a.nameJa.localeCompare(b.nameJa, "ja"));
  }, [merged, query, region, subRegion, intermediateRegion, colorFilter, diffMin, diffMax, clampDiff]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const similarList = useMemo(() => {
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

  const getAspectRatio = useCallback(
    (alpha2: string): number => {
      const v = aspectMeta?.[alpha2.toUpperCase()]?.ratio;
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
      return 1.5;
    },
    [aspectMeta]
  );

  const gridStyle = useMemo(() => ({ gridTemplateColumns: `repeat(auto-fill,minmax(${Math.max(120, Math.round(148 * cardScale))}px,1fr))` } as CSSProperties), [cardScale]);
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

      {isDevTj ? (
        <>
          <div className={`fixed right-3 top-14 z-[55] sm:right-4 sm:top-16 ${isDebugMode ? "pointer-events-none" : ""}`}>
            <button
              ref={debugOnButtonRef}
              type="button"
              disabled={isDebugMode}
              aria-hidden={isDebugMode}
              onClick={() => setIsDebugMode(true)}
              className={`rounded border border-stone-300 bg-white/90 px-2 py-1 font-mono text-xs text-stone-800 shadow-sm ${isDebugMode ? "opacity-0" : ""}`}
              title="デバッグを開始"
              aria-label="デバッグを開始"
            >
              DEBUG OFF
            </button>
          </div>
          {isDebugMode ? (
            <div className="fixed right-3 top-14 z-[56] w-[min(100vw-1.5rem,360px)] rounded-2xl border border-amber-300/80 bg-amber-50/95 text-left text-xs text-stone-900 shadow-lg backdrop-blur-sm sm:right-4 sm:top-16">
              <div className={`flex w-full min-w-0 items-center gap-2 p-2 ${isDebugPanelExpanded ? "justify-between" : "justify-end"}`}>
                {isDebugPanelExpanded ? <span className="min-w-0 truncate font-bold text-stone-700">国旗エクスプローラー DEBUG</span> : null}
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setIsDebugMode(false)} className="rounded border border-amber-700/40 bg-amber-500 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">DEBUG ON</button>
                  <button type="button" onClick={() => setIsDebugPanelExpanded((v) => !v)} className="rounded border border-stone-300 p-1 text-stone-500 hover:bg-stone-100" aria-expanded={isDebugPanelExpanded}>{isDebugPanelExpanded ? "▲" : "▼"}</button>
                </div>
              </div>
              {isDebugPanelExpanded ? (
                <div className="space-y-2 border-t border-stone-200/80 px-3 py-2">
                  <label className="flex items-center gap-2 text-[11px] text-stone-700">
                    カードサイズ率
                    <input type="range" min={0.7} max={1.35} step={0.05} value={cardScale} onChange={(e) => setCardScale(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-amber-500" />
                    <span className="w-10 text-right tabular-nums">{cardScale.toFixed(2)}</span>
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      <p className="mb-4 text-sm leading-relaxed text-[var(--color-muted)]">
        地域・色タグ・難易度で絞り込み、国旗を一覧します。<Link href="/lab/flag-guesser" className="text-[var(--color-primary)] underline-offset-2 hover:underline">フラッグゲッサー</Link>へ。
      </p>

      <div className="relative z-0 mb-4 w-full" style={{ minHeight: GAME_AD_SLOT_MIN_HEIGHT_PX }}><PairLinkAdSlot slotIndex={1} /></div>

      {loadError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</div> : null}
      {!dataReady && !loadError ? <div className="py-16 text-center text-sm text-[var(--color-muted)]">読み込み中…</div> : null}

      {dataReady ? (
        <>
          <section className="mb-6 space-y-4 rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-4 backdrop-blur sm:p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text)]"><div className="flex items-center gap-2"><Filter className="h-4 w-4" />絞り込み</div><button type="button" onClick={resetFilters} className="rounded-md border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] px-2 py-1 text-[11px] font-medium">入力をリセット</button></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-xs"><span>地域</span><select value={region} onChange={(e) => { setRegion(e.target.value); setSubRegion(""); setIntermediateRegion(""); }} className="rounded-lg border px-3 py-2 text-sm"><option value="">（すべて）</option>{regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>

              {region ? (
                <label className="flex flex-col gap-1.5 text-xs"><span>サブリージョン</span><select value={subRegion} onChange={(e) => { setSubRegion(e.target.value); setIntermediateRegion(""); }} className="rounded-lg border px-3 py-2 text-sm"><option value="">（すべて）</option>{subRegionOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              ) : null}

              {region && subRegion ? (
                <label className="flex flex-col gap-1.5 text-xs"><span>中間リージョン</span><select value={intermediateRegion} disabled={intermediateOptions.length === 0} onChange={(e) => setIntermediateRegion(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">{intermediateOptions.length === 0 ? "（なし）" : "（すべて）"}</option>{intermediateOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              ) : null}
            </div>

            <div className="pt-1">
              <div className="flex flex-col gap-1.5"><span className="text-xs">難易度 {clampDiff(diffMin, diffMax).lo}〜{clampDiff(diffMin, diffMax).hi}</span><div className="flex gap-2"><input type="range" min={1} max={8} value={diffMin} onChange={(e) => { const v = Number(e.target.value); setDiffMin(v); setDiffMax((m) => m < v ? v : m); }} className="h-2 w-full" /><input type="range" min={1} max={8} value={diffMax} onChange={(e) => { const v = Number(e.target.value); setDiffMax(v); setDiffMin((m) => m > v ? v : m); }} className="h-2 w-full" /></div></div>
            </div>

            <label className="flex flex-col gap-1.5 text-xs"><span>色 (AND)</span><div className="flex flex-wrap gap-2">{colorOptions.map((c) => { const on = colorFilter.includes(c); return <button key={c} type="button" onClick={() => setColorFilter((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-[var(--color-primary)]" : ""}`}>{displayColorTag(c)}</button>; })}</div></label>
            <label className="flex flex-col gap-1.5 text-xs"><span>文字列</span><div className="flex items-center gap-2 rounded-xl border px-3 py-2"><Search className="h-4 w-4" /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="国名 or alpha-3" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div></label>
            <p className="text-xs">該当 {filtered.length} 件 / 全 {merged.length} 件</p>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">国旗一覧</h2>
            <div className="grid gap-3" style={gridStyle}>
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.map((c) => (
                  <motion.button key={c.alpha3} type="button" initial={{ opacity: 0, scale: 0.94, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: -4 }} transition={springItem} onClick={() => setSelected(c)} className="group flex flex-col overflow-hidden rounded-2xl border text-left" whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
                    <div className="flex h-44 w-full items-center justify-center overflow-hidden bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-bg))] p-2"><div className="max-h-full max-w-full" style={{ aspectRatio: getAspectRatio(c.alpha2) }}><FlagImage alpha2={c.alpha2} alt={`${c.nameJa}の国旗`} /></div></div>
                    <div className="flex flex-col gap-1.5 p-2.5"><span className="line-clamp-2 text-xs font-semibold">{c.nameJa}</span><span className="text-[10px]">{c.alpha3}</span><DifficultyDots value={c.difficulty} /></div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </section>

          <div className="relative z-0 w-full" style={{ minHeight: GAME_AD_SLOT_MIN_HEIGHT_PX, marginTop: GAME_AD_GAP_BEFORE_SLOT_2_PX }}><PairLinkAdSlot slotIndex={2} /></div>
        </>
      ) : null}

      <AnimatePresence>
        {selected && isoRows ? (
          <motion.div key="overlay" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <button type="button" aria-label="close" className="absolute inset-0 bg-black/45" onClick={() => setSelected(null)} />
            <motion.aside role="dialog" aria-modal="true" className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-[var(--color-bg)] shadow-2xl" initial={{ y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, scale: 0.98, opacity: 0 }} transition={springPanel}>
              <div className="flex items-start justify-between gap-3 border-b px-4 py-3"><div className="min-w-0"><h2 className="text-lg font-bold">{selected.nameJa}</h2><p className="text-sm">{selected.nameEn}</p></div><button type="button" onClick={() => setSelected(null)} className="shrink-0 rounded-full p-2"><X className="h-5 w-5" /></button></div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="mb-4 flex h-64 w-full items-center justify-center overflow-hidden border bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-bg))] p-3"><div className="max-h-full max-w-full" style={{ aspectRatio: getAspectRatio(selected.alpha2) }}><FlagImage alpha2={selected.alpha2} alt={`${selected.nameJa}の国旗`} /></div></div>
                <dl className="space-y-3 text-sm"><div><dt className="text-xs">alpha-3</dt><dd className="font-mono">{selected.alpha3}</dd></div><div><dt className="text-xs">地域</dt><dd>{selected.regionLabel ?? "—"}{selected.subRegionLabel ? ` / ${selected.subRegionLabel}` : ""}{selected.intermediateRegionLabel ? ` / ${selected.intermediateRegionLabel}` : ""}</dd></div></dl>
                <div className="mt-6"><h3 className="mb-2 text-xs">地図</h3><FlagExplorerMap highlightCountryCode={selected.countryCode} isoRows={isoRows} /></div>
                <div className="mt-6"><h3 className="mb-2 text-xs">混同しやすい国旗(colors/design)</h3>{similarList.length === 0 ? <p className="text-xs">比較候補なし</p> : <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{similarList.map((s) => <li key={s.alpha3}><button type="button" onClick={() => setSelected(s)} className="flex w-full flex-col overflow-hidden rounded-xl border text-left"><div className="flex h-24 w-full items-center justify-center bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-bg))] p-1"><div className="max-h-full max-w-full" style={{ aspectRatio: getAspectRatio(s.alpha2) }}><FlagImage alpha2={s.alpha2} alt={`${s.nameJa}の国旗`} /></div></div><span className="line-clamp-2 p-2 text-[11px]">{s.nameJa}</span></button></li>)}</ul>}</div>
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
