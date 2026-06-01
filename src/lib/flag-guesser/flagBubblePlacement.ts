import { geoPath, type GeoProjection } from "d3-geo";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import {
  countryIdAtPixelOnSorted,
  largestPolygonPieceFromFeature,
  projectMainlandCentroid,
  projectedFeatureArea,
  sortFeaturesForHitTest,
  visiblePlacementBaseForCountry,
} from "@/lib/flag-guesser/mapProjections";
import type { CountryFeature } from "@/lib/flag-guesser/types";
import { visibleMapRectInMapSpace, type ZoomPlain } from "@/lib/flag-guesser/viewportGeo";

export type FlagBubbleLayout = {
  /** 最大陸塊重心（地図座標）— 指し示し線の先 */
  anchorX: number;
  anchorY: number;
  /** 国旗カード中心（地図座標） */
  flagX: number;
  flagY: number;
  useBubble: boolean;
  /** 国旗矩形面積 / 最大陸塊投影面積 × 100 */
  areaRatioPercent: number;
  /** 吹き出し探索基準点からのオフセット（パン時に基準点だけ更新） */
  placementOffsetX: number;
  placementOffsetY: number;
};

/** 距離段の倍率（段数スライダーは先頭から何段使うか） */
export const FLAG_BUBBLE_DISTANCE_MULTIPLIERS = [1, 1.18, 1.38] as const;

export type FlagBubbleSearchTuning = {
  directionCount: number;
  sampleCols: number;
  sampleRows: number;
  /** `FLAG_BUBBLE_DISTANCE_MULTIPLIERS` の先頭 N 段 */
  distanceStepCount: number;
};

export const DEFAULT_FLAG_BUBBLE_SEARCH_TUNING: FlagBubbleSearchTuning = {
  directionCount: 16,
  sampleCols: 4,
  sampleRows: 4,
  distanceStepCount: 3,
};

/** 国プールが大きいとき（G13 ヨーロッパ等）に使う探索パラメータ（D） */
export const COMPACT_FLAG_BUBBLE_SEARCH_TUNING: FlagBubbleSearchTuning = {
  directionCount: 8,
  sampleCols: 2,
  sampleRows: 2,
  distanceStepCount: 2,
};

/** この件数以上の in-pool 国では compact チューニングを適用 */
export const FLAG_BUBBLE_COMPACT_HIT_POOL_THRESHOLD = 20;

/** 閾値の何倍以上なら極小国とみなし探索をスキップ（E） */
export const FLAG_BUBBLE_MICROSTATE_SKIP_SEARCH_FACTOR = 3;

/** 面積比がこの % 以上なら閾値に関係なく探索スキップ */
export const FLAG_BUBBLE_MICROSTATE_MIN_AREA_RATIO_PERCENT = 100;

export function mergeFlagBubbleSearchTuning(
  base: FlagBubbleSearchTuning,
  hitFeatureCount: number,
  compactThreshold = FLAG_BUBBLE_COMPACT_HIT_POOL_THRESHOLD
): FlagBubbleSearchTuning {
  if (hitFeatureCount < compactThreshold) return base;
  const compact = COMPACT_FLAG_BUBBLE_SEARCH_TUNING;
  return {
    directionCount: Math.min(base.directionCount, compact.directionCount),
    sampleCols: Math.min(base.sampleCols, compact.sampleCols),
    sampleRows: Math.min(base.sampleRows, compact.sampleRows),
    distanceStepCount: Math.min(base.distanceStepCount, compact.distanceStepCount),
  };
}

export function flagBubbleSearchCandidateCount(tuning: FlagBubbleSearchTuning): number {
  const steps = Math.max(1, Math.min(FLAG_BUBBLE_DISTANCE_MULTIPLIERS.length, tuning.distanceStepCount));
  return tuning.directionCount * steps;
}

export function flagBubbleHitTestSampleCount(tuning: FlagBubbleSearchTuning): number {
  return (
    flagBubbleSearchCandidateCount(tuning) *
    Math.max(1, tuning.sampleCols) *
    Math.max(1, tuning.sampleRows)
  );
}

function flagPlacementMarginPx(cardW: number, cardH: number, flagVisualScale: number): number {
  return Math.max(cardW, cardH) * flagVisualScale * 0.55;
}

function flagHalfExtents(cardW: number, cardH: number, flagVisualScale: number) {
  const s = flagVisualScale;
  return { hw: (cardW * s) / 2, hh: (cardH * s) / 2 };
}

