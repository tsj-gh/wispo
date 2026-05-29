/**
 * 本番（またはプレビュー）URL の HTML が参照する JS/CSS が HTTP 200 か検証する。
 * デプロイ直後は CDN の本番エイリアス反映に遅れがあるため SMOKE_RETRIES で再試行する。
 */
const SITE_URL = (process.env.SITE_URL || "https://wispo.pages.dev").replace(/\/$/, "");
const RETRIES = Math.max(1, Number(process.env.SMOKE_RETRIES || "1"));
const RETRY_DELAY_MS = Math.max(0, Number(process.env.SMOKE_RETRY_DELAY_MS || "8000"));

const PAGES = [
  "/",
  "/lab/flag-guesser",
  "/lab/flag-guesser/explorer",
];

const ASSET_RE = /\/_next\/static\/[^"'\s)]+\.(?:js|css)/g;

const fetchOpts = {
  redirect: "follow",
  headers: { "Cache-Control": "no-cache" },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(path) {
  const url = `${SITE_URL}${path}`;
  const res = await fetch(url, fetchOpts);
  if (!res.ok) throw new Error(`${path} HTML ${res.status}`);
  return res.text();
}

/** HEAD が 404 でも GET が通る CDN 対策で GET を使う */
async function assetOk(assetPath) {
  const url = `${SITE_URL}${assetPath}`;
  const res = await fetch(url, { ...fetchOpts, method: "GET" });
  if (!res.ok) return { assetPath, status: res.status, ok: false };
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 32) {
    return { assetPath, status: res.status, ok: false, reason: "too small" };
  }
  return { assetPath, status: res.status, ok: true };
}

async function runOnce() {
  const allAssets = new Set();

  for (const path of PAGES) {
    const html = await fetchText(path);
    for (const m of html.matchAll(ASSET_RE)) allAssets.add(m[0]);
  }

  const results = await Promise.all([...allAssets].map(assetOk));
  const bad = results.filter((r) => !r.ok);
  return { allAssets, bad };
}

async function main() {
  let lastBad = [];

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const { allAssets, bad } = await runOnce();
    if (!bad.length) {
      console.log(
        `[smoke-pages-production] OK — ${PAGES.length} page(s), ${allAssets.size} asset(s) on ${SITE_URL}` +
          (attempt > 1 ? ` (attempt ${attempt}/${RETRIES})` : "")
      );
      return;
    }

    lastBad = bad;
    if (attempt < RETRIES) {
      console.warn(
        `[smoke-pages-production] ${bad.length} asset(s) not OK (attempt ${attempt}/${RETRIES}), retry in ${RETRY_DELAY_MS}ms…`
      );
      for (const b of bad.slice(0, 5)) {
        console.warn(`  ${b.status} ${b.assetPath}${b.reason ? ` — ${b.reason}` : ""}`);
      }
      await sleep(RETRY_DELAY_MS);
    }
  }

  console.error(`[smoke-pages-production] ${lastBad.length} asset(s) not OK on ${SITE_URL}:`);
  for (const b of lastBad) {
    console.error(`  ${b.status} ${b.assetPath}${b.reason ? ` — ${b.reason}` : ""}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("[smoke-pages-production]", err);
  process.exit(1);
});
