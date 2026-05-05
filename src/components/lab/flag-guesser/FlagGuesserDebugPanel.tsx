"use client";

import type { MapRenderBackend } from "@/lib/flag-guesser/drawRegionMapCanvas";
import type { TopoLodId } from "@/lib/flag-guesser/topoLod";

export type FlagGuesserDebugPanelProps = {
  isDebugMode: boolean;
  setIsDebugMode: (v: boolean) => void;
  isDebugPanelExpanded: boolean;
  setIsDebugPanelExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  onEnumerateVisible: () => void;
  listedCountryLabelsJa: string[];
  mapDebugSnippet: string | null;
  centerLonLatText: string | null;
  scaleText: string | null;
  /** LOD（devtj 時のみ UI 以外でも値は渡せる） */
  lodThresholdLow: number;
  setLodThresholdLow: (n: number) => void;
  lodThresholdHigh: number;
  setLodThresholdHigh: (n: number) => void;
  lodMetric: number;
  displayedLod: TopoLodId;
  desiredLod: TopoLodId;
  loadingHighDetail: boolean;
  mapRenderBackend: MapRenderBackend;
  setMapRenderBackend: (v: MapRenderBackend) => void;
  /** Canvas 再描画ベースのおおよその FPS（devtj デバッグ用） */
  canvasMapFps: number | null;
  /** 実際に Canvas に渡している地形 LOD */
  canvasPaintLod: TopoLodId;
  /** ズーム／パン操作中（終了後 200ms は false） */
  canvasMapInteracting: boolean;
};

/**
 * 盤面外（ラボシェルのサイドバー等）に配置する。`fixed` は使わない。
 */
