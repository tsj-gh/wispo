import { geoArea, geoBounds, geoCentroid, geoContains, geoMercator, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, Polygon } from "geojson";
import type { CountryFeature, Iso3166Row, RegionRoundModel } from "./types";
import { visibleMapRectInMapSpace, type ZoomPlain } from "./viewportGeo";

/**
 * ヒットテスト対象とする球面積（steradians）の上限。
 * Natural Earth `countries-10m` の Maldives (462) だけが ~37.7 と異常に大きく、
 * Path2D が画面ほぼ全域を内側と判定して海上クリックがモルディブになる不具合がある。
 * ロシア等の最大級でも ~0.42 未満のため 1.0 で十分に安全。
 */
export const MAX_PLAUSIBLE_COUNTRY_GEO_AREA_STERADIANS = 1;

/** 経度を基準子午線まわり 360° 未満の帯に収め、±180° 縫い目での分断を減らす */
export function unwrapLongitude(lon: number, centerMeridian: number): number {
  let L = lon;
  while (L > centerMeridian + 180) L -= 360;
  while (L < centerMeridian - 180) L += 360;
  return L;
}

function unwrapCoordinatesTree(coords: unknown, centerMeridian: number): unknown {
  if (!Array.isArray(coords)) return coords;
  if (
    coords.length >= 2 &&
    typeof coords[0] === "number" &&
    typeof coords[1] === "number"
  ) {
    const lon = coords[0] as number;
    const lat = coords[1] as number;
    const rest = coords.slice(2) as number[];
    return [unwrapLongitude(lon, centerMeridian), lat, ...rest];
  }
  return coords.map((c) => unwrapCoordinatesTree(c, centerMeridian));
}

function unwrapGeometry(geometry: Geometry, centerMeridian: number): Geometry {
  const g = JSON.parse(JSON.stringify(geometry)) as Geometry & {
    coordinates?: unknown;
    geometries?: Geometry[];
  };
  if (g.type === "GeometryCollection" && g.geometries) {
    g.geometries = g.geometries.map((sub) => unwrapGeometry(sub, centerMeridian));
    return g;
  }
  if ("coordinates" in g && g.coordinates !== undefined) {
    g.coordinates = unwrapCoordinatesTree(g.coordinates, centerMeridian) as never;
  }
  return g;
}

/** Region の重心経度（[-180,180]）を基準にする。bounds が異常に広いときも centroid にフォールバック */
export function computeUnwrapCenterMeridian(
  fc: FeatureCollection<Geometry, GeoJsonProperties>
): number {
  try {
    const [[lon0], [lon1]] = geoBounds(fc);
    if (Number.isFinite(lon0) && Number.isFinite(lon1)) {
      const span = lon1 - lon0;
      if (span > 0 && span <= 180) {
        const mid = (lon0 + lon1) / 2;
        return unwrapLongitude(mid, 0);
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const [lon] = geoCentroid(fc);
    if (Number.isFinite(lon)) return unwrapLongitude(lon as number, 0);
  } catch {
    /* fall through */
  }
  return 60;
}

export function cloneCountryFeatureUnwrapped(f: CountryFeature, centerMeridian: number): CountryFeature {
  if (!f.geometry) return { ...f };
  return {
    ...f,
    geometry: unwrapGeometry(f.geometry, centerMeridian),
  };
}

export function featureIdString(f: CountryFeature): string | null {
  const raw = f.id;
  if (raw === undefined || raw === null) return null;
  return String(raw);
}

/** geoPath が出力した `d` から Path2D をキャッシュ（ヒットテストのピーク負荷軽減） */
const path2dFromDCache = new Map<string, Path2D>();

/** geoPath の SVG path `d` から Path2D を返す（文字列ごとにキャッシュ） */
export function path2DFromPathString(d: string): Path2D | null {
  let p = path2dFromDCache.get(d);
  if (p) return p;
  try {
    p = new Path2D(d);
    path2dFromDCache.set(d, p);
    return p;
  } catch {
    return null;
  }
}

let hitTestCanvas: HTMLCanvasElement | null = null;
let hitTestCtx: CanvasRenderingContext2D | null = null;

function getHitTestContext2D(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!hitTestCtx) {
    hitTestCanvas = document.createElement("canvas");
    hitTestCanvas.width = hitTestCanvas.height = 8;
    hitTestCtx = hitTestCanvas.getContext("2d");
  }
  return hitTestCtx;
}

/**
 * `sortFeaturesForHitTest` 済みの一覧に対するヒットテスト（吹き出し探索など大量呼び出し向け）。
 */
export function countryIdAtPixelOnSorted(
  projection: GeoProjection,
  sortedFeatures: readonly CountryFeature[],
  x: number,
  y: number,
  pathDById?: ReadonlyMap<string, string>
): string | null {
  if (pathDById?.size) {
    const ctx = getHitTestContext2D();
    if (ctx && typeof Path2D !== "undefined") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const feat of sortedFeatures) {
        const id = featureIdString(feat);
        if (!id) continue;
        const area = geoArea(feat as Feature<Geometry, GeoJsonProperties>);
        if (area > MAX_PLAUSIBLE_COUNTRY_GEO_AREA_STERADIANS) continue;
        const d = pathDById.get(id);
        if (!d) continue;
        const p = path2DFromPathString(d);
        if (!p) continue;
        try {
          const inOdd = ctx.isPointInPath(p, x, y, "evenodd");
          const inNon = ctx.isPointInPath(p, x, y, "nonzero");
          if (inOdd || inNon) return id;
        } catch {
          /* Path2D が不正なときは下へフォールバック */
        }
      }
      return null;
    }
  }

  const inv = projection.invert?.([x, y]);
  if (!inv) return null;
  const [lon, lat] = inv;
  for (const feat of sortedFeatures) {
    const area = geoArea(feat as Feature<Geometry, GeoJsonProperties>);
    if (area > MAX_PLAUSIBLE_COUNTRY_GEO_AREA_STERADIANS) continue;
    if (geoContains(feat as Feature<Geometry, GeoJsonProperties>, [lon, lat])) {
      const id = featureIdString(feat);
      if (id) return id;
    }
  }
  return null;
}

