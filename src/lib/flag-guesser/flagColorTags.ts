/** Explorer 絞り込み用の仮想タグ（UI ではまとめて表示） */
export const EXPLORER_COLOR_FILTER_TAGS = [
  "red_brown",
  "blue",
  "yellow_orange",
  "white",
  "black",
  "green",
  "purple",
  "silver",
  "pink",
  "emblem_colors",
  "other",
] as const;

const RED_BROWN_CANONICAL = new Set(["red", "brown"]);

/** 難易度 JSON の正規色 → Explorer 絞り込みタグ */
export function canonicalColorToFilterTag(c: string): string {
  const k = c.trim().toLowerCase();
  if (RED_BROWN_CANONICAL.has(k) || k === "maroon" || k === "red_brown") return "red_brown";
  if (k === "yellow" || k === "orange") return "yellow_orange";
  return k;
}

/** 絞り込みタグ → 難易度 JSON 上の色（OR 一致用） */
export function filterTagExpandsToCanonical(filterTag: string): string[] {
  if (filterTag === "red_brown") return ["red", "brown"];
  if (filterTag === "yellow_orange") return ["yellow_orange", "yellow", "orange"];
  return [filterTag];
}

export function countryHasFilterColor(countryColors: readonly string[], filterTag: string): boolean {
  const expanded = filterTagExpandsToCanonical(filterTag);
  return expanded.some((c) => countryColors.includes(c));
}

/** 国の正規色列 → 絞り込みタグ列（完全一致比較用） */
export function countryColorsToFilterMultiset(colors: readonly string[]): string[] {
  return colors.map((c) => canonicalColorToFilterTag(c));
}

export function colorFilterMultisetEqual(filterTags: readonly string[], countryColors: readonly string[]): boolean {
  const a = [...filterTags].sort();
  const b = [...countryColorsToFilterMultiset(countryColors)].sort();
  if (a.length !== b.length) return false;
  return a.every((c, i) => c === b[i]);
}

/** confusable_colors スコア計算用（red / brown は別タグとして扱う） */
export function colorsForConfusableScore(colors: readonly string[]): string[] {
  return colors
    .map((c) => {
      const k = c.trim().toLowerCase();
      if (k === "maroon" || k === "red_brown") return "brown";
      if (k === "yellow" || k === "orange") return "yellow_orange";
      return k;
    })
    .filter((c) => c !== "unknown" && c !== "emblem_colors" && c !== "other");
}

export function colorOverlapScore(aColors: readonly string[], bColors: readonly string[]): number {
  const as = new Set(colorsForConfusableScore(aColors));
  const bs = new Set(colorsForConfusableScore(bColors));
  if (as.size === 0 || bs.size === 0) return 0;
  let inter = 0;
  for (const c of Array.from(as)) if (bs.has(c)) inter++;
  return inter;
}

export type FlagDifficultyColorRow = {
  alpha3: string;
  sub_region: string;
  intermediate_region: string;
  tags: { colors: string[] };
};

export function rebuildConfusableColors(
  row: FlagDifficultyColorRow,
  allRows: readonly FlagDifficultyColorRow[],
  limit = 10
): string[] {
  const a3 = row.alpha3.trim().toUpperCase();
  const colorCandidates = allRows
    .filter((x) => x.alpha3.trim().toUpperCase() !== a3)
    .map((x) => ({
      a3: x.alpha3.trim().toUpperCase(),
      s: colorOverlapScore(row.tags.colors, x.tags.colors),
      sameIR:
        Boolean(row.intermediate_region?.trim()) &&
        Boolean(x.intermediate_region?.trim()) &&
        row.intermediate_region.trim() === x.intermediate_region.trim(),
      sameSR:
        Boolean(row.sub_region?.trim()) &&
        Boolean(x.sub_region?.trim()) &&
        row.sub_region.trim() === x.sub_region.trim(),
    }))
    .filter((x) => x.s > 0)
    .sort(
      (u, v) =>
        v.s - u.s ||
        Number(v.sameIR) - Number(u.sameIR) ||
        Number(v.sameSR) - Number(u.sameSR) ||
        u.a3.localeCompare(v.a3)
    );
  return Array.from(new Set(colorCandidates.map((x) => x.a3))).slice(0, limit);
}

/** `red_brown` / `maroon` を正規の `red` | `brown` に正規化 */
export function normalizeCanonicalColors(colors: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of colors) {
    const k = raw.trim().toLowerCase();
    if (k === "red_brown" || k === "red") {
      if (!out.includes("red")) out.push("red");
    } else if (k === "maroon" || k === "brown") {
      if (!out.includes("brown")) out.push("brown");
    } else if (k && !out.includes(k)) {
      out.push(k);
    }
  }
  return out;
}
