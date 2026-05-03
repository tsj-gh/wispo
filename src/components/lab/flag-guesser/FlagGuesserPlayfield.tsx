"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Topology } from "topojson-specification";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import { select } from "d3-selection";
import {
  buildRegionRoundModel,
  countryIdAtPixel,
  projectCentroid,
  sortFeaturesForHitTest,
} from "@/lib/flag-guesser/mapProjections";
import type { CountryFeature, Iso3166Row, RegionRoundModel } from "@/lib/flag-guesser/types";
import {
  countryFeaturesFromTopology,
  createRoundPlan,
  flagUrlForAlpha2,
  topoNumericIdSet,
  resolveIsoRows,
} from "@/lib/flag-guesser/selectRound";
import { spawnBubbleLike, stepBubbleLikeInBox, type FloatingBubbleLike } from "@/lib/flag-guesser/floatingFlagPhysics";
import { useI18n } from "@/lib/i18n-context";
import {
  getCountryDisplayName,
  formatMapDebugSnippet,
  screenToMapSpace,
  ZOOM_IDENTITY,
  type ZoomPlain,
} from "@/components/lab/flag-guesser/MapCanvas";
import {
  featuresOverlappingViewport,
  viewportLonLatBounds,
} from "@/lib/flag-guesser/viewportGeo";
import { FlagGuesserDebugPanel } from "@/components/lab/flag-guesser/FlagGuesserDebugPanel";

const TOPO_URL = "/assets/flag-guesser/countries-50m.json";
const ISO_URL = "/assets/flag-guesser/iso-3166.json";

/** Tailwind の `in_srgb` はクラス名用エスケープ。生の CSS では `in srgb` とスペースが必須。 */
const MAP_FILL_DEFAULT = "color-mix(in srgb, var(--color-primary) 12%, transparent)";
const MAP_FILL_HOVER = "color-mix(in srgb, var(--color-primary) 28%, transparent)";
const MAP_FILL_DRAG = "color-mix(in srgb, var(--color-primary) 42%, transparent)";
const MAP_FILL_CORRECT = "color-mix(in srgb, #22c55e 42%, transparent)";
const MAP_FILL_WRONG = "color-mix(in srgb, #ef4444 42%, transparent)";

const CARD_W = 72;
const CARD_H = 54;

type DragState = {
  cardId: string;
  offsetX: number;
  offsetY: number;
};

/** client → SVG と同寸法のローカル px（左上原点） */
function clientToLocalSvg(clientX: number, clientY: number, rect: DOMRect, innerW: number, innerH: number): [number, number] {
  const x = ((clientX - rect.left) / rect.width) * innerW;
  const y = ((clientY - rect.top) / rect.height) * innerH;
  return [x, y];
}

/** ローカル px → projection と同一の地図座標（ズームが単位行列ならそのまま） */
function localToMap([sx, sy]: [number, number], zoomTf: ZoomPlain): [number, number] {
  return screenToMapSpace(sx, sy, zoomTf);
}

type PlayCard = { id: string; alpha2: string };

