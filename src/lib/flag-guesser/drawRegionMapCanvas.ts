import { geoPath, type GeoProjection } from "d3-geo";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
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
  projection: GeoProjection;
  features: readonly CountryFeature[];
  zoom: { x: number; y: number; k: number };
  centroidById: Map<string, [number, number]>;
  /** 各国 fill（CSS 文字列）→ Canvas 用に解決した色を返す */
  fillForId: (id: string) => string;
  seaFillResolved: string;
  borderStrokeResolved: string;
  borderStrokeWidth: number;
  hoverCountryId: string | null;
  pathHoverScale: number;
  drag: boolean;
};

/**
 * d3.geoPath + Canvas 2D。ズームは ctx.translate / scale で SVG の `<g transform>` と同等。
 */
export function drawRegionMapCanvas(p: DrawRegionMapCanvasParams): void {
  const {
    ctx,
    logicalW,
    logicalH,
    dpr,
    projection,
    features,
    zoom,
    centroidById,
    fillForId,
    seaFillResolved,
    borderStrokeResolved,
    borderStrokeWidth,
    hoverCountryId,
    pathHoverScale,
    drag,
  } = p;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, logicalW, logicalH);

  ctx.fillStyle = seaFillResolved;
  ctx.fillRect(0, 0, logicalW, logicalH);

  const pathGen = geoPath(projection);
  pathGen.context(ctx);

  ctx.save();
  ctx.translate(zoom.x, zoom.y);
  ctx.scale(zoom.k, zoom.k);

  const k = Math.max(zoom.k, 0.08);
  const lineW = borderStrokeWidth / k;
  const dashUnit = 1 / k;

  for (const f of features) {
    const id = String(f.id ?? "");
    ctx.save();
    const c = centroidById.get(id);
    const pathHover = !drag && hoverCountryId === id;
    if (c && pathHover) {
      ctx.translate(c[0], c[1]);
      ctx.scale(pathHoverScale, pathHoverScale);
      ctx.translate(-c[0], -c[1]);
    }

    ctx.beginPath();
    pathGen(f as Feature<Geometry, GeoJsonProperties>);
    ctx.fillStyle = fillForId(id);
    ctx.fill();

    ctx.strokeStyle = borderStrokeResolved;
    ctx.lineWidth = lineW;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([1.2 * dashUnit, 2.2 * dashUnit]);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
  ctx.restore();
}
