/**
 * flag_difficulty.json の confusable_colors / confusable_design を
 * 色・デザイン・シンボルの類似度で再構築する。
 *
 * confusable_colors … 色スコアのみでソート（A1）
 * confusable_design … 色+デザイン+シンボル+地域の合計でソート
 *
 * tags.canton_colors … Union Jack 等カントン色は field 色より低重み（B3）
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIFF_PATH = path.join(ROOT, "public/assets/flag-guesser/flag_difficulty.json");
const LIMIT = 10;

const IGNORE_COLORS = new Set(["unknown", "emblem_colors", "other"]);
const WEAK_SYMBOLS = new Set(["なし", "その他"]);
const UNION_JACK = ["blue", "white", "red"];
const CANTON_COLOR_WEIGHT = 0.3;

function normA3(v) {
  return String(v ?? "").trim().toUpperCase();
}

function normColors(colors) {
  return (colors ?? [])
    .map((c) => String(c).trim().toLowerCase())
    .filter((c) => c && !IGNORE_COLORS.has(c));
}

function normSymbols(symbols) {
  return (symbols ?? [])
    .map((s) => String(s).trim())
    .filter((s) => s && !WEAK_SYMBOLS.has(s));
}

function multisetEqual(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function overlapMetrics(a, b) {
  const as = new Set(a);
  const bs = new Set(b);
  if (!as.size || !bs.size) return { inter: 0, jaccard: 0, exact: false };
  let inter = 0;
  for (const x of as) if (bs.has(x)) inter++;
  const union = as.size + bs.size - inter;
  return {
    inter,
    jaccard: union > 0 ? inter / union : 0,
    exact: multisetEqual(a, b),
  };
}

function scoreColorSets(aColors, bColors) {
  const ac = normColors(aColors);
  const bc = normColors(bColors);
  if (!ac.length || !bc.length) return 0;
  const { inter, jaccard, exact } = overlapMetrics(ac, bc);
  if (inter === 0) return 0;
  return inter * 12 + jaccard * 25 + (exact ? 35 : 0);
}

/** B3: field 色はフル重み、canton 色は CANTON_COLOR_WEIGHT */
function scoreColors(aTags, bTags) {
  const mainA = aTags?.colors;
  const mainB = bTags?.colors;
  const cantonA = aTags?.canton_colors;
  const cantonB = bTags?.canton_colors;

  let score = scoreColorSets(mainA, mainB);
  const ca = normColors(cantonA);
  const cb = normColors(cantonB);
  if (!ca.length && !cb.length) return score;

  score += scoreColorSets(mainA, cantonB) * CANTON_COLOR_WEIGHT;
  score += scoreColorSets(cantonA, mainB) * CANTON_COLOR_WEIGHT;
  score += scoreColorSets(cantonA, cantonB) * CANTON_COLOR_WEIGHT;
  return score;
}

function scoreDesign(aDesign, bDesign) {
  const a = String(aDesign ?? "").trim();
  const b = String(bDesign ?? "").trim();
  if (!a || !b || a === "generic" || a === "（未分類）") return 0;
  return a === b ? 40 : 0;
}

function scoreSymbols(aSymbols, bSymbols) {
  const as = normSymbols(aSymbols);
  const bs = normSymbols(bSymbols);
  if (!as.length || !bs.length) return 0;
  const { inter, jaccard, exact } = overlapMetrics(as, bs);
  if (inter === 0) return 0;
  return inter * 18 + jaccard * 12 + (exact ? 30 : 0);
}

function regionalBonus(row, other) {
  let bonus = 0;
  const irA = String(row.intermediate_region ?? "").trim();
  const irB = String(other.intermediate_region ?? "").trim();
  const srA = String(row.sub_region ?? "").trim();
  const srB = String(other.sub_region ?? "").trim();
  if (irA && irB && irA === irB) bonus += 3;
  else if (srA && srB && srA === srB) bonus += 2;
  return bonus;
}

function scorePair(row, other) {
  const color = scoreColors(row.tags, other.tags);
  const design = scoreDesign(row.tags?.design, other.tags?.design);
  const symbol = scoreSymbols(row.tags?.symbol, other.tags?.symbol);
  const region = regionalBonus(row, other);
  return {
    total: color + design + symbol + region,
    color,
    design,
    symbol,
    region,
  };
}