/** 国旗中心（translate -50%）が可視地図範囲に収まるよう内側へ寄せる */
function insetFlagCenterInVisibleMap(
  x: number,
  y: number,
  mapWidth: number,
  mapHeight: number,
  marginPx: number,
  mapZoom: ZoomPlain,
  cardW: number,
  cardH: number,
  flagVisualScale: number
): [number, number] {
  const vp = visibleMapRectInMapSpace(mapWidth, mapHeight, marginPx, mapZoom);
  const { hw, hh } = flagHalfExtents(cardW, cardH, flagVisualScale);
  const insetX0 = vp.x0 + hw;
  const insetX1 = vp.x1 - hw;
  const insetY0 = vp.y0 + hh;
  const insetY1 = vp.y1 - hh;
  if (insetX1 <= insetX0 || insetY1 <= insetY0) {
    return [(vp.x0 + vp.x1) / 2, (vp.y0 + vp.y1) / 2];
  }
  return [
    Math.max(insetX0, Math.min(insetX1, x)),
    Math.max(insetY0, Math.min(insetY1, y)),
  ];
}

/** 国旗中心から anchor 方向の矩形外周上の点（コネクタ終端） */
export function flagCardEdgeTowardAnchor(
  flagX: number,
  flagY: number,
  anchorX: number,
  anchorY: number,
  cardW: number,
  cardH: number,
  flagVisualScale: number
): [number, number] {
  const { hw, hh } = flagHalfExtents(cardW, cardH, flagVisualScale);
  const vx = anchorX - flagX;
  const vy = anchorY - flagY;
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return [flagX + hw, flagY];
  const nx = vx / len;
  const ny = vy / len;
  const denom = Math.max(Math.abs(nx) / hw, Math.abs(ny) / hh, 1e-6);
  return [flagX + nx / denom, flagY + ny / denom];
}

function sampleOverlapScore(
  flagX: number,
  flagY: number,
  cardW: number,
  cardH: number,
  flagVisualScale: number,
  targetCountryId: string,
  projection: GeoProjection,
  sortedHitFeatures: readonly CountryFeature[],
  pathDById: Map<string, string>,
  sampleCols: number,
  sampleRows: number
): { other: number; target: number; sea: number } {
  const { hw, hh } = flagHalfExtents(cardW, cardH, flagVisualScale);
  let other = 0;
  let target = 0;
  let sea = 0;
  for (let row = 0; row < sampleRows; row++) {
    for (let col = 0; col < sampleCols; col++) {
      const u = (col + 0.5) / sampleCols - 0.5;
      const v = (row + 0.5) / sampleRows - 0.5;
      const x = flagX + u * 2 * hw;
      const y = flagY + v * 2 * hh;
      const id = countryIdAtPixelOnSorted(projection, sortedHitFeatures, x, y, pathDById);
      if (!id) {
        sea++;
      } else if (id === targetCountryId) {
        target++;
      } else {
        other++;
      }
    }
  }
  return { other, target, sea };
}

function bubbleCandidateInMap(
  fx: number,
  fy: number,
  mapWidth: number,
  mapHeight: number,
  margin: number
): boolean {
  return fx >= margin && fy >= margin && fx <= mapWidth - margin && fy <= mapHeight - margin;
}

function computeBubbleMinDist(
  piece: Feature<Geometry, GeoJsonProperties> | null,
  projection: GeoProjection,
  cardW: number,
  cardH: number,
  flagVisualScale: number
): number {
  let minDist = Math.max(cardW, cardH) * flagVisualScale * 0.85;
  if (!piece) return minDist;
  const path = geoPath(projection);
  try {
    const [[x0, y0], [x1, y1]] = path.bounds(piece as Parameters<typeof path.bounds>[0]);
    const bw = Math.max(1, x1 - x0);
    const bh = Math.max(1, y1 - y0);
    minDist = Math.max(minDist, Math.max(bw, bh) * 0.42 + Math.max(cardW, cardH) * flagVisualScale * 0.35);
  } catch {
    /* keep default */
  }
  return minDist;
}

function bubbleSearchStartAngle(
  anchorX: number,
  anchorY: number,
  hintMapPoint?: [number, number]
): number {
  if (!hintMapPoint) return 0;
  const dx = hintMapPoint[0] - anchorX;
  const dy = hintMapPoint[1] - anchorY;
  return Math.hypot(dx, dy) > 1e-6 ? Math.atan2(dy, dx) : 0;
}

function shouldSkipBubbleSearch(areaRatioPercent: number, thresholdPercent: number): boolean {
  return (
    areaRatioPercent >= thresholdPercent * FLAG_BUBBLE_MICROSTATE_SKIP_SEARCH_FACTOR ||
    areaRatioPercent >= FLAG_BUBBLE_MICROSTATE_MIN_AREA_RATIO_PERCENT
  );
}

