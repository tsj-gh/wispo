/**
 * `out/` 内の HTML が参照する /_next/static 資産が存在し、空でないことを検証する。
 * デプロイ前に実行（CI・ローカル deploy:pages 共通）。
 */
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "out");
const MIN_BYTES = 32;

const ASSET_RE = /\/_next\/static\/[^"'\s)]+\.(?:js|css)/g;

function collectHtmlFiles(dir, acc = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) collectHtmlFiles(p, acc);
    else if (name.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

function assetFilePath(assetPath) {
  const parts = assetPath.replace(/^\//, "").split("/").filter(Boolean);
  return join(outDir, ...parts);
}

function checkAsset(assetPath) {
  const pathToUse = assetFilePath(assetPath);
  let st;
  try {
    st = statSync(pathToUse);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (!st.isFile() || st.size < MIN_BYTES) {
    return { ok: false, reason: `too small (${st.size} B)` };
  }
  return { ok: true };
}

const htmlFiles = collectHtmlFiles(outDir);
const assets = new Set();
for (const htmlPath of htmlFiles) {
  const text = readFileSync(htmlPath, "utf8");
  for (const m of text.matchAll(ASSET_RE)) assets.add(m[0]);
}

const critical = [
  "/lab/flag-guesser/explorer.html",
  "/lab/flag-guesser.html",
  "/index.html",
].map((p) => assetFilePath(p));

for (const p of critical) {
  try {
    statSync(p);
  } catch {
    console.error(`[verify-pages-out] missing critical HTML: ${p}`);
    process.exit(1);
  }
}

const failures = [];
for (const asset of assets) {
  const r = checkAsset(asset);
  if (!r.ok) failures.push({ asset, reason: r.reason });
}

if (failures.length) {
  console.error(`[verify-pages-out] ${failures.length} broken reference(s) in out/:`);
  for (const f of failures.slice(0, 30)) {
    console.error(`  ${f.asset} — ${f.reason}`);
  }
  if (failures.length > 30) console.error(`  ... and ${failures.length - 30} more`);
  process.exit(1);
}

console.log(
  `[verify-pages-out] OK — ${htmlFiles.length} HTML file(s), ${assets.size} static asset reference(s)`
);
