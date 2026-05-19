import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { CountryFeature, Iso3166Row } from "./types";
import { featureIdString } from "./mapProjections";
import { mapDisplayCountryCodesForTarget } from "./flagGuesserCurriculum";
import { indexIsoByAlpha2, indexIsoByCountryCode } from "./isoIndex";

const FLAG_BASE = "/assets/flag-guesser/flags";

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
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
  while (decoys.length < decoyCount && decoysPool.length > decoys.length) {
    const extra = decoysPool.find((d) => !decoys.includes(d));
    if (!extra) break;
    decoys.push(extra);
  }

  const cardAlpha2s = [targetA2, ...decoys].slice(0, decoyCount + 1);
  shuffleInPlace(cardAlpha2s);

  return { targetRow, cardAlpha2s };
}

/**
 * カリキュラム用: プール内から正解とお邪魔を抽選。地図は `mapCountryCodes` でプールの sub_region ブロックに限定。
 */
export function createCurriculumRoundPlan(
  poolRows: readonly Iso3166Row[],
  excludeAlpha2: Set<string>,
  decoyCount = 2
): RoundPlan | null {
  if (poolRows.length === 0) return null;

  const eligibleTargets = poolRows.filter((r) => {
    const a2 = r["alpha-2"]?.trim().toUpperCase();
    return a2 && !excludeAlpha2.has(a2);
  });
  const targetPool = eligibleTargets.length > 0 ? eligibleTargets : poolRows;
  const targetRow = targetPool[Math.floor(Math.random() * targetPool.length)]!;
  const targetA2 = targetRow["alpha-2"].trim().toUpperCase();

  const decoysPool = Array.from(
    new Set(
      poolRows
        .filter((r) => r["alpha-2"].trim().toUpperCase() !== targetA2)
        .map((r) => r["alpha-2"].trim().toUpperCase())
    )
  );
  shuffleInPlace(decoysPool);

  const decoys: string[] = [];
  for (const d of decoysPool) {
    if (decoys.length >= decoyCount) break;
    decoys.push(d);
  }
  while (decoys.length < decoyCount && decoysPool.length > 0) {
    decoys.push(decoysPool[decoys.length % decoysPool.length]!);
  }

  const cardAlpha2s = [targetA2, ...decoys].slice(0, decoyCount + 1);
  shuffleInPlace(cardAlpha2s);

  const mapCountryCodes = mapDisplayCountryCodesForTarget(poolRows, targetRow);
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
