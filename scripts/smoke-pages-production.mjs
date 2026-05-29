/**
 * 本番（またはプレビュー）URL の HTML が参照する JS/CSS が HTTP 200 か検証する。
 * デプロイ直後に CI で実行。
 */
const SITE_URL = (process.env.SITE_URL || "https://wispo.pages.dev").replace(/\/$/, "");

const PAGES = [
  "/",
  "/lab/flag-guesser",
  "/lab/flag-guesser/explorer",
];

const ASSET_RE = /\/_next\/static\/[^"'\s)]+\.(?:js|css)/g;

async function fetchText(path) {
  const url = `${SITE_URL}${path}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${path} HTML ${res.status}`);
  return res.text();
}

async function headOk(assetPath) {
  const url = `${SITE_URL}${assetPath}`;
  const res = await fetch(url, { method: "HEAD", redirect: "follow" });
  return { assetPath, status: res.status, ok: res.ok };
}

const allAssets = new Set();

for (const path of PAGES) {
  const html = await fetchText(path);
  for (const m of html.matchAll(ASSET_RE)) allAssets.add(m[0]);
}

const results = await Promise.all([...allAssets].map(headOk));
const bad = results.filter((r) => !r.ok);

if (bad.length) {
  console.error(`[smoke-pages-production] ${bad.length} asset(s) not OK on ${SITE_URL}:`);
  for (const b of bad) {
    console.error(`  ${b.status} ${b.assetPath}`);
  }
  process.exit(1);
}

console.log(
  `[smoke-pages-production] OK — ${PAGES.length} page(s), ${allAssets.size} asset(s) on ${SITE_URL}`
);
