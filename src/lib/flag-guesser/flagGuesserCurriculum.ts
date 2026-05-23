import { resolveExplorerMapPreset, type ExplorerMapPresetView } from "./explorerMapPresets";
import type { FlagDifficultyJsonRow } from "./flagExplorerDataset";
import type { Iso3166Row } from "./types";

export const CURRICULUM_LEVELS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
] as const;

export type FlagGuesserCurriculumLevel = (typeof CURRICULUM_LEVELS)[number];

export type MapFitScope = "sub_region" | "region" | "pool";

export type DecoySource = "pool_only" | "pool_plus_confusable";

export type CurriculumStageConfig = {
  level: FlagGuesserCurriculumLevel;
  nameJa: string;
  /** 空なら sub_region では絞らない */
  targetSubRegions?: readonly string[];
  /** 大陸（`iso-3166` の `region`）で絞る */
  targetRegions?: readonly string[];
  targetDifficultyMin?: number;
  targetDifficultyMax: number;
  /** 指定時はこの alpha-3 のみ（他条件も満たすこと） */
  poolAlpha3Only?: readonly string[];
  decoyCount: number;
  decoyDifficultyMax?: number;
  mapFitScope: MapFitScope;
  decoySource?: DecoySource;
};

export const CURRICULUM_STAGES: Record<FlagGuesserCurriculumLevel, CurriculumStageConfig> = {
  1: {
    level: 1,
    nameJa: "東アジア・西ヨーロッパ・北米",
    targetSubRegions: ["Eastern Asia", "Western Europe", "Northern America"],
    targetDifficultyMax: 1,
    decoyCount: 0,
    mapFitScope: "sub_region",
  },
  2: {
    level: 2,
    nameJa: "北欧・東欧・中南米",
    targetSubRegions: ["Northern Europe", "Eastern Europe", "Latin America and the Caribbean"],
    targetDifficultyMax: 1,
    decoyCount: 0,
    mapFitScope: "sub_region",
  },
  3: {
    level: 3,
    nameJa: "南欧（超有名）",
    targetSubRegions: ["Southern Europe"],
    targetDifficultyMax: 1,
    decoyCount: 2,
    mapFitScope: "sub_region",
  },
  4: {
    level: 4,
    nameJa: "南アジア・西アジア・豪州",
    targetSubRegions: ["Southern Asia", "Western Asia", "Australia and New Zealand"],
    targetDifficultyMax: 1,
    decoyCount: 2,
    mapFitScope: "sub_region",
  },
  5: {
    level: 5,
    nameJa: "全世界・超有名",
    targetDifficultyMax: 1,
    decoyCount: 2,
    mapFitScope: "sub_region",
  },
  6: {
    level: 6,
    nameJa: "東南アジア",
    targetSubRegions: ["South-eastern Asia"],
    targetDifficultyMax: 2,
    decoyCount: 3,
    mapFitScope: "sub_region",
  },
  7: {
    level: 7,
    nameJa: "西ヨーロッパ＋中欧",
    targetSubRegions: ["Western Europe", "Central Europe"],
    targetDifficultyMax: 2,
    decoyCount: 3,
    mapFitScope: "sub_region",
  },
  8: {
    level: 8,
    nameJa: "北欧・東欧",
    targetSubRegions: ["Northern Europe", "Eastern Europe"],
    targetDifficultyMax: 2,
    decoyCount: 3,
    mapFitScope: "sub_region",
  },
  9: {
    level: 9,
    nameJa: "南欧・東アジア",
    targetSubRegions: ["Southern Europe", "Eastern Asia"],
    targetDifficultyMax: 2,
    decoyCount: 3,
    mapFitScope: "sub_region",
  },
  10: {
    level: 10,
    nameJa: "中南米（基礎）",
    poolAlpha3Only: ["BRA", "MEX", "ARG", "CHL", "COL", "JAM"],
    targetDifficultyMax: 2,
    decoyCount: 3,
    mapFitScope: "sub_region",
  },
  11: {
    level: 11,
    nameJa: "北アフリカ",
    targetSubRegions: ["Northern Africa"],
    targetDifficultyMax: 2,
    decoyCount: 3,
    mapFitScope: "sub_region",
  },
  12: {
    level: 12,
    nameJa: "北米・南アジア",
    targetSubRegions: ["Northern America", "Southern Asia"],
    targetDifficultyMax: 2,
    decoyCount: 3,
    mapFitScope: "sub_region",
  },
  13: {
    level: 13,
    nameJa: "ヨーロッパ全体",
    targetRegions: ["Europe"],
    targetDifficultyMax: 3,
    decoyCount: 3,
    mapFitScope: "region",
  },
  14: {
    level: 14,
    nameJa: "アジア全体",
    targetRegions: ["Asia"],
    targetDifficultyMax: 3,
    decoyCount: 3,
    mapFitScope: "region",
  },
  15: {
    level: 15,
    nameJa: "アメリカ大陸",
    targetRegions: ["Americas"],
    targetDifficultyMax: 3,
    decoyCount: 3,
    mapFitScope: "region",
  },
  16: {
    level: 16,
    nameJa: "アフリカ入門",
    targetSubRegions: ["Northern Africa", "Sub-Saharan Africa"],
    targetDifficultyMax: 3,
    decoyCount: 3,
    mapFitScope: "sub_region",
  },
  17: {
    level: 17,
    nameJa: "四大大陸・標準",
    targetRegions: ["Africa", "Americas", "Asia", "Europe"],
    targetDifficultyMax: 4,
    decoyCount: 3,
    mapFitScope: "region",
  },
  18: {
    level: 18,
    nameJa: "大洋州・島嶼",
    targetRegions: ["Oceania"],
    targetSubRegions: ["Micronesia", "Polynesia", "Melanesia", "Australia and New Zealand"],
    targetDifficultyMax: 5,
    decoyCount: 3,
    mapFitScope: "sub_region",
  },
  19: {
    level: 19,
    nameJa: "似た旗・地理",
    targetDifficultyMax: 5,
    decoyCount: 3,
    decoySource: "pool_plus_confusable",
    mapFitScope: "region",
  },
  20: {
    level: 20,
    nameJa: "マスター",
    targetDifficultyMax: 8,
    decoyCount: 4,
    decoySource: "pool_plus_confusable",
    mapFitScope: "region",
  },
};

