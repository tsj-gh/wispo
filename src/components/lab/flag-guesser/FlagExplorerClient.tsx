"use client";

import { AnimatePresence, motion } from "framer-motion";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import jaLocale from "i18n-iso-countries/langs/ja.json";
import { Filter, Map as MapIcon, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { PairLinkAdSlot } from "@/components/PairLinkAdSlots";
import { GamePageHeader } from "@/components/GamePageHeader";
import { FlagExplorerMap } from "@/components/lab/flag-guesser/FlagExplorerMap";
import { FlagExplorerMapSelect } from "@/components/lab/flag-guesser/FlagExplorerMapSelect";
import {
  buildRegionHierarchy,
  collectColorTagOptions,
  collectCountryCodesForMapMode,
  collectCountryCodesForRegionalMapFit,
  collectDesignTagOptions,
  collectSymbolTagOptions,
  displayColorTag,
  displayDesignTagByLocale,
  displaySymbolTagByLocale,
  mergeExplorerCountries,
  type ExplorerCountryRow,
  type FlagDifficultyJsonRow,
} from "@/lib/flag-guesser/flagExplorerDataset";
import {
  type ExplorerMapPresetsFile,
  explorerMapPresetKey,
  formatExplorerMapPresetClipboardEntry,
  resolveExplorerMapPreset,
} from "@/lib/flag-guesser/explorerMapPresets";
import { flagUrlForAlpha2 } from "@/lib/flag-guesser/selectRound";
import type { Iso3166Row } from "@/lib/flag-guesser/types";
import { GAME_AD_GAP_BEFORE_SLOT_2_PX, GAME_AD_SLOT_MIN_HEIGHT_PX } from "@/lib/gameLayout";
import { useI18n } from "@/lib/i18n-context";

countries.registerLocale(enLocale);
countries.registerLocale(jaLocale);

const ISO_URL = "/assets/flag-guesser/iso-3166.json";
const DIFF_URL = "/assets/flag-guesser/flag_difficulty.json";
const ASPECT_URL = "/assets/flag-guesser/flag_aspect_ratio.json";
const MAP_PRESETS_URL = "/assets/flag-guesser/explorer_map_presets.json";
const springPanel = { type: "spring" as const, stiffness: 370, damping: 32 };
const springItem = { type: "spring" as const, stiffness: 400, damping: 32 };

/** カラータグ配列が同一か（順不同・重複数も一致） */
function colorTagMultisetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((c, i) => c === sb[i]);
}

type ClampDiffFn = (a: number, b: number) => { lo: number; hi: number };

/**
 * 難易度 1〜8 の範囲。トラック上のクリック位置に近い側のハンドルをドラッグ対象にする（従来の二重 range の取りこぼしを避ける）。
 */
