import { geoPath, type GeoProjection } from "d3-geo";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import {
  countryIdAtPixel,
  largestPolygonPieceFromFeature,
  projectMainlandCentroid,
  projectedFeatureArea,
  sortFeaturesForHitTest,
} from "@/lib/flag-guesser/mapProjections";
import type { CountryFeature } from "@/lib/flag-guesser/types";

export type FlagBubbleLayout = {
  /** 最大陸塊重心（地図座標）— 指し示し先 */
  anchorX: number;
  anchorY: number;
  /** 国旗カード中心（地図座標） */
  flagX: number;
  flagY: number;
  useBubble: boolean;
  /** 国旗矩形面積 / 最大陸塊投影面積 × 100 */
  areaRatioPercent: number;
};

const DIRECTION_COUNT = 32;
const SAMPLE_COLS = 6;
const SAMPLE_ROWS = 5;

function flagHalfExtents(cardW: number, cardH: number, flagVisualScale: number) {
  const s = flagVisualScale;
  return { hw: (cardW * s) / 2, hh: (cardH * s) / 2 };
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
  hitFeatures: readonly CountryFeature[],
  pathDById: Map<string, string>
): { other: number; target: number; sea: number } {
  const { hw, hh } = flagHalfExtents(cardW, cardH, flagVisualScale);
  let other = 0;
  let target = 0;
  let sea = 0;
  for (let row = 0; row < SAMPLE_ROWS; row++) {
    for (let col = 0; col < SAMPLE_COLS; col++) {
      const u = (col + 0.5) / SAMPLE_COLS - 0.5;
      const v = (row + 0.5) / SAMPLE_ROWS - 0.5;
      const x = flagX + u * 2 * hw;
      const y = flagY + v * 2 * hh;
      const id = countryIdAtPixel(projection, hitFeatures, x, y, pathDById);
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

function pickBubbleDirection(
  anchorX: number,
  anchorY: number,
  targetCountryId: string,
  piece: Feature<Geometry, GeoJsonProperties>,
  projection: GeoProjection,
  hitFeatures: readonly CountryFeature[],
  pathDById: Map<string, string>,
  cardW: number,
  cardH: number,
  flagVisualScale: number,
  mapWidth: number,
  mapHeight: number
): { flagX: number; flagY: number } {
  const path = geoPath(projection);
  let minDist = Math.max(cardW, cardH) * flagVisualScale * 0.85;
  try {
    const [[x0, y0], [x1, y1]] = path.bounds(piece as Parameters<typeof path.bounds>[0]);
    const bw = Math.max(1, x1 - x0);
    const bh = Math.max(1, y1 - y0);
    minDist = Math.max(minDist, Math.max(bw, bh) * 0.42 + Math.max(cardW, cardH) * flagVisualScale * 0.35);
  } catch {
    /* keep default */
  }

  const margin = Math.max(cardW, cardH) * flagVisualScale * 0.6;
  let bestScore = Infinity;
  let bestX = anchorX + minDist;
  let bestY = anchorY;

  for (let i = 0; i < DIRECTION_COUNT; i++) {
    const angle = (i / DIRECTION_COUNT) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const distMul of [1, 1.18, 1.38]) {
      const dist = minDist * distMul;
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
        hitFeatures,
        pathDById
      );
      const score = other * 100 + target * 8 - sea * 2;
      if (score < bestScore) {
        bestScore = score;
        bestX = fx;
        bestY = fy;
      }
    }
  }

  return { flagX: bestX, flagY: bestY };
}

/**
 * 国旗が最大陸塊に対して大きいとき、周囲で他国との重なりが少ない方向へ吹き出す。
 */
export function computeFlagBubbleLayout(input: {
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
}): FlagBubbleLayout | null {
  const anchor = projectMainlandCentroid(input.projection, input.targetFeature);
  if (!anchor) return null;
  const [anchorX, anchorY] = anchor;

  const piece = largestPolygonPieceFromFeature(input.targetFeature);
  const countryArea = piece
    ? projectedFeatureArea(input.projection, piece)
    : projectedFeatureArea(input.projection, input.targetFeature as Feature<Geometry, GeoJsonProperties>);

  const flagArea =
    input.cardW * input.cardH * input.flagVisualScale * input.flagVisualScale;
  const areaRatioPercent = countryArea > 1e-6 ? (flagArea / countryArea) * 100 : 999;

  const useBubble = areaRatioPercent >= input.thresholdPercent;

  if (!useBubble) {
    return {
      anchorX,
      anchorY,
      flagX: anchorX,
      flagY: anchorY,
      useBubble: false,
      areaRatioPercent,
    };
  }

  const sortedHits = sortFeaturesForHitTest(input.hitFeatures);
  const pieceFeat = piece ?? input.targetFeature;
  const { flagX, flagY } = pickBubbleDirection(
    anchorX,
    anchorY,
    input.targetCountryId,
    pieceFeat as Feature<Geometry, GeoJsonProperties>,
    input.projection,
    sortedHits,
    input.pathDById,
    input.cardW,
    input.cardH,
    input.flagVisualScale,
    input.mapWidth,
    input.mapHeight
  );

  return {
    anchorX,
    anchorY,
    flagX,
    flagY,
    useBubble: true,
    areaRatioPercent,
  };
}