/**
 * 画面上の点がどの国に属するか（面積の小さいポリゴンを先に判定）。
 *
 * `pathDById` があるときは **Mercator に投影した SVG path（画面と同一ジオメトリ）** に対して
 * `Path2D` + `isPointInPath` で判定する。球面の `geoContains` だけだと、島嶼・ズーム大で
 * 「海上なのにモルディブ」など描画と不一致になるケースがある。
 */
export function countryIdAtPixel(
  projection: GeoProjection,
  features: readonly CountryFeature[],
  x: number,
  y: number,
  pathDById?: ReadonlyMap<string, string>
): string | null {
  return countryIdAtPixelOnSorted(projection, sortFeaturesForHitTest(features), x, y, pathDById);
}

/** 海上クリック時、重心への近傍で国を拾うときの既定上限（画面上の px） */
export const DEFAULT_SEA_PROXIMITY_MAX_SNAP_SCREEN_PX = 52;
/** 最近傍 A と次点 B の距離差がこれ未満ならスナップしない（画面上の px） */
export const DEFAULT_SEA_PROXIMITY_MIN_GAP_SCREEN_PX = 18;

export type CountryProximitySnapOptions = {
  /** d3-zoom の k（map 座標 1 単位 ≈ k screen px） */
  zoomK: number;
  maxSnapScreenPx?: number;
  minGapScreenPx?: number;
};

/**
 * ポリゴン内ヒットを優先し、海上では重心距離で最近傍国を補正する。
 * 国 A が最近傍かつ、次点 B までの距離差が十分大きいときだけ A を返す。
 */
export function countryIdAtPixelWithSeaProximity(
  projection: GeoProjection,
  features: readonly CountryFeature[],
  x: number,
  y: number,
  pathDById: ReadonlyMap<string, string> | undefined,
  opts: CountryProximitySnapOptions
): string | null {
  const polygonHit = countryIdAtPixel(projection, features, x, y, pathDById);
  if (polygonHit) return polygonHit;

  const k = Math.max(opts.zoomK, 0.06);
  const maxDist = (opts.maxSnapScreenPx ?? DEFAULT_SEA_PROXIMITY_MAX_SNAP_SCREEN_PX) / k;
  const minGap = (opts.minGapScreenPx ?? DEFAULT_SEA_PROXIMITY_MIN_GAP_SCREEN_PX) / k;

  const distances: { id: string; dist: number }[] = [];
  for (const feat of features) {
    const id = featureIdString(feat);
    if (!id) continue;
    const area = geoArea(feat as Feature<Geometry, GeoJsonProperties>);
    if (area > MAX_PLAUSIBLE_COUNTRY_GEO_AREA_STERADIANS) continue;
    const centroid = projectCentroid(projection, feat);
    if (!centroid) continue;
    const dist = Math.hypot(centroid[0] - x, centroid[1] - y);
    distances.push({ id, dist });
  }

  if (distances.length === 0) return null;
  distances.sort((a, b) => a.dist - b.dist);

  const nearest = distances[0]!;
  if (nearest.dist > maxDist) return null;

  if (distances.length === 1) return nearest.id;

  const second = distances[1]!;
  if (second.dist - nearest.dist >= minGap) return nearest.id;
  return null;
}

export type CountryDragSnapOptions = {
  /** d3-zoom の k（map 座標 1 単位 ≈ k screen px） */
  zoomK: number;
  /** 直前にヒットした国（海上ドラッグで維持・全重心走査はしない） */
  stickyCountryId?: string | null;
  stickyMaxScreenPx?: number;
};

/**
 * ドラッグ中の着弾候補: ポリゴンヒット優先。海上は `stickyCountryId` が
 * 重心の近傍にあるときだけ維持（`countryIdAtPixelWithSeaProximity` より軽い）。
 */
