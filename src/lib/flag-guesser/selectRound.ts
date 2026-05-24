import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { CountryFeature, Iso3166Row } from "./types";
import { featureIdString } from "./mapProjections";
import {
  mapDisplayCountryCodesForStage,
  type CurriculumStageConfig,
} from "./flagGuesserCurriculum";
import type { FlagDifficultyJsonRow } from "./flagExplorerDataset";
import { indexIsoByAlpha2, indexIsoByCountryCode } from "./isoIndex";

const FLAG_BASE = "/assets/flag-guesser/flags";

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/** 同一 alpha-2 を除去（先頭優先）。国旗カードの重複出題を防ぐ */
function dedupeAlpha2PreservingOrder(alpha2s: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of alpha2s) {
    const a2 = raw.trim().toUpperCase();
    if (!a2 || seen.has(a2)) continue;
    seen.add(a2);
    out.push(a2);
  }
  return out;
}

/**
 * Natural Earth TopoJSON から国別 Feature 一覧を得る。
 */
export function countryFeaturesFromTopology(topology: Topology): CountryFeature[] {
  const obj = topology.objects.countries;
  if (!obj) return [];
  const merged = feature(topology, obj);
  if (merged.type !== "FeatureCollection") return [];
  return merged.features as CountryFeature[];
}

export function topoNumericIdSet(features: readonly CountryFeature[]): Set<string> {
  const s = new Set<string>();
  for (const f of features) {
    const id = featureIdString(f);
    if (id) s.add(id);
  }
  return s;
}

export type RoundPlan = {
  targetRow: Iso3166Row;
  /** カード枚数 = decoys + 1。シャッフル済みで exactly 1 つが target と一致 */
  cardAlpha2s: string[];
  /** 学習段階モード: 地図に描画・フィットする国（ISO numeric country-code） */
  mapCountryCodes?: Set<string>;
};

/**
 * 同一 Region 内に正解とお邪魔カードを並べるラウンドを構築する。
 * `excludeAlpha2` で直近の正解国を避け、`decoyCount` 枚のお邪魔を付ける（計 decoyCount+1 枚）。
 */
export function createRoundPlan(
  rows: readonly Iso3166Row[],
  topoIds: Set<string>,
  excludeAlpha2: Set<string>,
  decoyCount = 3
): RoundPlan | null {
  const eligibleTargets = rows.filter((r) => {
    if (!r.region || r.region.trim() === "" || r.region === "Antarctica") return false;
    const code = r["country-code"]?.trim();
    if (!code || !topoIds.has(code)) return false;
    if (!r["alpha-2"]) return false;
    return !excludeAlpha2.has(r["alpha-2"].toUpperCase());
  });

  const pool = eligibleTargets.length > 0 ? eligibleTargets : rows.filter((r) => {
    if (!r.region || r.region.trim() === "" || r.region === "Antarctica") return false;
    const code = r["country-code"]?.trim();
    if (!code || !topoIds.has(code)) return false;
    return !!r["alpha-2"];
  });

  if (pool.length === 0) return null;

  const targetRow = pool[Math.floor(Math.random() * pool.length)]!;
  const region = targetRow.region!;
  const targetA2 = targetRow["alpha-2"].toUpperCase();

  const inRegion = rows.filter(
    (r) =>
      r.region === region &&
      r["country-code"] &&
      topoIds.has(r["country-code"].trim()) &&
      r["alpha-2"]
  );

  const decoysPool = Array.from(
    new Set(
      inRegion
        .filter((r) => r["alpha-2"].toUpperCase() !== targetA2)
        .map((r) => r["alpha-2"].toUpperCase())
    )
  );
  shuffleInPlace(decoysPool);

  const decoys = decoysPool.slice(0, decoyCount);

  const cardAlpha2s = dedupeAlpha2PreservingOrder([targetA2, ...decoys].slice(0, decoyCount + 1));
  shuffleInPlace(cardAlpha2s);

  return { targetRow, cardAlpha2s };
}

