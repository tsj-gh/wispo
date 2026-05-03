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
  fillForId: (id: string) => string;
  seaFillResolved: string;
  borderStrokeResolved: string;
  borderStrokeWidth: number;
  /** ホバー国の太い輪郭（陸地 fill ハイライトに代わる） */
  hoverStrokeResolved: string;
  hoverLineWidth: number;
  /** ドラッグ着弾候補の輪郭 */
  dragTargetStrokeResolved: string;
  hoverCountryId: string | null;
  dragTargetCountryId: string | null;
  drag: boolean;
};

/**
 * d3.geoPath + Canvas 2D。ズームは ctx.translate / scale で SVG の `<g transform>` と同等。
 * 国境は実線。ホバー／ドラッグ先は同じ path を太線で重ね描き。
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
  const normalLineW = borderStrokeWidth / k;

  for (const f of features) {
    const id = String(f.id ?? "");
    ctx.save();

    ctx.beginPath();
    pathGen(f as Feature<Geometry, GeoJsonProperties>);
    ctx.fillStyle = fillForId(id);
    ctx.fill();

    ctx.beginPath();
    pathGen(f as Feature<Geometry, GeoJsonProperties>);
    ctx.strokeStyle = borderStrokeResolved;
    ctx.lineWidth = normalLineW;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    ctx.stroke();

    const emphasisDrag = drag && dragTargetCountryId === id;
    const emphasisHover = !drag && hoverCountryId === id;
    if (emphasisDrag || emphasisHover) {
      ctx.beginPath();
      pathGen(f as Feature<Geometry, GeoJsonProperties>);
      ctx.strokeStyle = emphasisDrag ? dragTargetStrokeResolved : hoverStrokeResolved;
      ctx.lineWidth = emphasisDrag ? hoverLineWidth * 1.05 : hoverLineWidth;
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.restore();
  ctx.restore();
}
