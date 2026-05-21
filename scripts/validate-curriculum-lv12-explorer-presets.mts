/**
 * Lv1〜2 出題国が、正解時に適用される explorer プリセットのビューポートと一部でも重なるか検証。
 *
 * Usage: npx tsx scripts/validate-curriculum-lv12-explorer-presets.mts
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { CountryFeature, Iso3166Row } from "../src/lib/flag-guesser/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const CURRICULUM_ALPHA3 = [
  "CHN",
  "JPN",
  "KOR",
  "DEU",
  "FRA",
  "CHE",
  "USA",
  "CAN",
  "DNK",
  "FIN",
  "GBR",
  "SWE",
  "RUS",
  "UKR",
  "BRA",
  "MEX",
] as const;

const PLAYFIELD_W = 520;
const PLAYFIELD_H = 390;

function countryFeaturesFromTopology(topology: Topology): CountryFeature[] {
  const obj = topology.objects.countries;
  if (!obj) return [];
  const merged = feature(topology, obj);
  if (merged.type !== "FeatureCollection") return [];
  return merged.features as CountryFeature[];
}

async function main(): Promise<void> {
  const { filterWorldTopoFeatures } = await import("../src/lib/flag-guesser/topoFeatureFilter.ts");
  const { indexIsoByCountryCode } = await import("../src/lib/flag-guesser/isoIndex.ts");
  const { buildExplorerWorldMapProjection, featureIdString } = await import(
    "../src/lib/flag-guesser/mapProjections.ts"
  );
  const { resolveExplorerMapPreset, zoomPlainFromCenterLonLatK } = await import(
    "../src/lib/flag-guesser/explorerMapPresets.ts"
  );
  const { explorerMapPresetForIsoRow } = await import("../src/lib/flag-guesser/flagGuesserCurriculum.ts");
  const { viewportLonLatBounds } = await import("../src/lib/flag-guesser/viewportGeo.ts");
  const { geoArea, geoBounds, geoCentroid } = await import("d3-geo");
  const { MAX_PLAUSIBLE_COUNTRY_GEO_AREA_STERADIANS } = await import(
    "../src/lib/flag-guesser/mapProjections.ts"
  );

  const presetsPath = join(root, "public/assets/flag-guesser/explorer_map_presets.json");
  const isoPath = join(root, "public/assets/flag-guesser/iso-3166.json");
  const topoPath = join(root, "public/assets/flag-guesser/countries-110m.json");
  const diffPath = join(root, "public/assets/flag-guesser/flag_difficulty.json");

  const rawPresets = JSON.parse(readFileSync(presetsPath, "utf8")) as {
    presets?: Record<string, { lon: number; lat: number; k: number }>;
  };
  const presets = rawPresets.presets;
  if (!presets) {
    console.error("missing presets");
    process.exit(1);
  }

  const isoRows = JSON.parse(readFileSync(isoPath, "utf8")) as Iso3166Row[];
  const diffRows = JSON.parse(readFileSync(diffPath, "utf8")) as { alpha3: string; difficulty: number }[];
  const isoByCode = indexIsoByCountryCode(isoRows);
  const diffByA3 = new Map(diffRows.map((r) => [r.alpha3?.trim().toUpperCase(), r]));

  const topo = JSON.parse(readFileSync(topoPath, "utf8")) as Topology;
  const world = filterWorldTopoFeatures(countryFeaturesFromTopology(topo), isoByCode);

  const worldProj = buildExplorerWorldMapProjection(world, PLAYFIELD_W, PLAYFIELD_H);
  if (!worldProj) {
    console.error("projection failed");
    process.exit(1);
  }

  const idToFeature = new Map<string, CountryFeature>();
  for (const f of world) {
    const id = featureIdString(f);
    if (id) idToFeature.set(id, f);
  }

  function countryTouchesViewport(
    feat: CountryFeature,
    vp: { lonMin: number; lonMax: number; latMin: number; latMax: number }
  ): boolean {
    const area = geoArea(feat);
    if (area > MAX_PLAUSIBLE_COUNTRY_GEO_AREA_STERADIANS) {
      const [cx, cy] = geoCentroid(feat);
      return (
        Number.isFinite(cx) &&
        Number.isFinite(cy) &&
        cx >= vp.lonMin &&
        cx <= vp.lonMax &&
        cy >= vp.latMin &&
        cy <= vp.latMax
      );
    }
    const [[lon0, lat0], [lon1, lat1]] = geoBounds(feat);
    const clonMin = Math.min(lon0, lon1);
    const clonMax = Math.max(lon0, lon1);
    const clatMin = Math.min(lat0, lat1);
    const clatMax = Math.max(lat0, lat1);
    if (clonMax - clonMin > 200) {
      const [cx, cy] = geoCentroid(feat);
      return cx >= vp.lonMin && cx <= vp.lonMax && cy >= vp.latMin && cy <= vp.latMax;
    }
    return !(
      clonMax < vp.lonMin ||
      clonMin > vp.lonMax ||
      clatMax < vp.latMin ||
      clatMin > vp.latMax
    );
  }

  const errors: string[] = [];
  const ok: string[] = [];

  for (const a3 of CURRICULUM_ALPHA3) {
    const row = isoRows.find((r) => r["alpha-3"]?.trim().toUpperCase() === a3);
    if (!row) {
      errors.push(`${a3}: ISO 行なし`);
      continue;
    }
    const diff = diffByA3.get(a3);
    const lv = diff?.difficulty === 1 && ["CHN", "JPN", "KOR", "DEU", "FRA", "CHE", "USA", "CAN"].includes(a3)
      ? 1
      : diff?.difficulty === 1
        ? 2
        : "?";

    const preset = explorerMapPresetForIsoRow(presets, row);
    if (!preset) {
      errors.push(`${a3} (Lv${lv}): プリセット未解決 region=${row.region} sub=${row["sub-region"]} ir=${row["intermediate-region"]}`);
      continue;
    }

    const zoom = zoomPlainFromCenterLonLatK(
      worldProj.projection,
      PLAYFIELD_W,
      PLAYFIELD_H,
      preset.lon,
      preset.lat,
      preset.k
    );
    if (!zoom) {
      errors.push(`${a3}: zoom 計算失敗`);
      continue;
    }

    const vp = viewportLonLatBounds(worldProj.projection, PLAYFIELD_W, PLAYFIELD_H, zoom);
    if (!vp) {
      errors.push(`${a3}: viewport 計算失敗`);
      continue;
    }

    const cc = row["country-code"]?.trim();
    const feat = cc ? idToFeature.get(cc) : undefined;
    if (!feat) {
      errors.push(`${a3}: Topo ポリゴンなし`);
      continue;
    }

    if (!countryTouchesViewport(feat, vp)) {
      errors.push(
        `${a3} (Lv${lv}): ビューポート外 sub=${row["sub-region"]} ir=${row["intermediate-region"] || "(なし)"} preset k=${preset.k}`
      );
    } else {
      ok.push(`${a3} (Lv${lv}) sub=${row["sub-region"]} ir=${row["intermediate-region"] || "*"}`);
    }
  }

  console.log("Lv1〜2 出題国 × explorer プリセット（playfield 520×390）");
  console.log("OK:", ok.length);
  for (const line of ok) console.log("  ✓", line);
  if (errors.length) {
    console.log("\n問題:", errors.length);
    for (const line of errors) console.log("  ✗", line);
    process.exit(1);
  }
  console.log("\n全て問題なし — 実装可能");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