/** 極小国: ヒットテストなしで hint 方向（または 8 方位）へ 1 段だけオフセット（E） */
function pickBubbleDirectionMicrostate(
  anchorX: number,
  anchorY: number,
  piece: Feature<Geometry, GeoJsonProperties> | null,
  projection: GeoProjection,
  cardW: number,
  cardH: number,
  flagVisualScale: number,
  mapWidth: number,
  mapHeight: number,
  hintMapPoint?: [number, number]
): { flagX: number; flagY: number } {
  const minDist = computeBubbleMinDist(piece, projection, cardW, cardH, flagVisualScale);
  const margin = Math.max(cardW, cardH) * flagVisualScale * 0.6;
  const startAngle = bubbleSearchStartAngle(anchorX, anchorY, hintMapPoint);

  for (let i = 0; i < 8; i++) {
    const angle = startAngle + (i / 8) * Math.PI * 2;
    const fx = anchorX + Math.cos(angle) * minDist;
    const fy = anchorY + Math.sin(angle) * minDist;
    if (bubbleCandidateInMap(fx, fy, mapWidth, mapHeight, margin)) {
      return { flagX: fx, flagY: fy };
    }
  }

  return { flagX: anchorX + minDist, flagY: anchorY };
}

function pickBubbleDirection(
  anchorX: number,
  anchorY: number,
  targetCountryId: string,
  piece: Feature<Geometry, GeoJsonProperties>,
  projection: GeoProjection,
  sortedHitFeatures: readonly CountryFeature[],
  pathDById: Map<string, string>,
  cardW: number,
  cardH: number,
  flagVisualScale: number,
  mapWidth: number,
  mapHeight: number,
  tuning: FlagBubbleSearchTuning,
  hintMapPoint?: [number, number]
): { flagX: number; flagY: number } {
  const minDist = computeBubbleMinDist(piece, projection, cardW, cardH, flagVisualScale);
  const margin = Math.max(cardW, cardH) * flagVisualScale * 0.6;
  const directionCount = Math.max(4, Math.min(64, Math.round(tuning.directionCount)));
  const sampleCols = Math.max(2, Math.min(10, Math.round(tuning.sampleCols)));
  const sampleRows = Math.max(2, Math.min(10, Math.round(tuning.sampleRows)));
  const distSteps = Math.max(
    1,
    Math.min(FLAG_BUBBLE_DISTANCE_MULTIPLIERS.length, Math.round(tuning.distanceStepCount))
  );
  const startAngle = bubbleSearchStartAngle(anchorX, anchorY, hintMapPoint);

  let bestScore = Infinity;
  let bestX = anchorX + minDist;
  let bestY = anchorY;

  for (let i = 0; i < directionCount; i++) {
    const angle = startAngle + (i / directionCount) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let di = 0; di < distSteps; di++) {
      const dist = minDist * FLAG_BUBBLE_DISTANCE_MULTIPLIERS[di]!;
      const fx = anchorX + cos * dist;
      const fy = anchorY + sin * dist;
      if (fx < margin || fy < margin || fx > mapWidth - margin || fy > mapHeight - margin) {
        continue;
      }
      const { other, target, sea } = sampleOverlapScore(
        fx,
        fy,
        cardW,
        cardH,
        flagVisualScale,
        targetCountryId,
        projection,
        sortedHitFeatures,
        pathDById,
        sampleCols,
        sampleRows
      );
      const score = other * 100 + target * 8 - sea * 2;
      if (score < bestScore) {
        bestScore = score;
        bestX = fx;
        bestY = fy;
        if (other === 0) {
          return { flagX: bestX, flagY: bestY };
        }
      }
    }
  }

  return { flagX: bestX, flagY: bestY };
}

export type ComputeFlagBubbleLayoutInput = {
  projection: GeoProjection;
  targetCountryId: string;
  targetFeature: CountryFeature;
  hitFeatures: readonly CountryFeature[];
  pathDById: Map<string, string>;
  flagVisualScale: number;
  cardW: number;
  cardH: number;
  thresholdPercent: number;
  mapWidth: number;
  mapHeight: number;
  /** d3-zoom の transform（画面に見えている地図範囲の算出に必須） */
  mapZoom: ZoomPlain;
  searchTuning?: FlagBubbleSearchTuning;
  /** true のとき方向探索をスキップ（重心に仮置き・非同期の先行表示用） */
  anchorPreviewOnly?: boolean;
  /** ドロップ位置など — 複数の見えているポリゴン片のうちどれを基準にするか */
  hintMapPoint?: [number, number];
};

