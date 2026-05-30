/**
 * flag_difficulty.json の confusable_colors / confusable_design を
 * 色・デザイン・シンボルの類似度で再構築する。
 *
 * 1. 色の組み合わせが同じ/似ている
 * 2. 同じデザイン
 * 3. シンボルが同じ/似ている
 * 複数を満たすほどスコアが高く、リスト上位（= 出題ダミーに出やすい）になる。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIFF_PATH = path.join(ROOT, "public/assets/flag-guesser/flag_difficulty.json");
const LIMIT = 10;

const IGNORE_COLORS = new Set(["unknown", "emblem_colors", "other"]);
const WEAK_SYMBOLS = new Set(["なし", "その他"]);

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

function scoreColors(aColors, bColors) {
  const ac = normColors(aColors);
  const bc = normColors(bColors);
  if (!ac.length || !bc.length) return 0;
  const { inter, jaccard, exact } = overlapMetrics(ac, bc);
  if (inter === 0) return 0;
  return inter * 12 + jaccard * 25 + (exact ? 35 : 0);
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
  const color = scoreColors(row.tags?.colors, other.tags?.colors);
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

function rankCandidates(row, allRows, filterFn) {
  const a3 = normA3(row.alpha3);
  return allRows
    .filter((x) => normA3(x.alpha3) !== a3)
    .map((other) => {
      const s = scorePair(row, other);
      return { a3: normA3(other.alpha3), ...s };
    })
    .filter((x) => filterFn(x))
    .sort(
      (u, v) =>
        v.total - u.total ||
        v.color - u.color ||
        v.symbol - u.symbol ||
        v.design - u.design ||
        u.a3.localeCompare(v.a3)
    )
    .slice(0, LIMIT)
    .map((x) => x.a3);
}

function main() {
  const rows = JSON.parse(readFileSync(DIFF_PATH, "utf8"));
  let colorChanged = 0;
  let designChanged = 0;

  for (const row of rows) {
    const nextColors = rankCandidates(row, rows, (x) => x.color > 0);
    const nextDesign = rankCandidates(row, rows, (x) => x.design > 0);

    const prevC = row.confusable_colors ?? [];
    const prevD = row.confusable_design ?? [];
    if (prevC.join() !== nextColors.join()) colorChanged++;
    if (prevD.join() !== nextDesign.join()) designChanged++;

    row.confusable_colors = nextColors;
    row.confusable_design = nextDesign;
  }

  writeFileSync(DIFF_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

  const samples = ["ALA", "ALB", "JPN", "LBY", "FIN"].map((a3) => {
    const r = rows.find((x) => x.alpha3 === a3);
    return {
      alpha3: a3,
      tags: r?.tags,
      confusable_colors: r?.confusable_colors,
      confusable_design: r?.confusable_design,
    };
  });

  console.log(
    JSON.stringify(
      {
        rows: rows.length,
        colorListsUpdated: colorChanged,
        designListsUpdated: designChanged,
        samples,
      },
      null,
      2
    )
  );
}

main();
