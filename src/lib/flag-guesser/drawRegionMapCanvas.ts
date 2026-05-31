import { geoPath, type GeoPath, type GeoProjection } from "d3-geo";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { featureIdString, path2DFromPathString } from "@/lib/flag-guesser/mapProjections";
import type { CountryFeature } from "@/lib/flag-guesser/types";

export type MapRenderBackend = "svg" | "canvas";

const colorCache = new WeakMap<HTMLElement, Map<string, string>>();

/**
 * `color-mix` や CSS 変数を含む文字列を、Canvas `fillStyle` / `strokeStyle` 向けに解決する。
 */
export function resolveCssColorForCanvas(cssColor: string, probeMount: HTMLElement): string {
  let m = colorCache.get(probeMount);
  if (!m) {
    m = new Map();
    colorCache.set(probeMount, m);
  }
  const hit = m.get(cssColor);
  if (hit) return hit;
  const el = document.createElement("div");
  el.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:1px;height:1px;background-color:" +
    cssColor;
  probeMount.appendChild(el);
  const out = getComputedStyle(el).backgroundColor || cssColor;
  probeMount.removeChild(el);
  m.set(cssColor, out);
  return out;
}

export type DrawRegionMapCanvasParams = {
  ctx: CanvasRenderingContext2D;
  logicalW: number;
  logicalH: number;
  dpr: number;
  /** pathDById が欠けた feature 用のフォールバック（通常は未使用） */
  projection: GeoProjection;
  features: readonly CountryFeature[];
  /** モデル構築時に計算済みの path `d`（ズームは ctx transform のみ） */
  pathDById?: ReadonlyMap<string, string>;
  contextFeatures?: readonly CountryFeature[];
  contextPathDById?: ReadonlyMap<string, string>;
  contextFillResolved?: string;
  contextBorderStrokeResolved?: string;
  zoom: { x: number; y: number; k: number };
  fillForId: (id: string) => string;
  seaFillResolved: string;
  borderStrokeResolved: string;
  borderStrokeWidth: number;
  hoverStrokeResolved: string;
  hoverLineWidth: number;
  dragTargetStrokeResolved: string;
  hoverCountryId: string | null;
  dragTargetCountryId: string | null;
  drag: boolean;
  onDrawComplete?: () => void;
};

function pathDForFeature(
  f: CountryFeature,
  pathDById: ReadonlyMap<string, string> | undefined,
  fallback: GeoPath | null
): string | null {
  const id = featureIdString(f);
  if (id && pathDById?.has(id)) {
    const d = pathDById.get(id);
    if (d) return d;
  }
  if (!fallback) return null;
  return fallback(f as Feature<Geometry, GeoJsonProperties>) ?? null;
}

function combinedPathD(
  features: readonly CountryFeature[],
  pathDById: ReadonlyMap<string, string> | undefined,
  fallback: GeoPath | null
): string | null {
  let combined = "";
  for (const f of features) {
    const d = pathDForFeature(f, pathDById, fallback);
    if (d) combined += d;
  }
  return combined || null;
}

function path2DFromCombinedD(d: string | null): Path2D | null {
  if (!d) return null;
  return path2DFromPathString(d);
}

/**
 * Canvas 2D。pathDById を優先し、毎フレームの geoPath 再投影を避ける。
 */
export function drawRegionMapCanvas(p: DrawRegionMapCanvasParams): void {
  const {
    ctx,
    logicalW,
    logicalH,
    dpr,
    projection,
    features,
    pathDById,
    contextFeatures,
    contextPathDById,
    contextFillResolved,
    contextBorderStrokeResolved,
    zoom,
    fillForId,
    seaFillResolved,
    borderStrokeResolved,
    borderStrokeWidth,
    hoverStrokeResolved,
    hoverLineWidth,
    dragTargetStrokeResolved,
    hoverCountryId,
    dragTargetCountryId,
    drag,
    onDrawComplete,
  } = p;

  const needsGeoPathFallback =
    (contextFeatures?.length && !contextPathDById?.size) ||
    features.some((f) => {
      const id = featureIdString(f);
      return !id || !pathDById?.has(id);
    });
  const pathStringGen = needsGeoPathFallback ? geoPath(projection) : null;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, logicalW, logicalH);

  ctx.fillStyle = seaFillResolved;
  ctx.fillRect(0, 0, logicalW, logicalH);

  ctx.save();
  ctx.translate(zoom.x, zoom.y);
  ctx.scale(zoom.k, zoom.k);

  const k = Math.max(zoom.k, 0.08);
  const normalLineW = borderStrokeWidth / k;

  if (contextFeatures && contextFeatures.length > 0 && contextFillResolved) {
    const contextCombined = combinedPathD(contextFeatures, contextPathDById, pathStringGen);
    const contextPath = path2DFromCombinedD(contextCombined);
    if (contextPath) {
      ctx.fillStyle = contextFillResolved;
      ctx.fill(contextPath);
      if (contextBorderStrokeResolved) {
        ctx.strokeStyle = contextBorderStrokeResolved;
        ctx.lineWidth = normalLineW * 0.75;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash([]);
        ctx.stroke(contextPath);
      }
    }
  }

  const byFill = new Map<string, CountryFeature[]>();
  for (const f of features) {
    const id = String(f.id ?? "");
    const resolvedFill = fillForId(id);
    let arr = byFill.get(resolvedFill);
    if (!arr) {
      arr = [];
      byFill.set(resolvedFill, arr);
    }
    arr.push(f);
  }

  for (const [fillStyle, feats] of Array.from(byFill.entries())) {
    const combined = combinedPathD(feats, pathDById, pathStringGen);
    const path = path2DFromCombinedD(combined);
    if (!path) continue;
    ctx.fillStyle = fillStyle;
    ctx.fill(path);
  }

  const borderCombined = combinedPathD(features, pathDById, pathStringGen);
  const borderPath = path2DFromCombinedD(borderCombined);
  if (borderPath) {
    ctx.strokeStyle = borderStrokeResolved;
    ctx.lineWidth = normalLineW;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    ctx.stroke(borderPath);
  }

  if (drag && dragTargetCountryId) {
    const f = features.find((x) => String(x.id ?? "") === dragTargetCountryId);
    if (f) {
      const d = pathDForFeature(f, pathDById, pathStringGen);
      const ep = path2DFromCombinedD(d);
      if (ep) {
        ctx.strokeStyle = dragTargetStrokeResolved;
        ctx.lineWidth = hoverLineWidth * 1.05;
        ctx.stroke(ep);
      }
    }
  }

  if (!drag && hoverCountryId) {
    const f = features.find((x) => String(x.id ?? "") === hoverCountryId);
    if (f) {
      const d = pathDForFeature(f, pathDById, pathStringGen);
      const ep = path2DFromCombinedD(d);
      if (ep) {
        ctx.strokeStyle = hoverStrokeResolved;
        ctx.lineWidth = hoverLineWidth;
        ctx.stroke(ep);
      }
    }
  }

  ctx.restore();
  ctx.restore();

  onDrawComplete?.();
}
