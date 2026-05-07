import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ISO_PATH = path.join(ROOT, "public/assets/flag-guesser/iso-3166.json");
const FLAGS_DIR = path.join(ROOT, "public/assets/flag-guesser/flags");
const META_PATH = path.join(ROOT, "public/assets/flag-guesser/flag_aspect_ratio.json");

const USER_AGENT = "WispoFlagSync/1.0 (educational use)";
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const RESTCOUNTRIES_ALPHA = "https://restcountries.com/v3.1/alpha";

const SPARQL = `
SELECT ?code ?flag WHERE {
  ?item wdt:P297 ?code ;
        wdt:P41 ?flag .
  FILTER(STRLEN(?code) = 2)
}
`;

function parseNumericLike(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function parseSvgAspect(svgText) {
  const viewBox = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  if (viewBox) {
    const nums = viewBox
      .trim()
      .split(/[,\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 4 && nums[2] > 0 && nums[3] > 0) {
      return { width: nums[2], height: nums[3], ratio: nums[2] / nums[3] };
    }
  }

  const widthAttr = svgText.match(/\swidth\s*=\s*["']([^"']+)["']/i)?.[1];
  const heightAttr = svgText.match(/\sheight\s*=\s*["']([^"']+)["']/i)?.[1];
  const width = parseNumericLike(widthAttr);
  const height = parseNumericLike(heightAttr);
  if (width && height) {
    return { width, height, ratio: width / height };
  }
  return null;
}

function toRawFileUrl(flagValueUrl) {
  try {
    const u = new URL(flagValueUrl);
    const title = decodeURIComponent(u.pathname.split("/").pop() || "");
    if (!title) return null;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}`;
  } catch {
    return null;
  }
}

async function fetchJson(url, accept = "application/json") {
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept } });
  if (!r.ok) throw new Error(`Failed to fetch JSON: ${r.status} ${url}`);
  return r.json();
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "image/svg+xml,text/plain;q=0.9,*/*;q=0.1" } });
  if (!r.ok) throw new Error(`Failed to fetch SVG: ${r.status} ${url}`);
  return r.text();
}

async function fetchRestcountriesSvg(code) {
  const url = `${RESTCOUNTRIES_ALPHA}/${code.toUpperCase()}?fields=flags,cca2`;
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();
  const svg = String(j?.flags?.svg || "").trim();
  return svg.endsWith(".svg") ? svg : null;
}

async function main() {
  const iso = JSON.parse(await fs.readFile(ISO_PATH, "utf8"));
  const alpha2List = Array.from(
    new Set(
      iso
        .map((r) => String(r["alpha-2"] || "").trim().toLowerCase())
        .filter((v) => /^[a-z]{2}$/.test(v))
    )
  ).sort();

  const queryUrl = `${WIKIDATA_ENDPOINT}?format=json&query=${encodeURIComponent(SPARQL)}`;
  const sparqlResult = await fetchJson(queryUrl, "application/sparql-results+json");
  const byCode = new Map();
  for (const b of sparqlResult.results.bindings) {
    const code = String(b.code?.value || "").trim().toLowerCase();
    const flag = String(b.flag?.value || "").trim();
    if (/^[a-z]{2}$/.test(code) && flag) byCode.set(code, flag);
  }

  await fs.mkdir(FLAGS_DIR, { recursive: true });

  const out = {};
  let updated = 0;
  let skipped = 0;
  for (const code of alpha2List) {
    const flagValueUrl = byCode.get(code);
    const primaryUrl = flagValueUrl ? toRawFileUrl(flagValueUrl) : null;
    const fallbackUrl = await fetchRestcountriesSvg(code);
    const candidates = [primaryUrl, fallbackUrl].filter(Boolean);
    if (candidates.length === 0) {
      skipped++;
      continue;
    }

    try {
      let svg = null;
      let source = "";
      for (const url of candidates) {
        const text = await fetchText(url);
        if (!text.includes("<svg")) continue;
        const aspect = parseSvgAspect(text);
        if (!aspect) continue;
        svg = text;
        source = url;
        break;
      }
      if (!svg) {
        skipped++;
        continue;
      }
      const aspect = parseSvgAspect(svg);
      if (!aspect) {
        skipped++;
        continue;
      }

      const filePath = path.join(FLAGS_DIR, `${code}.svg`);
      await fs.writeFile(filePath, svg, "utf8");
      out[code.toUpperCase()] = {
        ratio: Number(aspect.ratio.toFixed(6)),
        width: Number(aspect.width.toFixed(6)),
        height: Number(aspect.height.toFixed(6)),
        source,
      };
      updated++;
    } catch {
      skipped++;
    }
  }

  const ordered = {};
  for (const code of Object.keys(out).sort()) ordered[code] = out[code];
  await fs.writeFile(META_PATH, JSON.stringify(ordered, null, 2), "utf8");

  console.log(`updated: ${updated}, skipped: ${skipped}, meta: ${META_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

