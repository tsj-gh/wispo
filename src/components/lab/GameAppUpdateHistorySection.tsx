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
  line2: string;
};

const HIDE_KEYWORDS = ["debug", "デバッグ", "adsense", "広告", "ad "];

function shouldHideEntry(message: string): boolean {
  const lower = message.toLowerCase();
  return HIDE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function toJapaneseDateLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function formatEntryMessage(message: string): { line1: string; line2: string } {
  const normalized = message.trim();
  const [head, ...rest] = normalized.split(":");
  const rawBody = rest.length > 0 ? rest.join(":").trim() : normalized;
  const body = rawBody
    .replaceAll("Hidden Stack（かくれつみき）", "かくれつみき")
    .replaceAll("hidden-stack", "かくれつみき")
    .replaceAll("Hidden Stack", "かくれつみき")
    .replaceAll("UI", "画面表示");

  const scope = head.toLowerCase();
  const reason = scope.includes("feat")
    ? "遊びながら学びやすくなるように"
    : scope.includes("fix")
      ? "安心して使える状態を保つために"
      : scope.includes("refactor")
        ? "動作を分かりやすく保つために"
        : scope.includes("revert")
          ? "安定した体験に戻すために"
          : scope.includes("seo")
            ? "見つけやすさと案内の分かりやすさを高めるために"
            : "使い心地を整えるために";

  return {
    line1: `${reason}、${body}を実施しました。`,
    line2: "お子さまが迷わず取り組めるように、操作の流れと見え方もあわせて調整しています。",
  };
}

function toRenderableEntries(entries: AppHistoryEntry[]): RenderableHistoryEntry[] {
  return entries
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => !shouldHideEntry(entry.message))
    .reverse()
    .map((entry) => {
      const formatted = formatEntryMessage(entry.message);
      return {
        key: `${entry.date}-${entry.index}`,
        dateLabel: toJapaneseDateLabel(entry.date),
        line1: formatted.line1,
        line2: formatted.line2,
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
            <p className="mt-1 m-0 text-xs leading-relaxed text-[var(--color-muted)]">{entry.line2}</p>
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
                <p className="mt-1 m-0 text-xs leading-relaxed text-[var(--color-muted)]">{entry.line2}</p>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
