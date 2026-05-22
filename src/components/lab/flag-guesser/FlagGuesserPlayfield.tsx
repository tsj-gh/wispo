"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Topology } from "topojson-specification";
import { easeCubicOut } from "d3-ease";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { select } from "d3-selection";
import { interpolate } from "flubber";
import "d3-transition";
import {
  buildCurriculumMapRoundModel,
  buildCurriculumMapRoundModelSameProjection,
  buildRegionRoundModel,
  buildRegionRoundModelSameProjection,
  countryIdAtPixel,
  countryIdAtPixelWithSeaProximity,
  projectMainlandCentroid,
  sortFeaturesForHitTest,
} from "@/lib/flag-guesser/mapProjections";
import { FlagGuesserPopBurstRipple } from "@/components/lab/flag-guesser/FlagGuesserPopBurstRipple";
import { geoPath, type GeoProjection } from "d3-geo";
import type { CountryFeature, Iso3166Row, RegionRoundModel } from "@/lib/flag-guesser/types";
import {
  countryFeaturesFromTopology,
  createCurriculumRoundPlan,
  flagUrlForAlpha2,
  topoNumericIdSet,
  resolveIsoRows,
  type RoundPlan,
} from "@/lib/flag-guesser/selectRound";
import {
  buildCurriculumPool,
  explorerMapPresetForIsoRow,
  getCurriculumStage,
  indexDifficultyByAlpha3,
  type FlagGuesserCurriculumLevel,
} from "@/lib/flag-guesser/flagGuesserCurriculum";
import {
  type ExplorerMapPresetView,
  type ExplorerMapPresetsFile,
  zoomPlainFromCenterLonLatK,
} from "@/lib/flag-guesser/explorerMapPresets";
import type { FlagDifficultyJsonRow } from "@/lib/flag-guesser/flagExplorerDataset";
import { spawnBubbleLike, spawnBubbleLikeAtPanelXY, stepBubbleLikeInBox, type FloatingBubbleLike } from "@/lib/flag-guesser/floatingFlagPhysics";
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
import type { FlagGuesserDebugPanelProps } from "@/components/lab/flag-guesser/FlagGuesserDebugPanel";
import {
  drawRegionMapCanvas,
  resolveCssColorForCanvas,
  type MapRenderBackend,
} from "@/lib/flag-guesser/drawRegionMapCanvas";
import {
  DEFAULT_LOD_THRESHOLD_HIGH,
  DEFAULT_LOD_THRESHOLD_LOW,
  lodTierForMetric,
  type TopoLodId,
  TOPO_LOD_URL,
} from "@/lib/flag-guesser/topoLod";
import { filterWorldTopoFeatures } from "@/lib/flag-guesser/topoFeatureFilter";

const ISO_URL = "/assets/flag-guesser/iso-3166.json";
const DIFF_URL = "/assets/flag-guesser/flag_difficulty.json";
const MAP_PRESETS_URL = "/assets/flag-guesser/explorer_map_presets.json";

/** 海（SVG 背景）— 視認性のため以前どおり淡い背景のみ */
const MAP_SEA_FILL = "color-mix(in srgb, var(--color-bg) 96%, transparent)";
/** 同一リージョンの陸（出題中はカード掲載国も含め同一トーン） */
const MAP_LAND_REGION_QUIET = "color-mix(in srgb, var(--color-muted) 14%, transparent)";
/** 通常の陸地国境（実線） */
const MAP_BORDER_STROKE = "color-mix(in srgb, var(--color-text) 26%, transparent)";
/** ホバー時の太い輪郭（以前のホバー fill トーンに合わせる） */
const MAP_HOVER_STROKE = "color-mix(in srgb, var(--color-primary) 72%, transparent)";
/** ドラッグ着弾候補の輪郭（マイルドな青） */
const MAP_DRAG_STROKE = "rgba(59, 130, 246, 0.72)";
/** ドラッグ中・配置待ちの領域塗り（正誤色と区別する薄い青） */
const MAP_FILL_DRAG_TARGET = "rgba(59, 130, 246, 0.2)";
const MAP_FILL_PLACED = "rgba(139, 92, 246, 0.18)";
const MAP_FILL_CORRECT = "color-mix(in srgb, #22c55e 42%, transparent)";
const MAP_FILL_WRONG = "color-mix(in srgb, #ef4444 42%, transparent)";

const CARD_W = 72;
const CARD_H = 54;
/** ドラッグ中の円形カード直径（4:3 矩形に内接する正円＝短辺） */
const CARD_DIAM = Math.min(CARD_W, CARD_H);
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 80;
const ZOOM_STEP = 1.3;

const DEFAULT_DRAG_CARD_SCREEN_OFFSET_PX = 80;
const DEFAULT_DRAG_CARD_SPRING = 0.22;

type DragState = {
  cardId: string;
};

function mapUnitsPerScreenPx(zoomK: number): number {
  return 1 / Math.max(zoomK, 0.08);
}

function dragCardTargetFromPointer(
  px: number,
  py: number,
  zoomK: number,
  offsetScreenPx: number
): { x: number; y: number } {
  const step = (offsetScreenPx * mapUnitsPerScreenPx(zoomK)) / Math.SQRT2;
  return { x: px + step, y: py - step };
}

/** ポインタ方向における円周上で最も近い点（コネクタ終端） */
function circleEdgeNearestPointer(px: number, py: number, cx: number, cy: number, r: number): [number, number] {
  const vx = px - cx;
  const vy = py - cy;
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return [cx + r, cy];
  const nx = vx / len;
  const ny = vy / len;
  return [cx + nx * r, cy + ny * r];
}

function dragConnectorPathD(px: number, py: number, tx: number, ty: number): string {
  const c1x = px + (tx - px) * 0.42;
  const c1y = py;
  const c2x = tx - (tx - px) * 0.42;
  const c2y = ty;
  return `M ${px} ${py} C ${c1x} ${c1y} ${c2x} ${c2y} ${tx} ${ty}`;
}

function clampZoomK(k: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k));
}

function zoomRatioToK(ratio: number): number {
  const t = Math.max(0, Math.min(1, ratio));
  const minLn = Math.log(ZOOM_MIN);
  const maxLn = Math.log(ZOOM_MAX);
  return Math.exp(minLn + (maxLn - minLn) * t);
}

function zoomKToRatio(k: number): number {
  const kk = clampZoomK(k);
  const minLn = Math.log(ZOOM_MIN);
  const maxLn = Math.log(ZOOM_MAX);
  return (Math.log(kk) - minLn) / (maxLn - minLn);
}

function fitTransformForRegion(regionModel: RegionRoundModel, width: number, height: number): ZoomPlain {
  const p = geoPath(regionModel.projection);
  const [[x0, y0], [x1, y1]] = p.bounds(regionModel.regionCollection);
  const bw = Math.max(1e-6, x1 - x0);
  const bh = Math.max(1e-6, y1 - y0);
  const padding = Math.max(24, Math.min(width, height) * 0.08);
  const usableW = Math.max(1, width - padding * 2);
  const usableH = Math.max(1, height - padding * 2);
  const k = clampZoomK(Math.min(usableW / bw, usableH / bh));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    x: width / 2 - cx * k,
    y: height / 2 - cy * k,
    k,
  };
}

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

function countryMapPathClass(
  id: string,
  opts: {
    drag: boolean;
    dragTargetCountryId: string | null;
    answered: boolean;
    placedCountryIds: Set<string>;
    resultByCountryId: Record<string, "correct" | "wrong">;
  }
): string {
  const parts = ["fg-map-country"];
  if (opts.drag && opts.dragTargetCountryId === id) parts.push("is-drag-target");
  if (!opts.answered && opts.placedCountryIds.has(id)) parts.push("is-placed");
  if (opts.answered) {
    const r = opts.resultByCountryId[id];
    if (r === "correct") parts.push("is-judge-correct");
    if (r === "wrong") parts.push("is-judge-wrong");
  }
  return parts.join(" ");
}

