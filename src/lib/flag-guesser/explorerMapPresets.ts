import type { GeoProjection } from "d3-geo";
import type { ZoomPlain } from "@/lib/flag-guesser/viewportGeo";

/** `public/assets/flag-guesser/explorer_map_presets.json` の各エントリ */
export type ExplorerMapPresetView = {
  lon: number;
  lat: number;
  /** d3-zoom の倍率 k（盤面オーバーレイの Scale と同じ） */
  k: number;
};

export type ExplorerMapPresetsFile = {
  /** 任意。説明用 */
  comment?: string;
  presets: Record<string, ExplorerMapPresetView>;
};

/** d3-zoom と同じ範囲（FlagExplorerMapSelect と一致） */
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 80;

function clampPresetK(k: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k));
}

/**
 * 地域フィルタの組み合わせをプリセット JSON のキーに変換。
 * 未選択は `*`（例: 世界全体は `*|*|*`）。
 */
export function explorerMapPresetKey(
  region: string,
  subRegion: string,
  intermediateRegion: string
): string {
  const r = region.trim() || "*";
  const s = subRegion.trim() || "*";
  const i = intermediateRegion.trim() || "*";
  return `${r}|${s}|${i}`;
}

function isValidPreset(p: unknown): p is ExplorerMapPresetView {
  if (!p || typeof p !== "object") return false;
  const o = p as ExplorerMapPresetView;
  return (
    typeof o.lon === "number" &&
    Number.isFinite(o.lon) &&
    typeof o.lat === "number" &&
    Number.isFinite(o.lat) &&
    typeof o.k === "number" &&
    Number.isFinite(o.k)
  );
}

/**
 * 最も具体的なキーから順に探索（中間 → サブ → 地域 → 世界）。
 */
export function resolveExplorerMapPreset(
  presets: Record<string, ExplorerMapPresetView> | undefined,
  region: string,
  subRegion: string,
  intermediateRegion: string
): ExplorerMapPresetView | null {
  if (!presets || typeof presets !== "object") return null;

  const r = region.trim();
  const s = subRegion.trim();
  const i = intermediateRegion.trim();

  const candidates: string[] = [];
  if (r && s && i) {
    candidates.push(`${r}|${s}|${i}`, `${r}|${s}|*`, `${r}|*|*`, `*|*|*`);
  } else if (r && s) {
    candidates.push(`${r}|${s}|*`, `${r}|*|*`, `*|*|*`);
  } else if (r) {
    candidates.push(`${r}|*|*`, `*|*|*`);
  } else {
    candidates.push(`*|*|*`);
  }

  for (const key of candidates) {
    const p = presets[key];
    if (isValidPreset(p)) return p;
  }
  return null;
}

/**
 * 画面中央に (lon,lat) が来るように d3-zoom の Plain を求める。
 * mapSpaceToScreen(mx,my,z) = (w/2, h/2) となる z。
 */
export function zoomPlainFromCenterLonLatK(
  projection: GeoProjection,
  width: number,
  height: number,
  lon: number,
  lat: number,
  k: number
): ZoomPlain | null {
  const p = projection([lon, lat]);
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  const [mx, my] = p;
  const cx = width / 2;
  const cy = height / 2;
  const kk = clampPresetK(k);
  return {
    x: cx - kk * mx,
    y: cy - kk * my,
    k: kk,
  };
}

/**
 * JSON の `presets` に貼り付けやすい 1 エントリ（キーは現在の地域フィルタ相当）。
 */
export function formatExplorerMapPresetClipboardEntry(
  region: string,
  subRegion: string,
  intermediateRegion: string,
  lon: number,
  lat: number,
  k: number
): string {
  const key = explorerMapPresetKey(region, subRegion, intermediateRegion);
  return [
    `// Merge into "presets" in public/assets/flag-guesser/explorer_map_presets.json`,
    `  ${JSON.stringify(key)}: {`,
    `    "lon": ${JSON.stringify(lon)},`,
    `    "lat": ${JSON.stringify(lat)},`,
    `    "k": ${JSON.stringify(k)}`,
    `  },`,
  ].join("\n");
}