export function countryIdAtPixelForDrag(
  projection: GeoProjection,
  sortedFeatures: readonly CountryFeature[],
  x: number,
  y: number,
  pathDById: ReadonlyMap<string, string> | undefined,
  opts: CountryDragSnapOptions
): string | null {
  const hit = countryIdAtPixelOnSorted(projection, sortedFeatures, x, y, pathDById);
  if (hit) return hit;

  const sticky = opts.stickyCountryId;
  if (!sticky) return null;

  const k = Math.max(opts.zoomK, 0.06);
  const maxDist = (opts.stickyMaxScreenPx ?? DEFAULT_SEA_PROXIMITY_MAX_SNAP_SCREEN_PX) / k;

  for (const feat of sortedFeatures) {
    const id = featureIdString(feat);
    if (id !== sticky) continue;
    const centroid = projectCentroid(projection, feat);
    if (!centroid) return null;
    return Math.hypot(centroid[0] - x, centroid[1] - y) <= maxDist ? sticky : null;
  }
  return null;
}

/**
 * フィルタ済み Feature の bounding を中央フィットする Mercator を構築。
 * `centralMeridian` を渡すと `rotate([-λ,0,0])` で縫い目をデータから逃がしてから fit する。
 */
export function buildMercatorForCollection(
  collection: FeatureCollection<Geometry, GeoJsonProperties>,
  width: number,
  height: number,
  pad = 8,
  centralMeridian?: number
): GeoProjection {
  const projection = geoMercator();
  if (centralMeridian !== undefined && Number.isFinite(centralMeridian)) {
    projection.rotate([-centralMeridian, 0, 0]);
  }
  projection.fitExtent(
    [
      [pad, pad],
      [Math.max(1, width - pad), Math.max(1, height - pad)],
    ],
    collection as FeatureCollection
  );
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  projection.clipExtent([
    [0, 0],
    [w, h],
  ]);
  return projection;
}

export function buildPathStrings(
  projection: GeoProjection,
  features: readonly CountryFeature[]
): Map<string, string> {
  const path = geoPath(projection);
  const m = new Map<string, string>();
  for (const f of features) {
    const id = featureIdString(f);
    if (!id) continue;
    const d = path(f as Parameters<typeof path>[0]);
    if (d) m.set(id, d);
  }
  return m;
}

/**
 * ヒットテスト用：球面面積の小さい順（島・小国を優先）。
 */
export function sortFeaturesForHitTest(features: readonly CountryFeature[]): CountryFeature[] {
  return [...features].sort((a, b) => geoArea(a) - geoArea(b));
}

export function projectCentroid(projection: GeoProjection, feat: CountryFeature): [number, number] | null {
  const c = geoCentroid(feat as Feature<Geometry, GeoJsonProperties>);
  const p = projection(c as [number, number]);
  if (!p) return null;
  return [p[0]!, p[1]!];
}

/** MultiPolygon / GeometryCollection を個別 Polygon に分解 */
function polygonPiecesFromGeometry(geometry: Geometry): Feature<Polygon, GeoJsonProperties>[] {
  if (geometry.type === "Polygon") {
    return [{ type: "Feature", properties: {}, geometry }];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((coords) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Polygon" as const, coordinates: coords },
    }));
  }
  if (geometry.type === "GeometryCollection") {
    const out: Feature<Polygon, GeoJsonProperties>[] = [];
    for (const g of geometry.geometries) {
      out.push(...polygonPiecesFromGeometry(g));
    }
    return out;
  }
  return [];
}

function largestPolygonPieceFromGeometry(
  geometry: Geometry
): Feature<Polygon, GeoJsonProperties> | null {
  let best: Feature<Polygon, GeoJsonProperties> | null = null;
  let bestArea = -1;
  for (const piece of polygonPiecesFromGeometry(geometry)) {
    const area = geoArea(piece as Feature<Geometry, GeoJsonProperties>);
    if (area > MAX_PLAUSIBLE_COUNTRY_GEO_AREA_STERADIANS) continue;
    if (area > bestArea) {
      bestArea = area;
      best = piece;
    }
  }
  return best;
}

/** 球面積が最大のポリゴン一片（海外領・離島で重心が海に寄るのを避ける） */
export function largestPolygonPieceFromFeature(
  feat: CountryFeature
): Feature<Polygon, GeoJsonProperties> | null {
  if (!feat.geometry) return null;
  return largestPolygonPieceFromGeometry(feat.geometry);
}

/**
 * 全ポリゴンの球面積が最大の一片の重心（コルシカ・海外領などで全体重心が海に寄るのを避ける）。
 */
export function geoCentroidOfLargestPolygonPiece(geometry: Geometry | null | undefined): [number, number] | null {
  if (!geometry) return null;
  const best = largestPolygonPieceFromGeometry(geometry);
  if (!best) return null;
  const c = geoCentroid(best as Feature<Geometry, GeoJsonProperties>);
  if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
  return [c[0]!, c[1]!];
}

/** 現在の投影におけるポリゴン面積（px²・比較用） */
export function projectedFeatureArea(
  projection: GeoProjection,
  feat: Feature<Geometry, GeoJsonProperties>
): number {
  try {
    const a = geoPath(projection).area(feat as Parameters<ReturnType<typeof geoPath>["area"]>[0]);
    return Number.isFinite(a) && a > 0 ? a : 0;
  } catch {
    return 0;
  }
}