function decoyDifficultyOk(
  diffRow: FlagDifficultyJsonRow | undefined,
  stage: CurriculumStageConfig
): boolean {
  if (!diffRow) return false;
  const max = stage.decoyDifficultyMax ?? stage.targetDifficultyMax;
  const min = stage.targetDifficultyMin ?? 1;
  return diffRow.difficulty >= min && diffRow.difficulty <= max;
}

function alpha2FromPoolRow(row: Iso3166Row): string | null {
  const a2 = row["alpha-2"]?.trim().toUpperCase();
  return a2 || null;
}

function pickDecoysFromPool(
  poolRows: readonly Iso3166Row[],
  targetA2: string,
  decoyCount: number,
  stage: CurriculumStageConfig,
  difficultyByAlpha3: Map<string, FlagDifficultyJsonRow>
): string[] {
  const decoysPool = Array.from(
    new Set(
      poolRows
        .filter((r) => {
          const a2 = alpha2FromPoolRow(r);
          if (!a2 || a2 === targetA2) return false;
          const a3 = r["alpha-3"]?.trim().toUpperCase();
          return decoyDifficultyOk(a3 ? difficultyByAlpha3.get(a3) : undefined, stage);
        })
        .map((r) => alpha2FromPoolRow(r)!)
    )
  );
  shuffleInPlace(decoysPool);

  const decoys: string[] = [];
  const used = new Set<string>();
  for (const d of decoysPool) {
    if (decoys.length >= decoyCount) break;
    if (used.has(d)) continue;
    used.add(d);
    decoys.push(d);
  }
  return decoys;
}

function pickConfusableDecoyAlpha2(
  targetRow: Iso3166Row,
  poolRows: readonly Iso3166Row[],
  isoRows: readonly Iso3166Row[],
  topoIds: Set<string>,
  stage: CurriculumStageConfig,
  difficultyByAlpha3: Map<string, FlagDifficultyJsonRow>,
  exclude: Set<string>,
  field: "confusable_colors" | "confusable_region"
): string | null {
  const targetA3 = targetRow["alpha-3"]?.trim().toUpperCase();
  if (!targetA3) return null;
  const diffRow = difficultyByAlpha3.get(targetA3);
  if (!diffRow) return null;

  const candidates = new Set(
    (field === "confusable_colors" ? diffRow.confusable_colors : diffRow.confusable_region).map((x) =>
      x.trim().toUpperCase()
    )
  );
  if (!candidates.size) return null;

  const poolA3 = new Set(poolRows.map((r) => r["alpha-3"]?.trim().toUpperCase()).filter(Boolean));
  const tryRows = poolRows.length > 0 ? poolRows : isoRows;

  const matches: string[] = [];
  for (const row of tryRows) {
    const a3 = row["alpha-3"]?.trim().toUpperCase();
    const a2 = alpha2FromPoolRow(row);
    const code = row["country-code"]?.trim();
    if (!a3 || !a2 || !code || !topoIds.has(code)) continue;
    if (!candidates.has(a3)) continue;
    if (exclude.has(a2)) continue;
    if (poolA3.size > 0 && !poolA3.has(a3)) continue;
    const dr = difficultyByAlpha3.get(a3);
    if (!decoyDifficultyOk(dr, stage)) continue;
    matches.push(a2);
  }

  if (!matches.length) return null;
  return matches[Math.floor(Math.random() * matches.length)]!;
}

