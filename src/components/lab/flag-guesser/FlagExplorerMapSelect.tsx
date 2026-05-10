"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { select } from "d3-selection";
import { geoPath } from "d3-geo";
import { easeCubicOut } from "d3-ease";
import "d3-transition";
import {
  buildMercatorForCollection,
  buildPathStrings,
  cloneCountryFeatureUnwrapped,
  computeUnwrapCenterMeridian,
  countryIdAtPixel,
  featureIdString,
  sortFeaturesForHitTest,
} from "@/lib/flag-guesser/mapProjections";
import { filterWorldTopoFeatures } from "@/lib/flag-guesser/topoFeatureFilter";
import { countryFeaturesFromTopology, flagUrlForAlpha2 } from "@/lib/flag-guesser/selectRound";
import { indexIsoByCountryCode } from "@/lib/flag-guesser/isoIndex";
import { getCountryDisplayName } from "@/components/lab/flag-guesser/MapCanvas";
import { screenToMapSpace, type ZoomPlain, ZOOM_IDENTITY } from "@/lib/flag-guesser/viewportGeo";
import {
  DEFAULT_LOD_THRESHOLD_LOW,
  DEFAULT_LOD_THRESHOLD_HIGH,
  lodTierForMetric,
  TOPO_LOD_URL,
  type TopoLodId,
} from "@/lib/flag-guesser/topoLod";
import type { CountryFeature, Iso3166Row } from "@/lib/flag-guesser/types";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import { useI18n } from "@/lib/i18n-context";

const ZOOM_MIN = 0.12;
const ZOOM_MAX = 80;
const ZOOM_STEP = 1.3;
const MAP_ASPECT = 440 / 800;

const MAP_SEA = "color-mix(in srgb, var(--color-bg) 96%, transparent)";
const MAP_LAND = "color-mix(in srgb, var(--color-muted) 18%, transparent)";
const MAP_BORDER = "color-mix(in srgb, var(--color-text) 22%, transparent)";
const MAP_HOVER_STROKE = "color-mix(in srgb, var(--color-primary) 72%, transparent)";
const MAP_HOVER_FILL = "color-mix(in srgb, var(--color-primary) 28%, transparent)";

function clampK(k: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k));
}
function zoomRatioToK(ratio: number) {
  const t = Math.max(0, Math.min(1, ratio));
  return Math.exp(Math.log(ZOOM_MIN) + (Math.log(ZOOM_MAX) - Math.log(ZOOM_MIN)) * t);
}
function zoomKToRatio(k: number) {
  return (Math.log(clampK(k)) - Math.log(ZOOM_MIN)) / (Math.log(ZOOM_MAX) - Math.log(ZOOM_MIN));
}

export type FlagExplorerMapSelectProps = {
  isoRows: readonly Iso3166Row[];
  /** ズームイン対象の ISO numeric country-codes（nullなら全世界） */
  regionFitCountryCodes: string[] | null;
  onSelectCountry: (row: Iso3166Row) => void;
};