export function FlagGuesserPlayfield() {
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const { locale } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomHostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [size, setSize] = useState({ w: 520, h: 390 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isoRows, setIsoRows] = useState<Iso3166Row[]>([]);
  const [allTopoFeatures, setAllTopoFeatures] = useState<CountryFeature[]>([]);
  const initRoundRef = useRef(false);

  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(true);
  const [mapManipEnabled, setMapManipEnabled] = useState(false);
  const [zoomTransform, setZoomTransform] = useState<ZoomPlain>(ZOOM_IDENTITY);
  const [listedCountryLabelsJa, setListedCountryLabelsJa] = useState<string[]>([]);

  const [roundSeq, setRoundSeq] = useState(0);
  const [roundPlan, setRoundPlan] = useState<{ targetRow: Iso3166Row; cardAlpha2s: string[] } | null>(null);
  const [excludeAlphas, setExcludeAlphas] = useState<Set<string>>(new Set());

  const [placedByCard, setPlacedByCard] = useState<Record<string, string>>({});
  const placedRef = useRef(placedByCard);
  placedRef.current = placedByCard;

  const [floatByCard, setFloatByCard] = useState<Record<string, FloatingBubbleLike>>({});
  const floatRef = useRef(floatByCard);
  floatRef.current = floatByCard;

  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [hoverCountryId, setHoverCountryId] = useState<string | null>(null);
  const [dragTargetCountryId, setDragTargetCountryId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [resultByCountryId, setResultByCountryId] = useState<Record<string, "correct" | "wrong">>({});

  const lastTsRef = useRef(0);
  const rafRef = useRef(0);

  const { byCountryCode } = useMemo(() => resolveIsoRows(isoRows), [isoRows]);

  const topoIds = useMemo(() => topoNumericIdSet(allTopoFeatures), [allTopoFeatures]);

  const regionModel = useMemo<RegionRoundModel | null>(() => {
    if (!roundPlan || !allTopoFeatures.length || size.w < 32 || size.h < 32) return null;
    try {
      return buildRegionRoundModel({
        target: roundPlan.targetRow,
        region: roundPlan.targetRow.region!,
        allFeatures: allTopoFeatures,
        isoByCode: byCountryCode,
        width: size.w,
        height: size.h,
      });
    } catch {
      return null;
    }
  }, [roundPlan, allTopoFeatures, byCountryCode, size.w, size.h]);

  const hitFeatures = useMemo(() => {
    if (!regionModel) return [];
    return sortFeaturesForHitTest(regionModel.allFeatures as CountryFeature[]);
  }, [regionModel]);

  const cards: PlayCard[] = useMemo(() => {
    if (!roundPlan) return [];
    return roundPlan.cardAlpha2s.map((a2, i) => ({
      id: `fc-${roundSeq}-${i}`,
      alpha2: a2,
    }));
  }, [roundPlan, roundSeq]);

  const projection = regionModel?.projection;

  const gTransform = useMemo(() => {
    return zoomIdentity.translate(zoomTransform.x, zoomTransform.y).scale(zoomTransform.k).toString();
  }, [zoomTransform]);

  const overlayParentTransform = useMemo(
    () => ({
      transform: `translate(${zoomTransform.x}px, ${zoomTransform.y}px) scale(${zoomTransform.k})`,
      transformOrigin: "0 0" as const,
    }),
    [zoomTransform]
  );

  const mapDebugCenterScale = useMemo(() => {
    if (!projection || size.w < 8 || size.h < 8) return null;
    const midLocal: [number, number] = [size.w / 2, size.h / 2];
    const mapPt = localToMap(midLocal, zoomTransform);
    const inv = projection.invert?.(mapPt);
    if (!inv || !Number.isFinite(inv[0]) || !Number.isFinite(inv[1])) return null;
    const [lon, lat] = inv;
    const snippet = formatMapDebugSnippet([lon, lat], zoomTransform.k);
    return {
      centerLonLatText: `${lon.toFixed(4)}°, ${lat.toFixed(4)}°`,
      scaleText: `${zoomTransform.k.toFixed(4)}×`,
      snippet,
    };
  }, [projection, size.w, size.h, zoomTransform]);

  useEffect(() => {
    if (!isDevTj) {
      setIsDebugMode(false);
      setMapManipEnabled(false);
      setZoomTransform(ZOOM_IDENTITY);
    }
  }, [isDevTj]);

  useEffect(() => {
    if (!mapManipEnabled) setZoomTransform(ZOOM_IDENTITY);
  }, [mapManipEnabled]);

  useEffect(() => {
    if (!isDevTj || !isDebugMode || !mapManipEnabled) return;
    const host = zoomHostRef.current;
    if (!host) return;
    const sel = select(host);
    const z = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.12, 80])
      .on("zoom", (event) => {
        setZoomTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
      });
    sel.call(z);
    sel.call(z.transform, zoomIdentity);
    return () => {
      sel.on(".zoom", null);
    };
  }, [isDevTj, isDebugMode, mapManipEnabled, size.w, size.h]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([
      fetch(TOPO_URL).then((r) => r.json() as Promise<Topology>),
      fetch(ISO_URL).then((r) => r.json() as Promise<Iso3166Row[]>),
    ])
      .then(([topo, iso]) => {
        if (cancelled) return;
        setIsoRows(iso);
        const feats = countryFeaturesFromTopology(topo);
        setAllTopoFeatures(feats);
      })
      .catch(() => {
        if (!cancelled) setLoadError("データの読み込みに失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isoRows.length || !allTopoFeatures.length || initRoundRef.current) return;
    const plan = createRoundPlan(isoRows, topoNumericIdSet(allTopoFeatures), new Set(), 3);
    if (plan) {
      setRoundPlan(plan);
      initRoundRef.current = true;
    }
  }, [isoRows, allTopoFeatures]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(280, Math.floor(r.width));
      const h = Math.max(280, Math.floor(r.height));
      if (w > 0 && h > 0) setSize({ w, h });
    };
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!cards.length || answered) return;
    const r = CARD_W * 0.45;
    setFloatByCard(() => {
      const next: Record<string, FloatingBubbleLike> = {};
      for (const c of cards) {
        next[c.id] = spawnBubbleLike({
          width: size.w,
          height: size.h,
          radius: r,
          speedScale: 0.95,
          restitution: 0.88,
        });
      }
      return next;
    });
  }, [roundSeq, size.w, size.h, answered, cards.length]);

  useEffect(() => {
    if (!cards.length || answered) return;
    const tick = (ts: number) => {
      const last = lastTsRef.current || ts;
      const dt = Math.min(0.033, Math.max(0.001, (ts - last) / 1000));
      lastTsRef.current = ts;
      setFloatByCard((prev) => {
        const next = { ...prev };
        for (const c of cards) {
          if (placedByCard[c.id] || drag?.cardId === c.id) continue;
          const b = next[c.id];
          if (!b) continue;
          stepBubbleLikeInBox(b, size.w, size.h, dt);
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cards, placedByCard, drag, answered, size.w, size.h, roundSeq]);

  const getMapRect = useCallback((): DOMRect | null => {
    const svg = svgRef.current;
    const host = zoomHostRef.current;
    const el = svg ?? host;
    if (!el) return null;
    return el.getBoundingClientRect();
  }, []);

  const pointerToMapCoords = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const rect = getMapRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      const local = clientToLocalSvg(clientX, clientY, rect, size.w, size.h);
      return localToMap(local, zoomTransform);
    },
    [getMapRect, size.w, size.h, zoomTransform]
  );

  const handleSvgPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!projection || !regionModel || answered || drag || mapManipEnabled) return;
      const pt = pointerToMapCoords(event.clientX, event.clientY);
      if (!pt) return;
      const [x, y] = pt;
      const id = countryIdAtPixel(projection, hitFeatures, x, y);
      setHoverCountryId(id);
    },
    [projection, regionModel, hitFeatures, answered, drag, mapManipEnabled, pointerToMapCoords]
  );

  const handleSvgLeave = useCallback(() => {
    if (!drag) setHoverCountryId(null);
  }, [drag]);

  const countryFill = (id: string): string => {
    if (answered) {
      const m = resultByCountryId[id];
      if (m === "correct") return MAP_FILL_CORRECT;
      if (m === "wrong") return MAP_FILL_WRONG;
    }
    if (drag && dragTargetCountryId === id) return MAP_FILL_DRAG;
    if (hoverCountryId === id) return MAP_FILL_HOVER;
    return MAP_FILL_DEFAULT;
  };

  const beginDrag = useCallback(
    (cardId: string, clientX: number, clientY: number) => {
      if (!projection || mapManipEnabled) return;
      const pt = pointerToMapCoords(clientX, clientY);
      if (!pt) return;
      const [x, y] = pt;
      let cx = x;
      let cy = y;
      const fl = floatRef.current[cardId];
      if (fl) {
        cx = fl.x;
        cy = fl.y;
      }
      setDrag({ cardId, offsetX: x - cx, offsetY: y - cy });
      setDragPos({ x: cx, y: cy });
      if (fl) {
        setFloatByCard((prev) => {
          const next = { ...prev };
          delete next[cardId];
          return next;
        });
      }
    },
    [projection, mapManipEnabled, pointerToMapCoords]
  );

  const moveDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!projection || !drag || mapManipEnabled) return;
      const pt = pointerToMapCoords(clientX, clientY);
      if (!pt) return;
      const [x, y] = pt;
      const nx = x - drag.offsetX;
      const ny = y - drag.offsetY;
      setDragPos({ x: nx, y: ny });
      const id = countryIdAtPixel(projection, hitFeatures, nx, ny);
      setDragTargetCountryId(id);
    },
    [projection, drag, hitFeatures, mapManipEnabled, pointerToMapCoords]
  );

  const endDrag = useCallback(
    (cardId: string) => {
      const countryId = dragTargetCountryId;
      setDrag(null);
      setDragTargetCountryId(null);

      if (countryId) {
        const prevPlaced = placedRef.current;
        const occupied = Object.entries(prevPlaced).find(([other, cid]) => cid === countryId && other !== cardId);
        if (occupied) {
          setFloatByCard((prev) => ({
            ...prev,
            [cardId]: spawnBubbleLike({
              width: size.w,
              height: size.h,
              radius: CARD_W * 0.45,
              speedScale: 0.95,
              restitution: 0.88,
            }),
          }));
          return;
        }
        setPlacedByCard((prev) => ({ ...prev, [cardId]: countryId }));
        return;
      }

      setFloatByCard((prev) => ({
        ...prev,
        [cardId]: spawnBubbleLike({
          width: size.w,
          height: size.h,
          radius: CARD_W * 0.45,
          speedScale: 0.95,
          restitution: 0.88,
        }),
      }));
    },
    [dragTargetCountryId, size.w, size.h]
  );

  const peelStuck = useCallback(
    (cardId: string) => {
      setPlacedByCard((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      setFloatByCard((prev) => ({
        ...prev,
        [cardId]: spawnBubbleLike({
          width: size.w,
          height: size.h,
          radius: CARD_W * 0.45,
          speedScale: 0.95,
          restitution: 0.88,
        }),
      }));
    },
    [size.w, size.h]
  );

  const handleCardPointerDown = (cardId: string, e: ReactPointerEvent) => {
    if (answered || mapManipEnabled) return;
    e.preventDefault();
    if (placedByCard[cardId]) {
      peelStuck(cardId);
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    beginDrag(cardId, e.clientX, e.clientY);
  };

  useEffect(() => {
    if (!drag) return;
    const cardId = drag.cardId;
    const onMove = (e: PointerEvent) => moveDrag(e.clientX, e.clientY);
    const onUp = () => endDrag(cardId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, moveDrag, endDrag]);

  const submitAnswer = () => {
    if (!roundPlan) return;
    const byC: Record<string, "correct" | "wrong"> = {};
    for (const c of cards) {
      const cid = placedByCard[c.id];
      if (!cid) continue;
      const row = byCountryCode.get(cid);
      const ok = row?.["alpha-2"].toUpperCase() === c.alpha2.toUpperCase();
      byC[cid] = ok ? "correct" : "wrong";
    }
    setResultByCountryId(byC);
    setAnswered(true);
    const a2 = roundPlan.targetRow["alpha-2"]?.toUpperCase();
    if (a2) setExcludeAlphas((prev) => new Set([...Array.from(prev), a2]));
  };

  const startNewRound = useCallback(() => {
    if (!isoRows.length || !allTopoFeatures.length) return;
    const plan = createRoundPlan(isoRows, topoIds, excludeAlphas, 3);
    if (!plan) return;
    setRoundSeq((s) => s + 1);
    setRoundPlan(plan);
    setPlacedByCard({});
    setAnswered(false);
    setResultByCountryId({});
    setHoverCountryId(null);
    setDragTargetCountryId(null);
    setDrag(null);
  }, [isoRows, allTopoFeatures, topoIds, excludeAlphas]);

  const mapScale = !drag && hoverCountryId && !mapManipEnabled ? 1.03 : 1;

  const hoverCountryLabel = useMemo(() => {
    if (!hoverCountryId) return null;
    const row = byCountryCode.get(hoverCountryId);
    if (!row) return locale === "ja" ? "国を選択中" : "Select a country";
    const localized = getCountryDisplayName(row["alpha-2"], locale);
    return localized ?? row.name;
  }, [hoverCountryId, byCountryCode, locale]);

  const onEnumerateVisible = useCallback(() => {
    if (!projection || !allTopoFeatures.length || size.w < 32 || size.h < 32) {
      setListedCountryLabelsJa([]);
      return;
    }
    const vp = viewportLonLatBounds(projection, size.w, size.h, zoomTransform);
    if (!vp) {
      setListedCountryLabelsJa([]);
      return;
    }
    const overlapping = featuresOverlappingViewport(allTopoFeatures, vp);
    const labels = overlapping
      .map((f) => {
        const id = String(f.id ?? "");
        const row = byCountryCode.get(id);
        const a2 = row?.["alpha-2"];
        const ja = getCountryDisplayName(a2, "ja") ?? row?.name ?? `ID ${id}`;
        return ja;
      })
      .sort((a, b) => a.localeCompare(b, "ja"))
      .slice(0, 10);
    setListedCountryLabelsJa(labels);
  }, [projection, allTopoFeatures, size.w, size.h, zoomTransform, byCountryCode]);

  if (loadError) {
    return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{loadError}</div>;
  }

  if (!regionModel || !roundPlan) {
    return (
      <div className="flex min-h-[320px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-6">
        <div className="h-40 w-full max-w-md animate-pulse rounded-xl bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]" />
        <p className="text-sm text-[var(--color-muted)]">地図と国旗データを読み込み中…</p>
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      className="relative flex h-full min-h-[min(58dvh,640px)] w-full flex-1 flex-col touch-none overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_94%,white_6%)] shadow-inner"
    >
      {isDevTj && (
        <FlagGuesserDebugPanel
          isDebugMode={isDebugMode}
          setIsDebugMode={setIsDebugMode}
          isDebugPanelExpanded={isDebugPanelExpanded}
          setIsDebugPanelExpanded={setIsDebugPanelExpanded}
          mapManipEnabled={mapManipEnabled}
          setMapManipEnabled={setMapManipEnabled}
          onEnumerateVisible={onEnumerateVisible}
          listedCountryLabelsJa={listedCountryLabelsJa}
          mapDebugSnippet={mapDebugCenterScale?.snippet ?? null}
          centerLonLatText={mapDebugCenterScale?.centerLonLatText ?? null}
          scaleText={mapDebugCenterScale?.scaleText ?? null}
        />
      )}

      <div className="pointer-events-none absolute right-2 top-2 z-30 md:right-3 md:top-3">
        {!answered ? (
          <button
            type="button"
            disabled={Object.keys(placedByCard).length === 0 || mapManipEnabled}
            onClick={submitAnswer}
            className="pointer-events-auto rounded-full border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-bg))] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow-sm transition hover:bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            こたえる
          </button>
        ) : (
          <button
            type="button"
            onClick={startNewRound}
            className="pointer-events-auto rounded-full border border-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] shadow-sm transition hover:opacity-95"
          >
            つぎの国
          </button>
        )}
      </div>

      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center">
        <div
          className="relative mx-auto min-h-0 w-full max-w-full flex-1 origin-center transition-transform duration-300 ease-out"
          style={{ transform: `scale(${mapScale})`, width: size.w, height: size.h }}
        >
          <div
            ref={zoomHostRef}
            className={`relative touch-none ${mapManipEnabled ? "cursor-grab active:cursor-grabbing" : ""}`}
            style={{ width: size.w, height: size.h }}
          >
            <svg
              ref={svgRef}
              width={size.w}
              height={size.h}
              className="block select-none"
              role="img"
              aria-label="地域マップ"
              onPointerMove={handleSvgPointerMove}
              onPointerLeave={handleSvgLeave}
            >
              <rect
                width={size.w}
                height={size.h}
                style={{ fill: "color-mix(in srgb, var(--color-bg) 96%, transparent)" }}
              />
              <g transform={gTransform}>
                {regionModel.allFeatures.map((f) => {
                  const id = String(f.id ?? "");
                  const d = regionModel.pathDById.get(id);
                  if (!d) return null;
                  return (
                    <path
                      key={id}
                      d={d}
                      className="transition-[fill] duration-150"
                      style={{
                        fill: countryFill(id),
                        stroke: "color-mix(in srgb, var(--color-text) 18%, transparent)",
                        strokeWidth: 0.6,
                      }}
                    />
                  );
                })}
              </g>
            </svg>

            {isDevTj && isDebugMode && mapDebugCenterScale && (
              <div className="pointer-events-none absolute right-1 top-1 z-10 max-w-[min(100%,18rem)] rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] px-1.5 py-1 font-mono text-[9px] leading-tight text-[var(--color-text)] backdrop-blur-sm">
                <div>Center (lon, lat): {mapDebugCenterScale.centerLonLatText}</div>
                <div>Scale: {mapDebugCenterScale.scaleText}</div>
                <div className="mt-0.5 break-all text-[8px] text-[var(--color-muted)]">{mapDebugCenterScale.snippet}</div>
              </div>
            )}

            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute left-0 top-0"
                style={{
                  ...overlayParentTransform,
                  width: size.w,
                  height: size.h,
                  pointerEvents: mapManipEnabled ? "none" : "auto",
                }}
              >
                {projection &&
                  cards.map((c) => {
                    const cid = placedByCard[c.id];
                    if (!cid || drag?.cardId === c.id) return null;
                    const feat = regionModel.allFeatures.find((f) => String(f.id) === cid);
                    if (!feat) return null;
                    const p = projectCentroid(projection, feat as CountryFeature);
                    if (!p) return null;
                    return (
                      <button
                        key={`stuck-${c.id}`}
                        type="button"
                        className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-md border-2 border-white/40 bg-white/10 p-0.5 shadow-md backdrop-blur-sm active:cursor-grabbing"
                        style={{ left: p[0], top: p[1], width: CARD_W, height: CARD_H }}
                        onPointerDown={(e) => handleCardPointerDown(c.id, e)}
                        aria-label="国旗を戻す"
                      >
                        <Image
                          src={flagUrlForAlpha2(c.alpha2)}
                          alt=""
                          width={CARD_W - 4}
                          height={CARD_H - 4}
                          className="pointer-events-none h-full w-full rounded object-contain"
                          draggable={false}
                          unoptimized
                        />
                      </button>
                    );
                  })}

                {drag &&
                  (() => {
                    const c = cards.find((x) => x.id === drag.cardId);
                    if (!c) return null;
                    return (
                      <div
                        className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-[var(--color-primary)] bg-white/90 p-0.5 shadow-xl"
                        style={{ left: dragPos.x, top: dragPos.y, width: CARD_W, height: CARD_H }}
                      >
                        <Image
                          src={flagUrlForAlpha2(c.alpha2)}
                          alt=""
                          width={CARD_W - 4}
                          height={CARD_H - 4}
                          className="h-full w-full rounded object-contain"
                          draggable={false}
                          unoptimized
                        />
                      </div>
                    );
                  })()}

                {!answered &&
                  cards.map((c) => {
                    if (placedByCard[c.id] || drag?.cardId === c.id) return null;
                    const fl = floatByCard[c.id];
                    if (!fl) return null;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-md border border-[color-mix(in_srgb,var(--color-text)_15%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] p-0.5 shadow-md active:cursor-grabbing"
                        style={{ left: fl.x, top: fl.y, width: CARD_W, height: CARD_H }}
                        onPointerDown={(e) => handleCardPointerDown(c.id, e)}
                      >
                        <Image
                          src={flagUrlForAlpha2(c.alpha2)}
                          alt=""
                          width={CARD_W - 4}
                          height={CARD_H - 4}
                          className="pointer-events-none rounded object-contain"
                          draggable={false}
                          unoptimized
                        />
                      </button>
                    );
                  })}
              </div>
            </div>

            {isDevTj && isDebugMode && listedCountryLabelsJa.length > 0 && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[5] border-t border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-2 py-1.5 text-[10px] leading-snug text-[var(--color-text)] backdrop-blur-sm">
                <span className="font-semibold text-[var(--color-muted)]">ビューポート候補: </span>
                {listedCountryLabelsJa.join(" · ")}
              </div>
            )}
          </div>
        </div>
      </div>

      {hoverCountryId && projection && !drag && !mapManipEnabled && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-10 rounded-lg bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] px-2 py-1 text-center text-[11px] text-[var(--color-text)] backdrop-blur-sm md:text-xs">
          {hoverCountryLabel ?? (locale === "ja" ? "国を選択中" : "Select a country")}
        </div>
      )}
    </div>
  );
}