/** 国旗吸着・正誤演出の錨 — 最大陸塊の重心を投影座標へ */
export function projectMainlandCentroid(
  projection: GeoProjection,
  feat: CountryFeature
): [number, number] | null {
  const c =
    geoCentroidOfLargestPolygonPiece(feat.geometry) ??
    (() => {
      const fallback = geoCentroid(feat as Feature<Geometry, GeoJsonProperties>);
      return Number.isFinite(fallback[0]) && Number.isFinite(fallback[1])
        ? ([fallback[0]!, fallback[1]!] as [number, number])
        : null;
    })();
  if (!c) return null;
  const p = projection(c);
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  return [p[0]!, p[1]!];
}

type ProjectedMapRect = { x0: number; y0: number; x1: number; y1: number };

function intersectProjectedBoundsWithMapRect(
  [[bx0, by0], [bx1, by1]]: [[number, number], [number, number]],
  rect: ProjectedMapRect
): ProjectedMapRect | null {
  const x0 = Math.max(Math.min(bx0, bx1), rect.x0);
  const y0 = Math.max(Math.min(by0, by1), rect.y0);
  const x1 = Math.min(Math.max(bx0, bx1), rect.x1);
  const y1 = Math.min(Math.max(by0, by1), rect.y1);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x0, y0, x1, y1 };
}

function pointInProjectedMapRect(x: number, y: number, r: ProjectedMapRect): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/** 線分と軸平行矩形の交点（盤面内に見える辺の端点を拾う） */
function clipSegmentToMapRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rect: ProjectedMapRect,
  onPoint: (x: number, y: number) => void
): void {
  const { x0: xMin, y0: yMin, x1: xMax, y1: yMax } = rect;

  const inside = (x: number, y: number) => x >= xMin && x <= xMax && y >= yMin && y <= yMax;
  if (inside(ax, ay)) onPoint(ax, ay);
  if (inside(bx, by)) onPoint(bx, by);

  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;

  const ts: number[] = [];
  if (Math.abs(dx) > 1e-9) {
    ts.push((xMin - ax) / dx, (xMax - ax) / dx);
  }
  if (Math.abs(dy) > 1e-9) {
    ts.push((yMin - ay) / dy, (yMax - ay) / dy);
  }
  for (const t of ts) {
    if (t < 0 || t > 1) continue;
    const x = ax + t * dx;
    const y = ay + t * dy;
    if (inside(x, y)) onPoint(x, y);
  }
}

/**
 * ポリゴン片のうち **ビューポート内に投影された頂点・辺** だけから可視 bbox を作る。
 * `path.bounds` 全体（日付変更線で画面幅いっぱいになる国）を避ける。
 */
function visibleProjectedRectFromPieceInMapRect(
  projection: GeoProjection,
  piece: Feature<Polygon, GeoJsonProperties>,
  visibleMapRect: ProjectedMapRect
): ProjectedMapRect | null {
  const geom = piece.geometry;
  if (geom.type !== "Polygon") return null;

  const points: [number, number][] = [];
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    points.push([x, y]);
  };

  for (const ring of geom.coordinates) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const pa = projection([a[0], a[1]]);
      const pb = projection([b[0], b[1]]);
      if (!pa || !pb) continue;
      clipSegmentToMapRect(pa[0]!, pa[1]!, pb[0]!, pb[1]!, visibleMapRect, add);
    }
  }

  if (!points.length) return null;
  let x0 = points[0]![0];
  let y0 = points[0]![1];
  let x1 = x0;
  let y1 = y0;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x0, y0, x1, y1 };
}

/** 国のポリゴンが現在の画面表示（ズーム・パン後）と重なっているか */
function countryFootprintVisibleOnMap(
  projection: GeoProjection,
  feat: CountryFeature,
  visibleMapRect: ProjectedMapRect
): boolean {
  const geometry = feat.geometry;
  if (!geometry) return false;
  const path = geoPath(projection);

  for (const piece of polygonPiecesFromGeometry(geometry)) {
    if (visibleProjectedRectFromPieceInMapRect(projection, piece, visibleMapRect)) {
      return true;
    }
    try {
      const bounds = path.bounds(piece as Parameters<typeof path.bounds>[0]);
      if (intersectProjectedBoundsWithMapRect(bounds, visibleMapRect)) {
        return true;
      }
    } catch {
      /* skip */
    }
  }
  return false;
}

/**
 * 国旗の表示基準点（地図座標）。
 * - 重心が **現在画面に見えている地図範囲** 内 → 重心
 * - 重心は画面外だが国ポリゴンが見えている → 重心をその可視範囲の辺へクランプ
 * - 国が画面に見えない → null
 */
