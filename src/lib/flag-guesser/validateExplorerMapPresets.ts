import { geoArea, geoBounds, geoCentroid } from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GeoProjection } from "d3-geo";
import {
  buildExplorerWorldMapProjection,
  featureIdString,
  MAX_PLAUSIBLE_COUNTRY_GEO_AREA_STERADIANS,
} from "@/lib/flag-guesser/mapProjections";
import { zoomPlainFromCenterLonLatK } from "@/lib/flag-guesser/explorerMapPresets";
import { viewportLonLatBounds, type ZoomPlain } from "@/lib/flag-guesser/viewportGeo";
import { collectCountryCodesForMapMode } from "@/lib/flag-guesser/flagExplorerDataset";
import type { CountryFeature, Iso3166Row } from "@/lib/flag-guesser/types";

const DEFAULT_W = 800;
const DEFAULT_H = 440;

export type ExplorerMapPresetEntry = { lon: number; lat: number; k: number };

export type ExplorerMapPresetViewportIssue = {
  presetKey: string;
  countryCode: string;
  countryName: string;
};

export type ExplorerMapPresetWarning = {
  presetKey: string;
  countryCode: string;
  countryName: string;
  reason: "no_topo_polygon" | "corrupt_geometry_skipped";
};

export type ExplorerMapPresetValidationResult = {
  ok: boolean;
  skippedWorldPreset: boolean;
  /** 表示矩形と国情報が一切重ならない（必ず検討） */
  errors: ExplorerMapPresetViewportIssue[];
  /** Topo に無い・極小・異常ジオメトリなど（要件から除外しうるもの） */
  warnings: ExplorerMapPresetWarning[];
  skippedSmallPolygons: number;
  skippedCorruptGeometries: number;
};

function isoNameByNumeric(isoRows: readonly Iso3166Row[], numeric: string): string {
  const row = isoRows.find((r) => r["country-code"]?.trim() === numeric);
  return row?.name ?? numeric;
}

function countryTouchesViewport(
  feat: CountryFeature,
  vp: { lonMin: number; lonMax: number; latMin: number; latMax: number }
): { ok: boolean; corrupt: boolean } {
  const area = geoArea(feat as Feature<Geometry, GeoJsonProperties>);
  if (area > MAX_PLAUSIBLE_COUNTRY_GEO_AREA_STERADIANS) {
    return { ok: false, corrupt: true };
  }

  try {
    const bb = geoBounds(feat as Feature<Geometry, GeoJsonProperties>);
    const [[lon0, lat0], [lon1, lat1]] = bb;
    const clonMin = Math.min(lon0, lon1);
    const clonMax = Math.max(lon0, lon1);
    const clatMin = Math.min(lat0, lat1);
    const clatMax = Math.max(lat0, lat1);
    const lonSpan = clonMax - clonMin;

    if (lonSpan > 200) {
      const [cx, cy] = geoCentroid(feat as Feature<Geometry, GeoJsonProperties>);
      const lon = cx as number;
      const lat = cy as number;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { ok: false, corrupt: false };
      const ok =
        lon >= vp.lonMin &&
        lon <= vp.lonMax &&
        lat >= vp.latMin &&
        lat <= vp.latMax;
      return { ok, corrupt: false };
    }

    const overlaps = !(
      clonMax < vp.lonMin ||
      clonMin > vp.lonMax ||
      clatMax < vp.latMin ||
      clatMin > vp.latMax
    );
    return { ok: overlaps, corrupt: false };
  } catch {
    return { ok: false, corrupt: false };
  }
}

/** @deprecated use buildExplorerWorldMapProjection */
export function buildProjectionForExplorerMapSelect(
  filteredWorldFeatures: CountryFeature[],
  width: number,
  height: number
): GeoProjection | null {
  return buildExplorerWorldMapProjection(filteredWorldFeatures, width, height)?.projection ?? null;
}

/**
 * 各プリセットについて、`collectCountryCodesForMapMode` と同じ地域に属する国が、
 * FlagExplorerMapSelect と同様の投影・寸法・（lon,lat,k）のビューポートと一部でも重なるか検証する。
 * `*|*|*` は全世界のためスキップ。Topo に無い国・極小・異常ジオメトリは warnings にのみ載せ、ok 判定からは除外する。
 */
export function validateExplorerMapPresets(params: {
  presets: Record<string, ExplorerMapPresetEntry>;
  isoRows: readonly Iso3166Row[];
  filteredWorldFeatures: CountryFeature[];
  width?: number;
  height?: number;
}): ExplorerMapPresetValidationResult {
  const width = params.width ?? DEFAULT_W;
  const height = params.height ?? DEFAULT_H;
  const projection = buildExplorerWorldMapProjection(params.filteredWorldFeatures, width, height)?.projection;
  const errors: ExplorerMapPresetViewportIssue[] = [];
  const warnings: ExplorerMapPresetWarning[] = [];
  let skippedSmallPolygons = 0;
  let skippedCorruptGeometries = 0;

  if (!projection) {
    return {
      ok: false,
      skippedWorldPreset: false,
      errors: [{ presetKey: "(init)", countryCode: "", countryName: "projection build failed" }],
      warnings: [],
      skippedSmallPolygons: 0,
      skippedCorruptGeometries: 0,
    };
  }

  const idToFeature = new Map<string, CountryFeature>();
  for (const f of params.filteredWorldFeatures) {
    const id = featureIdString(f);
    if (id) idToFeature.set(id, f);
  }

  let skippedWorldPreset = false;

  for (const [presetKey, preset] of Object.entries(params.presets)) {
    if (presetKey === "*|*|*") {
      skippedWorldPreset = true;
      continue;
    }

    const segments = presetKey.split("|");
    if (segments.length !== 3) continue;
    const [rawR, rawS, rawI] = segments;
    const region = rawR === "*" ? "" : rawR;
    const subRegion = rawS === "*" ? "" : rawS;
    const intermediateRegion = rawI === "*" ? "" : rawI;
    if (!region) continue;

    const codes =
      collectCountryCodesForMapMode(params.isoRows, region, subRegion, intermediateRegion) ?? [];

    const zoomPlain = zoomPlainFromCenterLonLatK(
      projection,
      width,
      height,
      preset.lon,
      preset.lat,
      preset.k
    );
    if (!zoomPlain) {
      errors.push({
        presetKey,
        countryCode: "",
        countryName: "無効な lon/lat/k（投影できません）",
      });
      continue;
    }

    const vp = viewportLonLatBounds(projection, width, height, zoomPlain as ZoomPlain);
    if (!vp) {
      errors.push({
        presetKey,
        countryCode: "",
        countryName: "ビューポート境界を計算できません",
      });
      continue;
    }

    for (const cc of codes) {
      const feat = idToFeature.get(cc);
      if (!feat) {
        skippedSmallPolygons++;
        warnings.push({
          presetKey,
          countryCode: cc,
          countryName: isoNameByNumeric(params.isoRows, cc),
          reason: "no_topo_polygon",
        });
        continue;
      }

      const touch = countryTouchesViewport(feat, vp);
      if (touch.corrupt) {
        skippedCorruptGeometries++;
        warnings.push({
          presetKey,
          countryCode: cc,
          countryName: isoNameByNumeric(params.isoRows, cc),
          reason: "corrupt_geometry_skipped",
        });
        continue;
      }
      if (!touch.ok) {
        errors.push({
          presetKey,
          countryCode: cc,
          countryName: isoNameByNumeric(params.isoRows, cc),
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    skippedWorldPreset,
    errors,
    warnings,
    skippedSmallPolygons,
    skippedCorruptGeometries,
  };
}