function rankCandidates(row, allRows, filterFn, sortFn) {
  const a3 = normA3(row.alpha3);
  return allRows
    .filter((x) => normA3(x.alpha3) !== a3)
    .map((other) => {
      const s = scorePair(row, other);
      return { a3: normA3(other.alpha3), ...s };
    })
    .filter((x) => filterFn(x))
    .sort(sortFn)
    .slice(0, LIMIT)
    .map((x) => x.a3);
}

/** B3: カントン旗の Union Jack 色（白・赤）を canton_colors へ分離 */
function splitCantonColors(tags) {
  const design = String(tags?.design ?? "").trim();
  if (design !== "カントン") return tags;

  const raw = tags?.colors ?? [];
  const colors = normColors(raw);
  const hasUjSecondary = colors.includes("white") || colors.includes("red");
  const mainCandidates = colors.filter((c) => c !== "white" && c !== "red");
  if (!hasUjSecondary || mainCandidates.length === 0) return tags;

  const canton = UNION_JACK.filter((c) => colors.includes(c));
  if (canton.length < 2) return tags;

  const newColors = [...mainCandidates];
  const rawLower = raw.map((c) => String(c).trim().toLowerCase());
  if (rawLower.includes("other")) newColors.push("other");

  const prevCanton = (tags.canton_colors ?? []).map((c) => String(c).trim().toLowerCase()).sort();
  const nextCanton = [...canton].sort();
  const prevColors = rawLower.filter((c) => c !== "other" || newColors.includes("other"));
  const nextColorsLower = newColors.map((c) => c.toLowerCase());

  const colorsSame =
    prevColors.length === nextColorsLower.length &&
    [...prevColors].sort().every((c, i) => c === [...nextColorsLower].sort()[i]);
  const cantonSame =
    prevCanton.length === nextCanton.length &&
    prevCanton.every((c, i) => c === nextCanton[i]);

  if (colorsSame && cantonSame) return tags;

  return {
    ...tags,
    colors: newColors,
    canton_colors: canton,
  };
}

/** B1: FJI シンボルを Union Jack + 星に合わせる */
function fixFjiSymbols(rows) {
  const fji = rows.find((r) => normA3(r.alpha3) === "FJI");
  if (!fji?.tags) return false;
  const next = ["星", "十字"];
  const prev = (fji.tags.symbol ?? []).map((s) => String(s).trim());
  if (prev.length === next.length && prev.every((s, i) => s === next[i])) return false;
  fji.tags.symbol = next;
  return true;
}

function main() {
  const rows = JSON.parse(readFileSync(DIFF_PATH, "utf8"));
  let cantonSplitCount = 0;
  let fjiFixed = false;

  for (const row of rows) {
    if (!row.tags) continue;
    const nextTags = splitCantonColors(row.tags);
    if (nextTags !== row.tags) {
      row.tags = nextTags;
      cantonSplitCount++;
    }
  }
  fjiFixed = fixFjiSymbols(rows);

  let colorChanged = 0;
  let designChanged = 0;

  const colorSort = (u, v) =>
    v.color - u.color ||
    v.design - u.design ||
    v.symbol - u.symbol ||
    u.a3.localeCompare(v.a3);

  const totalSort = (u, v) =>
    v.total - u.total ||
    v.color - u.color ||
    v.symbol - u.symbol ||
    v.design - u.design ||
    u.a3.localeCompare(v.a3);

  for (const row of rows) {
    const nextColors = rankCandidates(row, rows, (x) => x.color > 0, colorSort);
    const nextDesign = rankCandidates(row, rows, (x) => x.design > 0, totalSort);

    const prevC = row.confusable_colors ?? [];
    const prevD = row.confusable_design ?? [];
    if (prevC.join() !== nextColors.join()) colorChanged++;
    if (prevD.join() !== nextDesign.join()) designChanged++;

    row.confusable_colors = nextColors;
    row.confusable_design = nextDesign;
  }

  writeFileSync(DIFF_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

  const ecu = rows.find((r) => r.alpha3 === "ECU");
  const fji = rows.find((r) => r.alpha3 === "FJI");

  console.log(
    JSON.stringify(
      {
        rows: rows.length,
        cantonSplitCount,
        fjiFixed,
        colorListsUpdated: colorChanged,
        designListsUpdated: designChanged,
        ecu: {
          confusable_colors: ecu?.confusable_colors,
          fjiInColors: ecu?.confusable_colors?.includes("FJI"),
        },
        fji: {
          tags: fji?.tags,
          confusable_colors: fji?.confusable_colors,
        },
      },
      null,
      2
    )
  );
}

main();
