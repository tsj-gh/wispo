import { geoArea } from "d3-geo";
import type { Feature, Geometry, GeoJsonProperties } from "geojson";
import type { CountryFeature, Iso3166Row } from "./types";
import { featureIdString } from "./mapProjections";

/**
 * 球面座標系での面積（steradians）。これ未満は岩礁・ノイズ扱いで破棄。
 * （約 1e-7 はごく小さな島でも残しやすい目安。必要なら調整）
 */
export const MIN_TOPO_FEATURE_AREA_STERADIANS = 8e-8;

/**
 * ISO の `country-code`（数値）に載っていないポリゴン、および極小面積のフィーチャを除く。
 * Natural Earth にあって ISO に無い灰色ポリゴンやオーバルの残骸を抑止する。
 */
export function filterWorldTopoFeatures(
  features: readonly CountryFeature[],
  isoByCountryCode: Map<string, Iso3166Row>
): CountryFeature[] {
  const out: CountryFeature[] = [];
  for (const f of features) {
    const id = featureIdString(f);
    if (!id || !isoByCountryCode.has(id)) continue;
    const area = geoArea(f as Feature<Geometry, GeoJsonProperties>);
    if (area < MIN_TOPO_FEATURE_AREA_STERADIANS) continue;
    out.push(f);
  }
  return out;
}