export function visiblePlacementBaseForCountry(
  projection: GeoProjection,
  feat: CountryFeature,
  trueAnchorX: number,
  trueAnchorY: number,
  mapWidth: number,
  mapHeight: number,
  marginPx: number,
  mapZoom: ZoomPlain
): [number, number] | null {
  const vp = visibleMapRectInMapSpace(mapWidth, mapHeight, marginPx, mapZoom);

  if (pointInProjectedMapRect(trueAnchorX, trueAnchorY, vp)) {
    return [trueAnchorX, trueAnchorY];
  }

  if (!countryFootprintVisibleOnMap(projection, feat, vp)) {
    return null;
  }

  return [
    Math.max(vp.x0, Math.min(vp.x1, trueAnchorX)),
    Math.max(vp.y0, Math.min(vp.y1, trueAnchorY)),
  ];
}

type BuildRoundInput = {
  target: Iso3166Row;
  region: string;
  allFeatures: CountryFeature[];
  isoByCode: Map<string, Iso3166Row>;
  width: number;
  height: number;
  /** 文脈用の低 LOD 全世界 features（未指定なら allFeatures を使用） */
  contextWorldFeatures?: readonly CountryFeature[];
};

/**
 * 同一 Region のポリゴンのみ集め、投影と path d を返す（純粋・Worker 向け分離の核）。
 */
export function filterFeaturesByRegion(
  allFeatures: readonly CountryFeature[],
  region: string,
  isoByCode: Map<string, Iso3166Row>
): CountryFeature[] {
  const inRegion: CountryFeature[] = [];
  for (const f of allFeatures) {
    const id = featureIdString(f);
    if (!id) continue;
    const row = isoByCode.get(id);
    if (!row || !row.region || row.region !== region) continue;
    inRegion.push(f);
  }
  return inRegion;
}

/**
 * FlagExplorerMapSelect / explorer プリセットと同じ全世界 Mercator。
 * 学習モードの初期ズーム（lon,lat,k）をプリセットと揃えるために使う。
 */
export function buildExplorerWorldMapProjection(
  filteredWorldFeatures: readonly CountryFeature[],
  width: number,
  height: number
): { projection: GeoProjection; unwrapCenterMeridian: number } | null {
  if (!filteredWorldFeatures.length || width < 32 || height < 32) return null;
  const fc: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: filteredWorldFeatures as Feature<Geometry, GeoJsonProperties>[],
  };
  const unwrapCenterMeridian = computeUnwrapCenterMeridian(fc);
  const unwrapped = filteredWorldFeatures.map((f) => cloneCountryFeatureUnwrapped(f, unwrapCenterMeridian));
  const fcUnwrapped: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: unwrapped as Feature<Geometry, GeoJsonProperties>[],
  };
  const projection = buildMercatorForCollection(fcUnwrapped, width, height, 8, unwrapCenterMeridian);
  return { projection, unwrapCenterMeridian };
}

/** カリキュラム段階のプール（numeric country-code 集合）に含まれるポリゴンのみ */
export function filterFeaturesByCountryCodes(
  allFeatures: readonly CountryFeature[],
  countryCodes: Set<string>
): CountryFeature[] {
  const out: CountryFeature[] = [];
  for (const f of allFeatures) {
    const id = featureIdString(f);
    if (id && countryCodes.has(id)) out.push(f);
  }
  return out;
}

/**
 * プール外の世界国を「文脈用ポリゴン」として返す。
 *
 * 初期視認範囲の周辺で世界地図としての連続性を保つため、難易度・sub_region フィルタに
 * 関わらず Topo に載る全国（プールを除く）を背面に描画するための入力を作る。
 * `inPoolIds` に含まれる feature は除外する。
 * unwrap は呼び出し側の `unwrapCenterMeridian` を必ず使うこと（プールと同じ縫い目処理）。
 *
 * 性能最適化（段階 1）:
 * - `sourceWorldFeatures` には必ず低 LOD（110m 等）を渡すこと。高 LOD の頂点数で
 *   全世界 ~200 国分を描くと高ズーム時に重くなる（context はミュート色なので
 *   荒くても視認上は十分）。
 * - `inPoolBounds` が与えられたとき、その bounding box を中心に `paddingMultiplier`
 *   倍へ拡張した矩形に **bounds が掛からない** context は破棄する（フラスタムカリング）。
 *   inPoolBounds がない場合は全件残す（後方互換）。
 */
