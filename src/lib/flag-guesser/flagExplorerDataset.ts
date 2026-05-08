import type { Iso3166Row } from "./types";

/** `flag_difficulty.json` の1行 */
export type FlagDifficultyJsonRow = {
  alpha3: string;
  name: string;
  difficulty: number;
  region: string;
  sub_region: string;
  intermediate_region: string;
  tags: { colors: string[]; design: string; symbol?: string[] };
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
  symbolTags: string[];
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

    const symbolTags = (d?.tags?.symbol ?? [])
      .map((s) => String(s).trim())
      .filter(Boolean);

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
      symbolTags,
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
    silver: "銀",
    pink: "桃",
    emblem_colors: "紋章色",
    unknown: "不明",
  };
  return m[c] ?? c;
}

export function displayDesignTag(d: string): string {
  return displayDesignTagByLocale(d, "ja");
}

export function collectDesignTagOptions(rows: readonly ExplorerCountryRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.designLabel))).sort((a, b) => a.localeCompare(b));
}

export function collectSymbolTagOptions(rows: readonly ExplorerCountryRow[]): string[] {
  const preferredOrder = ["太陽/月", "十字", "星", "生物", "文字", "景色/建物", "その他", "なし"];
  const present = new Set<string>();
  for (const r of rows) {
    for (const s of r.symbolTags) present.add(s);
  }
  const ordered = preferredOrder.filter((s) => present.has(s));
  const extra = Array.from(present)
    .filter((s) => !preferredOrder.includes(s))
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...extra];
}

export function displayDesignTagByLocale(d: string, locale: "ja" | "en"): string {
  const raw = (d ?? "").trim();
  if (!raw) return locale === "ja" ? "（未分類）" : "";
  if (locale === "en") {
    const enMap: Record<string, string> = {
      横分割: "Horizontal Split",
      縦分割: "Vertical Split",
      十字四分割: "Cross / Quadrants",
      斜め分割: "Diagonal Split",
      対角: "Radiating / Angular",
      T字: "T-shape",
      Y字: "Y-shape",
      カントン: "Canton",
      その他: "Other",
    };
    if (raw === "（未分類）") return "";
    return enMap[raw] ?? raw;
  }
  if (raw === "generic") return "汎用";
  if (raw === "（未分類）") return raw;

  const tokenJa: Record<string, string> = {
    arrow: "矢印",
    shapes: "図形",
    bicolor: "二色",
    tricolor: "三色",
    triband: "三分割帯",
    quadrants: "四分割",
    horizontal: "横帯",
    vertical: "縦帯",
    stripe: "ストライプ",
    stripes: "ストライプ",
    split: "分割",
    diagonal: "斜め",
    triangle: "三角",
    triangles: "三角",
    diamond: "菱形",
    diamonds: "菱形",
    disk: "円盤",
    centered: "中央",
    center: "中央",
    side: "側面",
    off: "オフ",
    offcentered: "オフ中心",
    emblem: "紋章",
    cross: "十字",
    crosses: "十字",
    nordic: "北欧",
    square: "正方",
    corner: "隅",
    corners: "隅",
    canton: "カントン",
    stars: "星",
    star: "星",
    sun: "太陽",
    rays: "光線",
    crescent: "三日月",
    wheel: "輪",
    flower: "花",
    leaf: "葉",
    branches: "枝",
    map: "地図",
    border: "縁取り",
    framed: "額縁",
    radiating: "放射",
    saltire: "斜め十字",
    serrated: "ギザギザ",
    shield: "盾",
    union: "ユニオン",
    jack: "ジャック",
    yellow: "黄色",
    pan: "パン",
    african: "アフリカ",
    arab: "アラブ",
    trapezoid: "台形",
    y: "Y字",
    v: "V字",
    zigzag: "ジグザグ",
    non: "非",
    quadrilateral: "四角形",
    unique: "独特",
    text: "文字",
    tree: "木",
    trigrams: "八卦",
    dragon: "龍",
    pattern: "模様",
    five: "5つ",
    landscape: "横長",
  };
  const translated = raw
    .split("_")
    .map((token) => tokenJa[token] ?? token)
    .join("・");
  return translated;
}

export function displaySymbolTagByLocale(s: string, locale: "ja" | "en"): string {
  const raw = (s ?? "").trim();
  if (!raw) return "";
  if (locale === "ja") return raw;
  const enMap: Record<string, string> = {
    "太陽/月": "Sun / Moon",
    十字: "Cross",
    星: "Star",
    生物: "Creature",
    文字: "Text",
    "景色/建物": "Scenery / Building",
    その他: "Other",
    なし: "None",
  };
  return enMap[raw] ?? raw;
}

/**
 * 詳細地図の表示範囲用：同じ中間リージョンの国（無ければ同じサブリージョン、それも無ければ同じ地域）の ISO numeric country-code 一覧。
 */
export function collectCountryCodesForRegionalMapFit(
  selected: ExplorerCountryRow,
  isoRows: readonly Iso3166Row[]
): string[] {
  const ir = selected.intermediateRegionLabel;
  const sr = selected.subRegionLabel;
  const reg = selected.regionLabel;
  const codes = new Set<string>();
  for (const row of isoRows) {
    const cc = row["country-code"]?.trim();
    if (!cc) continue;
    if (ir) {
      if (normalizeBlank(row["intermediate-region"]) === ir) codes.add(cc);
    } else if (sr) {
      const msr = normalizeBlank(row["sub-region"]);
      const mr = normalizeBlank(row.region);
      if (msr === sr && (!reg || mr === reg)) codes.add(cc);
    } else if (reg) {
      if (normalizeBlank(row.region) === reg) codes.add(cc);
    }
  }
  return Array.from(codes);
}