export function isFlagGuesserCurriculumLevel(n: number): n is FlagGuesserCurriculumLevel {
  return Number.isInteger(n) && n >= 1 && n <= 20 && n in CURRICULUM_STAGES;
}

export function getCurriculumStage(level: FlagGuesserCurriculumLevel): CurriculumStageConfig {
  return CURRICULUM_STAGES[level];
}

export function indexDifficultyByAlpha3(
  rows: readonly FlagDifficultyJsonRow[]
): Map<string, FlagDifficultyJsonRow> {
  const m = new Map<string, FlagDifficultyJsonRow>();
  for (const r of rows) {
    const k = r.alpha3?.trim().toUpperCase();
    if (k) m.set(k, r);
  }
  return m;
}

function rowMatchesCurriculumStage(
  row: Iso3166Row,
  diffRow: FlagDifficultyJsonRow,
  stage: CurriculumStageConfig
): boolean {
  const a3 = row["alpha-3"]?.trim().toUpperCase();
  if (!a3) return false;

  if (stage.poolAlpha3Only?.length) {
    if (!stage.poolAlpha3Only.includes(a3)) return false;
  }

  const d = diffRow.difficulty;
  const dMin = stage.targetDifficultyMin ?? 1;
  if (d < dMin || d > stage.targetDifficultyMax) return false;

  const sub = row["sub-region"]?.trim();
  const region = row.region?.trim();

  if (stage.targetSubRegions?.length) {
    const subMatch = sub && stage.targetSubRegions.includes(sub);
    const regionMatch = stage.targetRegions?.length && region && stage.targetRegions.includes(region);
    if (!subMatch && !regionMatch) return false;
  } else if (stage.targetRegions?.length) {
    if (!region || !stage.targetRegions.includes(region)) return false;
  }

  return true;
}