function buildContextFeaturesAndPaths(
  sourceWorldFeatures: readonly CountryFeature[],
  inPoolIds: ReadonlySet<string>,
  unwrapCenterMeridian: number,
  projection: GeoProjection,
  cullOpts?: {
    /** 投影後の in-pool 全体の bounding box（map 座標, [[x0,y0],[x1,y1]]） */
    inPoolBounds: [[number, number], [number, number]];
    /** 中心からの拡大倍率。4 ≈ in-pool の幅・高さの 4 倍以内まで残す */
    paddingMultiplier: number;
    /** 拡大後の半幅・半高の最小値（map px）。ズーム = preset.k のとき
     *  画面の何割を覆うかの実用最小ガードに使う。 */
    minHalfExtent: number;
  }
): { contextFeatures: CountryFeature[]; contextPathDById: Map<string, string> } {
  const cloned: CountryFeature[] = [];
  for (const f of sourceWorldFeatures) {
    const id = featureIdString(f);
    if (!id || inPoolIds.has(id)) continue;
    cloned.push(cloneCountryFeatureUnwrapped(f, unwrapCenterMeridian));
  }

  let kept: CountryFeature[] = cloned;
  if (cullOpts) {
    const path = geoPath(projection);
    const [[x0, y0], [x1, y1]] = cullOpts.inPoolBounds;
    const bw = Math.max(1, x1 - x0);
    const bh = Math.max(1, y1 - y0);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const halfW = Math.max((bw / 2) * cullOpts.paddingMultiplier, cullOpts.minHalfExtent);
    const halfH = Math.max((bh / 2) * cullOpts.paddingMultiplier, cullOpts.minHalfExtent);
    const vx0 = cx - halfW;
    const vx1 = cx + halfW;
    const vy0 = cy - halfH;
    const vy1 = cy + halfH;
    kept = [];
    for (const f of cloned) {
      try {
        const [[bx0, by0], [bx1, by1]] = path.bounds(f as Parameters<typeof path.bounds>[0]);
        if (!Number.isFinite(bx0) || !Number.isFinite(by0)) continue;
        // bbox が完全に外側ならスキップ（縫い目をまたぐ巨大 bounds は内側に重なるので残る）
        if (bx1 < vx0 || bx0 > vx1 || by1 < vy0 || by0 > vy1) continue;
        kept.push(f);
      } catch {
        /* bounds 計算失敗は単純に外す（描画しない方が安全） */
      }
    }
  }

  const contextPathDById = buildPathStrings(projection, kept);
  return { contextFeatures: kept, contextPathDById };
}

function inPoolIdsOf(features: readonly CountryFeature[]): Set<string> {
  const s = new Set<string>();
  for (const f of features) {
    const id = featureIdString(f);
    if (id) s.add(id);
  }
  return s;
}

/**
 * context フラスタムカリング用の標準パラメータ。
 * - paddingMultiplier = 4: in-pool の bounding box を 4 倍に広げた領域に重なる国だけ残す。
 *   Western Europe 出題なら欧州 + 北アフリカ + ロシア西側くらいまで広がる。
 * - minHalfExtent: in-pool が極小（1 国だけ等）でも視野直径ぶんは確保する。
 *   投影は通常 width/height の数倍の map px を持つので、画面短辺の 1.5 倍を下限にする。
 */
function defaultContextCullOpts(
  inPoolBounds: [[number, number], [number, number]],
  width: number,
  height: number
): {
  inPoolBounds: [[number, number], [number, number]];
  paddingMultiplier: number;
  minHalfExtent: number;
} {
  return {
    inPoolBounds,
    paddingMultiplier: 4,
    minHalfExtent: Math.min(width, height) * 1.5,
  };
}

function safeBoundsOf(
  projection: GeoProjection,
  features: readonly CountryFeature[]
): [[number, number], [number, number]] | null {
  try {
    const path = geoPath(projection);
    const fc: FeatureCollection<Geometry, GeoJsonProperties> = {
      type: "FeatureCollection",
      features: features as Feature<Geometry, GeoJsonProperties>[],
    };
    const b = path.bounds(fc);
    if (
      !Number.isFinite(b[0][0]) ||
      !Number.isFinite(b[0][1]) ||
      !Number.isFinite(b[1][0]) ||
      !Number.isFinite(b[1][1])
    ) {
      return null;
    }
    return b as [[number, number], [number, number]];
  } catch {
    return null;
  }
}

type BuildPoolRoundInput = {
  target: Iso3166Row;
  countryCodes: Set<string>;
  allFeatures: CountryFeature[];
  width: number;
  height: number;
  /** 文脈用の低 LOD 全世界 features（未指定なら allFeatures を使用） */
  contextWorldFeatures?: readonly CountryFeature[];
};

type BuildCurriculumMapRoundInput = {
  target: Iso3166Row;
  countryCodes: Set<string>;
  filteredWorldFeatures: readonly CountryFeature[];
  width: number;
  height: number;
  /** 文脈用の低 LOD 全世界 features（未指定なら filteredWorldFeatures を使用） */
  contextWorldFeatures?: readonly CountryFeature[];
};

/**
 * 描画は sub_region 内の国のみ。投影は explorer と同じ全世界フィット（プリセット lon/lat/k 用）。
 */
