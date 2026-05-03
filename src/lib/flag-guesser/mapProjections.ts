import { geoArea, geoBounds, geoCentroid, geoContains, geoMercator, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { CountryFeature, Iso3166Row, RegionRoundModel } from "./types";

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

function path2DFromPathString(d: string): Path2D | null {
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
  const sorted = sortFeaturesForHitTest(features);

  if (pathDById?.size) {
    const ctx = getHitTestContext2D();
    if (ctx && typeof Path2D !== "undefined") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const feat of sorted) {
        const id = featureIdString(feat);
        if (!id) continue;
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
  for (const feat of sorted) {
    if (geoContains(feat as Feature<Geometry, GeoJsonProperties>, [lon, lat])) {
      const id = featureIdString(feat);
      if (id) return id;
    }
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

type BuildRoundInput = {
  target: Iso3166Row;
  region: string;
  allFeatures: CountryFeature[];
  isoByCode: Map<string, Iso3166Row>;
  width: number;
  height: number;
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

export function buildRegionRoundModel(input: BuildRoundInput): RegionRoundModel {
  const { target, region, allFeatures, isoByCode, width, height } = input;
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
  return {
    target,
    regionCollection: collection,
    allFeatures: inRegion,
    projection,
    pathDById,
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
};

/**
 * 同一 Mercator（ズームと整合させるため fit の投影を凍結したまま）で別解像度の国土だけ差し替える。
 */
export function buildRegionRoundModelSameProjection(input: SameProjectionInput): RegionRoundModel {
  const { target, region, projection, allWorldFeatures, isoByCode, width, height, unwrapCenterMeridian } = input;
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
  return {
    target,
    regionCollection: collection,
    allFeatures: inRegion,
    projection,
    pathDById,
    width,
    height,
    unwrapCenterMeridian,
  };
}
