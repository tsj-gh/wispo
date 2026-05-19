import type { FlagDifficultyJsonRow } from "./flagExplorerDataset";
import type { Iso3166Row } from "./types";

/** 実装済みの学習段階（段階的に拡張） */
export type FlagGuesserCurriculumLevel = 1 | 2;

export type CurriculumStageConfig = {
  level: FlagGuesserCurriculumLevel;
  nameJa: string;
  targetSubRegions: readonly string[];
  /** 正解・お邪魔に許す difficulty（Lv1〜2 は 1 のみ） */
  targetDifficultyExact: number;
  decoyCount: number;
};

export const CURRICULUM_STAGES: Record<FlagGuesserCurriculumLevel, CurriculumStageConfig> = {
  1: {
    level: 1,
    nameJa: "東アジア・西ヨーロッパ・北米",
    targetSubRegions: ["Eastern Asia", "Western Europe", "Northern America"],
    targetDifficultyExact: 1,
    decoyCount: 2,
  },
  2: {
    level: 2,
    nameJa: "北欧・東欧・中南米",
    targetSubRegions: ["Northern Europe", "Eastern Europe", "Latin America and the Caribbean"],
    targetDifficultyExact: 1,
    decoyCount: 2,
  },
};

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

/**
 * 段階の sub_region × difficulty 条件を満たし、Topo に載る ISO 行のプール。
 */
export function buildCurriculumPool(
  isoRows: readonly Iso3166Row[],
  difficultyByAlpha3: Map<string, FlagDifficultyJsonRow>,
  topoIds: Set<string>,
  level: FlagGuesserCurriculumLevel
): Iso3166Row[] {
  const stage = getCurriculumStage(level);
  const subSet = new Set(stage.targetSubRegions);
  const out: Iso3166Row[] = [];

  for (const row of isoRows) {
    const code = row["country-code"]?.trim();
    const a3 = row["alpha-3"]?.trim().toUpperCase();
    const sub = row["sub-region"]?.trim();
    if (!code || !a3 || !row["alpha-2"]?.trim()) continue;
    if (!topoIds.has(code)) continue;
    if (!sub || !subSet.has(sub)) continue;
    if (row.region === "Antarctica") continue;

    const diffRow = difficultyByAlpha3.get(a3);
    if (!diffRow || diffRow.difficulty !== stage.targetDifficultyExact) continue;

    out.push(row);
  }

  return out;
}

/**
 * 地図表示・外接フィット用: 正解国と同一 sub_region に属するプール内の国だけ。
 */
export function mapDisplayCountryCodesForTarget(
  poolRows: readonly Iso3166Row[],
  target: Iso3166Row
): Set<string> {
  const sub = target["sub-region"]?.trim();
  const codes = new Set<string>();
  for (const row of poolRows) {
    if (sub && row["sub-region"]?.trim() !== sub) continue;
    const code = row["country-code"]?.trim();
    if (code) codes.add(code);
  }
  return codes;
}
