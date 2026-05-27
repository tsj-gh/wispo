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
 * プリセット (lon,lat) を画面中央に置いたとき、in-pool の bounding box が
 * 画面の幅・高さに収まる最大の k を求める。
 *
 * モバイル等で画面幅が狭いとき、プリセット k のまま適用すると in-pool の
 * 左右の国が画面外に切れる。この k 上限と元のプリセット k の min を取ることで
 * 必ず in-pool が表示領域に収まるようにする。
 *
 * @param presetK     プリセット定義の k（上限）
 * @param projection  ラウンドの投影（既に width/height にフィット済み）
 * @param width       描画ステージ幅 px
 * @param height      描画ステージ高 px
 * @param centerLon   プリセット中心 lon
 * @param centerLat   プリセット中心 lat
 * @param inPoolBounds  投影後の in-pool の bounding box（map 座標）
 * @param paddingPx   画面端からのマージン px（デフォルト 16）
 * @returns adjusted k
 */
export function presetKToFitInPool(
  presetK: number,
  projection: GeoProjection,
  width: number,
  height: number,
  centerLon: number,
  centerLat: number,
  inPoolBounds: [[number, number], [number, number]],
  paddingPx = 16
): number {
  const center = projection([centerLon, centerLat]);
  if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
    return clampPresetK(presetK);
  }
  const [mx, my] = center;
  const [[x0, y0], [x1, y1]] = inPoolBounds;
  if (![x0, y0, x1, y1].every((v) => Number.isFinite(v))) return clampPresetK(presetK);

  /* preset 中央から in-pool の左右・上下端までの距離（map 座標, 中央オフセット込み） */
  const reqHalfW = Math.max(Math.abs(mx - x0), Math.abs(x1 - mx));
  const reqHalfH = Math.max(Math.abs(my - y0), Math.abs(y1 - my));

  /* 数値異常時はそのまま preset を採用 */
  if (!Number.isFinite(reqHalfW) || !Number.isFinite(reqHalfH) || reqHalfW <= 0 || reqHalfH <= 0) {
    return clampPresetK(presetK);
  }

  const availHalfW = Math.max(1, width / 2 - paddingPx);
  const availHalfH = Math.max(1, height / 2 - paddingPx);
  const kMaxByW = availHalfW / reqHalfW;
  const kMaxByH = availHalfH / reqHalfH;
  const kMax = Math.min(kMaxByW, kMaxByH);
  if (!Number.isFinite(kMax) || kMax <= 0) return clampPresetK(presetK);

  /* preset k より kMax の方が小さければ「画面が狭いので縮める」フェーズ */
  return clampPresetK(Math.min(presetK, kMax));
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
