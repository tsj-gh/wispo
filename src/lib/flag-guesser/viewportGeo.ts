import { geoBounds } from "d3-geo";
import { zoomIdentity } from "d3-zoom";
import type { GeoProjection } from "d3-geo";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import type { CountryFeature } from "./types";

/** d3-zoom の translate / scale を React state 用に保持するための素朴な型 */
export type ZoomPlain = { x: number; y: number; k: number };

export const ZOOM_IDENTITY: ZoomPlain = { x: 0, y: 0, k: 1 };

/** SVG 上のピクセル（左上原点）→ ズーム前の「地図」座標（projection と同じ空間） */
export function screenToMapSpace(sx: number, sy: number, z: ZoomPlain): [number, number] {
  return zoomIdentity.translate(z.x, z.y).scale(z.k).invert([sx, sy]) as [number, number];
}

/** 地図座標 → 画面上のピクセル */
export function mapSpaceToScreen(mx: number, my: number, z: ZoomPlain): [number, number] {
  return zoomIdentity.translate(z.x, z.y).scale(z.k).apply([mx, my]) as [number, number];
}

/**
 * 表示 Viewport（SVG 四隅）を経緯度の粗い矩形に射影。
 * Mercator の極付近などで invert が NaN になる点はスキップ。
 */
export function viewportLonLatBounds(
  projection: GeoProjection,
  width: number,
  height: number,
  z: ZoomPlain
): { lonMin: number; lonMax: number; latMin: number; latMax: number } | null {
  const corners: [number, number][] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let latMin = Infinity;
  let latMax = -Infinity;
  for (const [cx, cy] of corners) {
    const [mx, my] = screenToMapSpace(cx, cy, z);
    const inv = projection.invert?.([mx, my]);
    if (!inv || !Number.isFinite(inv[0]) || !Number.isFinite(inv[1])) continue;
    const [lo, la] = inv;
    lonMin = Math.min(lonMin, lo);
    lonMax = Math.max(lonMax, lo);
    latMin = Math.min(latMin, la);
    latMax = Math.max(latMax, la);
  }
  if (!Number.isFinite(lonMin) || !Number.isFinite(latMin)) return null;
  return { lonMin, lonMax, latMin, latMax };
}

export function geoBBoxLonLat(feature: CountryFeature) {
  const b = geoBounds(feature as Feature<Geometry, GeoJsonProperties>);
  const [[lonA, latA], [lonB, latB]] = b;
  return {
    lon0: Math.min(lonA, lonB),
    lon1: Math.max(lonA, lonB),
    lat0: Math.min(latA, latB),
    lat1: Math.max(latA, latB),
  };
}

export function bboxOverlapsViewport(
  box: ReturnType<typeof geoBBoxLonLat>,
  vp: { lonMin: number; lonMax: number; latMin: number; latMax: number }
): boolean {
  if (box.lon1 < vp.lonMin || box.lon0 > vp.lonMax) return false;
  if (box.lat1 < vp.latMin || box.lat0 > vp.latMax) return false;
  return true;
}

/** ビューポート矩形と geoBBox が重なる国 feature を列挙（全件走査） */
export function featuresOverlappingViewport(
  features: readonly CountryFeature[],
  vp: { lonMin: number; lonMax: number; latMin: number; latMax: number }
): CountryFeature[] {
  const out: CountryFeature[] = [];
  for (const f of features) {
    const bb = geoBBoxLonLat(f);
    if (bboxOverlapsViewport(bb, vp)) out.push(f);
  }
  return out;
}

/**
 * コピペ用: 画面中心の経緯度とズーム倍率 k。
 * projection の scale 値ではなく、d3-zoom の k（ユーザ指定の「倍率」に相当）。
 */
export function formatMapDebugSnippet(centerLonLat: [number, number], zoomK: number): string {
  const [lon, lat] = centerLonLat;
  return `center: [${lon.toFixed(4)}, ${lat.toFixed(4)}], scale: ${zoomK.toFixed(4)}`;
}
