import type { LabOperatorMemoLabId } from "@/lib/labOperatorMemos";
import { getLabOperatorMemoBody } from "@/lib/labOperatorMemos";

type GameOperatorMemoSectionProps = {
  labId: LabOperatorMemoLabId;
};

/** 本番表示の運営メモ（1段落）。本文は `src/lib/labOperatorMemos.ts` で管理 */
export function GameOperatorMemoSection({ labId }: GameOperatorMemoSectionProps) {
  const body = getLabOperatorMemoBody(labId);
  return (
    <section
      className="mb-3 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] border-l-[3px] border-l-[color-mix(in_srgb,var(--color-primary)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)] px-3 py-2.5"
      aria-label="運営メモ"
    >
      <h2 className="m-0 text-sm font-bold text-[var(--color-text)]">運営メモ</h2>
      <p className="mt-1 m-0 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted)]">{body}</p>
    </section>
  );
}
