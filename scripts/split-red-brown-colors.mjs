/**
 * flag_difficulty.json: red_brown → red / brown に分割し confusable_colors を再構築。
 * 分割根拠は red_brown 導入直前（72bd2ceb）の maroon → brown / red → red。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const DIFF_PATH = path.join(ROOT, "public/assets/flag-guesser/flag_difficulty.json");
const BASE_SHA = "72bd2ceb";

function colorsForScore(colors) {
  return colors
    .map((c) => {
      const k = String(c).trim().toLowerCase();
      if (k === "maroon" || k === "red_brown") return "brown";
      if (k === "yellow" || k === "orange") return "yellow_orange";
      return k;
    })
    .filter((c) => c !== "unknown" && c !== "emblem_colors" && c !== "other");
}

function colorScore(aColors, bColors) {
  const as = new Set(colorsForScore(aColors));
  const bs = new Set(colorsForScore(bColors));
  if (!as.size || !bs.size) return 0;
  let inter = 0;
  for (const c of as) if (bs.has(c)) inter++;
  return inter;
}

function rebuildConfusableColors(row, allRows, limit = 10) {
  const a3 = String(row.alpha3).trim().toUpperCase();
  return [
    ...new Set(
      allRows
        .filter((x) => String(x.alpha3).trim().toUpperCase() !== a3)
        .map((x) => ({
          a3: String(x.alpha3).trim().toUpperCase(),
          s: colorScore(row.tags.colors, x.tags.colors),
          sameIR:
            String(row.intermediate_region || "").trim() &&
            String(x.intermediate_region || "").trim() &&
            row.intermediate_region === x.intermediate_region,
          sameSR:
            String(row.sub_region || "").trim() &&
            String(x.sub_region || "").trim() &&
            row.sub_region === x.sub_region,
        }))
        .filter((x) => x.s > 0)
        .sort(
          (u, v) =>
            v.s - u.s ||
            Number(v.sameIR) - Number(u.sameIR) ||
            Number(v.sameSR) - Number(u.sameSR) ||
            u.a3.localeCompare(v.a3)
        )
        .map((x) => x.a3)
    ),
  ].slice(0, limit);
}

function splitRedBrownToken(alpha3, legacyColors) {
  const oc = (legacyColors || []).map((c) => String(c).trim().toLowerCase());
  if (oc.includes("maroon") && !oc.includes("red")) return "brown";
  return "red";
}

function normalizeColors(colors, alpha3, legacyByA3) {
  const legacy = legacyByA3.get(alpha3);
  const out = [];
  for (const raw of colors) {
    const k = String(raw).trim().toLowerCase();
    if (k === "red_brown") {
      const split = splitRedBrownToken(alpha3, legacy?.tags?.colors);
      if (!out.includes(split)) out.push(split);
    } else if (k === "maroon") {
      if (!out.includes("brown")) out.push("brown");
    } else if (k === "red") {
      if (!out.includes("red")) out.push("red");
    } else if (k && !out.includes(k)) {
      out.push(k);
    }
  }
  return out;
}

function main() {
  const legacyRaw = execSync(`git show ${BASE_SHA}:public/assets/flag-guesser/flag_difficulty.json`, {
    encoding: "utf8",
  });
  const legacyRows = JSON.parse(legacyRaw);
  const legacyByA3 = new Map(legacyRows.map((r) => [String(r.alpha3).trim().toUpperCase(), r]));

  const rows = JSON.parse(readFileSync(DIFF_PATH, "utf8"));
  let splitCount = 0;
  const splitLog = { red: 0, brown: 0 };

  for (const row of rows) {
    const a3 = String(row.alpha3).trim().toUpperCase();
    const before = [...(row.tags?.colors || [])];
    const after = normalizeColors(before, a3, legacyByA3);
    if (before.some((c) => String(c).trim().toLowerCase() === "red_brown")) {
      splitCount++;
      if (after.includes("brown") && !before.includes("brown")) splitLog.brown++;
      else splitLog.red++;
    }
    row.tags.colors = after;
  }

  let confChanged = 0;
  for (const row of rows) {
    const next = rebuildConfusableColors(row, rows);
    const prev = row.confusable_colors || [];
    const same = prev.length === next.length && prev.every((c, i) => c === next[i]);
    if (!same) confChanged++;
    row.confusable_colors = next;
  }

  writeFileSync(DIFF_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

  const tagCounts = { red: 0, brown: 0, red_brown: 0 };
  for (const row of rows) {
    for (const c of row.tags.colors) {
      if (c in tagCounts) tagCounts[c]++;
    }
  }

  console.log(
    JSON.stringify(
      {
        splitRedBrownRows: splitCount,
        splitLog,
        confusableRowsUpdated: confChanged,
        tagCounts,
        brownCountries: rows.filter((r) => r.tags.colors.includes("brown")).map((r) => r.alpha3),
      },
      null,
      2
    )
  );
}

main();
