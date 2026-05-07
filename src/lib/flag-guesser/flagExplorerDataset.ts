import type { Iso3166Row } from "./types";

/** `flag_difficulty.json` の1行 */
export type FlagDifficultyJsonRow = {
  alpha3: string;
  name: string;
  difficulty: number;
  region: string;
  sub_region: string;
  intermediate_region: string;
  tags: { colors: string[]; design: string };
  confusable_region: string[];
  confusable_colors: string[];
  confusable_design: string[];
};

/** 探索ページ用に ISO と難易度JSONを束ねた1国分 */
export type ExplorerCountryRow = {
  alpha3: string;
  alpha2: string;
  countryCode: string;
  nameEn: string;
  nameJa: string;
  regionLabel: string | null;
  subRegionLabel: string | null;
  intermediateRegionLabel: string | null;
  /** 1〜8。難易度JSONに無い国は中間の 4 */
  difficulty: number;
  colors: string[];
  designLabel: string;
  confusableColors: string[];
  confusableDesign: string[];
  /** 難易度・タグが `flag_difficulty` に存在したか */
  hasDifficultySource: boolean;
};

export function normalizeBlank(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

/**
 * `iso-3166` 全行を走査し、alpha-2/3・数値ID が揃う行だけを採用。
 * 難易度JSONは alpha-3 で左結合。
 */
export function mergeExplorerCountries(
  isoRows: Iso3166Row[],
  difficultyRows: FlagDifficultyJsonRow[],
  nameJaByAlpha2: Map<string, string>
): ExplorerCountryRow[] {
  const diffByA3 = new Map<string, FlagDifficultyJsonRow>();
  for (const d of difficultyRows) {
    const k = d.alpha3?.trim().toUpperCase();
    if (k) diffByA3.set(k, d);
  }

  const out: ExplorerCountryRow[] = [];
  for (const iso of isoRows) {
    const alpha2 = iso["alpha-2"]?.trim().toUpperCase();
    const alpha3 = iso["alpha-3"]?.trim().toUpperCase();
    const cc = iso["country-code"]?.trim();
    if (!alpha2 || !alpha3 || !cc) continue;

    const d = diffByA3.get(alpha3);
    const hasDifficultySource = d != null;
    const nameEn = (iso.name?.trim() || d?.name?.trim() || alpha3) as string;
    const nameJa = nameJaByAlpha2.get(alpha2) ?? nameEn;

    let difficulty = 4;
    if (d != null && Number.isFinite(d.difficulty)) {
      const n = Math.round(d.difficulty);
      if (n >= 1 && n <= 8) difficulty = n;
    }

    const rawColors = d?.tags?.colors ?? [];
    const colors = rawColors
      .map((c) => String(c).trim().toLowerCase())
      .filter((c) => c.length > 0);
    const designRaw = d?.tags?.design;
    const designLabel =
      typeof designRaw === "string" && designRaw.trim() !== ""
        ? designRaw.trim()
        : "（未分類）";

    out.push({
      alpha3,
      alpha2,
      countryCode: cc,
      nameEn,
      nameJa,
      regionLabel: normalizeBlank(iso.region),
      subRegionLabel: normalizeBlank(iso["sub-region"]),
      intermediateRegionLabel: normalizeBlank(iso["intermediate-region"]),
      difficulty,
      colors,
      designLabel,
      confusableColors: Array.from(
        new Set((d?.confusable_colors ?? []).map((x) => String(x).toUpperCase()))
      ).filter(Boolean),
      confusableDesign: Array.from(
        new Set((d?.confusable_design ?? []).map((x) => String(x).toUpperCase()))
      ).filter(Boolean),
      hasDifficultySource,
    });
  }
  return out;
}

export type RegionHierarchy = Map<string, Set<string>>;

/** Region → Sub-region 集合（空の sub-region は入れない） */
export function buildRegionHierarchy(isoRows: readonly Iso3166Row[]): RegionHierarchy {
  const m: RegionHierarchy = new Map();
  for (const row of isoRows) {
    const r = normalizeBlank(row.region);
    const sr = normalizeBlank(row["sub-region"]);
    if (!r) continue;
    if (!m.has(r)) m.set(r, new Set());
    if (sr) m.get(r)!.add(sr);
  }
  return m;
}

/** タグ出現集合（ソート済み。`unknown` は末尾） */
export function collectColorTagOptions(rows: readonly ExplorerCountryRow[]): string[] {
  const s = new Set<string>();
  for (const row of rows) {
    for (const c of row.colors) s.add(c);
  }
  const preferredOrder = [
    "red",
    "blue",
    "yellow",
    "white",
    "black",
    "green",
    "orange",
    "purple",
    "brown",
    "maroon",
    "gold",
    "silver",
    "pink",
    "emblem_colors",
  ];
  const ordered = preferredOrder.filter((c) => s.has(c));
  const extra = Array.from(s)
    .filter((c) => c !== "unknown" && !preferredOrder.includes(c))
    .sort((a, b) => a.localeCompare(b));
  const out = [...ordered, ...extra];
  if (s.has("unknown")) out.push("unknown");
  return out;
}

export function displayColorTag(c: string): string {
  const m: Record<string, string> = {
    red: "赤",
    blue: "青",
    yellow: "黄",
    white: "白",
    black: "黒",
    green: "緑",
    orange: "橙",
    purple: "紫",
    brown: "茶",
    maroon: "赤茶",
    gold: "金",
    silver: "銀",
    pink: "桃",
    emblem_colors: "紋章色",
    unknown: "不明",
  };
  return m[c] ?? c;
}

export function displayDesignTag(d: string): string {
  if (d === "generic" || d === "（未分類）") return d === "generic" ? "汎用" : d;
  return d;
}
