import type { GeoProjection } from "d3-geo";
import { drawRegionMapCanvas } from "@/lib/flag-guesser/drawRegionMapCanvas";
import type { RegionRoundModel } from "@/lib/flag-guesser/types";
import type { ZoomPlain } from "@/lib/flag-guesser/viewportGeo";

export const MOBILE_DRAG_LOUPE_DIAM_PX = 120;
export const MOBILE_DRAG_LOUPE_MAG = 2.5;
/** 指位置（screen）からルーペ中心へのオフセット */
export const MOBILE_DRAG_LOUPE_OFFSET_X_PX = 36;
export const MOBILE_DRAG_LOUPE_OFFSET_Y_PX = -96;

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

export function loupeCenterScreenFromFinger(
  fingerSx: number,
  fingerSy: number,
  mapW: number,
  mapH: number,
  diam: number
): { x: number; y: number } {
  let x = fingerSx + MOBILE_DRAG_LOUPE_OFFSET_X_PX;
  let y = fingerSy + MOBILE_DRAG_LOUPE_OFFSET_Y_PX;
  const r = diam / 2;
  const pad = 6;
  x = Math.max(r + pad, Math.min(mapW - r - pad, x));
  y = Math.max(r + pad, Math.min(mapH - r - pad, y));
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