function pickDecoysWithConfusable(
  poolRows: readonly Iso3166Row[],
  targetRow: Iso3166Row,
  decoyCount: number,
  stage: CurriculumStageConfig,
  isoRows: readonly Iso3166Row[],
  topoIds: Set<string>,
  difficultyByAlpha3: Map<string, FlagDifficultyJsonRow>
): string[] {
  const targetA2 = targetRow["alpha-2"].trim().toUpperCase();
  const used = new Set<string>([targetA2]);
  const decoys: string[] = [];

  if (decoyCount >= 1) {
    const colorDecoy = pickConfusableDecoyAlpha2(
      targetRow,
      poolRows,
      isoRows,
      topoIds,
      stage,
      difficultyByAlpha3,
      used,
      "confusable_colors"
    );
    if (colorDecoy) {
      decoys.push(colorDecoy);
      used.add(colorDecoy);
    }
  }
  if (decoyCount >= 2) {
    const regionDecoy = pickConfusableDecoyAlpha2(
      targetRow,
      poolRows,
      isoRows,
      topoIds,
      stage,
      difficultyByAlpha3,
      used,
      "confusable_region"
    );
    if (regionDecoy) {
      decoys.push(regionDecoy);
      used.add(regionDecoy);
    }
  }

  const remaining = decoyCount - decoys.length;
  if (remaining > 0) {
    const fromPool = pickDecoysFromPool(poolRows, targetA2, remaining, stage, difficultyByAlpha3).filter(
      (d) => !used.has(d)
    );
    for (const d of fromPool) {
      if (decoys.length >= decoyCount) break;
      decoys.push(d);
      used.add(d);
    }
  }

  while (decoys.length < decoyCount) {
    const extra = pickDecoysFromPool(poolRows, targetA2, 1, stage, difficultyByAlpha3).find((d) => !used.has(d));
    if (!extra) break;
    decoys.push(extra);
    used.add(extra);
  }

  return decoys.slice(0, decoyCount);
}

/**
 * カリキュラム用: プール内から正解を抽選。地図は `mapFitScope` に従う。
 */
export function createCurriculumRoundPlan(
  poolRows: readonly Iso3166Row[],
  excludeAlpha2: Set<string>,
  stage: CurriculumStageConfig,
  isoRows: readonly Iso3166Row[],
  topoIds: Set<string>,
  difficultyByAlpha3: Map<string, FlagDifficultyJsonRow>
): RoundPlan | null {
  if (poolRows.length === 0) return null;

  const eligibleTargets = poolRows.filter((r) => {
    const a2 = r["alpha-2"]?.trim().toUpperCase();
    return a2 && !excludeAlpha2.has(a2);
  });
  const targetPool = eligibleTargets.length > 0 ? eligibleTargets : poolRows;
  const targetRow = targetPool[Math.floor(Math.random() * targetPool.length)]!;
  const targetA2 = targetRow["alpha-2"].trim().toUpperCase();

  let cardAlpha2s: string[];
  const decoyCount = stage.decoyCount;
  if (decoyCount <= 0) {
    cardAlpha2s = [targetA2];
  } else if (stage.decoySource === "pool_plus_confusable") {
    const decoys = pickDecoysWithConfusable(
      poolRows,
      targetRow,
      decoyCount,
      stage,
      isoRows,
      topoIds,
      difficultyByAlpha3
    );
    cardAlpha2s = dedupeAlpha2PreservingOrder([targetA2, ...decoys].slice(0, decoyCount + 1));
    shuffleInPlace(cardAlpha2s);
  } else {
    const decoys = pickDecoysFromPool(poolRows, targetA2, decoyCount, stage, difficultyByAlpha3);
    cardAlpha2s = dedupeAlpha2PreservingOrder([targetA2, ...decoys].slice(0, decoyCount + 1));
    shuffleInPlace(cardAlpha2s);
  }

  const mapCountryCodes = mapDisplayCountryCodesForStage(
    isoRows,
    topoIds,
    targetRow,
    stage.mapFitScope,
    poolRows
  );
  return { targetRow, cardAlpha2s, mapCountryCodes };
}

export function flagUrlForAlpha2(alpha2: string): string {
  return `${FLAG_BASE}/${alpha2.toLowerCase()}.svg`;
}

/**
 * 直近ラウンドで使った国に偏らないよう、alpha-2 集合を渡して除外候補にする。
 */
export function buildExcludeSet(
  ...alphaSets: (readonly string[] | undefined)[]
): Set<string> {
  const s = new Set<string>();
  for (const set of alphaSets) {
    if (!set) continue;
    for (const a of set) s.add(a.toUpperCase());
  }
  return s;
}

export function resolveIsoRows(rows: readonly Iso3166Row[]): {
  byAlpha2: Map<string, Iso3166Row>;
  byCountryCode: Map<string, Iso3166Row>;
} {
  return {
    byAlpha2: indexIsoByAlpha2(rows),
    byCountryCode: indexIsoByCountryCode(rows),
  };
}