export function FlagExplorerMapSelect({
  isoRows,
  regionFitCountryCodes,
  onSelectCountry,
}: FlagExplorerMapSelectProps) {
  const { locale } = useI18n();

  const containerRef = useRef<HTMLDivElement>(null);
  const zoomHostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const canvasRefineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [size, setSize] = useState({ w: 800, h: Math.round(800 * MAP_ASPECT) });
  const [zoomTransform, setZoomTransform] = useState<ZoomPlain>(ZOOM_IDENTITY);
  /**
   * d3-zoom の "zoom" イベントで同期的に更新する ref。
   * React の batched state update より先に書かれるため、
   * 同一ネイティブイベント内で onPointerMove が走っても最新値を参照できる。
   * （FlagGuesserPlayfield と同じ対処）
   */
  const zoomTransformLatestRef = useRef<ZoomPlain>(ZOOM_IDENTITY);

  const [featuresCache, setFeaturesCache] = useState<Partial<Record<TopoLodId, CountryFeature[]>>>({});
  const featuresCacheRef = useRef(featuresCache);
  featuresCacheRef.current = featuresCache;
  const [displayedLod, setDisplayedLod] = useState<TopoLodId>("110");

  const [hoverCountryId, setHoverCountryId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const byCountryCode = useMemo(() => indexIsoByCountryCode(isoRows), [isoRows]);

  // ResizeObserver: width-only to prevent feedback loop
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const w = Math.max(320, Math.floor(el.getBoundingClientRect().width));
      setSize({ w, h: Math.max(200, Math.round(w * MAP_ASPECT)) });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Initial 110m fetch
  useEffect(() => {
    if (featuresCacheRef.current["110"]) return;
    let cancelled = false;
    fetch(TOPO_LOD_URL["110"])
      .then((r) => r.json())
      .then((topo) => {
        if (!cancelled) setFeaturesCache((p) => ({ ...p, "110": countryFeaturesFromTopology(topo) }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Filtered features for current LOD (original, non-unwrapped)
  const filteredFeatures = useMemo<CountryFeature[]>(() => {
    const raw = featuresCache[displayedLod];
    if (!raw?.length) return [];
    return filterWorldTopoFeatures(raw, byCountryCode);
  }, [featuresCache, displayedLod, byCountryCode]);

  /**
   * アンラップ済み features + projection を同時に計算。
   * FlagGuesserPlayfield の buildRegionRoundModel と同様、
   * unwrappedFeatures から pathDById を構築してヒットテストの正確性を保つ。
   */
  const { projection, unwrappedFeatures } = useMemo(() => {
    if (!filteredFeatures.length || size.w < 32 || size.h < 32) {
      return { projection: null, unwrappedFeatures: [] as CountryFeature[] };
    }
    const fc: FeatureCollection<Geometry, GeoJsonProperties> = {
      type: "FeatureCollection",
      features: filteredFeatures as any,
    };
    const meridian = computeUnwrapCenterMeridian(fc);
    const unwrapped: CountryFeature[] = filteredFeatures.map((f) =>
      cloneCountryFeatureUnwrapped(f, meridian)
    );
    const fcUnwrapped: FeatureCollection<Geometry, GeoJsonProperties> = {
      type: "FeatureCollection",
      features: unwrapped as any,
    };
    const proj = buildMercatorForCollection(fcUnwrapped, size.w, size.h, 8, meridian);
    return { projection: proj, unwrappedFeatures: unwrapped };
  }, [filteredFeatures, size.w, size.h]);

  /**
   * pathDById はアンラップ済み features から構築。
   * FlagGuesserPlayfield と同様、SVG に描画されたパスと一致させることで
   * geoContains の winding 問題（海域がモルディブ判定される等）を回避する。
   */
  const pathDById = useMemo(() => {
    if (!projection || !unwrappedFeatures.length) return new Map<string, string>();
    return buildPathStrings(projection, unwrappedFeatures);
  }, [projection, unwrappedFeatures]);

  /** ヒットテスト用ソート済み features（アンラップ済み、面積昇順） */
  const hitFeatures = useMemo(() => sortFeaturesForHitTest(unwrappedFeatures), [unwrappedFeatures]);

  // LOD upgrade based on zoom metric
  const lodMetric = useMemo(
    () => (projection ? projection.scale() * zoomTransform.k : 0),
    [projection, zoomTransform.k]
  );

  useEffect(() => {
    const desired = lodTierForMetric(lodMetric, DEFAULT_LOD_THRESHOLD_LOW, DEFAULT_LOD_THRESHOLD_HIGH);
    if (featuresCache[desired]?.length) {
      setDisplayedLod(desired);
      return;
    }
    if (!featuresCacheRef.current[desired]) {
      let cancelled = false;
      fetch(TOPO_LOD_URL[desired])
        .then((r) => r.json())
        .then((topo) => {
          if (!cancelled) setFeaturesCache((p) => ({ ...p, [desired]: countryFeaturesFromTopology(topo) }));
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }
  }, [lodMetric, featuresCache]);

  const borderStrokeWidth = useMemo(
    () => Math.max(0.35, Math.min(1.15, 1 / Math.sqrt(zoomTransform.k))),
    [zoomTransform.k]
  );

  const gTransform = useMemo(
    () => zoomIdentity.translate(zoomTransform.x, zoomTransform.y).scale(zoomTransform.k).toString(),
    [zoomTransform]
  );

  // d3-zoom setup
  useEffect(() => {
    const host = zoomHostRef.current;
    if (!host) return;
    const sel = select(host);
    const z = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .on("start", () => {
        if (canvasRefineTimerRef.current) {
          clearTimeout(canvasRefineTimerRef.current);
          canvasRefineTimerRef.current = null;
        }
      })
      .on("zoom", (ev) => {
        const next: ZoomPlain = { x: ev.transform.x, y: ev.transform.y, k: ev.transform.k };
        // ref を同期的に更新（React batched update より先に確定させる）
        zoomTransformLatestRef.current = next;
        setZoomTransform(next);
      })
      .on("end", () => {
        canvasRefineTimerRef.current = setTimeout(() => {
          canvasRefineTimerRef.current = null;
        }, 200);
      });
    zoomBehaviorRef.current = z;
    sel.call(z);
    sel.call(
      z.transform,
      zoomIdentity.translate(zoomTransform.x, zoomTransform.y).scale(zoomTransform.k)
    );
    return () => {
      zoomBehaviorRef.current = null;
      sel.on(".zoom", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  const applyZoomTransform = useCallback(
    (next: ZoomPlain, smooth: boolean) => {
      const host = zoomHostRef.current;
      const behavior = zoomBehaviorRef.current;
      if (!host || !behavior) {
        zoomTransformLatestRef.current = next;
        setZoomTransform(next);
        return;
      }
      const sel = select(host);
      sel.interrupt();
      const t = zoomIdentity.translate(next.x, next.y).scale(clampK(next.k));
      if (smooth) {
        sel.transition().duration(600).ease(easeCubicOut).call(behavior.transform, t);
      } else {
        sel.call(behavior.transform, t);
      }
    },
    []
  );

  const zoomByFactor = useCallback(
    (factor: number) => {
      const cx = size.w / 2;
      const cy = size.h / 2;
      const zt = zoomTransformLatestRef.current;
      const nextK = clampK(zt.k * factor);
      const scale = nextK / Math.max(zt.k, 1e-6);
      applyZoomTransform(
        { k: nextK, x: cx - (cx - zt.x) * scale, y: cy - (cy - zt.y) * scale },
        true
      );
    },
    [size.w, size.h, applyZoomTransform]
  );

  const applySliderRatioFromClientY = useCallback(
    (track: HTMLElement, clientY: number, smooth: boolean) => {
      const rect = track.getBoundingClientRect();
      const raw = 1 - (clientY - rect.top) / Math.max(rect.height, 1);
      const cx = size.w / 2;
      const cy = size.h / 2;
      const zt = zoomTransformLatestRef.current;
      const nextK = zoomRatioToK(raw);
      const scale = nextK / Math.max(zt.k, 1e-6);
      applyZoomTransform(
        { k: nextK, x: cx - (cx - zt.x) * scale, y: cy - (cy - zt.y) * scale },
        smooth
      );
    },
    [size.w, size.h, applyZoomTransform]
  );

  // Fit to region when regionFitCountryCodes changes
  const prevFitKeyRef = useRef<string>("");
  useEffect(() => {
    const key = (regionFitCountryCodes ?? []).join(",") + `|${size.w}|${size.h}`;
    if (prevFitKeyRef.current === key) return;
    prevFitKeyRef.current = key;
    if (!projection || size.w < 32 || size.h < 32 || !unwrappedFeatures.length) return;

    let fitFeatures = unwrappedFeatures;
    if (regionFitCountryCodes && regionFitCountryCodes.length > 0) {
      const codeSet = new Set(regionFitCountryCodes);
      const subset = unwrappedFeatures.filter((f) => {
        const id = featureIdString(f);
        return id ? codeSet.has(id) : false;
      });
      if (subset.length > 0) fitFeatures = subset;
    }
    if (!fitFeatures.length) return;

    try {
      const pathGen = geoPath(projection);
      const fc: FeatureCollection<Geometry, GeoJsonProperties> = {
        type: "FeatureCollection",
        features: fitFeatures as any,
      };
      const [[x0, y0], [x1, y1]] = pathGen.bounds(fc);
      if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) return;
      const bw = Math.max(1e-6, x1 - x0);
      const bh = Math.max(1e-6, y1 - y0);
      const pad = Math.max(24, Math.min(size.w, size.h) * 0.08);
      const k = clampK(Math.min((size.w - pad * 2) / bw, (size.h - pad * 2) / bh));
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      applyZoomTransform({ x: size.w / 2 - cx * k, y: size.h / 2 - cy * k, k }, true);
    } catch {}
  });

  /**
   * クライアント座標 → map 空間（投影出力座標）。
   * zoomTransformLatestRef を使って stale closure を回避する。
   */
  const getMapPt = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const el = svgRef.current ?? zoomHostRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const sx = ((clientX - rect.left) / rect.width) * size.w;
      const sy = ((clientY - rect.top) / rect.height) * size.h;
      // 最新の zoom transform を ref から直接取得（React state が stale でも正確）
      return screenToMapSpace(sx, sy, zoomTransformLatestRef.current) as [number, number];
    },
    [size.w, size.h]
    // zoomTransform を依存に含めない（ref で常に最新値を参照）
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!projection || !pathDById.size) {
        setHoverCountryId(null);
        setTooltipPos(null);
        return;
      }
      const pt = getMapPt(e.clientX, e.clientY);
      if (!pt) {
        setHoverCountryId(null);
        setTooltipPos(null);
        return;
      }
      // pathDById を渡すことで Path2D + isPointInPath を使い geoContains fallback を避ける
      const id = countryIdAtPixel(projection, hitFeatures, pt[0], pt[1], pathDById);
      setHoverCountryId(id);

      const host = zoomHostRef.current;
      if (host && id) {
        const rect = host.getBoundingClientRect();
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setTooltipPos(null);
      }
    },
    [projection, hitFeatures, pathDById, getMapPt]
  );

  const handlePointerLeave = useCallback(() => {
    setHoverCountryId(null);
    setTooltipPos(null);
  }, []);

  const handleClick = useCallback(() => {
    if (!hoverCountryId) return;
    const isoRow = byCountryCode.get(hoverCountryId);
    if (isoRow) onSelectCountry(isoRow);
  }, [hoverCountryId, byCountryCode, onSelectCountry]);

  // Tooltip info
  const tooltipAlpha2 = useMemo(
    () => (hoverCountryId ? (byCountryCode.get(hoverCountryId)?.["alpha-2"] ?? null) : null),
    [hoverCountryId, byCountryCode]
  );

  const tooltipName = useMemo(
    () => (tooltipAlpha2 ? (getCountryDisplayName(tooltipAlpha2, locale) ?? tooltipAlpha2) : null),
    [tooltipAlpha2, locale]
  );

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      <div
        style={{ width: size.w, height: size.h }}
        className="relative mx-auto overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)]"
      >
        {/* Zoom host (d3-zoom target) */}
        <div
          ref={zoomHostRef}
          className="relative cursor-crosshair touch-none"
          style={{ width: size.w, height: size.h }}
          onClick={handleClick}
        >
          {/* SVG にポインタイベントを付ける（FlagGuesserPlayfield と同様） */}
          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            className="block select-none"
            role="img"
            aria-label="世界地図"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <rect width={size.w} height={size.h} fill={MAP_SEA} />
            <g transform={gTransform}>
              {unwrappedFeatures.map((f) => {
                const id = featureIdString(f);
                if (!id) return null;
                const d = pathDById.get(id);
                if (!d) return null;
                const hover = id === hoverCountryId;
                return (
                  <path
                    key={id}
                    d={d}
                    className="transition-[fill,stroke,stroke-width] duration-100"
                    style={{
                      fill: hover ? MAP_HOVER_FILL : MAP_LAND,
                      stroke: hover ? MAP_HOVER_STROKE : MAP_BORDER,
                      strokeWidth: hover ? borderStrokeWidth * 3.6 : borderStrokeWidth,
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      vectorEffect: "non-scaling-stroke",
                      cursor: hover ? "pointer" : "crosshair",
                    }}
                  />
                );
              })}
            </g>
          </svg>

          {/* Tooltip: top-right of cursor */}
          {hoverCountryId && tooltipPos && tooltipName && tooltipAlpha2 ? (
            <div
              className="pointer-events-none absolute z-20 flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-2 py-1 shadow-md backdrop-blur-sm"
              style={{
                left: tooltipPos.x + 14,
                top: Math.max(4, tooltipPos.y - 38),
                maxWidth: 240,
              }}
            >
              <img
                src={flagUrlForAlpha2(tooltipAlpha2)}
                alt=""
                aria-hidden
                className="h-4 w-auto max-w-[32px] shrink-0 object-contain"
              />
              <span className="truncate text-xs font-semibold text-[var(--color-text)]">
                {tooltipName}
              </span>
            </div>
          ) : null}
        </div>

        {/* Zoom bar (same style & position as FlagGuesserPlayfield) */}
        <div className="pointer-events-none absolute right-2 top-2 z-10">
          <div className="pointer-events-auto flex w-10 select-none flex-col items-center gap-1 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] px-1 py-1.5 shadow-lg backdrop-blur-sm">
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded-md border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] text-sm font-bold text-[var(--color-text)] transition hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]"
              onClick={() => zoomByFactor(ZOOM_STEP)}
              aria-label="ズームイン"
            >
              +
            </button>
            <div className="tabular-nums text-[10px] font-semibold leading-none text-[var(--color-muted)]">
              {zoomTransform.k < 10 ? zoomTransform.k.toFixed(2) : zoomTransform.k.toFixed(1)}×
            </div>
            <div
              role="slider"
              aria-label="地図のズーム"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(zoomKToRatio(zoomTransform.k) * 100)}
              className="relative mx-auto h-36 w-4 cursor-pointer touch-none rounded-full bg-[color-mix(in_srgb,var(--color-text)_15%,transparent)] px-1"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const track = e.currentTarget;
                const startY = e.clientY;
                let moved = false;
                const onMove = (ev: PointerEvent) => {
                  if (Math.abs(ev.clientY - startY) > 3) moved = true;
                  applySliderRatioFromClientY(track, ev.clientY, false);
                };
                const onUp = (ev: PointerEvent) => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                  window.removeEventListener("pointercancel", onUp);
                  if (!moved) applySliderRatioFromClientY(track, ev.clientY, true);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
                window.addEventListener("pointercancel", onUp);
              }}
            >
              <div
                className="pointer-events-none absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-white/80 bg-[var(--color-primary)] shadow"
                style={{
                  top: `${(1 - zoomKToRatio(zoomTransform.k)) * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            </div>
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded-md border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] text-sm font-bold text-[var(--color-text)] transition hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]"
              onClick={() => zoomByFactor(1 / ZOOM_STEP)}
              aria-label="ズームアウト"
            >
              −
            </button>
          </div>
        </div>

        {unwrappedFeatures.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--color-muted)]">
            地図データを読み込み中…
          </div>
        ) : null}
      </div>
    </div>
  );
}