type CanvasDrawSnapshot = {
  logicalW: number;
  logicalH: number;
  dpr: number;
  projection: GeoProjection | null | undefined;
  rm: RegionRoundModel | null;
  zoomTransform: ZoomPlain;
  borderStrokeWidth: number;
  hoverOutlineWidth: number;
  hoverCountryId: string | null;
  dragTargetCountryId: string | null;
  drag: boolean;
  countryFill: (id: string) => string;
};

export type FlagGuesserPlayfieldProps = {
  /** devtj デバッグパネルをラボシェルのサイドバーに出すときに渡す */
  onDebugPanelPropsChange?: (props: FlagGuesserDebugPanelProps | null) => void;
};

export function FlagGuesserPlayfield({ onDebugPanelPropsChange }: FlagGuesserPlayfieldProps = {}) {
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const { locale } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomHostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [size, setSize] = useState({ w: 520, h: 390 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isoRows, setIsoRows] = useState<Iso3166Row[]>([]);
  const [diffRows, setDiffRows] = useState<FlagDifficultyJsonRow[] | null>(null);
  const [explorerMapPresets, setExplorerMapPresets] = useState<Record<
    string,
    ExplorerMapPresetView
  > | null>(null);
  const [curriculumLevel, setCurriculumLevel] = useState<FlagGuesserCurriculumLevel>(1);
  const curriculumLevelRef = useRef<FlagGuesserCurriculumLevel>(1);
  /** 必要になった解像度だけ逐次 fetch して保持 */
  const [featuresCache, setFeaturesCache] = useState<Partial<Record<TopoLodId, CountryFeature[]>>>({});
  const [displayedLod, setDisplayedLod] = useState<TopoLodId>("110");
  const [fetchingLod, setFetchingLod] = useState<TopoLodId | null>(null);
  const [lodThresholdLow, setLodThresholdLow] = useState(DEFAULT_LOD_THRESHOLD_LOW);
  const [lodThresholdHigh, setLodThresholdHigh] = useState(DEFAULT_LOD_THRESHOLD_HIGH);
  const featuresCacheRef = useRef(featuresCache);
  featuresCacheRef.current = featuresCache;
  const frozenProjectionRef = useRef<GeoProjection | null>(null);
  /** ラウンド開始時の経度アンラップ基準（LOD 差し替えで不変） */
  const frozenUnwrapMeridianRef = useRef(60);
  const frozenRoundSeqRef = useRef<number | null>(null);
  const pathMorphRoundSeqRef = useRef(-1);
  const prevPathDByIdForMorphRef = useRef<Map<string, string>>(new Map());
  const initRoundRef = useRef(false);

  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(true);
  const [mapRenderBackend, setMapRenderBackend] = useState<MapRenderBackend>("canvas");
  const [zoomTransform, setZoomTransform] = useState<ZoomPlain>(ZOOM_IDENTITY);
  const zoomTransformRef = useRef<ZoomPlain>(ZOOM_IDENTITY);
  zoomTransformRef.current = zoomTransform;
  /** マップ操作のズーム／パン中は true（終了後 200ms で false → Canvas を高精細に戻す） */
  const [canvasMapInteracting, setCanvasMapInteracting] = useState(false);
  const canvasRefineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const lastFitRoundSeqRef = useRef(-1);
  const [devicePixelRatioState, setDevicePixelRatioState] = useState(1);
  const [listedCountryLabelsJa, setListedCountryLabelsJa] = useState<string[]>([]);
  const [canvasMapFps, setCanvasMapFps] = useState<number | null>(null);
  const canvasFpsAccumRef = useRef({ frames: 0, t0: 0 });
  const canvasDrawSnapshotRef = useRef<CanvasDrawSnapshot | null>(null);

  const [roundSeq, setRoundSeq] = useState(0);
  const [roundPlan, setRoundPlan] = useState<RoundPlan | null>(null);
  const [excludeAlphas, setExcludeAlphas] = useState<Set<string>>(new Set());

  const [placedByCard, setPlacedByCard] = useState<Record<string, string>>({});
  const placedRef = useRef(placedByCard);
  placedRef.current = placedByCard;

  const [floatByCard, setFloatByCard] = useState<Record<string, FloatingBubbleLike>>({});
  const floatRef = useRef(floatByCard);
  floatRef.current = floatByCard;

  const [drag, setDrag] = useState<DragState | null>(null);
  /** ドロップ判定・十字の中心（地図座標） */
  const [dragPointerMap, setDragPointerMap] = useState<{ x: number; y: number } | null>(null);
  /** カード中心（地図座標・慣性追従） */
  const [dragCardDisplay, setDragCardDisplay] = useState<{ x: number; y: number } | null>(null);
  /** `endDrag` で最新の表示位置を参照するため（state は 1 フレーム遅れうる） */
  const dragCardDisplayRef = useRef<{ x: number; y: number } | null>(null);
  const dragPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [hoverCountryId, setHoverCountryId] = useState<string | null>(null);
  /** 出題中・マップ上で十字を描くためのポインタ位置（地図座標） */
  const [mapHoverCrossMap, setMapHoverCrossMap] = useState<{ x: number; y: number } | null>(null);
  const [dragTargetCountryId, setDragTargetCountryId] = useState<string | null>(null);
  /** ドラッグカードとポインタのオフセット（画面上の斜め方向の長さ・px） */
  const [dragCardScreenOffsetPx, setDragCardScreenOffsetPx] = useState(DEFAULT_DRAG_CARD_SCREEN_OFFSET_PX);
  /** ドラッグカードの慣性追従（毎フレームの補間率） */
  const [dragCardSpring, setDragCardSpring] = useState(DEFAULT_DRAG_CARD_SPRING);
  const [answered, setAnswered] = useState(false);
  const [resultByCountryId, setResultByCountryId] = useState<Record<string, "correct" | "wrong">>({});

  const lastTsRef = useRef(0);
  const rafRef = useRef(0);

  const { byCountryCode } = useMemo(() => resolveIsoRows(isoRows), [isoRows]);

  /** ISO 照合＋極小ポリゴン除去済み（描画・ヒットテスト・出題に使用） */
  const featuresForGame = useMemo(() => {
    const out: Partial<Record<TopoLodId, CountryFeature[]>> = {};
    for (const lod of ["110", "50", "10"] as const) {
      const raw = featuresCache[lod];
      if (!raw?.length) continue;
      out[lod] = isoRows.length ? filterWorldTopoFeatures(raw, byCountryCode) : raw;
    }
    return out;
  }, [featuresCache, isoRows.length, byCountryCode]);

  const topoIds = useMemo(() => topoNumericIdSet(featuresForGame["110"] ?? []), [featuresForGame]);

  const difficultyByAlpha3 = useMemo(
    () => (diffRows ? indexDifficultyByAlpha3(diffRows) : new Map()),
    [diffRows]
  );

  const curriculumPool = useMemo(() => {
    if (!isoRows?.length || !diffRows) return [];
    return buildCurriculumPool(isoRows, difficultyByAlpha3, topoIds, curriculumLevel);
  }, [isoRows, diffRows, difficultyByAlpha3, topoIds, curriculumLevel]);

  const curriculumStage = useMemo(() => getCurriculumStage(curriculumLevel), [curriculumLevel]);

  const regionModel = useMemo<RegionRoundModel | null>(() => {
    if (!roundPlan || size.w < 32 || size.h < 32) return null;
    const world = featuresForGame[displayedLod];
    if (!world?.length) return null;
    const mapCodes = roundPlan.mapCountryCodes;
    try {
      const roundChanged = frozenRoundSeqRef.current !== roundSeq;
      if (roundChanged) {
        frozenRoundSeqRef.current = roundSeq;
        const rm =
          mapCodes?.size && mapCodes.size > 0
            ? buildCurriculumMapRoundModel({
                target: roundPlan.targetRow,
                countryCodes: mapCodes,
                filteredWorldFeatures: world,
                width: size.w,
                height: size.h,
              })
            : buildRegionRoundModel({
                target: roundPlan.targetRow,
                region: roundPlan.targetRow.region!,
                allFeatures: world,
                isoByCode: byCountryCode,
                width: size.w,
                height: size.h,
              });
        frozenProjectionRef.current = rm.projection;
        frozenUnwrapMeridianRef.current = rm.unwrapCenterMeridian;
        return rm;
      }
      const proj = frozenProjectionRef.current;
      if (!proj) return null;
      if (mapCodes?.size && mapCodes.size > 0) {
        return buildCurriculumMapRoundModelSameProjection({
          target: roundPlan.targetRow,
          countryCodes: mapCodes,
          projection: proj,
          filteredWorldFeatures: world,
          width: size.w,
          height: size.h,
          unwrapCenterMeridian: frozenUnwrapMeridianRef.current,
        });
      }
      return buildRegionRoundModelSameProjection({
        target: roundPlan.targetRow,
        region: roundPlan.targetRow.region!,
        projection: proj,
        allWorldFeatures: world,
        isoByCode: byCountryCode,
        width: size.w,
        height: size.h,
        unwrapCenterMeridian: frozenUnwrapMeridianRef.current,
      });
    } catch {
      return null;
    }
  }, [roundPlan, featuresForGame, displayedLod, byCountryCode, size.w, size.h, roundSeq]);

  const lodMetric = useMemo(() => {
    const p = regionModel?.projection;
    if (!p || typeof p.scale !== "function") return 0;
    return p.scale() * zoomTransform.k;
  }, [regionModel?.projection, zoomTransform.k]);

  const lodThresholdHighEffective = Math.max(lodThresholdHigh, lodThresholdLow + 1);

  const desiredLod = useMemo(
    () => lodTierForMetric(lodMetric, lodThresholdLow, lodThresholdHighEffective),
    [lodMetric, lodThresholdLow, lodThresholdHighEffective]
  );

  /** ズーム操作中は 50m で描き、操作終了 200ms 後に displayedLod（10m 含む）へ Refine */
  const canvasPaintLod = useMemo<TopoLodId>(() => {
    if (!canvasMapInteracting) return displayedLod;
    if (desiredLod === "10" && featuresForGame["50"]?.length) return "50";
    return displayedLod;
  }, [canvasMapInteracting, desiredLod, displayedLod, featuresForGame]);

  const loadingHighDetail =
    fetchingLod === "10" || (desiredLod === "10" && !featuresCache["10"]?.length);

  const regionModelForCanvas = useMemo<RegionRoundModel | null>(() => {
    if (!regionModel || !roundPlan) return null;
    if (canvasPaintLod === displayedLod) return regionModel;
    const world = featuresForGame[canvasPaintLod];
    if (!world?.length) return regionModel;
    const mapCodes = roundPlan.mapCountryCodes;
    try {
      if (mapCodes?.size && mapCodes.size > 0) {
        return buildCurriculumMapRoundModelSameProjection({
          target: roundPlan.targetRow,
          countryCodes: mapCodes,
          projection: regionModel.projection,
          filteredWorldFeatures: world,
          width: size.w,
          height: size.h,
          unwrapCenterMeridian: regionModel.unwrapCenterMeridian,
        });
      }
      return buildRegionRoundModelSameProjection({
        target: roundPlan.targetRow,
        region: roundPlan.targetRow.region!,
        projection: regionModel.projection,
        allWorldFeatures: world,
        isoByCode: byCountryCode,
        width: size.w,
        height: size.h,
        unwrapCenterMeridian: regionModel.unwrapCenterMeridian,
      });
    } catch {
      return regionModel;
    }
  }, [
    regionModel,
    roundPlan,
    canvasPaintLod,
    displayedLod,
    featuresForGame,
    byCountryCode,
    size.w,
    size.h,
  ]);

  const pointerRegionModel = mapRenderBackend === "canvas" ? (regionModelForCanvas ?? regionModel) : regionModel;

  const hitFeaturesForPointer = useMemo(() => {
    if (!pointerRegionModel) return [];
    return sortFeaturesForHitTest(pointerRegionModel.allFeatures as CountryFeature[]);
  }, [pointerRegionModel]);

  const cards: PlayCard[] = useMemo(() => {
    if (!roundPlan) return [];
    return roundPlan.cardAlpha2s.map((a2, i) => ({
      id: `fc-${roundSeq}-${i}`,
      alpha2: a2,
    }));
  }, [roundPlan, roundSeq]);

  const projection = regionModel?.projection;

  /** ドラッグ着弾候補（領土外の海上は重心近傍＋最近傍との距離差で補正） */
  const resolveDragTargetAtMapPoint = useCallback(
    (x: number, y: number): string | null => {
      if (!projection || !pointerRegionModel) return null;
      return countryIdAtPixelWithSeaProximity(
        projection,
        hitFeaturesForPointer,
        x,
        y,
        pointerRegionModel.pathDById,
        { zoomK: zoomTransformRef.current.k }
      );
    },
    [projection, pointerRegionModel, hitFeaturesForPointer]
  );

  /** ロード完了前は盤面 DOM が無く zoomHostRef が null のため、これが true になったタイミングで d3-zoom を付け直す */
  const mapStageMounted = regionModel != null;

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

  /** 親の d3-zoom scale(k) に追従してもカードの見た目サイズが一定になるよう打ち消し */
  const flagVisualScale = useMemo(
    () => 1 / Math.max(zoomTransform.k, 0.06),
    [zoomTransform.k]
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
    }
  }, [isDevTj]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const setD = () => setDevicePixelRatioState(window.devicePixelRatio || 1);
    setD();
    window.addEventListener("resize", setD);
    return () => window.removeEventListener("resize", setD);
  }, []);

  useEffect(() => {
    return () => {
      if (canvasRefineTimerRef.current) {
        clearTimeout(canvasRefineTimerRef.current);
        canvasRefineTimerRef.current = null;
      }
    };
  }, []);

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
        setCanvasMapInteracting(true);
      })
      .on("zoom", (event) => {
        setZoomTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k });
      })
      .on("end", () => {
        if (canvasRefineTimerRef.current) clearTimeout(canvasRefineTimerRef.current);
        canvasRefineTimerRef.current = setTimeout(() => {
          setCanvasMapInteracting(false);
          canvasRefineTimerRef.current = null;
        }, 200);
      });
    zoomBehaviorRef.current = z;
    sel.call(z);
    sel.call(z.transform, zoomIdentity.translate(zoomTransform.x, zoomTransform.y).scale(zoomTransform.k));
    return () => {
      zoomBehaviorRef.current = null;
      sel.on(".zoom", null);
      if (canvasRefineTimerRef.current) {
        clearTimeout(canvasRefineTimerRef.current);
        canvasRefineTimerRef.current = null;
      }
    };
  }, [size.w, size.h, mapStageMounted]);

  const applyZoomTransform = useCallback((next: ZoomPlain, smooth: boolean) => {
    const host = zoomHostRef.current;
    const behavior = zoomBehaviorRef.current;
    if (!host || !behavior) {
      setZoomTransform(next);
      return;
    }
    const sel = select(host);
    sel.interrupt();
    const t = zoomIdentity.translate(next.x, next.y).scale(clampZoomK(next.k));
    if (smooth) {
      sel
        .transition()
        .duration(180)
        .ease(easeCubicOut)
        .call(behavior.transform, t);
    } else {
      sel.call(behavior.transform, t);
    }
  }, []);

  const zoomByFactor = useCallback(
    (factor: number) => {
      const centerX = size.w / 2;
      const centerY = size.h / 2;
      const nextK = clampZoomK(zoomTransform.k * factor);
      const scale = nextK / Math.max(zoomTransform.k, 1e-6);
      const next: ZoomPlain = {
        k: nextK,
        x: centerX - (centerX - zoomTransform.x) * scale,
        y: centerY - (centerY - zoomTransform.y) * scale,
      };
      applyZoomTransform(next, true);
    },
    [size.w, size.h, zoomTransform, applyZoomTransform]
  );

  const setZoomFromSliderRatio = useCallback(
    (ratio: number, smooth: boolean) => {
      const centerX = size.w / 2;
      const centerY = size.h / 2;
      const nextK = zoomRatioToK(ratio);
      const scale = nextK / Math.max(zoomTransform.k, 1e-6);
      const next: ZoomPlain = {
        k: nextK,
        x: centerX - (centerX - zoomTransform.x) * scale,
        y: centerY - (centerY - zoomTransform.y) * scale,
      };
      applyZoomTransform(next, smooth);
    },
    [size.w, size.h, zoomTransform, applyZoomTransform]
  );

  const applySliderRatioFromClientY = useCallback(
    (track: HTMLElement, clientY: number, smooth: boolean) => {
      const rect = track.getBoundingClientRect();
      const raw = 1 - (clientY - rect.top) / Math.max(rect.height, 1);
      setZoomFromSliderRatio(raw, smooth);
    },
    [setZoomFromSliderRatio]
  );

  const endSliderMapInteraction = useCallback(() => {
    if (canvasRefineTimerRef.current) clearTimeout(canvasRefineTimerRef.current);
    canvasRefineTimerRef.current = setTimeout(() => {
      setCanvasMapInteracting(false);
      canvasRefineTimerRef.current = null;
    }, 200);
  }, []);

  useEffect(() => {
    if (!regionModel || !roundPlan || size.w < 16 || size.h < 16) return;
    if (lastFitRoundSeqRef.current === roundSeq) return;
    lastFitRoundSeqRef.current = roundSeq;
    const preset =
      explorerMapPresets != null
        ? explorerMapPresetForIsoRow(explorerMapPresets, roundPlan.targetRow)
        : null;
    const fromPreset =
      preset != null
        ? zoomPlainFromCenterLonLatK(
            regionModel.projection,
            size.w,
            size.h,
            preset.lon,
            preset.lat,
            preset.k
          )
        : null;
    const fitted = fromPreset ?? fitTransformForRegion(regionModel, size.w, size.h);
    applyZoomTransform(fitted, false);
  }, [regionModel, roundPlan, explorerMapPresets, size.w, size.h, roundSeq, applyZoomTransform]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([
      fetch(ISO_URL).then((r) => {
        if (!r.ok) throw new Error("iso");
        return r.json() as Promise<Iso3166Row[]>;
      }),
      fetch(DIFF_URL).then((r) => {
        if (!r.ok) throw new Error("diff");
        return r.json() as Promise<FlagDifficultyJsonRow[]>;
      }),
      fetch(MAP_PRESETS_URL).then((r) => {
        if (!r.ok) throw new Error("presets");
        return r.json() as Promise<ExplorerMapPresetsFile>;
      }),
    ])
      .then(([iso, diff, presetsFile]) => {
        if (!cancelled) {
          setIsoRows(iso);
          setDiffRows(diff);
          setExplorerMapPresets(presetsFile.presets ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("国旗・難易度データの読み込みに失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resetRoundForCurriculum = useCallback(
    (exclude: Set<string>, options?: { bumpSeq?: boolean }) => {
      if (!isoRows.length || !featuresForGame["110"]?.length || curriculumPool.length === 0) return;
      const stage = getCurriculumStage(curriculumLevel);
      const plan = createCurriculumRoundPlan(
        curriculumPool,
        exclude,
        stage.decoyCount,
        isoRows,
        topoIds
      );
      if (!plan) return;
      if (options?.bumpSeq) setRoundSeq((s) => s + 1);
      setRoundPlan(plan);
      setPlacedByCard({});
      setAnswered(false);
      setResultByCountryId({});
      setHoverCountryId(null);
      setMapHoverCrossMap(null);
      setDragTargetCountryId(null);
      setDrag(null);
      setDragPointerMap(null);
      setDragCardDisplay(null);
      dragCardDisplayRef.current = null;
    },
    [isoRows, topoIds, featuresForGame, curriculumPool, curriculumLevel]
  );

  /** 閾値を跨いだときだけ該当解像度を fetch（キャッシュがあればスキップ） */
  useEffect(() => {
    const tier = desiredLod;
    if (featuresCacheRef.current[tier]) return;

    let cancelled = false;
    setFetchingLod((f) => f ?? tier);

    fetch(TOPO_LOD_URL[tier])
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Topology>;
      })
      .then((topo) => {
        if (cancelled) return;
        const feats = countryFeaturesFromTopology(topo);
        setFeaturesCache((prev) => ({ ...prev, [tier]: feats }));
      })
      .catch(() => {
        if (!cancelled) setLoadError("地形データの読み込みに失敗しました");
      })
      .finally(() => {
        if (!cancelled) {
          setFetchingLod((f) => (f === tier ? null : f));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [desiredLod]);

  /** 必要な解像度が揃ったら表示 LOD を追従（読み込み中は従来のまま） */
  useEffect(() => {
    if (featuresForGame[desiredLod]?.length) {
      setDisplayedLod(desiredLod);
    }
  }, [desiredLod, featuresForGame]);

  useEffect(() => {
    if (!isoRows.length || !diffRows || !featuresForGame["110"]?.length || curriculumPool.length === 0) return;
    if (initRoundRef.current) return;
    resetRoundForCurriculum(new Set());
    initRoundRef.current = true;
  }, [isoRows, diffRows, featuresForGame, curriculumPool, resetRoundForCurriculum]);

  useEffect(() => {
    curriculumLevelRef.current = curriculumLevel;
  }, [curriculumLevel]);

  const curriculumLevelChangeSkRef = useRef(true);
  useEffect(() => {
    if (curriculumLevelChangeSkRef.current) {
      curriculumLevelChangeSkRef.current = false;
      return;
    }
    if (!initRoundRef.current) return;
    setExcludeAlphas(new Set());
    lastFitRoundSeqRef.current = -1;
    resetRoundForCurriculum(new Set(), { bumpSeq: true });
  }, [curriculumLevel, resetRoundForCurriculum]);

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
    const mapEl = mapRenderBackend === "canvas" ? canvasRef.current : svgRef.current;
    const host = zoomHostRef.current;
    const el = mapEl ?? host;
    if (!el) return null;
    return el.getBoundingClientRect();
  }, [mapRenderBackend]);

  const pointerToMapCoords = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const rect = getMapRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      const local = clientToLocalSvg(clientX, clientY, rect, size.w, size.h);
      return localToMap(local, zoomTransform);
    },
    [getMapRect, size.w, size.h, zoomTransform]
  );

  const handleMapPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement | SVGSVGElement>) => {
      const pt = pointerToMapCoords(event.clientX, event.clientY);
      if (pt && !answered && !drag) {
        setMapHoverCrossMap({ x: pt[0], y: pt[1] });
      } else {
        setMapHoverCrossMap(null);
      }

      if (!projection || !pointerRegionModel || answered || drag) return;
      const [x, y] = pt!;
      const id = countryIdAtPixel(projection, hitFeaturesForPointer, x, y, pointerRegionModel.pathDById);
      setHoverCountryId(id);
    },
    [projection, pointerRegionModel, hitFeaturesForPointer, answered, drag, pointerToMapCoords]
  );

  const handleMapLeave = useCallback(() => {
    if (!drag) setHoverCountryId(null);
    setMapHoverCrossMap(null);
  }, [drag]);

  const placedCountryIds = useMemo(
    () => new Set(Object.values(placedByCard).filter((x): x is string => Boolean(x))),
    [placedByCard]
  );

  const mapPathClassOpts = useMemo(
    () => ({
      drag: Boolean(drag),
      dragTargetCountryId,
      answered,
      placedCountryIds,
      resultByCountryId,
    }),
    [drag, dragTargetCountryId, answered, placedCountryIds, resultByCountryId]
  );

  const countryFill = useCallback(
    (id: string): string => {
      if (answered) {
        const m = resultByCountryId[id];
        if (m === "correct") return MAP_FILL_CORRECT;
        if (m === "wrong") return MAP_FILL_WRONG;
      }
      if (drag && dragTargetCountryId === id) return MAP_FILL_DRAG_TARGET;
      if (placedCountryIds.has(id)) return MAP_FILL_PLACED;
      return MAP_LAND_REGION_QUIET;
    },
    [answered, resultByCountryId, drag, dragTargetCountryId, placedCountryIds]
  );

  const beginDrag = useCallback(
    (cardId: string, clientX: number, clientY: number) => {
      if (!projection) return;
      const pt = pointerToMapCoords(clientX, clientY);
      if (!pt) return;
      const [x, y] = pt;
      let cx = x;
      let cy = y;
      const fl = floatRef.current[cardId];
      if (fl) {
        const k = Math.max(zoomTransform.k, 0.06);
        cx = (fl.x - zoomTransform.x) / k;
        cy = (fl.y - zoomTransform.y) / k;
      }
      dragPointerRef.current = { x, y };
      setDragPointerMap({ x, y });
      setDragCardDisplay({ x: cx, y: cy });
      dragCardDisplayRef.current = { x: cx, y: cy };
      setMapHoverCrossMap(null);
      setDrag({ cardId });
      if (fl) {
        setFloatByCard((prev) => {
          const next = { ...prev };
          delete next[cardId];
          return next;
        });
      }
      setDragTargetCountryId(resolveDragTargetAtMapPoint(x, y));
    },
    [projection, pointerToMapCoords, zoomTransform, resolveDragTargetAtMapPoint]
  );

  const moveDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!projection || !drag || !pointerRegionModel) return;
      const pt = pointerToMapCoords(clientX, clientY);
      if (!pt) return;
      const [x, y] = pt;
      dragPointerRef.current = { x, y };
      setDragPointerMap({ x, y });
      setDragTargetCountryId(resolveDragTargetAtMapPoint(x, y));
    },
    [projection, drag, pointerToMapCoords, pointerRegionModel, resolveDragTargetAtMapPoint]
  );

  const endDrag = useCallback(
    (cardId: string) => {
      const countryId = dragTargetCountryId;
      const lastMap = dragCardDisplayRef.current;
      const zt = zoomTransformRef.current;
      const k = Math.max(zt.k, 0.06);
      const radius = CARD_W * 0.45;

      const floatFromLastCardVisual = (): FloatingBubbleLike => {
        if (!lastMap) {
          return spawnBubbleLike({
            width: size.w,
            height: size.h,
            radius,
            speedScale: 0.95,
            restitution: 0.88,
          });
        }
        let px = lastMap.x * k + zt.x;
        let py = lastMap.y * k + zt.y;
        px = Math.min(size.w - radius, Math.max(radius, px));
        py = Math.min(size.h - radius, Math.max(radius, py));
        return spawnBubbleLikeAtPanelXY({
          x: px,
          y: py,
          width: size.w,
          height: size.h,
          radius,
          speedScale: 0.95,
          restitution: 0.88,
        });
      };

      const floater = floatFromLastCardVisual();

      setDrag(null);
      setDragTargetCountryId(null);
      setDragPointerMap(null);
      setDragCardDisplay(null);
      dragCardDisplayRef.current = null;

      if (countryId) {
        const prevPlaced = placedRef.current;
        const occupied = Object.entries(prevPlaced).find(([other, cid]) => cid === countryId && other !== cardId);
        if (occupied) {
          setFloatByCard((prev) => ({
            ...prev,
            [cardId]: floater,
          }));
          return;
        }
        setPlacedByCard((prev) => ({ ...prev, [cardId]: countryId }));
        return;
      }

      setFloatByCard((prev) => ({
        ...prev,
        [cardId]: floater,
      }));
    },
    [dragTargetCountryId, size.w, size.h]
  );

  const handleCardPointerDown = (cardId: string, e: ReactPointerEvent) => {
    if (answered) return;
    e.preventDefault();
    if (placedByCard[cardId]) {
      setPlacedByCard((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
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

  /** ドラッグ中カードをポインタ＋オフセット目標へ慣性追従 */
  useEffect(() => {
    if (!drag) return;
    let frameId = 0;
    const tick = () => {
      const pt = dragPointerRef.current;
      const k = Math.max(zoomTransform.k, 0.08);
      const target = dragCardTargetFromPointer(pt.x, pt.y, k, dragCardScreenOffsetPx);
      setDragCardDisplay((prev) => {
        if (!prev) {
          dragCardDisplayRef.current = target;
          return target;
        }
        const s = dragCardSpring;
        const nx = prev.x + (target.x - prev.x) * s;
        const ny = prev.y + (target.y - prev.y) * s;
        if (
          Math.abs(nx - prev.x) < 0.03 &&
          Math.abs(ny - prev.y) < 0.03 &&
          Math.abs(target.x - prev.x) < 0.12 &&
          Math.abs(target.y - prev.y) < 0.12
        ) {
          dragCardDisplayRef.current = prev;
          return prev;
        }
        const next = { x: nx, y: ny };
        dragCardDisplayRef.current = next;
        return next;
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [drag, zoomTransform.k, dragCardScreenOffsetPx, dragCardSpring]);

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
    resetRoundForCurriculum(excludeAlphas, { bumpSeq: true });
  }, [resetRoundForCurriculum, excludeAlphas]);

  /** ズーム k が大きいほど線を細く（ユーザー座標上の太さ = base/k →画面上は nonScaling でほぼ一定） */
  const borderStrokeWidth = useMemo(() => {
    const k = Math.max(zoomTransform.k, 0.08);
    return Math.max(0.35, Math.min(1.15, 1.0 / Math.sqrt(k)));
  }, [zoomTransform.k]);

  /** ホバー／ドラッグ強調の太線（地図座標系。Canvas は /k で画面ピクセル感を揃える） */
  const hoverOutlineWidth = useMemo(() => {
    const k = Math.max(zoomTransform.k, 0.08);
    return Math.max((borderStrokeWidth * 3.6) / k, 2.6 / k);
  }, [zoomTransform.k, borderStrokeWidth]);

  const mapJudgeOverlay = useMemo(() => {
    const rm = regionModelForCanvas ?? regionModel;
    const proj = projection;
    if (!rm || !proj || !answered) return null;
    const judgedIds = Object.keys(resultByCountryId);
    if (!judgedIds.length) return null;

    return (
      <svg
        className="pointer-events-none absolute left-0 top-0 z-[9] block select-none"
        width={size.w}
        height={size.h}
        aria-hidden
      >
        <g transform={gTransform}>
          {judgedIds.map((id) => {
            const verdict = resultByCountryId[id];
            const d = rm.pathDById.get(id);
            const feat = rm.allFeatures.find((f) => String(f.id) === id);
            if (!d || !feat || !verdict) return null;
            const c = projectMainlandCentroid(proj, feat as CountryFeature);
            if (!c) return null;
            const [cx, cy] = c;

            if (verdict === "wrong") {
              return (
                <g
                  key={id}
                  transform={`translate(${cx},${cy})`}
                  className="fg-map-shake-wrap is-judge-wrong"
                >
                  <path
                    d={d}
                    transform={`translate(${-cx},${-cy})`}
                    className="fg-map-country-outline is-judge-wrong"
                    style={{
                      fill: MAP_FILL_WRONG,
                      stroke: "#ef4444",
                      strokeWidth: borderStrokeWidth * 2.8,
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      vectorEffect: "non-scaling-stroke",
                    }}
                  />
                </g>
              );
            }

            return (
              <g key={id}>
                <path
                  d={d}
                  className={`fg-map-country-outline is-judge-correct ${countryMapPathClass(id, mapPathClassOpts)}`}
                  style={{
                    fill: "none",
                    stroke: "#4ade80",
                    strokeWidth: borderStrokeWidth * 2.6,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    vectorEffect: "non-scaling-stroke",
                  }}
                />
              </g>
            );
          })}
        </g>
      </svg>
    );
  }, [
    regionModelForCanvas,
    regionModel,
    projection,
    answered,
    resultByCountryId,
    size.w,
    size.h,
    gTransform,
    mapPathClassOpts,
    borderStrokeWidth,
  ]);

  /** 正解時バーストリング（画面 px・国旗直径基準。PopPopBubbles と同系） */
  const judgeBurstRipples = useMemo(() => {
    const rm = regionModelForCanvas ?? regionModel;
    const proj = projection;
    if (!rm || !proj || !answered) return [];
    const k = zoomTransform.k;
    const { x: zx, y: zy } = zoomTransform;
    const out: { id: string; screenX: number; screenY: number }[] = [];
    for (const [id, verdict] of Object.entries(resultByCountryId)) {
      if (verdict !== "correct") continue;
      const feat = rm.allFeatures.find((f) => String(f.id) === id);
      if (!feat) continue;
      const p = projectMainlandCentroid(proj, feat as CountryFeature);
      if (!p) continue;
      out.push({ id, screenX: p[0] * k + zx, screenY: p[1] * k + zy });
    }
    return out;
  }, [
    regionModelForCanvas,
    regionModel,
    projection,
    answered,
    resultByCountryId,
    zoomTransform,
  ]);

  const hoverCountryLabel = useMemo(() => {
    if (!hoverCountryId) return null;
    const row = byCountryCode.get(hoverCountryId);
    if (!row) return locale === "ja" ? "国を選択中" : "Select a country";
    const localized = getCountryDisplayName(row["alpha-2"], locale);
    return localized ?? row.name;
  }, [hoverCountryId, byCountryCode, locale]);

  const onEnumerateVisible = useCallback(() => {
    const world = featuresForGame[displayedLod];
    if (!projection || !world?.length || size.w < 32 || size.h < 32) {
      setListedCountryLabelsJa([]);
      return;
    }
    const vp = viewportLonLatBounds(projection, size.w, size.h, zoomTransform);
    if (!vp) {
      setListedCountryLabelsJa([]);
      return;
    }
    const overlapping = featuresOverlappingViewport(world, vp);
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
  }, [projection, featuresForGame, displayedLod, size.w, size.h, zoomTransform, byCountryCode]);

  useLayoutEffect(() => {
    if (mapRenderBackend !== "svg" || !svgRef.current || !regionModel) return;

    if (pathMorphRoundSeqRef.current !== roundSeq) {
      pathMorphRoundSeqRef.current = roundSeq;
      prevPathDByIdForMorphRef.current = new Map(regionModel.pathDById);
      return;
    }

    const prev = prevPathDByIdForMorphRef.current;
    const next = regionModel.pathDById;
    if (prev.size === 0) {
      prevPathDByIdForMorphRef.current = new Map(next);
      return;
    }

    let anyPathChanged = false;
    for (const id of Array.from(next.keys())) {
      if (prev.get(id) !== next.get(id)) {
        anyPathChanged = true;
        break;
      }
    }
    if (!anyPathChanged) return;

    for (const f of regionModel.allFeatures) {
      const id = String(f.id ?? "");
      const oldD = prev.get(id);
      const newD = next.get(id);
      if (!newD || oldD === newD) continue;
      const el = svgRef.current.querySelector(`path[data-fg-cid="${id}"]`);
      if (!(el instanceof SVGPathElement) || !oldD) continue;
      el.setAttribute("d", oldD);
      try {
        const gen = interpolate(oldD, newD, { maxSegmentLength: 4 });
        select(el).interrupt().transition().duration(420).ease(easeCubicOut).attrTween("d", () => gen);
      } catch {
        select(el).attr("d", newD);
      }
    }
    prevPathDByIdForMorphRef.current = new Map(next);
  }, [regionModel, roundSeq, mapRenderBackend]);

  const recordCanvasDrawFrame = useCallback(() => {
    const a = canvasFpsAccumRef.current;
    const now = performance.now();
    if (!a.t0) a.t0 = now;
    a.frames++;
    if (now - a.t0 >= 650) {
      const sec = (now - a.t0) / 1000;
      setCanvasMapFps(Math.round(a.frames / sec));
      a.frames = 0;
      a.t0 = now;
    }
  }, []);

  /** Canvas: 常時 rAF で描画し、ズームバー操作や d3 トランジション中もフレームを落とさない */
  useEffect(() => {
    if (mapRenderBackend !== "canvas") return;
    const probeMount = stageRef.current;
    if (!probeMount) return;

    let cancelled = false;
    let rafId = 0;

    const tick = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const snap = canvasDrawSnapshotRef.current;
      if (!canvas || !snap?.projection || !snap.rm) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const sea = resolveCssColorForCanvas(MAP_SEA_FILL, probeMount);
      const border = resolveCssColorForCanvas(MAP_BORDER_STROKE, probeMount);
      const hoverS = resolveCssColorForCanvas(MAP_HOVER_STROKE, probeMount);
      const dragS = resolveCssColorForCanvas(MAP_DRAG_STROKE, probeMount);
      const fillResolvedCache = new Map<string, string>();
      const fillForId = (id: string) => {
        const css = snap.countryFill(id);
        let r = fillResolvedCache.get(css);
        if (!r) {
          r = resolveCssColorForCanvas(css, probeMount);
          fillResolvedCache.set(css, r);
        }
        return r;
      };

      drawRegionMapCanvas({
        ctx,
        logicalW: snap.logicalW,
        logicalH: snap.logicalH,
        dpr: snap.dpr,
        projection: snap.projection,
        features: snap.rm.allFeatures,
        zoom: snap.zoomTransform,
        fillForId,
        seaFillResolved: sea,
        borderStrokeResolved: border,
        borderStrokeWidth: snap.borderStrokeWidth,
        hoverStrokeResolved: hoverS,
        hoverLineWidth: snap.hoverOutlineWidth,
        dragTargetStrokeResolved: dragS,
        hoverCountryId: snap.hoverCountryId,
        dragTargetCountryId: snap.dragTargetCountryId,
        drag: snap.drag,
        onDrawComplete: recordCanvasDrawFrame,
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    mapRenderBackend,
    regionModelForCanvas,
    projection,
    size.w,
    size.h,
    devicePixelRatioState,
    recordCanvasDrawFrame,
  ]);

  useEffect(() => {
    if (mapRenderBackend !== "canvas") {
      setCanvasMapFps(null);
      canvasFpsAccumRef.current = { frames: 0, t0: 0 };
    }
  }, [mapRenderBackend]);

  useEffect(() => {
    if (!onDebugPanelPropsChange) return;
    if (!isDevTj) {
      onDebugPanelPropsChange(null);
      return;
    }
    onDebugPanelPropsChange({
      isDebugMode,
      setIsDebugMode,
      isDebugPanelExpanded,
      setIsDebugPanelExpanded,
      dragCardScreenOffsetPx,
      setDragCardScreenOffsetPx,
      dragCardSpring,
      setDragCardSpring,
      onEnumerateVisible,
      listedCountryLabelsJa,
      mapDebugSnippet: mapDebugCenterScale?.snippet ?? null,
      centerLonLatText: mapDebugCenterScale?.centerLonLatText ?? null,
      scaleText: mapDebugCenterScale?.scaleText ?? null,
      lodThresholdLow,
      setLodThresholdLow,
      lodThresholdHigh,
      setLodThresholdHigh,
      lodMetric,
      displayedLod,
      desiredLod,
      loadingHighDetail,
      mapRenderBackend,
      setMapRenderBackend,
      canvasMapFps,
      canvasPaintLod,
      canvasMapInteracting,
    });
    return () => onDebugPanelPropsChange(null);
  }, [
    onDebugPanelPropsChange,
    isDevTj,
    isDebugMode,
    isDebugPanelExpanded,
    dragCardScreenOffsetPx,
    dragCardSpring,
    listedCountryLabelsJa,
    mapDebugCenterScale,
    onEnumerateVisible,
    lodThresholdLow,
    lodThresholdHigh,
    lodMetric,
    displayedLod,
    desiredLod,
    loadingHighDetail,
    mapRenderBackend,
    canvasMapFps,
    canvasPaintLod,
    canvasMapInteracting,
  ]);

  canvasDrawSnapshotRef.current = {
    logicalW: size.w,
    logicalH: size.h,
    dpr: devicePixelRatioState,
    projection,
    rm: regionModelForCanvas,
    zoomTransform,
    borderStrokeWidth,
    hoverOutlineWidth,
    hoverCountryId,
    dragTargetCountryId,
    drag: !!drag,
    countryFill,
  };

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
      <div className="pointer-events-none absolute left-2 top-2 z-30 flex flex-col items-start gap-1.5 md:left-3 md:top-3">
        <div
          className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-bg))] p-1.5 shadow-sm"
          role="group"
          aria-label="学習レベル"
        >
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            学習 Lv
          </span>
          <div className="flex gap-1">
            {([1, 2] as const).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => setCurriculumLevel(lv)}
                aria-pressed={curriculumLevel === lv}
                className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                  curriculumLevel === lv
                    ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                    : "text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]"
                }`}
              >
                {lv}
              </button>
            ))}
          </div>
          <p className="max-w-[11rem] px-1 text-[10px] leading-snug text-[var(--color-muted)]">
            {curriculumStage.nameJa}
            <span className="tabular-nums"> · {curriculumPool.length}国</span>
          </p>
        </div>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 z-30 flex flex-col items-end gap-2 md:right-3 md:top-3">
        {!answered ? (
          <button
            type="button"
            disabled={Object.keys(placedByCard).length === 0}
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
              if (canvasRefineTimerRef.current) {
                clearTimeout(canvasRefineTimerRef.current);
                canvasRefineTimerRef.current = null;
              }
              setCanvasMapInteracting(true);
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
                endSliderMapInteraction();
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
              window.addEventListener("pointercancel", onUp);
            }}
          >
            <div
              className="pointer-events-none absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-white/80 bg-[var(--color-primary)] shadow"
              style={{ top: `${(1 - zoomKToRatio(zoomTransform.k)) * 100}%`, transform: "translate(-50%, -50%)" }}
            />
          </div>
          <button
            type="button"
            className="grid h-6 w-6 place-items-center rounded-md border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] text-sm font-bold text-[var(--color-text)] transition hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]"
            onClick={() => zoomByFactor(1 / ZOOM_STEP)}
            aria-label="ズームアウト"
          >
            -
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center">
        <div className="relative mx-auto min-h-0 w-full max-w-full flex-1" style={{ width: size.w, height: size.h }}>
          <div
            ref={zoomHostRef}
            className={`relative touch-none ${answered && !drag ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}`}
            style={{ width: size.w, height: size.h }}
          >
            {mapRenderBackend === "svg" ? (
              <svg
                ref={svgRef}
                width={size.w}
                height={size.h}
                className="block select-none"
                role="img"
                aria-label="地域マップ"
                onPointerMove={handleMapPointerMove}
                onPointerLeave={handleMapLeave}
              >
                <rect width={size.w} height={size.h} style={{ fill: MAP_SEA_FILL }} />
                <g transform={gTransform}>
                  {regionModel.allFeatures.map((f) => {
                    const id = String(f.id ?? "");
                    const d = regionModel.pathDById.get(id);
                    if (!d) return null;
                    const emphasisDrag = drag && dragTargetCountryId === id;
                    const emphasisHover = !drag && hoverCountryId === id;
                    const emphasis = emphasisDrag || emphasisHover;
                    return (
                      <path
                        key={id}
                        data-fg-cid={id}
                        d={d}
                        className={countryMapPathClass(id, mapPathClassOpts)}
                        style={{
                          fill: countryFill(id),
                          stroke: emphasisDrag ? MAP_DRAG_STROKE : emphasisHover ? MAP_HOVER_STROKE : MAP_BORDER_STROKE,
                          strokeWidth: emphasis ? borderStrokeWidth * 3.6 : borderStrokeWidth,
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                          vectorEffect: "non-scaling-stroke",
                        }}
                      />
                    );
                  })}
                </g>
              </svg>
            ) : (
              <canvas
                ref={canvasRef}
                width={Math.max(1, Math.round(size.w * devicePixelRatioState))}
                height={Math.max(1, Math.round(size.h * devicePixelRatioState))}
                className="block select-none"
                role="img"
                aria-label="地域マップ"
                style={{ width: size.w, height: size.h }}
                onPointerMove={handleMapPointerMove}
                onPointerLeave={handleMapLeave}
              />
            )}

            {mapJudgeOverlay}

            {judgeBurstRipples.map((r) => (
              <FlagGuesserPopBurstRipple
                key={`burst-${r.id}-${roundSeq}`}
                screenX={r.screenX}
                screenY={r.screenY}
                flagRadiusPx={CARD_DIAM / 2}
              />
            ))}

            {loadingHighDetail && (
              <div className="pointer-events-none absolute bottom-1 left-1 z-[11] rounded border border-[color-mix(in_srgb,var(--color-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] px-1.5 py-0.5 text-[9px] text-[var(--color-muted)] backdrop-blur-sm">
                高精細データ読み込み中…
              </div>
            )}

            {isDevTj && isDebugMode && mapDebugCenterScale && (
              <div className="pointer-events-none absolute right-1 top-1 z-10 max-w-[min(100%,18rem)] rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] px-1.5 py-1 font-mono text-[9px] leading-tight text-[var(--color-text)] backdrop-blur-sm">
                <div>Center (lon, lat): {mapDebugCenterScale.centerLonLatText}</div>
                <div>Scale: {mapDebugCenterScale.scaleText}</div>
                <div className="mt-0.5 break-all text-[8px] text-[var(--color-muted)]">{mapDebugCenterScale.snippet}</div>
              </div>
            )}

            {/* 全面を pointer-events:auto にしない（SVG のホバー検出が届かなくなる）。国旗ボタンのみ auto */}
            <div className="pointer-events-none absolute inset-0">
              <div
                className="absolute left-0 top-0"
                style={{
                  ...overlayParentTransform,
                  width: size.w,
                  height: size.h,
                  pointerEvents: "none",
                }}
              >
                {!drag && !answered && mapHoverCrossMap && (() => {
                  const k = Math.max(zoomTransform.k, 0.08);
                  const px = mapHoverCrossMap.x;
                  const py = mapHoverCrossMap.y;
                  const unit = mapUnitsPerScreenPx(k);
                  const gap = unit;
                  const arm = 14 * unit;
                  const onLand = hoverCountryId !== null;
                  const stroke = onLand ? "var(--color-primary)" : "rgba(42,42,48,0.92)";
                  const sw = onLand ? 1.65 : 1.05;
                  return (
                    <svg
                      className="pointer-events-none absolute left-0 top-0 z-[38] overflow-visible"
                      width={size.w}
                      height={size.h}
                      aria-hidden
                    >
                      <g transform={`translate(${px},${py})`}>
                        <line
                          x1={-(gap + arm)}
                          y1={0}
                          x2={-gap}
                          y2={0}
                          stroke={stroke}
                          strokeWidth={sw}
                          vectorEffect="non-scaling-stroke"
                        />
                        <line
                          x1={gap}
                          y1={0}
                          x2={gap + arm}
                          y2={0}
                          stroke={stroke}
                          strokeWidth={sw}
                          vectorEffect="non-scaling-stroke"
                        />
                        <line
                          x1={0}
                          y1={-(gap + arm)}
                          x2={0}
                          y2={-gap}
                          stroke={stroke}
                          strokeWidth={sw}
                          vectorEffect="non-scaling-stroke"
                        />
                        <line
                          x1={0}
                          y1={gap}
                          x2={0}
                          y2={gap + arm}
                          stroke={stroke}
                          strokeWidth={sw}
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    </svg>
                  );
                })()}

                {projection &&
                  cards.map((c) => {
                    const cid = placedByCard[c.id];
                    if (!cid || drag?.cardId === c.id) return null;
                    const feat = regionModel.allFeatures.find((f) => String(f.id) === cid);
                    if (!feat) return null;
                    const p = projectMainlandCentroid(projection, feat as CountryFeature);
                    if (!p) return null;
                    return (
                      <button
                        key={`stuck-${c.id}`}
                        type="button"
                        className={`fg-flag-card pointer-events-auto absolute z-20 flex cursor-default items-center justify-center overflow-hidden rounded-md border-2 border-white/40 bg-white/10 p-1 shadow-md backdrop-blur-sm ${!answered ? "is-judging" : ""}`}
                        style={{
                          left: p[0],
                          top: p[1],
                          width: CARD_W,
                          height: CARD_H,
                          transform: `translate(-50%, -50%) scale(${flagVisualScale})`,
                        }}
                        onPointerDown={(e) => handleCardPointerDown(c.id, e)}
                        aria-label="国旗を戻す"
                      >
                        <Image
                          src={flagUrlForAlpha2(c.alpha2)}
                          alt=""
                          width={CARD_W}
                          height={CARD_H}
                          className="pointer-events-none max-h-full max-w-full object-contain"
                          draggable={false}
                          unoptimized
                        />
                      </button>
                    );
                  })}

                {drag &&
                  dragPointerMap &&
                  dragCardDisplay &&
                  (() => {
                    const c = cards.find((x) => x.id === drag.cardId);
                    if (!c) return null;
                    const k = Math.max(zoomTransform.k, 0.08);
                    const px = dragPointerMap.x;
                    const py = dragPointerMap.y;
                    const cx = dragCardDisplay.x;
                    const cy = dragCardDisplay.y;
                    const cardR = (CARD_DIAM / 2) * flagVisualScale;
                    const [tx, ty] = circleEdgeNearestPointer(px, py, cx, cy, cardR);
                    const inCountry = dragTargetCountryId !== null;
                    const unit = mapUnitsPerScreenPx(k);
                    const gap = unit;
                    const arm = 14 * unit;
                    const crossStroke = inCountry ? "var(--color-primary)" : "rgba(42,42,48,0.92)";
                    const crossW = inCountry ? 1.65 : 1.05;
                    const connStroke = inCountry ? 2.2 : 1.2;
                    return (
                      <>
                        <svg
                          className="pointer-events-none absolute left-0 top-0 z-[38] overflow-visible"
                          width={size.w}
                          height={size.h}
                          aria-hidden
                        >
                          <path
                            d={dragConnectorPathD(px, py, tx, ty)}
                            fill="none"
                            stroke="rgba(100,100,108,0.42)"
                            strokeWidth={connStroke}
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                          <g transform={`translate(${px},${py})`}>
                            <line
                              x1={-(gap + arm)}
                              y1={0}
                              x2={-gap}
                              y2={0}
                              stroke={crossStroke}
                              strokeWidth={crossW}
                              vectorEffect="non-scaling-stroke"
                            />
                            <line
                              x1={gap}
                              y1={0}
                              x2={gap + arm}
                              y2={0}
                              stroke={crossStroke}
                              strokeWidth={crossW}
                              vectorEffect="non-scaling-stroke"
                            />
                            <line
                              x1={0}
                              y1={-(gap + arm)}
                              x2={0}
                              y2={-gap}
                              stroke={crossStroke}
                              strokeWidth={crossW}
                              vectorEffect="non-scaling-stroke"
                            />
                            <line
                              x1={0}
                              y1={gap}
                              x2={0}
                              y2={gap + arm}
                              stroke={crossStroke}
                              strokeWidth={crossW}
                              vectorEffect="non-scaling-stroke"
                            />
                          </g>
                        </svg>
                        <div
                          className="pointer-events-none absolute z-40 flex items-center justify-center overflow-hidden rounded-full border-2 border-[var(--color-primary)] bg-white/90 shadow-xl"
                          style={{
                            left: cx,
                            top: cy,
                            width: CARD_DIAM,
                            height: CARD_DIAM,
                            transform: `translate(-50%, -50%) scale(${flagVisualScale})`,
                          }}
                        >
                          <Image
                            src={flagUrlForAlpha2(c.alpha2)}
                            alt=""
                            width={CARD_W}
                            height={CARD_H}
                            className="max-h-full max-w-full object-contain"
                            draggable={false}
                            unoptimized
                          />
                        </div>
                      </>
                    );
                  })()}

              </div>
            </div>

            {isDevTj && isDebugMode && listedCountryLabelsJa.length > 0 && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[5] border-t border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-2 py-1.5 text-[10px] leading-snug text-[var(--color-text)] backdrop-blur-sm">
                <span className="font-semibold text-[var(--color-muted)]">ビューポート候補: </span>
                {listedCountryLabelsJa.join(" · ")}
              </div>
            )}
          </div>

          {!answered ? (
            <div className="pointer-events-none absolute inset-0 z-[22] overflow-visible">
              {cards.map((c) => {
                if (placedByCard[c.id] || drag?.cardId === c.id) return null;
                const fl = floatByCard[c.id];
                if (!fl) return null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="pointer-events-auto absolute z-20 flex cursor-default items-center justify-center overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--color-text)_15%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] p-1 shadow-md"
                    style={{
                      left: fl.x,
                      top: fl.y,
                      width: CARD_W,
                      height: CARD_H,
                      transform: "translate(-50%, -50%)",
                    }}
                    onPointerDown={(e) => handleCardPointerDown(c.id, e)}
                  >
                    <Image
                      src={flagUrlForAlpha2(c.alpha2)}
                      alt=""
                      width={CARD_W}
                      height={CARD_H}
                      className="pointer-events-none max-h-full max-w-full object-contain"
                      draggable={false}
                      unoptimized
                    />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {hoverCountryId && projection && !drag && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-10 rounded-lg bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] px-2 py-1 text-center text-[11px] text-[var(--color-text)] backdrop-blur-sm md:text-xs">
          {hoverCountryLabel ?? (locale === "ja" ? "国を選択中" : "Select a country")}
        </div>
      )}
    </div>
  );
}