export function FlagGuesserDebugPanel({
  isDebugMode,
  setIsDebugMode,
  isDebugPanelExpanded,
  setIsDebugPanelExpanded,
  onEnumerateVisible,
  listedCountryLabelsJa,
  mapDebugSnippet,
  centerLonLatText,
  scaleText,
  lodThresholdLow,
  setLodThresholdLow,
  lodThresholdHigh,
  setLodThresholdHigh,
  lodMetric,
  displayedLod,
  desiredLod,
  loadingHighDetail,
  mapRenderBackend,
  setMapRenderBackend,
  canvasMapFps,
  canvasPaintLod,
  canvasMapInteracting,
}: FlagGuesserDebugPanelProps) {
  return (
    <div className="w-full">
      {!isDebugMode && (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setIsDebugMode(true)}
            className="rounded border border-stone-300 bg-white/90 px-2 py-1 font-mono text-xs text-stone-800 shadow-sm"
            title="デバッグを開始"
          >
            DEBUG OFF
          </button>
        </div>
      )}
      {isDebugMode && (
        <div className="max-h-[min(70vh,520px)] w-full overflow-y-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_90%,var(--color-bg))] p-3 text-left text-xs text-[var(--color-text)] shadow-sm backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            {isDebugPanelExpanded && <span className="font-bold text-[var(--color-primary)]">フラッグゲッサー DEBUG</span>}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setIsDebugMode(false)}
                className="rounded border border-[color-mix(in_srgb,var(--color-text)_22%,transparent)] bg-[var(--color-primary)] px-2 py-1 text-[10px] font-semibold text-[var(--color-on-primary)]"
              >
                DEBUG ON
              </button>
              <button
                type="button"
                onClick={() => setIsDebugPanelExpanded((v) => !v)}
                className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] p-1 text-[var(--color-muted)]"
                aria-expanded={isDebugPanelExpanded}
              >
                {isDebugPanelExpanded ? "▲" : "▼"}
              </button>
            </div>
          </div>

          {isDebugPanelExpanded && (
            <div className="space-y-3 text-[10px] text-[var(--color-muted)]">
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-2">
                <div className="mb-2 font-semibold text-[var(--color-text)]">描画方式（検証）</div>
                <p className="mb-2 text-[9px] leading-snug">
                  SVG は DOM 負荷が大きい。Canvas は d3.geoPath(context)＋rAF 再描画。ホバーは投影済み path と Path2D の一致判定（島嶼で geoContains だけより安全）。
                </p>
                <div className="mb-2 font-mono text-[9px] text-[var(--color-text)]">
                  Canvas FPS:{" "}
                  <span className="tabular-nums font-semibold">{canvasMapFps !== null ? `${canvasMapFps}` : "—"}</span>
                  {mapRenderBackend === "canvas" && (
                    <>
                      {" "}
                      · 描画 LOD <span className="font-semibold">{canvasPaintLod}m</span>
                      {canvasMapInteracting ? (
                        <span className="text-[var(--color-primary)]">（操作中は簡略）</span>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setMapRenderBackend("svg")}
                    className={`flex-1 rounded border px-2 py-1.5 font-semibold ${
                      mapRenderBackend === "svg"
                        ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] text-[var(--color-text)]"
                        : "border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] text-[var(--color-text)]"
                    }`}
                  >
                    SVG
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapRenderBackend("canvas")}
                    className={`flex-1 rounded border px-2 py-1.5 font-semibold ${
                      mapRenderBackend === "canvas"
                        ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] text-[var(--color-text)]"
                        : "border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] text-[var(--color-text)]"
                    }`}
                  >
                    Canvas
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-2">
                <div className="mb-2 font-semibold text-[var(--color-text)]">地形 LOD（解像度）</div>
                <p className="mb-2 text-[9px] leading-snug">
                  指標 = projection.scale() × ズーム k。閾値で 110m / 50m / 10m を切替（初回のみ fetch、キャッシュ）。
                </p>
                <div className="mb-1 font-mono text-[9px] text-[var(--color-text)]">
                  指標: <span className="tabular-nums">{lodMetric.toFixed(1)}</span> → 希望{" "}
                  <span className="font-semibold">{desiredLod}m</span> / 表示 <span className="font-semibold">{displayedLod}m</span>
                </div>
                <label className="mb-2 block">
                  <div className="mb-0.5 font-semibold text-[var(--color-text)]">低〜中 閾値（未満は 110m）</div>
                  <input
                    type="range"
                    min={50}
                    max={2000}
                    step={10}
                    value={lodThresholdLow}
                    onChange={(e) => setLodThresholdLow(Number(e.target.value))}
                    className="w-full accent-[var(--color-primary)]"
                  />
                  <div className="tabular-nums">{lodThresholdLow}</div>
                </label>
                <label className="block">
                  <div className="mb-0.5 font-semibold text-[var(--color-text)]">中〜高 閾値（未満は 50m、以上は 10m）</div>
                  <input
                    type="range"
                    min={200}
                    max={8000}
                    step={50}
                    value={lodThresholdHigh}
                    onChange={(e) => setLodThresholdHigh(Number(e.target.value))}
                    className="w-full accent-[var(--color-primary)]"
                  />
                  <div className="tabular-nums">{lodThresholdHigh}</div>
                </label>
                {loadingHighDetail && (
                  <p className="mt-2 text-[9px] font-medium text-[var(--color-primary)]">高精細データ読み込み中…</p>
                )}
              </div>

              <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-2">
                <div className="mb-1 font-semibold text-[var(--color-text)]">マップ操作</div>
                <p className="text-[9px] leading-snug text-[var(--color-muted)]">
                  出題中も常にホイール・ピンチ・ドラッグでズーム／パンできます（d3-zoom）。
                </p>
              </div>

              <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-2">
                <button
                  type="button"
                  onClick={onEnumerateVisible}
                  className="w-full rounded border border-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] px-2 py-1.5 font-semibold text-[var(--color-text)]"
                >
                  現在見えている国を列挙
                </button>
                <p className="mt-1 text-[9px] leading-snug">ビューポートと各国バウンディングボックスの重なりで最大10件（日本語名）。</p>
              </div>

              {(centerLonLatText || scaleText || mapDebugSnippet) && (
                <div className="rounded border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] px-2 py-1 font-mono text-[9px] text-[var(--color-text)]">
                  {centerLonLatText && <div>Center: {centerLonLatText}</div>}
                  {scaleText && <div>Scale: {scaleText}</div>}
                  {mapDebugSnippet && (
                    <div className="mt-1 break-all text-[8px] text-[var(--color-muted)]" title="コピペ用">
                      {mapDebugSnippet}
                    </div>
                  )}
                </div>
              )}

              {listedCountryLabelsJa.length > 0 && (
                <div className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_14%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-2">
                  <div className="mb-1 font-semibold text-[var(--color-text)]">ビューポート内候補（最大10）</div>
                  <ul className="m-0 list-inside list-disc space-y-0.5 text-[var(--color-text)]">
                    {listedCountryLabelsJa.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