/** パン・ズーム後に表示基準点だけ更新（吹き出し探索はやり直さない） */
export function refreshFlagLayoutForViewport(
  layout: FlagBubbleLayout,
  input: {
    projection: GeoProjection;
    targetFeature: CountryFeature;
    mapWidth: number;
    mapHeight: number;
    mapZoom: ZoomPlain;
    cardW: number;
    cardH: number;
    flagVisualScale: number;
    hintMapPoint?: [number, number];
  }
): FlagBubbleLayout | null {
  const margin = flagPlacementMarginPx(input.cardW, input.cardH, input.flagVisualScale);
  const base = visiblePlacementBaseForCountry(
    input.projection,
    input.targetFeature,
    layout.anchorX,
    layout.anchorY,
    input.mapWidth,
    input.mapHeight,
    margin,
    input.mapZoom
  );
  if (!base) return null;
  const [baseX, baseY] = base;
  const [flagX, flagY] = insetFlagCenterInVisibleMap(
    baseX + layout.placementOffsetX,
    baseY + layout.placementOffsetY,
    input.mapWidth,
    input.mapHeight,
    margin,
    input.mapZoom,
    input.cardW,
    input.cardH,
    input.flagVisualScale
  );
  return {
    ...layout,
    flagX,
    flagY,
  };
}

/**
 * 国旗が最大陸塊に対して大きいとき、周囲で他国との重なりが少ない方向へ吹き出す。
 */
export function computeFlagBubbleLayout(input: ComputeFlagBubbleLayoutInput): FlagBubbleLayout | null {
  const tuning = mergeFlagBubbleSearchTuning(
    input.searchTuning ?? DEFAULT_FLAG_BUBBLE_SEARCH_TUNING,
    input.hitFeatures.length
  );
  const anchor = projectMainlandCentroid(input.projection, input.targetFeature);
  if (!anchor) return null;
  const [anchorX, anchorY] = anchor;

  const margin = flagPlacementMarginPx(input.cardW, input.cardH, input.flagVisualScale);
  const placementBase = visiblePlacementBaseForCountry(
    input.projection,
    input.targetFeature,
    anchorX,
    anchorY,
    input.mapWidth,
    input.mapHeight,
    margin,
    input.mapZoom
  );
  if (!placementBase) return null;
  const [baseX, baseY] = insetFlagCenterInVisibleMap(
    placementBase[0],
    placementBase[1],
    input.mapWidth,
    input.mapHeight,
    margin,
    input.mapZoom,
    input.cardW,
    input.cardH,
    input.flagVisualScale
  );

  const piece = largestPolygonPieceFromFeature(input.targetFeature);
  const countryArea = piece
    ? projectedFeatureArea(input.projection, piece)
    : projectedFeatureArea(input.projection, input.targetFeature as Feature<Geometry, GeoJsonProperties>);

  const flagArea =
    input.cardW * input.cardH * input.flagVisualScale * input.flagVisualScale;
  const areaRatioPercent = countryArea > 1e-6 ? (flagArea / countryArea) * 100 : 999;

  const useBubble = areaRatioPercent >= input.thresholdPercent;

  if (!useBubble || input.anchorPreviewOnly) {
    return {
      anchorX,
      anchorY,
      flagX: baseX,
      flagY: baseY,
      useBubble: false,
      areaRatioPercent,
      placementOffsetX: 0,
      placementOffsetY: 0,
    };
  }

  const sortedHits = sortFeaturesForHitTest(input.hitFeatures);
  const pieceFeat = piece ?? input.targetFeature;
  const pieceGeom = pieceFeat as Feature<Geometry, GeoJsonProperties>;
  const picked = shouldSkipBubbleSearch(areaRatioPercent, input.thresholdPercent)
    ? pickBubbleDirectionMicrostate(
        baseX,
        baseY,
        pieceGeom,
        input.projection,
        input.cardW,
        input.cardH,
        input.flagVisualScale,
        input.mapWidth,
        input.mapHeight,
        input.hintMapPoint
      )
    : pickBubbleDirection(
        baseX,
        baseY,
        input.targetCountryId,
        pieceGeom,
        input.projection,
        sortedHits,
        input.pathDById,
        input.cardW,
        input.cardH,
        input.flagVisualScale,
        input.mapWidth,
        input.mapHeight,
        tuning,
        input.hintMapPoint
      );
  const [flagX, flagY] = insetFlagCenterInVisibleMap(
    picked.flagX,
    picked.flagY,
    input.mapWidth,
    input.mapHeight,
    margin,
    input.mapZoom,
    input.cardW,
    input.cardH,
    input.flagVisualScale
  );

  return {
    anchorX,
    anchorY,
    flagX,
    flagY,
    useBubble: true,
    areaRatioPercent,
    placementOffsetX: flagX - baseX,
    placementOffsetY: flagY - baseY,
  };
}