export function buildCurriculumMapRoundModel(input: BuildCurriculumMapRoundInput): RegionRoundModel {
  const { target, countryCodes, filteredWorldFeatures, width, height, contextWorldFeatures } = input;
  const world = buildExplorerWorldMapProjection(filteredWorldFeatures, width, height);
  if (!world) throw new Error("curriculum world projection failed");

  const inPoolRaw = filterFeaturesByCountryCodes(filteredWorldFeatures, countryCodes);
  if (inPoolRaw.length === 0) throw new Error("curriculum map has no features");

  const inPool = inPoolRaw.map((f) => cloneCountryFeatureUnwrapped(f, world.unwrapCenterMeridian));
  const collection: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: inPool as Feature<Geometry, GeoJsonProperties>[],
  };
  const pathDById = buildPathStrings(world.projection, inPool);
  const poolBounds = safeBoundsOf(world.projection, inPool);
  const { contextFeatures, contextPathDById } = buildContextFeaturesAndPaths(
    contextWorldFeatures ?? filteredWorldFeatures,
    inPoolIdsOf(inPool),
    world.unwrapCenterMeridian,
    world.projection,
    poolBounds ? defaultContextCullOpts(poolBounds, width, height) : undefined
  );

  return {
    target,
    regionCollection: collection,
    allFeatures: inPool,
    projection: world.projection,
    pathDById,
    contextFeatures,
    contextPathDById,
    width,
    height,
    unwrapCenterMeridian: world.unwrapCenterMeridian,
  };
}

type SameCurriculumMapProjectionInput = {
  target: Iso3166Row;
  countryCodes: Set<string>;
  projection: GeoProjection;
  filteredWorldFeatures: readonly CountryFeature[];
  width: number;
  height: number;
  unwrapCenterMeridian: number;
  /** 文脈用の低 LOD 全世界 features（未指定なら filteredWorldFeatures を使用） */
  contextWorldFeatures?: readonly CountryFeature[];
};

/** 凍結した全世界投影のまま sub_region の国土だけ差し替え（LOD 切替用）。 */
export function buildCurriculumMapRoundModelSameProjection(
  input: SameCurriculumMapProjectionInput
): RegionRoundModel {
  const {
    target,
    countryCodes,
    projection,
    filteredWorldFeatures,
    width,
    height,
    unwrapCenterMeridian,
    contextWorldFeatures,
  } = input;
  const inPoolRaw = filterFeaturesByCountryCodes(filteredWorldFeatures, countryCodes);
  if (inPoolRaw.length === 0) throw new Error("curriculum map has no features");
  const inPool = inPoolRaw.map((f) => cloneCountryFeatureUnwrapped(f, unwrapCenterMeridian));
  const collection: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: inPool as Feature<Geometry, GeoJsonProperties>[],
  };
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  projection.clipExtent([
    [0, 0],
    [w, h],
  ]);
  const pathDById = buildPathStrings(projection, inPool);
  const poolBounds = safeBoundsOf(projection, inPool);
  const { contextFeatures, contextPathDById } = buildContextFeaturesAndPaths(
    contextWorldFeatures ?? filteredWorldFeatures,
    inPoolIdsOf(inPool),
    unwrapCenterMeridian,
    projection,
    poolBounds ? defaultContextCullOpts(poolBounds, w, h) : undefined
  );
  return {
    target,
    regionCollection: collection,
    allFeatures: inPool,
    projection,
    pathDById,
    contextFeatures,
    contextPathDById,
    width,
    height,
    unwrapCenterMeridian,
  };
}

/**
 * プール内の国だけで Mercator をフィット（レガシー／プリセット無し時のフォールバック）。
 */
export function buildPoolRoundModel(input: BuildPoolRoundInput): RegionRoundModel {
  const { target, countryCodes, allFeatures, width, height, contextWorldFeatures } = input;
  const inPoolRaw = filterFeaturesByCountryCodes(allFeatures, countryCodes);

  if (inPoolRaw.length === 0) {
    throw new Error("pool has no mappable features");
  }

  const fcRaw: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: inPoolRaw as Feature<Geometry, GeoJsonProperties>[],
  };
  const unwrapCenterMeridian = computeUnwrapCenterMeridian(fcRaw);
  const inPool = inPoolRaw.map((f) => cloneCountryFeatureUnwrapped(f, unwrapCenterMeridian));

  const collection: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: inPool as Feature<Geometry, GeoJsonProperties>[],
  };
  const projection = buildMercatorForCollection(collection, width, height, 8, unwrapCenterMeridian);
  const pathDById = buildPathStrings(projection, inPool);
  const poolBounds = safeBoundsOf(projection, inPool);
  const { contextFeatures, contextPathDById } = buildContextFeaturesAndPaths(
    contextWorldFeatures ?? allFeatures,
    inPoolIdsOf(inPool),
    unwrapCenterMeridian,
    projection,
    poolBounds ? defaultContextCullOpts(poolBounds, width, height) : undefined
  );

  return {
    target,
    regionCollection: collection,
    allFeatures: inPool,
    projection,
    pathDById,
    contextFeatures,
    contextPathDById,
    width,
    height,
    unwrapCenterMeridian,
  };
}

type SamePoolProjectionInput = {
  target: Iso3166Row;
  countryCodes: Set<string>;
  projection: GeoProjection;
  allWorldFeatures: CountryFeature[];
  width: number;
  height: number;
  unwrapCenterMeridian: number;
  /** 文脈用の低 LOD 全世界 features（未指定なら allWorldFeatures を使用） */
  contextWorldFeatures?: readonly CountryFeature[];
};