/**
 * 段階の条件を満たし、Topo に載る ISO 行の出題プール。
 */
export function buildCurriculumPool(
  isoRows: readonly Iso3166Row[],
  difficultyByAlpha3: Map<string, FlagDifficultyJsonRow>,
  topoIds: Set<string>,
  level: FlagGuesserCurriculumLevel
): Iso3166Row[] {
  const stage = getCurriculumStage(level);
  const out: Iso3166Row[] = [];

  for (const row of isoRows) {
    const code = row["country-code"]?.trim();
    const a3 = row["alpha-3"]?.trim().toUpperCase();
    if (!code || !a3 || !row["alpha-2"]?.trim()) continue;
    if (!topoIds.has(code)) continue;
    if (row.region === "Antarctica") continue;

    const diffRow = difficultyByAlpha3.get(a3);
    if (!diffRow || !rowMatchesCurriculumStage(row, diffRow, stage)) continue;

    out.push(row);
  }

  return out;
}

/** 正解国と同一 `region` の全国（Topo あり） */
export function mapDisplayCountryCodesForRegion(
  isoRows: readonly Iso3166Row[],
  topoIds: Set<string>,
  target: Iso3166Row
): Set<string> {
  const region = target.region?.trim();
  if (!region) return new Set();
  const codes = new Set<string>();
  for (const row of isoRows) {
    if (row.region?.trim() !== region) continue;
    const code = row["country-code"]?.trim();
    if (!code || !topoIds.has(code)) continue;
    if (row.region === "Antarctica") continue;
    codes.add(code);
  }
  return codes;
}

/**
 * 地図表示・外接フィット用: 正解国と同一 sub_region に属する Topo 国。
 */
export function mapDisplayCountryCodesForSubRegion(
  isoRows: readonly Iso3166Row[],
  topoIds: Set<string>,
  target: Iso3166Row
): Set<string> {
  const sub = target["sub-region"]?.trim();
  if (!sub) return new Set();
  const codes = new Set<string>();
  for (const row of isoRows) {
    if (row["sub-region"]?.trim() !== sub) continue;
    const code = row["country-code"]?.trim();
    if (!code || !topoIds.has(code)) continue;
    if (row.region === "Antarctica") continue;
    codes.add(code);
  }
  return codes;
}

/** 段階プール内の国だけ地図に描画 */
export function mapDisplayCountryCodesForPool(
  poolRows: readonly Iso3166Row[],
  topoIds: Set<string>
): Set<string> {
  const codes = new Set<string>();
  for (const row of poolRows) {
    const code = row["country-code"]?.trim();
    if (!code || !topoIds.has(code)) continue;
    codes.add(code);
  }
  return codes;
}

export function mapDisplayCountryCodesForStage(
  isoRows: readonly Iso3166Row[],
  topoIds: Set<string>,
  target: Iso3166Row,
  mapFitScope: MapFitScope,
  poolRows: readonly Iso3166Row[]
): Set<string> {
  switch (mapFitScope) {
    case "pool":
      return mapDisplayCountryCodesForPool(poolRows, topoIds);
    case "region":
      return mapDisplayCountryCodesForRegion(isoRows, topoIds, target);
    case "sub_region":
    default:
      return mapDisplayCountryCodesForSubRegion(isoRows, topoIds, target);
  }
}

/** explorer の地図タブと同じ優先順位でプリセットを解決。 */
export function explorerMapPresetForIsoRow(
  presets: Record<string, ExplorerMapPresetView>,
  row: Iso3166Row
): ExplorerMapPresetView | null {
  const region = row.region?.trim() ?? "";
  const subRegion = row["sub-region"]?.trim() ?? "";
  const intermediateRegion = row["intermediate-region"]?.trim() ?? "";
  return resolveExplorerMapPreset(presets, region, subRegion, intermediateRegion);
}
