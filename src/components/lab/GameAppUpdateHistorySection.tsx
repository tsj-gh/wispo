type AppHistoryEntry = {
  date: string;
  message: string;
};

type GameAppUpdateHistorySectionProps = {
  gameTitle: string;
  entries: AppHistoryEntry[];
};

type RenderableHistoryEntry = {
  key: string;
  dateLabel: string;
  line1: string;
};

const HIDE_KEYWORDS = ["debug", "デバッグ", "adsense", "広告", "ad "];
const MAJOR_CHANGE_KEYWORDS = [
  "レイアウト",
  "盤面",
  "見た目",
  "質感",
  "画面表示",
  "UI",
  "モード",
  "アニメーション",
  "切替",
  "追加",
];

function shouldHideEntry(message: string): boolean {
  const lower = message.toLowerCase();
  return HIDE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function shouldIncludeAsMajorEntry(message: string): boolean {
  const normalized = message.trim();
  const [head, ...rest] = normalized.split(":");
  const scope = head.toLowerCase();
  const body = (rest.length > 0 ? rest.join(":") : normalized).trim();
  if (scope.includes("feat")) return true;
  if (scope.includes("refactor") || scope.includes("revert")) return true;
  return MAJOR_CHANGE_KEYWORDS.some((keyword) => body.includes(keyword));
}

function toJapaneseDateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function toPoliteLine(body: string): string {
  const trimmed = body.trim().replace(/[。.]$/, "");
  if (trimmed.endsWith("しました")) return `${trimmed}。`;
  if (trimmed.endsWith("した")) return `${trimmed}。`;
  if (trimmed.endsWith("する")) return `${trimmed.slice(0, -2)}しました。`;
  return `${trimmed}しました。`;
}

function formatEntryMessage(message: string): { line1: string } {
  const normalized = message.trim();
  const [, ...rest] = normalized.split(":");
  const rawBody = rest.length > 0 ? rest.join(":").trim() : normalized;
  const body = rawBody
    .replaceAll("Hidden Stack（かくれつみき）", "かくれつみき")
    .replaceAll("hidden-stack", "かくれつみき")
    .replaceAll("Hidden Stack", "かくれつみき")
    .replaceAll("UI", "画面表示");

  return {
    line1: toPoliteLine(body),
  };
}

function toRenderableEntries(entries: AppHistoryEntry[]): RenderableHistoryEntry[] {
  return entries
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => !shouldHideEntry(entry.message))
    .filter((entry) => shouldIncludeAsMajorEntry(entry.message))
    .reverse()
    .map((entry) => {
      const formatted = formatEntryMessage(entry.message);
      return {
        key: `${entry.date}-${entry.index}`,
        dateLabel: toJapaneseDateLabel(entry.date),
        line1: formatted.line1,
      };
    });
}

export function GameAppUpdateHistorySection({ gameTitle, entries }: GameAppUpdateHistorySectionProps) {
  const renderedEntries = toRenderableEntries(entries);
  if (renderedEntries.length === 0) return null;

  const latest = renderedEntries.slice(0, 3);
  const older = renderedEntries.slice(3);

  return (
    <section
      className="mx-auto mt-4 w-full max-w-[1080px] rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] px-4 py-4 sm:px-5"
      aria-label={`${gameTitle} の更新履歴`}
    >
      <h2 className="m-0 text-base font-bold text-[var(--color-text)]">このアプリの更新履歴</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
        細かな改善内容を、遊び方への影響が分かる形でまとめています。
      </p>
      <div className="mt-3 space-y-2">
        {latest.map((entry) => (
          <article
            key={entry.key}
            className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_9%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-bg))] px-3 py-2"
          >
            <p className="m-0 text-[11px] font-semibold tracking-wide text-[var(--color-muted)]">{entry.dateLabel}</p>
            <p className="mt-1 m-0 text-xs leading-relaxed text-[var(--color-text)]">{entry.line1}</p>
          </article>
        ))}
      </div>
      {older.length > 0 ? (
        <details className="mt-3 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_9%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-bg))] px-3 py-2">
          <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--color-text)]">
            過去の履歴を見る
          </summary>
          <div className="mt-2 space-y-2">
            {older.map((entry) => (
              <article key={entry.key} className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] px-3 py-2">
                <p className="m-0 text-[11px] font-semibold tracking-wide text-[var(--color-muted)]">{entry.dateLabel}</p>
                <p className="mt-1 m-0 text-xs leading-relaxed text-[var(--color-text)]">{entry.line1}</p>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
