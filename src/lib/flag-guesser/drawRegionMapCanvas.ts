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
  /**
   * プール外で「世界地図の文脈」用に背面描画する周辺国（任意）。
   * features より先に同じ投影・ズームで描く。ヒットテスト・判定の対象ではない。
   */
  contextFeatures?: readonly CountryFeature[];
  /** contextFeatures の fill（解決済み RGB）。指定なら全件まとめて 1 色で塗る */
  contextFillResolved?: string;
  /** contextFeatures の border stroke（解決済み RGB） */
  contextBorderStrokeResolved?: string;
  zoom: { x: number; y: number; k: number };
  /** 解決済み RGB の fillStyle 文字列を返す（同一色バッチ用） */
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
  /** 描画完了ごとに呼ぶ（FPS 計測用） */
  onDrawComplete?: () => void;
};

function safePath2D(d: string): Path2D | null {
  try {
    return new Path2D(d);
  } catch {
    return null;
  }
}

/**
 * d3.geoPath + Canvas 2D。同色 fill／共通国境ストロークをバッチ化。
 */
export function drawRegionMapCanvas(p: DrawRegionMapCanvasParams): void {
  const {
    ctx,
    logicalW,
    logicalH,
    dpr,
    projection,
    features,
    contextFeatures,
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

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, logicalW, logicalH);

  ctx.fillStyle = seaFillResolved;
  ctx.fillRect(0, 0, logicalW, logicalH);

  const pathStringGen = geoPath(projection);
  ctx.save();
  ctx.translate(zoom.x, zoom.y);
  ctx.scale(zoom.k, zoom.k);

  const k = Math.max(zoom.k, 0.08);
  const normalLineW = borderStrokeWidth / k;

  /* プール外の文脈用ポリゴンを先に背面描画（ヒットテスト無し） */
  if (contextFeatures && contextFeatures.length > 0 && contextFillResolved) {
    let combined = "";
    for (const f of contextFeatures) {
      const d = pathStringGen(f as Feature<Geometry, GeoJsonProperties>);
      if (d) combined += d;
    }
    if (combined) {
      const path = safePath2D(combined);
      if (path) {
        ctx.fillStyle = contextFillResolved;
        ctx.fill(path);
        if (contextBorderStrokeResolved) {
          ctx.strokeStyle = contextBorderStrokeResolved;
          ctx.lineWidth = normalLineW * 0.75;
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.setLineDash([]);
          ctx.stroke(path);
        }
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
    let combined = "";
    for (const f of feats) {
      const d = pathStringGen(f as Feature<Geometry, GeoJsonProperties>);
      if (d) combined += d;
    }
    if (!combined) continue;
    const path = safePath2D(combined);
    if (!path) continue;
    ctx.fillStyle = fillStyle;
    ctx.fill(path);
  }

  let borderCombined = "";
  for (const f of features) {
    const d = pathStringGen(f as Feature<Geometry, GeoJsonProperties>);
    if (d) borderCombined += d;
  }
  if (borderCombined) {
    const borderPath = safePath2D(borderCombined);
    if (borderPath) {
      ctx.strokeStyle = borderStrokeResolved;
      ctx.lineWidth = normalLineW;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash([]);
      ctx.stroke(borderPath);
    }
  }

  if (drag && dragTargetCountryId) {
    const f = features.find((x) => String(x.id ?? "") === dragTargetCountryId);
    if (f) {
      const d = pathStringGen(f as Feature<Geometry, GeoJsonProperties>);
      const ep = d ? safePath2D(d) : null;
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
      const d = pathStringGen(f as Feature<Geometry, GeoJsonProperties>);
      const ep = d ? safePath2D(d) : null;
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
