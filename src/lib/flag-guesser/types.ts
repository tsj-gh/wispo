import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GeoProjection } from "d3-geo";

/** ISO-3166 行（`public/assets/flag-guesser/iso-3166.json` 相当） */
export type Iso3166Row = {
  name: string;
  "alpha-2": string;
  "alpha-3": string;
  "country-code": string;
  region: string | null;
  "sub-region": string | null;
  "intermediate-region": string | null;
  "region-code": string | null;
  "sub-region-code": string | null;
  "intermediate-region-code": string | null;
};

export type CountryFeature = Feature<Geometry, GeoJsonProperties> & { id?: number | string };

export type RegionRoundModel = {
  target: Iso3166Row;
  /** 同 Region の国ポリゴン（地図表示用） */
  regionCollection: FeatureCollection<Geometry, GeoJsonProperties>;
  /** 全 Feature（ID 解決用） */
  allFeatures: CountryFeature[];
  projection: GeoProjection;
  pathDById: Map<string, string>;
  /**
   * プール外で「世界地図の文脈」として背面に描画する周辺国。
   * 描画専用で、ヒットテスト・判定・「ここにはない」ロジックには使わない。
   * 初期視認範囲の周辺をなるべくカバーするため、ここには事実上 Topo の全国（プールを除く）を入れる。
   */
  contextFeatures?: readonly CountryFeature[];
  /** contextFeatures の path 文字列（id -> d） */
  contextPathDById?: ReadonlyMap<string, string>;
  width: number;
  height: number;
  /**
   * 日付変更線付近の分断を避けるための基準経度（経度シフト＋Mercator.rotate と一致）。
   * LOD 差し替え時は同一値でアンラップする。
   */
  unwrapCenterMeridian: number;
};

export type PlacedFlag = {
  cardId: string;
  /** TopoJSON / 国の数値 ID（= ISO 3166-1 numeric、文字列） */
  countryId: string;
  alpha2: string;
};

export type AnswerMark = "correct" | "wrong" | "none";