function ExplorerDifficultyRange({
  diffMin,
  diffMax,
  setDiffMin,
  setDiffMax,
  clampDiff,
}: {
  diffMin: number;
  diffMax: number;
  setDiffMin: Dispatch<SetStateAction<number>>;
  setDiffMax: Dispatch<SetStateAction<number>>;
  clampDiff: ClampDiffFn;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragThumbRef = useRef<"min" | "max" | null>(null);

  const { lo, hi } = clampDiff(diffMin, diffMax);

  const clientXToValue = useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 4;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 4;
    const t = (clientX - rect.left) / rect.width;
    return Math.min(8, Math.max(1, Math.round(1 + t * 7)));
  }, []);

  const applyThumb = useCallback((thumb: "min" | "max", v: number) => {
    if (thumb === "min") {
      setDiffMin(v);
      setDiffMax((m) => (m < v ? v : m));
    } else {
      setDiffMax(v);
      setDiffMin((m) => (m > v ? v : m));
    }
  }, [setDiffMin, setDiffMax]);

  const pickThumbForValue = useCallback(
    (v: number, curLo: number, curHi: number): "min" | "max" => {
      const distLo = Math.abs(v - curLo);
      const distHi = Math.abs(v - curHi);
      if (distLo < distHi) return "min";
      if (distHi < distLo) return "max";
      return v * 2 <= curLo + curHi ? "min" : "max";
    },
    []
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const v = clientXToValue(e.clientX);
      const thumb = pickThumbForValue(v, lo, hi);
      dragThumbRef.current = thumb;
      applyThumb(thumb, v);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [applyThumb, clientXToValue, lo, hi, pickThumbForValue]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const thumb = dragThumbRef.current;
      if (!thumb) return;
      const v = clientXToValue(e.clientX);
      applyThumb(thumb, v);
    },
    [applyThumb, clientXToValue]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragThumbRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
    dragThumbRef.current = null;
  }, []);

  return (
    <div
      ref={trackRef}
      className="relative h-8 w-full cursor-pointer touch-none select-none px-2"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)]" />
      <div
        className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--color-primary)]"
        style={{
          left: `calc(0.5rem + (100% - 1rem) * ${(lo - 1) / 7})`,
          width: `calc((100% - 1rem) * ${(hi - lo) / 7})`,
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`難易度の下限 ${lo}`}
        className="pointer-events-none absolute top-1/2 z-[1] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] bg-[var(--color-primary)] shadow"
        style={{ left: `calc(0.5rem + (100% - 1rem) * ${(lo - 1) / 7})` }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`難易度の上限 ${hi}`}
        className="pointer-events-none absolute top-1/2 z-[1] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] bg-[var(--color-primary)] shadow"
        style={{ left: `calc(0.5rem + (100% - 1rem) * ${(hi - 1) / 7})` }}
      />
    </div>
  );
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
  const { locale } = useI18n();
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const debugOnButtonRef = useRef<HTMLButtonElement | null>(null);

  const [isoRows, setIsoRows] = useState<Iso3166Row[] | null>(null);
  const [diffRows, setDiffRows] = useState<FlagDifficultyJsonRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** "filter" = 条件で絞り込みモード, "map" = 地図から選ぶモード */
  const [explorerMode, setExplorerMode] = useState<"filter" | "map">("filter");

  const [region, setRegion] = useState("");
  const [subRegion, setSubRegion] = useState("");
  const [intermediateRegion, setIntermediateRegion] = useState("");
  const [colorFilter, setColorFilter] = useState<string[]>([]);
  /** 色タグ複数選択時: AND = すべて含む / OR = いずれかを含む（選択色のみ時は無効） */
  const [colorCombineMode, setColorCombineMode] = useState<"and" | "or">("and");
  /** true のとき選択した色集合と国旗の tags.colors が完全一致のみ表示 */
  const [colorExactMatch, setColorExactMatch] = useState(false);
  const [diffMin, setDiffMin] = useState(1);
  const [diffMax, setDiffMax] = useState(8);
  const [query, setQuery] = useState("");
  const [designFilter, setDesignFilter] = useState("");
  const [symbolFilter, setSymbolFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<ExplorerCountryRow | null>(null);
  const [aspectMeta, setAspectMeta] = useState<Record<string, { ratio: number }> | null>(null);

  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(true);
  const [cardScale, setCardScale] = useState(1);
  const [flagFrameRatio, setFlagFrameRatio] = useState(1.6);
  /** devtj 時のみ：1.0 で無効、大きいほど小国ほど地域フィット後に追加ズーム */
  const [mapAreaInverseZoom, setMapAreaInverseZoom] = useState(1);

  const [explorerMapPresetsFile, setExplorerMapPresetsFile] = useState<ExplorerMapPresetsFile | null>(null);
  /** 「地図から選ぶ」盤面の画面中央 lon/lat と k（デバッグ・JSON コピー用） */
  const [mapSelectViewport, setMapSelectViewport] = useState<{ lon: number; lat: number; k: number } | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetch(MAP_PRESETS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j || typeof j !== "object") return;
        const p = (j as ExplorerMapPresetsFile).presets;
        if (p && typeof p === "object") setExplorerMapPresetsFile(j as ExplorerMapPresetsFile);
        else setExplorerMapPresetsFile(null);
      })
      .catch(() => {
        if (!cancelled) setExplorerMapPresetsFile(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (explorerMode !== "map") setMapSelectViewport(null);
  }, [explorerMode]);

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
  const designOptions = useMemo(() => collectDesignTagOptions(merged), [merged]);
  const symbolOptions = useMemo(() => collectSymbolTagOptions(merged), [merged]);
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
    setColorCombineMode("and");
    setColorExactMatch(false);
    setDiffMin(1);
    setDiffMax(8);
    setDesignFilter("");
    setSymbolFilter([]);
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
      if (colorExactMatch) {
        list = list.filter((r) => colorTagMultisetsEqual(colorFilter, r.colors));
      } else if (colorCombineMode === "and") {
        list = list.filter((r) => colorFilter.every((c) => r.colors.includes(c)));
      } else {
        list = list.filter((r) => colorFilter.some((c) => r.colors.includes(c)));
      }
    }
    if (isDevTj && isDebugMode && designFilter) {
      list = list.filter((r) => r.designLabel === designFilter);
    }
    if (isDevTj && isDebugMode && symbolFilter.length > 0) {
      list = list.filter((r) => symbolFilter.every((s) => r.symbolTags.includes(s)));
    }
    const { lo, hi } = clampDiff(diffMin, diffMax);
    return Array.from(list).filter((r) => r.difficulty >= lo && r.difficulty <= hi).sort((a, b) => a.nameJa.localeCompare(b.nameJa, "ja"));
  }, [
    merged,
    query,
    region,
    subRegion,
    intermediateRegion,
    colorFilter,
    colorCombineMode,
    colorExactMatch,
    diffMin,
    diffMax,
    clampDiff,
    isDevTj,
    isDebugMode,
    designFilter,
    symbolFilter,
  ]);

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

  /** 詳細オーバーレイ表示中の `flag_difficulty.json` 行（デバッグパネル用） */
  const selectedDifficultyJsonRow = useMemo(() => {
    if (!selected || !diffRows) return null;
    const a3 = selected.alpha3.trim().toUpperCase();
    return diffRows.find((d) => d.alpha3?.trim().toUpperCase() === a3) ?? null;
  }, [selected, diffRows]);

  const mapRegionFitCodes = useMemo(() => {
    if (!selected || !isoRows?.length) return null;
    const codes = collectCountryCodesForRegionalMapFit(selected, isoRows);
    return codes.length > 0 ? codes : null;
  }, [selected, isoRows]);

  /** 地図から選ぶモードのズーム対象 country-codes（null = 全世界） */
  const mapSelectRegionCodes = useMemo(() => {
    if (!isoRows?.length) return null;
    return collectCountryCodesForMapMode(isoRows, region, subRegion, intermediateRegion);
  }, [isoRows, region, subRegion, intermediateRegion]);

  const mapSelectPresetKey = useMemo(
    () => explorerMapPresetKey(region, subRegion, intermediateRegion),
    [region, subRegion, intermediateRegion]
  );

  const resolvedExplorerMapPreset = useMemo(() => {
    if (!explorerMapPresetsFile?.presets) return null;
    return resolveExplorerMapPreset(explorerMapPresetsFile.presets, region, subRegion, intermediateRegion);
  }, [explorerMapPresetsFile, region, subRegion, intermediateRegion]);

  const getAspectRatio = useCallback(
    (alpha2: string): number => {
      const v = aspectMeta?.[alpha2.toUpperCase()]?.ratio;
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.min(3, Math.max(0.5, v));
      return 1.5;
    },
    [aspectMeta]
  );

  const gridStyle = useMemo(() => ({ gridTemplateColumns: `repeat(auto-fill,minmax(${Math.max(120, Math.round(148 * cardScale))}px,1fr))` } as CSSProperties), [cardScale]);
  const dataReady = isoRows && diffRows && !loadError;

  /** 地図から選ぶモードで国をクリックしたとき */
  const handleMapSelectCountry = useCallback((row: Iso3166Row) => {
    const a2 = row["alpha-2"]?.trim().toUpperCase();
    if (!a2) return;
    const found = merged.find((r) => r.alpha2.toUpperCase() === a2);
    if (found) setSelected(found);
  }, [merged]);

  const copyExplorerMapPresetEntry = useCallback(async () => {
    if (!mapSelectViewport) return;
    const text = formatExplorerMapPresetClipboardEntry(
      region,
      subRegion,
      intermediateRegion,
      mapSelectViewport.lon,
      mapSelectViewport.lat,
      mapSelectViewport.k
    );
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }, [mapSelectViewport, region, subRegion, intermediateRegion]);

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
                  <label className="flex items-center gap-2 text-[11px] text-stone-700">
                    国旗表示枠比率
                    <input
                      type="range"
                      min={1.1}
                      max={2.2}
                      step={0.05}
                      value={flagFrameRatio}
                      onChange={(e) => setFlagFrameRatio(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer accent-amber-500"
                    />
                    <span className="w-10 text-right tabular-nums">{flagFrameRatio.toFixed(2)}</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-stone-700">
                    地図 面積逆比ズーム率（1.0＝無効）
                    <input
                      type="range"
                      min={1}
                      max={4}
                      step={0.05}
                      value={mapAreaInverseZoom}
                      onChange={(e) => setMapAreaInverseZoom(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer accent-amber-500"
                    />
                    <span className="w-10 text-right tabular-nums">{mapAreaInverseZoom.toFixed(2)}</span>
                  </label>
                  {selected ? (
                    <div className="mt-2 border-t border-amber-200/90 pt-2 text-[10px] leading-snug text-stone-800">
                      <div className="mb-1 font-semibold text-stone-800">詳細オーバーレイ（flag_difficulty.json）</div>
                      {selectedDifficultyJsonRow ? (
                        <dl className="space-y-1">
                          <div>
                            <dt className="text-stone-600">国名（JP）</dt>
                            <dd className="font-mono">{selected.nameJa}</dd>
                          </div>
                          <div>
                            <dt className="text-stone-600">difficulty</dt>
                            <dd className="tabular-nums">{selectedDifficultyJsonRow.difficulty}</dd>
                          </div>
                          <div>
                            <dt className="text-stone-600">colors（日本語）</dt>
                            <dd className="break-all">
                              {(selectedDifficultyJsonRow.tags?.colors ?? [])
                                .map((c) => displayColorTag(String(c).trim().toLowerCase()))
                                .filter(Boolean)
                                .join("、") || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-stone-600">design</dt>
                            <dd className="break-all">{displayDesignTagByLocale(selectedDifficultyJsonRow.tags?.design ?? "", locale) || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-stone-600">confusable_region（alpha-3）</dt>
                            <dd className="break-all font-mono text-[9px]">
                              {(selectedDifficultyJsonRow.confusable_region ?? []).join(", ") || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-stone-600">confusable_colors（alpha-3）</dt>
                            <dd className="break-all font-mono text-[9px]">
                              {(selectedDifficultyJsonRow.confusable_colors ?? []).join(", ") || "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-stone-600">confusable_design（alpha-3）</dt>
                            <dd className="break-all font-mono text-[9px]">
                              {(selectedDifficultyJsonRow.confusable_design ?? []).join(", ") || "—"}
                            </dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="text-stone-600">
                          <span className="font-mono">{selected.alpha3}</span> は flag_difficulty.json に該当行がありません。
                        </p>
                      )}
                    </div>
                  ) : null}
                  {explorerMode === "map" ? (
                    <div className="mt-2 border-t border-amber-200/90 pt-2 text-[10px] leading-snug text-stone-800">
                      <div className="mb-1 font-semibold text-stone-800">地図から選ぶ（explorer_map_presets.json）</div>
                      <p className="mb-1 text-stone-600">
                        プリセットキー:{" "}
                        <span className="break-all font-mono text-[9px] text-stone-800">{mapSelectPresetKey}</span>
                      </p>
                      {resolvedExplorerMapPreset ? (
                        <p className="mb-1 text-[9px] text-stone-600">
                          適用中: lon {resolvedExplorerMapPreset.lon}, lat {resolvedExplorerMapPreset.lat}, k{" "}
                          {resolvedExplorerMapPreset.k}
                        </p>
                      ) : (
                        <p className="mb-1 text-[9px] text-stone-600">適用中のプリセットなし（外接フィット）</p>
                      )}
                      {mapSelectViewport ? (
                        <p className="mb-1.5 font-mono text-[9px] text-stone-800">
                          現在: lon {mapSelectViewport.lon.toFixed(6)}, lat {mapSelectViewport.lat.toFixed(6)}, k{" "}
                          {mapSelectViewport.k.toFixed(6)}
                        </p>
                      ) : (
                        <p className="mb-1.5 text-[9px] text-stone-500">地図表示後に現在値が入ります。</p>
                      )}
                      <button
                        type="button"
                        disabled={!mapSelectViewport}
                        onClick={() => void copyExplorerMapPresetEntry()}
                        className="rounded border border-amber-700/35 bg-white px-2 py-1 text-[10px] font-semibold text-stone-900 shadow-sm hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        現在の {"{lon, lat, k}"} を presets 用にコピー
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      <p className="mb-4 text-sm leading-relaxed text-[var(--color-muted)]">
        地域・色タグ・難易度などで条件を指定して国旗を一覧できます。<Link href="/lab/flag-guesser" className="text-[var(--color-primary)] underline-offset-2 hover:underline">フラッグゲッサー</Link>へ。
      </p>

      <div className="relative z-0 mb-4 w-full" style={{ minHeight: GAME_AD_SLOT_MIN_HEIGHT_PX }}><PairLinkAdSlot slotIndex={1} /></div>

      {loadError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{loadError}</div> : null}
      {!dataReady && !loadError ? <div className="py-16 text-center text-sm text-[var(--color-muted)]">読み込み中…</div> : null}

      {dataReady ? (
        <>
          {/* タブ切り替え */}
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setExplorerMode("filter")}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                explorerMode === "filter"
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]"
                  : "border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] text-[var(--color-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]"
              }`}
            >
              <Filter className="h-4 w-4" />
              条件で絞り込み
            </button>
            <button
              type="button"
              onClick={() => setExplorerMode("map")}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                explorerMode === "map"
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]"
                  : "border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] text-[var(--color-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]"
              }`}
            >
              <MapIcon className="h-4 w-4" />
              地図から選ぶ
            </button>
          </div>

          {/* 条件で絞り込みモード */}
          {explorerMode === "filter" ? (
            <>
              <section className="mb-6 space-y-4 rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-4 backdrop-blur sm:p-5">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    条件で絞り込み
                  </div>
                  <button type="button" onClick={resetFilters} className="rounded-md border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] px-2 py-1 text-[11px] font-medium">
                    入力をリセット
                  </button>
                </div>
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
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs">難易度 {clampDiff(diffMin, diffMax).lo}〜{clampDiff(diffMin, diffMax).hi}</span>
                    <ExplorerDifficultyRange
                      diffMin={diffMin}
                      diffMax={diffMax}
                      setDiffMin={setDiffMin}
                      setDiffMax={setDiffMax}
                      clampDiff={clampDiff}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--color-text)]">色</span>
                    <div
                      className="inline-flex rounded-lg border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] p-0.5"
                      role="group"
                      aria-label="色タグの複数選択の結合"
                    >
                      <button
                        type="button"
                        disabled={colorExactMatch}
                        onClick={() => setColorCombineMode("and")}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          colorCombineMode === "and"
                            ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                            : "text-[var(--color-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]"
                        }`}
                      >
                        AND
                      </button>
                      <button
                        type="button"
                        disabled={colorExactMatch}
                        onClick={() => setColorCombineMode("or")}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          colorCombineMode === "or"
                            ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                            : "text-[var(--color-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]"
                        }`}
                      >
                        OR
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {colorOptions.map((c) => {
                      const on = colorFilter.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setColorFilter((prev) =>
                              prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                            )
                          }
                          className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-[var(--color-primary)]" : ""}`}
                        >
                          {displayColorTag(c)}
                        </button>
                      );
                    })}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 pt-0.5 text-[11px] text-[var(--color-text)]">
                    <input
                      type="checkbox"
                      checked={colorExactMatch}
                      onChange={(e) => setColorExactMatch(e.target.checked)}
                      className="rounded border-[color-mix(in_srgb,var(--color-text)_25%,transparent)]"
                    />
                    <span>選択色のみ</span>
                  </label>
                </div>
                {isDevTj && isDebugMode ? (
                  <label className="flex flex-col gap-1.5 text-xs">
                    <span>{locale === "ja" ? "デザイン" : "Design"}</span>
                    <select value={designFilter} onChange={(e) => setDesignFilter(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                      <option value="">{locale === "ja" ? "（すべて）" : "(All)"}</option>
                      {designOptions.map((d) => (
                        <option key={d} value={d}>
                          {displayDesignTagByLocale(d, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {isDevTj && isDebugMode ? (
                  <label className="flex flex-col gap-1.5 text-xs">
                    <span>{locale === "ja" ? "シンボル (AND)" : "Symbol (AND)"}</span>
                    <div className="flex flex-wrap gap-2">
                      {symbolOptions.map((s) => {
                        const on = symbolFilter.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() =>
                              setSymbolFilter((prev) =>
                                prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                              )
                            }
                            className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-[var(--color-primary)]" : ""}`}
                          >
                            {displaySymbolTagByLocale(s, locale)}
                          </button>
                        );
                      })}
                    </div>
                  </label>
                ) : null}
                <label className="flex flex-col gap-1.5 text-xs"><span>文字列</span><div className="flex items-center gap-2 rounded-xl border px-3 py-2"><Search className="h-4 w-4" /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="国名 or alpha-3" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div></label>
                <p className="text-xs">該当 {filtered.length} 件 / 全 {merged.length} 件</p>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold">国旗一覧</h2>
                <div className="grid gap-3" style={gridStyle}>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {filtered.map((c) => (
                      <motion.button key={c.alpha3} type="button" initial={{ opacity: 0, scale: 0.94, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: -4 }} transition={springItem} onClick={() => setSelected(c)} className="group flex flex-col overflow-hidden rounded-2xl border text-left" whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
                        <div
                          className="flex w-full items-center justify-center overflow-hidden bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-bg))] p-2"
                          style={{ aspectRatio: flagFrameRatio }}
                        >
                          <div className="h-full max-w-full" style={{ aspectRatio: getAspectRatio(c.alpha2) }}>
                            <FlagImage alpha2={c.alpha2} alt={`${c.nameJa}の国旗`} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 p-2.5"><span className="line-clamp-2 text-xs font-semibold">{c.nameJa}</span><span className="text-[10px]">{c.alpha3}</span><DifficultyDots value={c.difficulty} /></div>
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            </>
          ) : null}

          {/* 地図から選ぶモード */}
          {explorerMode === "map" ? (
            <section className="space-y-4">
              <div className="rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-4 backdrop-blur sm:p-5">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <label className="flex flex-col gap-1.5 text-xs">
                    <span>地域</span>
                    <select
                      value={region}
                      onChange={(e) => { setRegion(e.target.value); setSubRegion(""); setIntermediateRegion(""); }}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">（世界全体）</option>
                      {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>

                  {region ? (
                    <label className="flex flex-col gap-1.5 text-xs">
                      <span>サブリージョン</span>
                      <select
                        value={subRegion}
                        onChange={(e) => { setSubRegion(e.target.value); setIntermediateRegion(""); }}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="">（すべて）</option>
                        {subRegionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                  ) : null}

                  {region && subRegion ? (
                    <label className="flex flex-col gap-1.5 text-xs">
                      <span>中間リージョン</span>
                      <select
                        value={intermediateRegion}
                        disabled={intermediateOptions.length === 0}
                        onChange={(e) => setIntermediateRegion(e.target.value)}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="">{intermediateOptions.length === 0 ? "（なし）" : "（すべて）"}</option>
                        {intermediateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>

              <FlagExplorerMapSelect
                isoRows={isoRows}
                regionFitCountryCodes={mapSelectRegionCodes}
                mapPreset={resolvedExplorerMapPreset}
                mapSelectionKey={mapSelectPresetKey}
                onViewportLonLatKChange={setMapSelectViewport}
                onSelectCountry={handleMapSelectCountry}
              />

              <p className="text-xs text-[var(--color-muted)]">
                地図上の国をクリックすると国旗詳細を表示します。
              </p>
            </section>
          ) : null}

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
                <div className="mb-4 flex h-64 w-full items-center justify-center overflow-hidden border bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-bg))] p-3"><div className="h-full max-w-full" style={{ aspectRatio: getAspectRatio(selected.alpha2) }}><FlagImage alpha2={selected.alpha2} alt={`${selected.nameJa}の国旗`} /></div></div>
                <dl className="space-y-3 text-sm"><div><dt className="text-xs">alpha-3</dt><dd className="font-mono">{selected.alpha3}</dd></div><div><dt className="text-xs">地域</dt><dd>{selected.regionLabel ?? "—"}{selected.subRegionLabel ? ` / ${selected.subRegionLabel}` : ""}{selected.intermediateRegionLabel ? ` / ${selected.intermediateRegionLabel}` : ""}</dd></div></dl>
                <div className="mt-6">
                  <h3 className="mb-2 text-xs">地図</h3>
                  <FlagExplorerMap
                    highlightCountryCode={selected.countryCode}
                    isoRows={isoRows}
                    regionFitCountryCodes={mapRegionFitCodes}
                    areaInverseZoom={isDevTj ? mapAreaInverseZoom : 1}
                  />
                </div>
                <div className="mt-6"><h3 className="mb-2 text-xs">色使いや形が似ている国旗</h3>{similarList.length === 0 ? <p className="text-xs">比較候補なし</p> : <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{similarList.map((s) => <li key={s.alpha3}><button type="button" onClick={() => setSelected(s)} className="flex w-full flex-col overflow-hidden rounded-xl border text-left"><div className="flex h-24 w-full items-center justify-center bg-[color-mix(in_srgb,var(--color-accent)_16%,var(--color-bg))] p-1"><div className="h-full max-w-full" style={{ aspectRatio: getAspectRatio(s.alpha2) }}><FlagImage alpha2={s.alpha2} alt={`${s.nameJa}の国旗`} /></div></div><span className="line-clamp-2 p-2 text-[11px]">{s.nameJa}</span></button></li>)}</ul>}</div>
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
