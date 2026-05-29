/**
 * flag_difficulty.json:
 * - blue → blue | water（国旗 SVG の青系色相で判定）
 * - yellow_orange → yellow | orange（72bd2ceb の旧タグに基づく）
 * confusable_colors を全行再構築。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const DIFF_PATH = path.join(ROOT, "public/assets/flag-guesser/flag_difficulty.json");
const FLAGS_DIR = path.join(ROOT, "public/assets/flag-guesser/flags");
const ISO_PATH = path.join(ROOT, "public/assets/flag-guesser/iso-3166.json");
const LEGACY_SHA = "72bd2ceb";

function parseHex(raw) {
  let h = String(raw).trim().toLowerCase();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || !/^[0-9a-f]+$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s, l];
}

function extractHexColors(svg) {
  const set = new Set();
  for (const m of svg.matchAll(/#(?:[0-9a-fA-F]{3,8})\b/g)) set.add(m[0]);
  return [...set];
}

/** 国旗 SVG から blue（紺）か water（水色）かを推定 */
export function classifyBlueFromSvg(svg) {
  const cols = extractHexColors(svg).map(parseHex).filter(Boolean);
  const blues = cols
    .map(([r, g, b]) => {
      const [h, s, l] = rgbToHsl(r, g, b);
      return { h, s, l, w: l * s };
    })
    .filter((c) => c.l > 0.07 && c.l < 0.96 && c.s > 0.12 && c.h >= 165 && c.h <= 255);

  if (!blues.length) return "blue";

  let hSum = 0;
  let lSum = 0;
  let wSum = 0;
  for (const c of blues) {
    hSum += c.h * c.w;
    lSum += c.l * c.w;
    wSum += c.w;
  }
  const H = hSum / wSum;
  const L = lSum / wSum;

  if (L >= 0.52 && H >= 182) return "water";
  if (L >= 0.58) return "water";
  return "blue";
}

function colorsForScore(colors) {
  return colors
    .map((c) => String(c).trim().toLowerCase())
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
  return Array.from(
    new Set(
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
    )
  ).slice(0, limit);
}

function splitYellowOrangeToken(alpha3, legacyColors) {
  const oc = (legacyColors || []).map((c) => String(c).trim().toLowerCase());
  const hasY = oc.includes("yellow");
  const hasO = oc.includes("orange");
  if (hasY && hasO) return ["yellow", "orange"];
  if (hasO) return "orange";
  return "yellow";
}

function normalizeColors(colors, alpha3, legacyByA3, blueByA3) {
  const legacy = legacyByA3.get(alpha3);
  const out = [];

  for (const raw of colors) {
    const k = String(raw).trim().toLowerCase();
    if (k === "yellow_orange") {
      const split = splitYellowOrangeToken(alpha3, legacy?.tags?.colors);
      if (Array.isArray(split)) {
        for (const t of split) if (!out.includes(t)) out.push(t);
      } else if (!out.includes(split)) {
        out.push(split);
      }
    } else if (k === "blue") {
      const split = blueByA3.get(alpha3) || "blue";
      if (!out.includes(split)) out.push(split);
    } else if (k === "yellow") {
      if (!out.includes("yellow")) out.push("yellow");
    } else if (k === "orange") {
      if (!out.includes("orange")) out.push("orange");
    } else if (k === "water") {
      if (!out.includes("water")) out.push("water");
    } else if (k && !out.includes(k)) {
      out.push(k);
    }
  }
  return out;
}

function main() {
  const legacyRaw = execSync(`git show ${LEGACY_SHA}:public/assets/flag-guesser/flag_difficulty.json`, {
    encoding: "utf8",
  });
  const legacyRows = JSON.parse(legacyRaw);
  const legacyByA3 = new Map(legacyRows.map((r) => [String(r.alpha3).trim().toUpperCase(), r]));

  const isoRows = JSON.parse(readFileSync(ISO_PATH, "utf8"));
  const a3ToA2 = new Map(
    isoRows.map((r) => [String(r["alpha-3"]).trim().toUpperCase(), String(r["alpha-2"]).trim().toLowerCase()])
  );

  const blueByA3 = new Map();
  for (const [a3, a2] of a3ToA2) {
    const fp = path.join(FLAGS_DIR, `${a2}.svg`);
    if (!existsSync(fp)) continue;
    blueByA3.set(a3, classifyBlueFromSvg(readFileSync(fp, "utf8")));
  }

  const rows = JSON.parse(readFileSync(DIFF_PATH, "utf8"));
  const splitLog = { blue: 0, water: 0, yellow: 0, orange: 0, yellowOrangeBoth: 0 };

  for (const row of rows) {
    const a3 = String(row.alpha3).trim().toUpperCase();
    const before = [...(row.tags?.colors || [])];
    const after = normalizeColors(before, a3, legacyByA3, blueByA3);

    if (before.includes("blue")) {
      const tag = after.find((c) => c === "blue" || c === "water");
      if (tag === "water") splitLog.water++;
      else splitLog.blue++;
    }
    if (before.includes("yellow_orange")) {
      if (after.includes("yellow") && after.includes("orange")) splitLog.yellowOrangeBoth++;
      else if (after.includes("orange")) splitLog.orange++;
      else splitLog.yellow++;
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

  const tagCounts = {};
  for (const row of rows) {
    for (const c of row.tags.colors) tagCounts[c] = (tagCounts[c] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        splitLog,
        confusableRowsUpdated: confChanged,
        tagCounts,
        waterCountries: rows.filter((r) => r.tags.colors.includes("water")).map((r) => r.alpha3),
        orangeOnlyFromYellowOrange: rows
          .filter((r) => r.tags.colors.includes("orange") && !r.tags.colors.includes("yellow"))
          .map((r) => r.alpha3),
      },
      null,
      2
    )
  );
}

main();
