"use client";

type Props = {
  isDebugMode: boolean;
  setIsDebugMode: (v: boolean) => void;
  isDebugPanelExpanded: boolean;
  setIsDebugPanelExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  mapManipEnabled: boolean;
  setMapManipEnabled: (v: boolean) => void;
  onEnumerateVisible: () => void;
  listedCountryLabelsJa: string[];
  mapDebugSnippet: string | null;
  centerLonLatText: string | null;
  scaleText: string | null;
};

export function FlagGuesserDebugPanel({
  isDebugMode,
  setIsDebugMode,
  isDebugPanelExpanded,
  setIsDebugPanelExpanded,
  mapManipEnabled,
  setMapManipEnabled,
  onEnumerateVisible,
  listedCountryLabelsJa,
  mapDebugSnippet,
  centerLonLatText,
  scaleText,
}: Props) {
  return (
    <>
      {!isDebugMode && (
        <div className="fixed right-4 top-4 z-50">
          <button
            type="button"
            onClick={() => setIsDebugMode(true)}
            className="rounded border border-[color-mix(in_srgb,var(--color-text)_22%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_84%,var(--color-bg))] px-2 py-1 font-mono text-xs text-[var(--color-text)] shadow-sm"
          >
            DEBUG OFF
          </button>
        </div>
      )}
      {isDebugMode && (
        <div className="fixed right-4 top-4 z-50 max-h-[90vh] w-[min(92vw,300px)] overflow-y-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_90%,var(--color-bg))] p-3 text-left text-xs text-[var(--color-text)] shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            {isDebugPanelExpanded && <span className="font-bold text-[var(--color-primary)]">フラッグゲッサー DEBUG</span>}
            <div className="ml-auto flex items-center gap-1">
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
                <div className="mb-2 font-semibold text-[var(--color-text)]">マップ操作モード</div>
                <p className="mb-2 text-[9px] leading-snug">ON のときホイール／ピンチでズーム、ドラッグでパン。国旗操作は一時的に無効です。</p>
                <button
                  type="button"
                  onClick={() => setMapManipEnabled(!mapManipEnabled)}
                  className="w-full rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] px-2 py-1.5 font-semibold text-[var(--color-text)]"
                >
                  {mapManipEnabled ? "マップ操作: ON" : "マップ操作: OFF"}
                </button>
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
    </>
  );
}