/** 凍結投影のままプール内の国土だけ差し替え（LOD 切替用）。 */
export function buildPoolRoundModelSameProjection(input: SamePoolProjectionInput): RegionRoundModel {
  const {
    target,
    countryCodes,
    projection,
    allWorldFeatures,
    width,
    height,
    unwrapCenterMeridian,
    contextWorldFeatures,
  } = input;
  const inPoolRaw = filterFeaturesByCountryCodes(allWorldFeatures, countryCodes);
  if (inPoolRaw.length === 0) {
    throw new Error("pool has no mappable features");
  }
  const inPool = inPoolRaw.map((f) => cloneCountryFeatureUnwrapped(f, unwrapCenterMeridian));
  const collection: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: inPool as Feature<Geometry, GeoJsonProperties>[],
  };
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  projection.clipExtent([
    [0, 0],
    [w, h],
  ]);
  const pathDById = buildPathStrings(projection, inPool);
  const poolBounds = safeBoundsOf(projection, inPool);
  const { contextFeatures, contextPathDById } = buildContextFeaturesAndPaths(
    contextWorldFeatures ?? allWorldFeatures,
    inPoolIdsOf(inPool),
    unwrapCenterMeridian,
    projection,
    poolBounds ? defaultContextCullOpts(poolBounds, w, h) : undefined
  );
  return {
    target,
    regionCollection: collection,
    allFeatures: inPool,
    projection,
    pathDById,
    contextFeatures,
    contextPathDById,
    width,
    height,
    unwrapCenterMeridian,
  };
}

export function buildRegionRoundModel(input: BuildRoundInput): RegionRoundModel {
  const { target, region, allFeatures, isoByCode, width, height, contextWorldFeatures } = input;
  const inRegionRaw = filterFeaturesByRegion(allFeatures, region, isoByCode);

  if (inRegionRaw.length === 0) {
    throw new Error("region has no mappable features");
  }

  const fcRaw: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: inRegionRaw as Feature<Geometry, GeoJsonProperties>[],
  };
  const unwrapCenterMeridian = computeUnwrapCenterMeridian(fcRaw);
  const inRegion = inRegionRaw.map((f) => cloneCountryFeatureUnwrapped(f, unwrapCenterMeridian));

  const collection: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: inRegion as Feature<Geometry, GeoJsonProperties>[],
  };
  const projection = buildMercatorForCollection(collection, width, height, 8, unwrapCenterMeridian);
  const pathDById = buildPathStrings(projection, inRegion);
  const poolBounds = safeBoundsOf(projection, inRegion);
  const { contextFeatures, contextPathDById } = buildContextFeaturesAndPaths(
    contextWorldFeatures ?? allFeatures,
    inPoolIdsOf(inRegion),
    unwrapCenterMeridian,
    projection,
    poolBounds ? defaultContextCullOpts(poolBounds, width, height) : undefined
  );
  return {
    target,
    regionCollection: collection,
    allFeatures: inRegion,
    projection,
    pathDById,
    contextFeatures,
    contextPathDById,
    width,
    height,
    unwrapCenterMeridian,
  };
}

type SameProjectionInput = {
  target: Iso3166Row;
  region: string;
  projection: GeoProjection;
  allWorldFeatures: CountryFeature[];
  isoByCode: Map<string, Iso3166Row>;
  width: number;
  height: number;
  unwrapCenterMeridian: number;
  /** 文脈用の低 LOD 全世界 features（未指定なら allWorldFeatures を使用） */
  contextWorldFeatures?: readonly CountryFeature[];
};

/**
 * 同一 Mercator（ズームと整合させるため fit の投影を凍結したまま）で別解像度の国土だけ差し替える。
 */
export function buildRegionRoundModelSameProjection(input: SameProjectionInput): RegionRoundModel {
  const {
    target,
    region,
    projection,
    allWorldFeatures,
    isoByCode,
    width,
    height,
    unwrapCenterMeridian,
    contextWorldFeatures,
  } = input;
  const inRegionRaw = filterFeaturesByRegion(allWorldFeatures, region, isoByCode);
  if (inRegionRaw.length === 0) {
    throw new Error("region has no mappable features");
  }
  const inRegion = inRegionRaw.map((f) => cloneCountryFeatureUnwrapped(f, unwrapCenterMeridian));
  const collection: FeatureCollection<Geometry, GeoJsonProperties> = {
    type: "FeatureCollection",
    features: inRegion as Feature<Geometry, GeoJsonProperties>[],
  };
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  projection.clipExtent([
    [0, 0],
    [w, h],
  ]);
  const pathDById = buildPathStrings(projection, inRegion);
  const poolBounds = safeBoundsOf(projection, inRegion);
  const { contextFeatures, contextPathDById } = buildContextFeaturesAndPaths(
    contextWorldFeatures ?? allWorldFeatures,
    inPoolIdsOf(inRegion),
    unwrapCenterMeridian,
    projection,
    poolBounds ? defaultContextCullOpts(poolBounds, w, h) : undefined
  );
  return {
    target,
    regionCollection: collection,
    allFeatures: inRegion,
    projection,
    pathDById,
    contextFeatures,
    contextPathDById,
    width,
    height,
    unwrapCenterMeridian,
  };
}
