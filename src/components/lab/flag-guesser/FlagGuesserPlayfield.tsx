"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

/**
 * Explorer の国詳細オーバーレイは i18n-iso-countries / framer-motion 等の依存が大きいので、
 * 正誤判定後に初めて開いたタイミングで遅延ロードする。
 * 副次効果として、フラッグゲッサーページ初期チャンクの hash が安定し、
 * Pages CDN 上の壊れたアセットを参照し続ける事故を避けやすい。
 */
const ExplorerCountryDetailOverlay = dynamic(
  () =>
    import("@/components/lab/flag-guesser/ExplorerCountryDetailOverlay").then(
      (m) => m.ExplorerCountryDetailOverlay
    ),
  { ssr: false }
);
import {
  startTransition,
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
import {
  computeFlagBubbleLayout,
  DEFAULT_FLAG_BUBBLE_SEARCH_TUNING,
  flagBubbleHitTestSampleCount,
  flagBubbleSearchCandidateCount,
  flagCardEdgeTowardAnchor,
  refreshFlagLayoutForViewport,
  type FlagBubbleLayout,
  type FlagBubbleSearchTuning,
} from "@/lib/flag-guesser/flagBubblePlacement";
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
import type { FlagGuesserCurriculumMeta } from "@/components/lab/flag-guesser/FlagGuesserGradePicker";
import {
  zoomPlainToFitPoolWidth,
  type ExplorerMapPresetView,
  type ExplorerMapPresetsFile,
  zoomPlainFromCenterLonLatK,
} from "@/lib/flag-guesser/explorerMapPresets";
import type { FlagDifficultyJsonRow } from "@/lib/flag-guesser/flagExplorerDataset";
import {
  clampBubbleToFloatRect,
  flagFloatRectFromStageElement,
  insetFlagFloatRect,
  intersectFlagFloatRects,
  spawnBubbleLike,
  spawnBubbleLikeAtPanelXY,
  stepBubbleLikeInRect,
  type FlagFloatRect,
  type FloatingBubbleLike,
} from "@/lib/flag-guesser/floatingFlagPhysics";
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
/**
 * プール外で文脈用に背面描画する陸（より淡く、世界地図の連続性を補う）。
 * インタラクション対象ではないので、ホバー／ドラッグ／判定の色や輪郭は付かない。
 */
const MAP_LAND_CONTEXT_QUIET = "color-mix(in srgb, var(--color-muted) 6%, transparent)";
const MAP_BORDER_CONTEXT_STROKE = "color-mix(in srgb, var(--color-text) 14%, transparent)";
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
/** 浮遊国旗の translate(-50%) 付き矩形の半幅・半高（壁反射に使用） */
const FLOAT_HALF_W = CARD_W / 2;
const FLOAT_HALF_H = CARD_H / 2;
/** 盤面 px 幅ではなく viewport 幅でモバイル判定（列 max 520px の PC では false） */
const MOBILE_VIEWPORT_MAX_PX = 539;
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 80;
const ZOOM_STEP = 1.3;

const DEFAULT_DRAG_CARD_SCREEN_OFFSET_PX = 80;
const DEFAULT_DRAG_CARD_SPRING = 0.22;
/** 国旗面積 / 最大陸塊面積 がこの % 以上で吹き出し */
const DEFAULT_FLAG_BUBBLE_AREA_THRESHOLD_PCT = 80;
const DEFAULT_FLAG_BUBBLE_DIRECTION_COUNT = DEFAULT_FLAG_BUBBLE_SEARCH_TUNING.directionCount;
const DEFAULT_FLAG_BUBBLE_SAMPLE_COLS = DEFAULT_FLAG_BUBBLE_SEARCH_TUNING.sampleCols;
const DEFAULT_FLAG_BUBBLE_SAMPLE_ROWS = DEFAULT_FLAG_BUBBLE_SEARCH_TUNING.sampleRows;
const DEFAULT_FLAG_BUBBLE_DISTANCE_STEPS = DEFAULT_FLAG_BUBBLE_SEARCH_TUNING.distanceStepCount;

type DragState = {
  cardId: string;
};

/**
 * 「ここにはない」ドロップゾーンの特殊 placeId。
 * `placedByCard[cardId] === NOT_ON_MAP_ID` のとき複数カードが同時に吸着できる
 * （通常の country-code とは異なり一意化しない）。
 */
const NOT_ON_MAP_ID = "__not_on_map__";

/** 「ここにはない」ゾーンの楕円半径（地図領域の screen 座標, 投影空間 = ズーム=identity 時の screen と一致） */
const NOT_ON_MAP_ZONE_RX = 72;
const NOT_ON_MAP_ZONE_RY = 50;
const NOT_ON_MAP_ZONE_MARGIN = 10;
/** 角の判定で「他の国の重心と被らない」とみなす最小距離（地図短辺に対する比） */
const NOT_ON_MAP_ZONE_MIN_CENTROID_DIST_RATIO = 0.18;
/** 重心採用の最小面積（小さすぎる島嶼を除外） */
const NOT_ON_MAP_ZONE_FEATURE_MIN_AREA = 60;

type NotOnMapCorner = "TL" | "BL" | "BR" | "TR";

type NotOnMapZoneInfo = {
  corner: NotOnMapCorner;
  /** 地図領域の左上を原点とした座標（投影空間 = ズーム=identity 時の screen と同じ単位） */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

/** 「ここにはない」ゾーンの内向き角度（カードが伸びる中心方向） */
const NOT_ON_MAP_INWARD_ANGLE: Record<NotOnMapCorner, number> = {
  TL: Math.PI / 4,
  BL: -Math.PI / 4,
  BR: -3 * Math.PI / 4,
  TR: 3 * Math.PI / 4,
};

/**
 * ゾーン内に吸着済みカードを並べる位置。線の方角と長さを均等にずらして重なりを避ける。
 */
function notOnMapBubbleLayoutFor(
  zone: NotOnMapZoneInfo,
  cardIndex: number,
  totalCards: number,
  cardW: number
): FlagBubbleLayout {
  const inward = NOT_ON_MAP_INWARD_ANGLE[zone.corner];
  const arcHalf = Math.PI / 3;
  const step =
    totalCards > 1 ? (2 * arcHalf) / (totalCards - 1) : 0;
  const offset =
    totalCards > 1 ? -arcHalf + step * cardIndex : 0;
  const angle = inward + offset;
  const baseDist = Math.max(zone.rx, zone.ry) + cardW * 0.85;
  const stagger = (cardIndex % 2) * 14;
  const distance = baseDist + stagger;
  return {
    anchorX: zone.cx,
    anchorY: zone.cy,
    flagX: zone.cx + Math.cos(angle) * distance,
    flagY: zone.cy + Math.sin(angle) * distance,
    useBubble: true,
    areaRatioPercent: 100,
    placementOffsetX: 0,
    placementOffsetY: 0,
  };
}

/** screen 座標 (sx, sy) が楕円ゾーン内かを判定 */
function isPointInNotOnMapZone(sx: number, sy: number, zone: NotOnMapZoneInfo): boolean {
  const dx = (sx - zone.cx) / zone.rx;
  const dy = (sy - zone.cy) / zone.ry;
  return dx * dx + dy * dy <= 1;
}

function mapUnitsPerScreenPx(zoomK: number): number {
  return 1 / Math.max(zoomK, 0.08);
}

/** ズーム親 `scale(k)` 内の SVG で、画面上のストローク太さを k=1 相当に保つ */
function mapOverlayStrokeWidth(baseScreenPx: number, zoomK: number): number {
  return baseScreenPx / Math.max(zoomK, 0.08);
}

const MAP_CROSS_GAP_SCREEN_PX = 1;
const MAP_CROSS_ARM_SCREEN_PX = 14;
const MAP_CROSS_STROKE_LAND_PX = 1.65;
const MAP_CROSS_STROKE_SEA_PX = 1.05;
const MAP_CONNECTOR_STROKE_PX = 2.2;
const MAP_CONNECTOR_STROKE_DRAG_SEA_PX = 1.2;

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
  curriculumLevel: FlagGuesserCurriculumLevel;
  onCurriculumMetaChange?: (meta: FlagGuesserCurriculumMeta) => void;
  /** devtj デバッグパネルをラボシェルのサイドバーに出すときに渡す */
  onDebugPanelPropsChange?: (props: FlagGuesserDebugPanelProps | null) => void;
};

export function FlagGuesserPlayfield({
  curriculumLevel,
  onCurriculumMetaChange,
  onDebugPanelPropsChange,
}: FlagGuesserPlayfieldProps) {
  const [explorerOverlayAlpha2, setExplorerOverlayAlpha2] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const { locale } = useI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomHostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [floatRect, setFloatRect] = useState<FlagFloatRect>({
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  });
  const floatRectRef = useRef(floatRect);
  floatRectRef.current = floatRect;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isoRows, setIsoRows] = useState<Iso3166Row[]>([]);
  const [diffRows, setDiffRows] = useState<FlagDifficultyJsonRow[] | null>(null);
  const [explorerMapPresets, setExplorerMapPresets] = useState<Record<
    string,
    ExplorerMapPresetView
  > | null>(null);
  const curriculumLevelRef = useRef<FlagGuesserCurriculumLevel>(curriculumLevel);
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
  const lastMapViewResetKeyRef = useRef<string | null>(null);
  const [devicePixelRatioState, setDevicePixelRatioState] = useState(1);
  const [listedCountryLabelsJa, setListedCountryLabelsJa] = useState<string[]>([]);
  const [canvasMapFps, setCanvasMapFps] = useState<number | null>(null);
  const canvasFpsAccumRef = useRef({ frames: 0, t0: 0 });
  const canvasDrawSnapshotRef = useRef<CanvasDrawSnapshot | null>(null);

  const [roundSeq, setRoundSeq] = useState(0);
  const [roundPlan, setRoundPlan] = useState<RoundPlan | null>(null);
  const [excludeAlphas, setExcludeAlphas] = useState<Set<string>>(new Set());

  const [placedByCard, setPlacedByCard] = useState<Record<string, string>>({});
  const [placedLayoutByCard, setPlacedLayoutByCard] = useState<Record<string, FlagBubbleLayout>>({});
  const placedLayoutRef = useRef(placedLayoutByCard);
  placedLayoutRef.current = placedLayoutByCard;
  const [flagBubbleAreaThresholdPct, setFlagBubbleAreaThresholdPct] = useState(
    DEFAULT_FLAG_BUBBLE_AREA_THRESHOLD_PCT
  );
  const [flagBubbleDirectionCount, setFlagBubbleDirectionCount] = useState(
    DEFAULT_FLAG_BUBBLE_DIRECTION_COUNT
  );
  const [flagBubbleSampleCols, setFlagBubbleSampleCols] = useState(DEFAULT_FLAG_BUBBLE_SAMPLE_COLS);
  const [flagBubbleSampleRows, setFlagBubbleSampleRows] = useState(DEFAULT_FLAG_BUBBLE_SAMPLE_ROWS);
  const [flagBubbleDistanceSteps, setFlagBubbleDistanceSteps] = useState(
    DEFAULT_FLAG_BUBBLE_DISTANCE_STEPS
  );
  const flagBubbleSearchTuning = useMemo<FlagBubbleSearchTuning>(
    () => ({
      directionCount: flagBubbleDirectionCount,
      sampleCols: flagBubbleSampleCols,
      sampleRows: flagBubbleSampleRows,
      distanceStepCount: flagBubbleDistanceSteps,
    }),
    [
      flagBubbleDirectionCount,
      flagBubbleSampleCols,
      flagBubbleSampleRows,
      flagBubbleDistanceSteps,
    ]
  );
  /** 吹き出し確定時に pop アニメを再トリガーする */
  const [placedLayoutAnimKeyByCard, setPlacedLayoutAnimKeyByCard] = useState<Record<string, number>>(
    {}
  );
  const placedRef = useRef(placedByCard);
  placedRef.current = placedByCard;
  const placedByCardForLayoutRef = useRef(placedByCard);
  placedByCardForLayoutRef.current = placedByCard;

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
  /** 正誤判定後のマップホバー用（カーソル付近に国旗＋国名） */
  const [judgmentHoverScreenPos, setJudgmentHoverScreenPos] = useState<{ x: number; y: number } | null>(
    null
  );
  /** 出題中・マップ上で十字を描くためのポインタ位置（地図座標） */
  const [mapHoverCrossMap, setMapHoverCrossMap] = useState<{ x: number; y: number } | null>(null);
  const [dragTargetCountryId, setDragTargetCountryId] = useState<string | null>(null);
  /** ドラッグカードとポインタのオフセット（画面上の斜め方向の長さ・px） */
  const [dragCardScreenOffsetPx, setDragCardScreenOffsetPx] = useState(DEFAULT_DRAG_CARD_SCREEN_OFFSET_PX);
  /** ドラッグカードの慣性追従（毎フレームの補間率） */
  const [dragCardSpring, setDragCardSpring] = useState(DEFAULT_DRAG_CARD_SPRING);
  const [answered, setAnswered] = useState(false);
  const [resultByCountryId, setResultByCountryId] = useState<Record<string, "correct" | "wrong">>({});
  /** 「ここにはない」へドロップしたカードの正誤（cardId 別） */
  const [resultByNotOnMapCardId, setResultByNotOnMapCardId] = useState<
    Record<string, "correct" | "wrong">
  >({});
  /** 現在のドラッグが「ここにはない」ゾーンの真上にあるか */
  const [dragOverNotOnMap, setDragOverNotOnMap] = useState(false);

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
  /** お邪魔のあるグレード（3 以降）のみ「ここにはない」ゾーンを出す */
  const notOnMapEnabled = curriculumStage.decoyCount >= 1;

  useEffect(() => {
    onCurriculumMetaChange?.({
      poolLength: curriculumPool.length,
      stageNameJa: curriculumStage.nameJa,
      decoyCount: curriculumStage.decoyCount,
    });
  }, [
    onCurriculumMetaChange,
    curriculumPool.length,
    curriculumStage.nameJa,
    curriculumStage.decoyCount,
  ]);

  const regionModel = useMemo<RegionRoundModel | null>(() => {
    if (!roundPlan || size.w < 32 || size.h < 32) return null;
    const world = featuresForGame[displayedLod];
    if (!world?.length) return null;
    /**
     * 文脈用 (context) 国は常に最低 LOD (110m) を使い、in-pool より頂点数を
     * 大幅に減らす（段階1: ① context LOD 固定）。視認上は muted 色なので荒くて OK。
     * 110m がまだロード前なら現在 LOD にフォールバックする。
     */
    const contextWorld = featuresForGame["110"] ?? world;
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
                contextWorldFeatures: contextWorld,
                width: size.w,
                height: size.h,
              })
            : buildRegionRoundModel({
                target: roundPlan.targetRow,
                region: roundPlan.targetRow.region!,
                allFeatures: world,
                contextWorldFeatures: contextWorld,
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
          contextWorldFeatures: contextWorld,
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
        contextWorldFeatures: contextWorld,
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
    const contextWorld = featuresForGame["110"] ?? world;
    const mapCodes = roundPlan.mapCountryCodes;
    try {
      if (mapCodes?.size && mapCodes.size > 0) {
        return buildCurriculumMapRoundModelSameProjection({
          target: roundPlan.targetRow,
          countryCodes: mapCodes,
          projection: regionModel.projection,
          filteredWorldFeatures: world,
          contextWorldFeatures: contextWorld,
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
        contextWorldFeatures: contextWorld,
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

  /**
   * 「ここにはない」ゾーンの配置 corner を選ぶ。
   * - 左上 → 左下 → 右下 → 右上 の順に探索
   * - 国ポリゴン重心と一定距離以上離れていれば採用
   * - 全部不適なら左上に固定
   */
  const notOnMapZone = useMemo<NotOnMapZoneInfo | null>(() => {
    if (!notOnMapEnabled) return null;
    if (!regionModel?.projection || !regionModel.allFeatures?.length) return null;
    if (size.w < 220 || size.h < 220) return null;

    const rx = NOT_ON_MAP_ZONE_RX;
    const ry = NOT_ON_MAP_ZONE_RY;
    const m = NOT_ON_MAP_ZONE_MARGIN;
    const corners: Array<{ key: NotOnMapCorner; cx: number; cy: number }> = [
      { key: "TL", cx: rx + m, cy: ry + m },
      { key: "BL", cx: rx + m, cy: size.h - ry - m },
      { key: "BR", cx: size.w - rx - m, cy: size.h - ry - m },
      { key: "TR", cx: size.w - rx - m, cy: ry + m },
    ];

    const path = geoPath(regionModel.projection);
    const centroids: Array<[number, number]> = [];
    for (const f of regionModel.allFeatures) {
      try {
        const c = path.centroid(f as Parameters<typeof path.centroid>[0]);
        const a = Math.abs(path.area(f as Parameters<typeof path.area>[0]));
        if (Number.isFinite(c[0]) && Number.isFinite(c[1]) && a >= NOT_ON_MAP_ZONE_FEATURE_MIN_AREA) {
          centroids.push([c[0], c[1]]);
        }
      } catch {
        /* skip */
      }
    }

    const minDist = Math.min(size.w, size.h) * NOT_ON_MAP_ZONE_MIN_CENTROID_DIST_RATIO;

    for (const corner of corners) {
      let nearest = Infinity;
      for (const [cx, cy] of centroids) {
        const dx = corner.cx - cx;
        const dy = corner.cy - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearest) nearest = d;
        if (nearest < minDist) break;
      }
      if (nearest >= minDist) {
        return { corner: corner.key, cx: corner.cx, cy: corner.cy, rx, ry };
      }
    }
    return { corner: "TL", cx: corners[0]!.cx, cy: corners[0]!.cy, rx, ry };
  }, [notOnMapEnabled, regionModel, size.w, size.h]);

  const cards: PlayCard[] = useMemo(() => {
    if (!roundPlan) return [];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const a2 of roundPlan.cardAlpha2s) {
      const u = a2.trim().toUpperCase();
      if (!u || seen.has(u)) continue;
      seen.add(u);
      unique.push(u);
    }
    return unique.map((a2, i) => ({
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

  const applySliderRatioFromClientX = useCallback(
    (track: HTMLElement, clientX: number, smooth: boolean) => {
      const rect = track.getBoundingClientRect();
      const raw = (clientX - rect.left) / Math.max(rect.width, 1);
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

  const bindZoomSliderPointer = useCallback(
    (
      track: HTMLElement,
      pickRatio: (track: HTMLElement, clientX: number, clientY: number, smooth: boolean) => void,
      ev: ReactPointerEvent<HTMLElement>
    ) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (canvasRefineTimerRef.current) {
        clearTimeout(canvasRefineTimerRef.current);
        canvasRefineTimerRef.current = null;
      }
      setCanvasMapInteracting(true);
      const startX = ev.clientX;
      const startY = ev.clientY;
      let moved = false;
      const onMove = (moveEv: PointerEvent) => {
        if (Math.abs(moveEv.clientX - startX) > 3 || Math.abs(moveEv.clientY - startY) > 3) moved = true;
        pickRatio(track, moveEv.clientX, moveEv.clientY, false);
      };
      const onUp = (upEv: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (!moved) pickRatio(track, upEv.clientX, upEv.clientY, true);
        endSliderMapInteraction();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [endSliderMapInteraction]
  );

  const pickZoomFromVerticalSlider = useCallback(
    (track: HTMLElement, _clientX: number, clientY: number, smooth: boolean) => {
      applySliderRatioFromClientY(track, clientY, smooth);
    },
    [applySliderRatioFromClientY]
  );

  const pickZoomFromHorizontalSlider = useCallback(
    (track: HTMLElement, clientX: number, _clientY: number, smooth: boolean) => {
      applySliderRatioFromClientX(track, clientX, smooth);
    },
    [applySliderRatioFromClientX]
  );

  const zoomLevelLabel =
    zoomTransform.k < 10 ? zoomTransform.k.toFixed(2) : zoomTransform.k.toFixed(1);
  const zoomSliderRatio = zoomKToRatio(zoomTransform.k);
  const zoomSliderAriaNow = Math.round(zoomSliderRatio * 100);

  /**
   * Explorer 地図タブと同じ reset キー。プリセット JSON の非同期ロード完了後にも
   * 再適用できるよう roundSeq だけでガードしない（以前は fit が先に走り k がずれていた）。
   */
  const mapViewResetKey = useMemo(() => {
    if (!roundPlan) return "none";
    const preset =
      explorerMapPresets != null
        ? explorerMapPresetForIsoRow(explorerMapPresets, roundPlan.targetRow)
        : null;
    return [
      roundSeq,
      `${size.w}x${size.h}`,
      isMobileLayout ? "m" : "d",
      preset ? `p:${preset.lon},${preset.lat},${preset.k}` : explorerMapPresets ? "fit" : "loading",
    ].join("|");
  }, [roundPlan, roundSeq, size.w, size.h, isMobileLayout, explorerMapPresets]);

  useEffect(() => {
    if (!regionModel || !roundPlan || size.w < 16 || size.h < 16) return;
    if (lastMapViewResetKeyRef.current === mapViewResetKey) return;
    /* プリセット JSON 未到着の間は外接 fit を走らせない（到着後に explorer と同じ k を適用） */
    if (!explorerMapPresets) return;

    const preset = explorerMapPresetForIsoRow(explorerMapPresets, roundPlan.targetRow);
    let fromPreset: ZoomPlain | null = null;
    if (preset != null) {
      if (isMobileLayout) {
        try {
          const path = geoPath(regionModel.projection);
          const b = path.bounds(regionModel.regionCollection);
          if (b && b[0] && b[1]) {
            fromPreset = zoomPlainToFitPoolWidth(
              regionModel.projection,
              size.w,
              size.h,
              preset.lon,
              preset.lat,
              preset.k,
              b as [[number, number], [number, number]],
              12
            );
          }
        } catch {
          /* fall through */
        }
      }
      if (fromPreset == null) {
        fromPreset = zoomPlainFromCenterLonLatK(
          regionModel.projection,
          size.w,
          size.h,
          preset.lon,
          preset.lat,
          preset.k
        );
      }
    }
    const fitted = fromPreset ?? fitTransformForRegion(regionModel, size.w, size.h);
    applyZoomTransform(fitted, false);
    lastMapViewResetKeyRef.current = mapViewResetKey;
  }, [
    regionModel,
    roundPlan,
    explorerMapPresets,
    mapViewResetKey,
    size.w,
    size.h,
    isMobileLayout,
    applyZoomTransform,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_VIEWPORT_MAX_PX}px)`);
    const sync = () => setIsMobileLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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
        stage,
        isoRows,
        topoIds,
        difficultyByAlpha3
      );
      if (!plan) return;
      if (options?.bumpSeq) setRoundSeq((s) => s + 1);
      setRoundPlan(plan);
      setPlacedByCard({});
      setPlacedLayoutByCard({});
      setPlacedLayoutAnimKeyByCard({});
      setAnswered(false);
      setResultByCountryId({});
      setResultByNotOnMapCardId({});
      setHoverCountryId(null);
      setJudgmentHoverScreenPos(null);
      setMapHoverCrossMap(null);
      setDragTargetCountryId(null);
      setDragOverNotOnMap(false);
      setDrag(null);
      setDragPointerMap(null);
      setDragCardDisplay(null);
      dragCardDisplayRef.current = null;
    },
    [isoRows, topoIds, featuresForGame, curriculumPool, curriculumLevel, difficultyByAlpha3]
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
    lastMapViewResetKeyRef.current = null;
    resetRoundForCurriculum(new Set(), { bumpSeq: true });
  }, [curriculumLevel, resetRoundForCurriculum]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const host = zoomHostRef.current;
      /* clientWidth: 子の固定 px 幅で膨らんだ border-box より、親 flex の実表示幅を取る */
      const rawW = host && host.clientWidth > 0 ? host.clientWidth : el.clientWidth;
      const rawH = host && host.clientHeight > 0 ? host.clientHeight : el.clientHeight;
      if (rawW <= 0 || rawH <= 0) return;
      const w = Math.floor(rawW);
      const h = Math.floor(rawH);
      if (w >= 32 && h >= 32) {
        setSize({ w, h });
        let rect: FlagFloatRect = { minX: 0, minY: 0, maxX: w, maxY: h };
        rect = intersectFlagFloatRects(rect, flagFloatRectFromStageElement(el));
        if (host) {
          rect = intersectFlagFloatRects(rect, flagFloatRectFromStageElement(host));
        }
        if (isMobileLayout) {
          rect = insetFlagFloatRect(rect, FLOAT_HALF_W + 2, FLOAT_HALF_H + 2);
        }
        /* 計測幅を超えないようクランプ（viewport 交差の取りこぼし対策） */
        rect = {
          minX: Math.max(0, Math.min(rect.minX, w - FLOAT_HALF_W * 2 - 4)),
          minY: rect.minY,
          maxX: Math.min(w, Math.max(rect.maxX, FLOAT_HALF_W * 2 + 4)),
          maxY: rect.maxY,
        };
        if (rect.maxX - rect.minX < FLOAT_HALF_W * 2 + 8) {
          rect = { minX: FLOAT_HALF_W + 2, minY: FLOAT_HALF_H + 2, maxX: w - FLOAT_HALF_W - 2, maxY: h - FLOAT_HALF_H - 2 };
        }
        setFloatRect(rect);
      }
    };
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    const hostEl = zoomHostRef.current;
    if (hostEl) ro.observe(hostEl);
    measure();
    requestAnimationFrame(measure);
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [isMobileLayout]);

  useEffect(() => {
    if (!cards.length || answered) return;
    const rect = floatRectRef.current;
    const spawnInside = isMobileLayout;
    setFloatByCard(() => {
      const next: Record<string, FloatingBubbleLike> = {};
      for (const c of cards) {
        next[c.id] = spawnBubbleLike({
          rect,
          halfW: FLOAT_HALF_W,
          halfH: FLOAT_HALF_H,
          speedScale: 0.95,
          restitution: 0.88,
          spawnInside,
        });
      }
      return next;
    });
  }, [roundSeq, size.w, size.h, floatRect, isMobileLayout, answered, cards.length]);

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
          const rect = floatRectRef.current;
          stepBubbleLikeInRect(b, rect, dt, FLOAT_HALF_W, FLOAT_HALF_H);
          clampBubbleToFloatRect(b, rect, FLOAT_HALF_W, FLOAT_HALF_H);
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cards, placedByCard, drag, answered, size.w, size.h, floatRect, roundSeq]);

  useEffect(() => {
    if (!cards.length || answered) return;
    const rect = floatRectRef.current;
    setFloatByCard((prev) => {
      const next = { ...prev };
      for (const c of cards) {
        const b = next[c.id];
        if (!b) continue;
        clampBubbleToFloatRect(b, rect, FLOAT_HALF_W, FLOAT_HALF_H);
      }
      return next;
    });
  }, [floatRect, cards, answered]);

  const getMapRect = useCallback((): DOMRect | null => {
    const mapEl = mapRenderBackend === "canvas" ? canvasRef.current : svgRef.current;
    const host = zoomHostRef.current;
    const el = mapEl ?? host;
    if (!el) return null;
    return el.getBoundingClientRect();
  }, [mapRenderBackend]);

  const buildPlacementLayout = useCallback(
    (
      countryId: string,
      opts?: { anchorPreviewOnly?: boolean; hintMapPoint?: [number, number] }
    ): FlagBubbleLayout | null => {
      if (!projection || !pointerRegionModel) return null;
      const feat = pointerRegionModel.allFeatures.find((f) => String(f.id) === countryId);
      if (!feat) return null;
      return computeFlagBubbleLayout({
        projection,
        targetCountryId: countryId,
        targetFeature: feat as CountryFeature,
        hitFeatures: pointerRegionModel.allFeatures,
        pathDById: pointerRegionModel.pathDById,
        flagVisualScale,
        cardW: CARD_W,
        cardH: CARD_H,
        thresholdPercent: flagBubbleAreaThresholdPct,
        mapWidth: size.w,
        mapHeight: size.h,
        mapZoom: zoomTransform,
        searchTuning: flagBubbleSearchTuning,
        anchorPreviewOnly: opts?.anchorPreviewOnly,
        hintMapPoint: opts?.hintMapPoint,
      });
    },
    [
      projection,
      pointerRegionModel,
      flagVisualScale,
      flagBubbleAreaThresholdPct,
      flagBubbleSearchTuning,
      size.w,
      size.h,
      zoomTransform,
    ]
  );

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

      if (!projection || !pointerRegionModel || drag) {
        return;
      }
      if (!pt) {
        if (!drag) setHoverCountryId(null);
        setJudgmentHoverScreenPos(null);
        return;
      }
      const [x, y] = pt;
      const id = countryIdAtPixel(projection, hitFeaturesForPointer, x, y, pointerRegionModel.pathDById);
      setHoverCountryId(id);

      if (answered && id && stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        setJudgmentHoverScreenPos({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      } else {
        setJudgmentHoverScreenPos(null);
      }
    },
    [projection, pointerRegionModel, hitFeaturesForPointer, answered, drag, pointerToMapCoords]
  );

  const handleMapLeave = useCallback(() => {
    if (!drag) setHoverCountryId(null);
    setMapHoverCrossMap(null);
    setJudgmentHoverScreenPos(null);
  }, [drag]);

  /** 正誤判定中: ページを離れずに Explorer の国詳細パネルをオーバーレイ表示 */
  const openExplorerForCountryAlpha2 = useCallback(
    (alpha2: string | null | undefined) => {
      const a2 = alpha2?.trim().toUpperCase();
      if (!a2) return;
      setExplorerOverlayAlpha2(a2);
    },
    []
  );
  const closeExplorerOverlay = useCallback(() => setExplorerOverlayAlpha2(null), []);

  /** 正誤判定中のマップクリック: 国を Explorer の詳細ページで開く */
  const handleMapClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement | SVGSVGElement>) => {
      if (!answered || drag) return;
      if (!projection || !pointerRegionModel) return;
      const pt = pointerToMapCoords(event.clientX, event.clientY);
      if (!pt) return;
      const [x, y] = pt;
      const id = countryIdAtPixel(projection, hitFeaturesForPointer, x, y, pointerRegionModel.pathDById);
      if (!id) return;
      const a2 = byCountryCode.get(id)?.["alpha-2"];
      openExplorerForCountryAlpha2(a2);
    },
    [
      answered,
      drag,
      projection,
      pointerRegionModel,
      hitFeaturesForPointer,
      pointerToMapCoords,
      byCountryCode,
      openExplorerForCountryAlpha2,
    ]
  );

  /** 正誤判定中: 配置済み国旗カード上でホバーしたとき、カードが覆っている国のハイライト/ツールチップを出す */
  const handlePlacedFlagPointerMove = useCallback(
    (placedCountryId: string, event: ReactPointerEvent) => {
      if (!answered) return;
      // 「ここにはない」ゾーン上のカードは国がないのでホバーハイライトを出さない
      if (placedCountryId === NOT_ON_MAP_ID) {
        setHoverCountryId(null);
        setJudgmentHoverScreenPos(null);
        return;
      }
      setHoverCountryId(placedCountryId);
      const stageEl = stageRef.current;
      if (stageEl) {
        const rect = stageEl.getBoundingClientRect();
        setJudgmentHoverScreenPos({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      }
    },
    [answered]
  );

  const handlePlacedFlagPointerLeave = useCallback(() => {
    if (!answered) return;
    setHoverCountryId(null);
    setJudgmentHoverScreenPos(null);
  }, [answered]);

  const placedCountryIds = useMemo(
    () =>
      new Set(
        Object.values(placedByCard).filter(
          (x): x is string => Boolean(x) && x !== NOT_ON_MAP_ID
        )
      ),
    [placedByCard]
  );

  /** ゾーンに置かれているカード ID の順序付き配列（描画時の index 計算用） */
  const notOnMapCardIds = useMemo(
    () =>
      Object.entries(placedByCard)
        .filter(([, v]) => v === NOT_ON_MAP_ID)
        .map(([k]) => k),
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

      // 「ここにはない」ゾーン（地図領域 screen 座標）への着弾を優先判定
      if (notOnMapZone) {
        const rect = getMapRect();
        if (rect) {
          const sx = clientX - rect.left;
          const sy = clientY - rect.top;
          if (isPointInNotOnMapZone(sx, sy, notOnMapZone)) {
            setDragOverNotOnMap(true);
            setDragTargetCountryId(null);
            return;
          }
        }
      }
      setDragOverNotOnMap(false);
      setDragTargetCountryId(resolveDragTargetAtMapPoint(x, y));
    },
    [
      projection,
      drag,
      pointerToMapCoords,
      pointerRegionModel,
      resolveDragTargetAtMapPoint,
      notOnMapZone,
      getMapRect,
    ]
  );

  const endDrag = useCallback(
    (cardId: string) => {
      const countryId = dragTargetCountryId;
      const wasOverNotOnMap = dragOverNotOnMap;
      const lastMap = dragCardDisplayRef.current;
      const zt = zoomTransformRef.current;
      const k = Math.max(zt.k, 0.06);
      const rect = floatRectRef.current;

      const floatFromLastCardVisual = (): FloatingBubbleLike => {
        if (!lastMap) {
          return spawnBubbleLike({
            rect,
            halfW: FLOAT_HALF_W,
            halfH: FLOAT_HALF_H,
            speedScale: 0.95,
            restitution: 0.88,
            spawnInside: isMobileLayout,
          });
        }
        let px = lastMap.x * k + zt.x;
        let py = lastMap.y * k + zt.y;
        px = Math.min(rect.maxX - FLOAT_HALF_W, Math.max(rect.minX + FLOAT_HALF_W, px));
        py = Math.min(rect.maxY - FLOAT_HALF_H, Math.max(rect.minY + FLOAT_HALF_H, py));
        return spawnBubbleLikeAtPanelXY({
          x: px,
          y: py,
          rect,
          halfW: FLOAT_HALF_W,
          halfH: FLOAT_HALF_H,
          speedScale: 0.95,
          restitution: 0.88,
        });
      };

      const floater = floatFromLastCardVisual();

      setDrag(null);
      setDragTargetCountryId(null);
      setDragOverNotOnMap(false);
      setDragPointerMap(null);
      setDragCardDisplay(null);
      dragCardDisplayRef.current = null;

      // 「ここにはない」ゾーンへのドロップ（複数枚許容）
      if (wasOverNotOnMap && notOnMapZone) {
        setPlacedByCard((prev) => {
          const next = { ...prev, [cardId]: NOT_ON_MAP_ID };
          // ゾーン内の全カードについて、線の方角・長さを再配分して重なりを抑える
          const zoneCardIds = Object.entries(next)
            .filter(([, v]) => v === NOT_ON_MAP_ID)
            .map(([k]) => k);
          // 既存の placedLayout を維持しつつ、ゾーン内分は再計算
          setPlacedLayoutByCard((prevLayout) => {
            const nextLayout: Record<string, FlagBubbleLayout> = { ...prevLayout };
            zoneCardIds.forEach((id, idx) => {
              nextLayout[id] = notOnMapBubbleLayoutFor(
                notOnMapZone,
                idx,
                zoneCardIds.length,
                CARD_W
              );
            });
            return nextLayout;
          });
          // pop アニメを新規カードだけトリガー
          setPlacedLayoutAnimKeyByCard((prevK) => ({
            ...prevK,
            [cardId]: (prevK[cardId] ?? 0) + 1,
          }));
          return next;
        });
        return;
      }

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
        const dropHint: [number, number] | undefined = lastMap ? [lastMap.x, lastMap.y] : undefined;
        const preview = buildPlacementLayout(countryId, {
          anchorPreviewOnly: true,
          hintMapPoint: dropHint,
        });
        if (preview) {
          setPlacedLayoutByCard((prev) => ({ ...prev, [cardId]: preview }));
        }
        requestAnimationFrame(() => {
          startTransition(() => {
            if (placedRef.current[cardId] !== countryId) return;
            const layout = buildPlacementLayout(countryId, { hintMapPoint: dropHint });
            if (!layout) return;
            setPlacedLayoutByCard((prev) => ({ ...prev, [cardId]: layout }));
            if (layout.useBubble) {
              setPlacedLayoutAnimKeyByCard((prev) => ({
                ...prev,
                [cardId]: (prev[cardId] ?? 0) + 1,
              }));
            }
          });
        });
        return;
      }

      setFloatByCard((prev) => ({
        ...prev,
        [cardId]: floater,
      }));
    },
    [dragTargetCountryId, dragOverNotOnMap, notOnMapZone, size.w, size.h, buildPlacementLayout]
  );

  /** パン・ズームで見えているポリゴン内へ国旗表示位置を追従（探索は再実行しない） */
  useEffect(() => {
    if (!projection || !pointerRegionModel) return;
    const entries = Object.entries(placedByCardForLayoutRef.current);
    if (!entries.length) return;
    startTransition(() => {
      const next = { ...placedLayoutRef.current };
      for (const [cardId, countryId] of entries) {
        const prev = next[cardId];
        if (!prev) continue;
        const feat = pointerRegionModel.allFeatures.find((f) => String(f.id) === countryId);
        if (!feat) continue;
        const refreshed = refreshFlagLayoutForViewport(prev, {
          projection,
          targetFeature: feat as CountryFeature,
          mapWidth: size.w,
          mapHeight: size.h,
          mapZoom: zoomTransform,
          cardW: CARD_W,
          cardH: CARD_H,
          flagVisualScale,
          hintMapPoint: [prev.flagX, prev.flagY],
        });
        if (refreshed) next[cardId] = refreshed;
        else delete next[cardId];
      }
      setPlacedLayoutByCard(next);
    });
  }, [zoomTransform, projection, pointerRegionModel, size.w, size.h, flagVisualScale]);

  /** 吹き出し閾値・探索パラメータ変更時はフル再配置 */
  useEffect(() => {
    if (!projection || !pointerRegionModel) return;
    const entries = Object.entries(placedByCardForLayoutRef.current);
    if (!entries.length) return;
    const next: Record<string, FlagBubbleLayout> = {};
    for (const [cardId, countryId] of entries) {
      if (countryId === NOT_ON_MAP_ID) {
        const prev = placedLayoutRef.current[cardId];
        if (prev) next[cardId] = prev;
        continue;
      }
      const prev = placedLayoutRef.current[cardId];
      const hint: [number, number] | undefined = prev ? [prev.flagX, prev.flagY] : undefined;
      const layout = buildPlacementLayout(countryId, { hintMapPoint: hint });
      if (layout) next[cardId] = layout;
    }
    setPlacedLayoutByCard(next);
  }, [
    flagBubbleAreaThresholdPct,
    flagBubbleSearchTuning,
    buildPlacementLayout,
    projection,
    pointerRegionModel,
  ]);

  /** リサイズ等で「ここにはない」ゾーン位置が変わったとき、内部カードの吹き出しを再配分 */
  useEffect(() => {
    if (!notOnMapZone) return;
    const zoneIds = Object.entries(placedByCardForLayoutRef.current)
      .filter(([, v]) => v === NOT_ON_MAP_ID)
      .map(([k]) => k);
    if (zoneIds.length === 0) return;
    setPlacedLayoutByCard((prev) => {
      const next = { ...prev };
      zoneIds.forEach((id, idx) => {
        next[id] = notOnMapBubbleLayoutFor(notOnMapZone, idx, zoneIds.length, CARD_W);
      });
      return next;
    });
  }, [notOnMapZone]);

  const handleCardPointerDown = (cardId: string, e: ReactPointerEvent) => {
    if (answered) return;
    e.preventDefault();
    if (placedByCard[cardId]) {
      const wasInZone = placedByCard[cardId] === NOT_ON_MAP_ID;
      setPlacedByCard((prev) => {
        const next = { ...prev };
        delete next[cardId];
        // ゾーンから抜けたら、残ったゾーン内カードの線を再配分
        if (wasInZone && notOnMapZone) {
          const remaining = Object.entries(next)
            .filter(([, v]) => v === NOT_ON_MAP_ID)
            .map(([k]) => k);
          setPlacedLayoutByCard((prevLayout) => {
            const nextLayout: Record<string, FlagBubbleLayout> = { ...prevLayout };
            delete nextLayout[cardId];
            remaining.forEach((id, idx) => {
              nextLayout[id] = notOnMapBubbleLayoutFor(
                notOnMapZone,
                idx,
                remaining.length,
                CARD_W
              );
            });
            return nextLayout;
          });
          return next;
        }
        return next;
      });
      if (!wasInZone) {
        setPlacedLayoutByCard((prev) => {
          const next = { ...prev };
          delete next[cardId];
          return next;
        });
      }
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
    const byZoneCard: Record<string, "correct" | "wrong"> = {};
    const mapCodes = roundPlan.mapCountryCodes ?? null;
    for (const c of cards) {
      const cid = placedByCard[c.id];
      if (!cid) continue;
      if (cid === NOT_ON_MAP_ID) {
        // 国旗の対応国が地図に描画されていなければ正解
        const isoRow = isoRows.find(
          (r) => r["alpha-2"]?.trim().toUpperCase() === c.alpha2.toUpperCase()
        );
        const cc = isoRow?.["country-code"]?.trim() ?? "";
        const onMap = mapCodes ? !!(cc && mapCodes.has(cc)) : true;
        byZoneCard[c.id] = onMap ? "wrong" : "correct";
        continue;
      }
      const row = byCountryCode.get(cid);
      const ok = row?.["alpha-2"].toUpperCase() === c.alpha2.toUpperCase();
      byC[cid] = ok ? "correct" : "wrong";
    }
    setResultByCountryId(byC);
    setResultByNotOnMapCardId(byZoneCard);
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

  const hoverCountryAlpha2 = useMemo(() => {
    if (!hoverCountryId) return null;
    const a2 = byCountryCode.get(hoverCountryId)?.["alpha-2"]?.trim().toUpperCase();
    return a2 || null;
  }, [hoverCountryId, byCountryCode]);

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
      const contextFill = resolveCssColorForCanvas(MAP_LAND_CONTEXT_QUIET, probeMount);
      const contextBorder = resolveCssColorForCanvas(MAP_BORDER_CONTEXT_STROKE, probeMount);
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
        contextFeatures: snap.rm.contextFeatures,
        contextFillResolved: contextFill,
        contextBorderStrokeResolved: contextBorder,
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
      flagBubbleAreaThresholdPct,
      setFlagBubbleAreaThresholdPct,
      flagBubbleDirectionCount,
      setFlagBubbleDirectionCount,
      flagBubbleSampleCols,
      setFlagBubbleSampleCols,
      flagBubbleSampleRows,
      setFlagBubbleSampleRows,
      flagBubbleDistanceSteps,
      setFlagBubbleDistanceSteps,
      flagBubbleSearchCandidateCount: flagBubbleSearchCandidateCount(flagBubbleSearchTuning),
      flagBubbleHitTestSampleCount: flagBubbleHitTestSampleCount(flagBubbleSearchTuning),
    });
    return () => onDebugPanelPropsChange(null);
  }, [
    onDebugPanelPropsChange,
    isDevTj,
    isDebugMode,
    isDebugPanelExpanded,
    dragCardScreenOffsetPx,
    dragCardSpring,
    flagBubbleAreaThresholdPct,
    flagBubbleDirectionCount,
    flagBubbleSampleCols,
    flagBubbleSampleRows,
    flagBubbleDistanceSteps,
    flagBubbleSearchTuning,
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
      <div
        ref={stageRef}
        className="relative flex min-h-[320px] w-full min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-6"
      >
        <div ref={zoomHostRef} className="pointer-events-none absolute inset-0 h-full w-full min-w-0" aria-hidden />
        <div className="h-40 w-full max-w-md animate-pulse rounded-xl bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]" />
        <p className="text-sm text-[var(--color-muted)]">地図と国旗データを読み込み中…</p>
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      className="relative flex h-full min-h-[min(58dvh,640px)] w-full min-w-0 flex-1 flex-col touch-none overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_94%,white_6%)] shadow-inner"
    >
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
        <div className="pointer-events-auto hidden w-10 select-none flex-col items-center gap-1 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] px-1 py-1.5 shadow-lg backdrop-blur-sm lg:flex">
          <button
            type="button"
            className="grid h-6 w-6 place-items-center rounded-md border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] text-sm font-bold text-[var(--color-text)] transition hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]"
            onClick={() => zoomByFactor(ZOOM_STEP)}
            aria-label="ズームイン"
          >
            +
          </button>
          <div className="tabular-nums text-[10px] font-semibold leading-none text-[var(--color-muted)]">
            {zoomLevelLabel}×
          </div>
          <div
            role="slider"
            aria-label="地図のズーム"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={zoomSliderAriaNow}
            className="relative mx-auto h-36 w-4 cursor-pointer touch-none rounded-full bg-[color-mix(in_srgb,var(--color-text)_15%,transparent)] px-1"
            onPointerDown={(e) => bindZoomSliderPointer(e.currentTarget, pickZoomFromVerticalSlider, e)}
          >
            <div
              className="pointer-events-none absolute left-1/2 h-3 w-3 rounded-full border border-white/80 bg-[var(--color-primary)] shadow"
              style={{
                top: `${(1 - zoomSliderRatio) * 100}%`,
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

      <div className="pointer-events-none absolute bottom-2 left-1/2 z-30 w-[min(100%,18rem)] -translate-x-1/2 px-2 lg:hidden">
        <div className="pointer-events-auto flex select-none items-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-2 py-1.5 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] text-sm font-bold text-[var(--color-text)] transition hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]"
            onClick={() => zoomByFactor(1 / ZOOM_STEP)}
            aria-label="ズームアウト"
          >
            −
          </button>
          <div
            role="slider"
            aria-label="地図のズーム"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={zoomSliderAriaNow}
            className="relative h-3 min-w-0 flex-1 cursor-pointer touch-none rounded-full bg-[color-mix(in_srgb,var(--color-text)_15%,transparent)]"
            onPointerDown={(e) => bindZoomSliderPointer(e.currentTarget, pickZoomFromHorizontalSlider, e)}
          >
            <div
              className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 rounded-full border border-white/80 bg-[var(--color-primary)] shadow"
              style={{
                left: `${zoomSliderRatio * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
          <span className="shrink-0 tabular-nums text-[10px] font-semibold leading-none text-[var(--color-muted)]">
            {zoomLevelLabel}×
          </span>
          <button
            type="button"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] text-sm font-bold text-[var(--color-text)] transition hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]"
            onClick={() => zoomByFactor(ZOOM_STEP)}
            aria-label="ズームイン"
          >
            +
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center">
        <div className="relative mx-auto flex min-h-0 min-w-0 w-full max-w-full flex-1">
          <div
            ref={zoomHostRef}
            className={`relative h-full w-full min-w-0 touch-none ${answered && !drag ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}`}
          >
            {size.w >= 32 && size.h >= 32 ? (
              <>
                {mapRenderBackend === "svg" ? (
              <svg
                ref={svgRef}
                width={size.w}
                height={size.h}
                className={`block select-none ${answered ? "cursor-pointer" : ""}`}
                role="img"
                aria-label="地域マップ"
                onPointerMove={handleMapPointerMove}
                onPointerLeave={handleMapLeave}
                onClick={handleMapClick}
              >
                <rect width={size.w} height={size.h} style={{ fill: MAP_SEA_FILL }} />
                <g transform={gTransform}>
                  {/*
                   * プール外の周辺国を背面にミュート描画して、世界地図としての連続性を保つ。
                   * pointer-events を切ってヒットテスト・ホバー・ドラッグの対象から完全に外す。
                   */}
                  {regionModel.contextFeatures && regionModel.contextPathDById && (
                    <g style={{ pointerEvents: "none" }} aria-hidden>
                      {regionModel.contextFeatures.map((f) => {
                        const id = String(f.id ?? "");
                        const d = regionModel.contextPathDById!.get(id);
                        if (!d) return null;
                        return (
                          <path
                            key={`ctx-${id}`}
                            d={d}
                            style={{
                              fill: MAP_LAND_CONTEXT_QUIET,
                              stroke: MAP_BORDER_CONTEXT_STROKE,
                              strokeWidth: borderStrokeWidth * 0.75,
                              strokeLinecap: "round",
                              strokeLinejoin: "round",
                              vectorEffect: "non-scaling-stroke",
                            }}
                          />
                        );
                      })}
                    </g>
                  )}
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
                className={`block select-none ${answered ? "cursor-pointer" : ""}`}
                role="img"
                aria-label="地域マップ"
                style={{ width: size.w, height: size.h }}
                onPointerMove={handleMapPointerMove}
                onPointerLeave={handleMapLeave}
                onClick={handleMapClick}
              />
            )}

            {notOnMapZone && (
              <div
                className="pointer-events-none absolute z-[26] select-none"
                style={{
                  left: notOnMapZone.cx - notOnMapZone.rx,
                  top: notOnMapZone.cy - notOnMapZone.ry,
                  width: notOnMapZone.rx * 2,
                  height: notOnMapZone.ry * 2,
                }}
                aria-hidden
              >
                <div
                  className={`flex h-full w-full items-center justify-center rounded-full border-2 transition-colors duration-150 ${
                    dragOverNotOnMap
                      ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-primary)_18%,transparent)]"
                      : "border-dashed border-[color-mix(in_srgb,var(--color-text)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_82%,transparent)]"
                  }`}
                >
                  <span
                    className={`text-center text-[11px] font-semibold leading-tight ${
                      dragOverNotOnMap
                        ? "text-[var(--color-primary)]"
                        : "text-[color-mix(in_srgb,var(--color-text)_72%,transparent)]"
                    }`}
                  >
                    ここには
                    <br />
                    ない
                  </span>
                </div>
              </div>
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
                  const gap = MAP_CROSS_GAP_SCREEN_PX * mapUnitsPerScreenPx(k);
                  const arm = MAP_CROSS_ARM_SCREEN_PX * mapUnitsPerScreenPx(k);
                  const onLand = hoverCountryId !== null;
                  const stroke = onLand ? "var(--color-primary)" : "rgba(42,42,48,0.92)";
                  const sw = mapOverlayStrokeWidth(
                    onLand ? MAP_CROSS_STROKE_LAND_PX : MAP_CROSS_STROKE_SEA_PX,
                    k
                  );
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
                    if (cid === NOT_ON_MAP_ID) return null;
                    const layout = placedLayoutByCard[c.id];
                    if (!layout) return null;
                    const layoutAnimKey = placedLayoutAnimKeyByCard[c.id] ?? 0;
                    const { anchorX, anchorY, flagX, flagY, useBubble } = layout;
                    const bubbleFromDx = anchorX - flagX;
                    const bubbleFromDy = anchorY - flagY;
                    const [lineTx, lineTy] = useBubble
                      ? flagCardEdgeTowardAnchor(
                          flagX,
                          flagY,
                          anchorX,
                          anchorY,
                          CARD_W,
                          CARD_H,
                          flagVisualScale
                        )
                      : [flagX, flagY];
                    const connD = useBubble
                      ? dragConnectorPathD(anchorX, anchorY, lineTx, lineTy)
                      : null;
                    return (
                      <span key={`stuck-${c.id}`} className="pointer-events-none absolute left-0 top-0 z-20">
                        {useBubble && connD && (
                          <svg
                            className="pointer-events-none absolute left-0 top-0 overflow-visible"
                            width={size.w}
                            height={size.h}
                            aria-hidden
                          >
                            <path
                              d={connD}
                              className="fg-flag-bubble-connector"
                              strokeWidth={mapOverlayStrokeWidth(MAP_CONNECTOR_STROKE_PX, zoomTransform.k)}
                            />
                          </svg>
                        )}
                        <button
                          key={`stuck-btn-${c.id}-${layoutAnimKey}`}
                          type="button"
                          className={`fg-flag-card pointer-events-auto absolute flex items-center justify-center overflow-hidden rounded-md border-2 border-white/40 bg-white/90 p-1 shadow-md backdrop-blur-sm ${
                            answered ? "cursor-pointer" : "cursor-default"
                          } ${useBubble ? "fg-flag-bubble-pop" : ""}`}
                          style={{
                            left: flagX,
                            top: flagY,
                            width: CARD_W,
                            height: CARD_H,
                            ["--fg-bubble-from-dx" as string]: `${bubbleFromDx}px`,
                            ["--fg-bubble-from-dy" as string]: `${bubbleFromDy}px`,
                            ["--fg-flag-scale" as string]: String(flagVisualScale),
                            transform: useBubble
                              ? undefined
                              : `translate(-50%, -50%) scale(${flagVisualScale})`,
                          }}
                          onPointerDown={(e) => handleCardPointerDown(c.id, e)}
                          onPointerMove={(e) => handlePlacedFlagPointerMove(cid, e)}
                          onPointerLeave={handlePlacedFlagPointerLeave}
                          onClick={() => {
                            if (answered) openExplorerForCountryAlpha2(c.alpha2);
                          }}
                          aria-label={answered ? "この国の詳細をエクスプローラーで開く" : "国旗を戻す"}
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
                      </span>
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
                    const gap = MAP_CROSS_GAP_SCREEN_PX * mapUnitsPerScreenPx(k);
                    const arm = MAP_CROSS_ARM_SCREEN_PX * mapUnitsPerScreenPx(k);
                    const crossStroke = inCountry ? "var(--color-primary)" : "rgba(42,42,48,0.92)";
                    const crossW = mapOverlayStrokeWidth(
                      inCountry ? MAP_CROSS_STROKE_LAND_PX : MAP_CROSS_STROKE_SEA_PX,
                      k
                    );
                    const connStroke = mapOverlayStrokeWidth(
                      inCountry ? MAP_CONNECTOR_STROKE_PX : MAP_CONNECTOR_STROKE_DRAG_SEA_PX,
                      k
                    );
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

            {/*
             * 「ここにはない」ゾーン内のカードはズーム変換の外側に「画面 1:1」で描画する。
             *
             * 通常の placed card は `overlayParentTransform` の `scale(k)` の内側にあるため、
             * `flagVisualScale = 1/k` を CSS 変数経由で渡して見た目サイズを一定に保っている。
             * ゾーン用カードはその親 transform の外側にあるので 1/k の打ち消しは不要で、
             * scale = 1 を **inline transform で直に固定** する（CSS アニメ keyframes 経由だと
             * `var(--fg-flag-scale)` が他の re-render と相互作用してズームに引きずられることが
             * 観測された）。
             */}
            {notOnMapZone && (
              <div className="pointer-events-none absolute inset-0 z-[27]">
                {cards.map((c) => {
                  if (placedByCard[c.id] !== NOT_ON_MAP_ID) return null;
                  if (drag?.cardId === c.id) return null;
                  const layout = placedLayoutByCard[c.id];
                  if (!layout) return null;
                  const { anchorX, anchorY, flagX, flagY } = layout;
                  const [lineTx, lineTy] = flagCardEdgeTowardAnchor(
                    flagX,
                    flagY,
                    anchorX,
                    anchorY,
                    CARD_W,
                    CARD_H,
                    1
                  );
                  const connD = dragConnectorPathD(anchorX, anchorY, lineTx, lineTy);
                  const verdict = resultByNotOnMapCardId[c.id];
                  const borderTone = answered
                    ? verdict === "correct"
                      ? "border-emerald-500/70"
                      : verdict === "wrong"
                      ? "border-rose-500/70"
                      : "border-white/40"
                    : "border-white/40";
                  return (
                    <span
                      key={`zone-${c.id}`}
                      className="pointer-events-none absolute left-0 top-0"
                    >
                      <svg
                        className="pointer-events-none absolute left-0 top-0 overflow-visible"
                        width={size.w}
                        height={size.h}
                        aria-hidden
                      >
                        <path
                          d={connD}
                          className="fg-flag-bubble-connector"
                          strokeWidth={MAP_CONNECTOR_STROKE_PX}
                        />
                      </svg>
                      <button
                        key={`zone-btn-${c.id}`}
                        type="button"
                        className={`fg-flag-card pointer-events-auto absolute flex items-center justify-center overflow-hidden rounded-md border-2 bg-white/90 p-1 shadow-md backdrop-blur-sm ${
                          answered ? "cursor-pointer" : "cursor-default"
                        } ${borderTone}`}
                        style={{
                          left: flagX,
                          top: flagY,
                          width: CARD_W,
                          height: CARD_H,
                          transform: "translate(-50%, -50%) scale(1)",
                          transformOrigin: "center center",
                        }}
                        onPointerDown={(e) => handleCardPointerDown(c.id, e)}
                        onClick={() => {
                          if (answered) openExplorerForCountryAlpha2(c.alpha2);
                        }}
                        aria-label={
                          answered
                            ? "この国の詳細をエクスプローラーで開く"
                            : "国旗を戻す"
                        }
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
                    </span>
                  );
                })}
              </div>
            )}

            {isDevTj && isDebugMode && listedCountryLabelsJa.length > 0 && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[5] border-t border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-2 py-1.5 text-[10px] leading-snug text-[var(--color-text)] backdrop-blur-sm">
                <span className="font-semibold text-[var(--color-muted)]">ビューポート候補: </span>
                {listedCountryLabelsJa.join(" · ")}
              </div>
            )}
              </>
            ) : (
              <div
                className="absolute inset-0 min-h-[12rem] w-full animate-pulse rounded-xl bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]"
                aria-hidden
              />
            )}
          </div>

          {size.w >= 32 && size.h >= 32 && !answered ? (
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

      {hoverCountryId && projection && !drag && !answered && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-10 rounded-lg bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] px-2 py-1 text-center text-[11px] text-[var(--color-text)] backdrop-blur-sm md:text-xs">
          {hoverCountryLabel ?? (locale === "ja" ? "国を選択中" : "Select a country")}
        </div>
      )}

      {answered &&
        hoverCountryId &&
        hoverCountryAlpha2 &&
        hoverCountryLabel &&
        judgmentHoverScreenPos && (
          <div
            className="pointer-events-none absolute z-[45] flex max-w-[min(240px,calc(100%-16px))] items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_94%,transparent)] px-2.5 py-1.5 shadow-lg backdrop-blur-sm"
            style={{
              left: Math.min(judgmentHoverScreenPos.x + 14, Math.max(8, size.w - 220)),
              top: Math.max(8, judgmentHoverScreenPos.y - 44),
            }}
          >
            <img
              src={flagUrlForAlpha2(hoverCountryAlpha2)}
              alt=""
              aria-hidden
              className="h-7 w-auto max-w-[40px] shrink-0 object-contain"
            />
            <span className="min-w-0 truncate text-xs font-semibold leading-snug text-[var(--color-text)]">
              {hoverCountryLabel}
            </span>
          </div>
        )}

      {explorerOverlayAlpha2 ? (
        <ExplorerCountryDetailOverlay
          alpha2={explorerOverlayAlpha2}
          onClose={closeExplorerOverlay}
        />
      ) : null}
    </div>
  );
}
