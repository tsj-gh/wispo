import type { GeoProjection } from "d3-geo";
import { drawRegionMapCanvas } from "@/lib/flag-guesser/drawRegionMapCanvas";
import type { RegionRoundModel } from "@/lib/flag-guesser/types";
import type { ZoomPlain } from "@/lib/flag-guesser/viewportGeo";

export const MOBILE_DRAG_LOUPE_MAG = 2.5;
/** 指位置（screen）からルーペ中心へのオフセット（デフォルト＝旧値の半分） */
export const DEFAULT_MOBILE_DRAG_LOUPE_OFFSET_X_PX = 18;
export const DEFAULT_MOBILE_DRAG_LOUPE_OFFSET_Y_PX = -48;
export const DEFAULT_MOBILE_DRAG_LOUPE_RADIUS_PX = 60;

/** 地図座標 mapX,mapY がルーペ円の中心に来るズーム */
export function zoomForLoupeCenteredOnMapPoint(
  mapX: number,
  mapY: number,
  baseZoom: ZoomPlain,
  loupeRadius: number,
  magnify: number
): ZoomPlain {
  const k = baseZoom.k * magnify;
  return {
    k,
    x: loupeRadius - mapX * k,
    y: loupeRadius - mapY * k,
  };
}

/** 指の screen 座標からルーペ中心（screen 座標）へ。ズーム変換の外側で 1:1 配置する */
export function loupeCenterScreenFromFinger(
  fingerSx: number,
  fingerSy: number,
  mapW: number,
  mapH: number,
  radiusPx: number,
  offsetXPx: number,
  offsetYPx: number
): { x: number; y: number } {
  let x = fingerSx + offsetXPx;
  let y = fingerSy + offsetYPx;
  const pad = 6;
  x = Math.max(radiusPx + pad, Math.min(mapW - radiusPx - pad, x));
  y = Math.max(radiusPx + pad, Math.min(mapH - radiusPx - pad, y));
  return { x, y };
}

export type DrawDragLoupeParams = {
  ctx: CanvasRenderingContext2D;
  diam: number;
  dpr: number;
  projection: GeoProjection;
  rm: RegionRoundModel;
  baseZoom: ZoomPlain;
  centerMapX: number;
  centerMapY: number;
  magnify: number;
  fillForId: (id: string) => string;
  seaFillResolved: string;
  contextFillResolved: string;
  contextBorderStrokeResolved: string;
  borderStrokeResolved: string;
  borderStrokeWidth: number;
  hoverStrokeResolved: string;
  hoverLineWidth: number;
  dragTargetStrokeResolved: string;
  hoverCountryId: string | null;
  dragTargetCountryId: string | null;
};

/** ドラッグ中ルーペ: 指下の地図を拡大描画 */
export function drawDragLoupeCanvas(p: DrawDragLoupeParams): void {
  const r = p.diam / 2;
  const loupeZoom = zoomForLoupeCenteredOnMapPoint(
    p.centerMapX,
    p.centerMapY,
    p.baseZoom,
    r,
    p.magnify
  );
  drawRegionMapCanvas({
    ctx: p.ctx,
    logicalW: p.diam,
    logicalH: p.diam,
    dpr: p.dpr,
    projection: p.projection,
    features: p.rm.allFeatures,
    pathDById: p.rm.pathDById,
    contextFeatures: p.rm.contextFeatures,
    contextPathDById: p.rm.contextPathDById,
    contextFillResolved: p.contextFillResolved,
    contextBorderStrokeResolved: p.contextBorderStrokeResolved,
    zoom: loupeZoom,
    fillForId: p.fillForId,
    seaFillResolved: p.seaFillResolved,
    borderStrokeResolved: p.borderStrokeResolved,
    borderStrokeWidth: p.borderStrokeWidth,
    hoverStrokeResolved: p.hoverStrokeResolved,
    hoverLineWidth: p.hoverLineWidth,
    dragTargetStrokeResolved: p.dragTargetStrokeResolved,
    hoverCountryId: p.hoverCountryId,
    dragTargetCountryId: p.dragTargetCountryId,
    drag: true,
  });
}
