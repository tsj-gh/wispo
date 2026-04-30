import { LAB_SUPPLEMENT_BAND_CLASS } from "@/lib/gameLayout";

type GamePrimaryContextSectionProps = {
  title: string;
  body: string;
};

/** 誤解の訂正・利用時間の目安など、教材固有の一次情報用 */
export function GamePrimaryContextSection({ title, body }: GamePrimaryContextSectionProps) {
  return (
    <section
      className={`${LAB_SUPPLEMENT_BAND_CLASS} mb-3 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] border-l-[3px] border-l-[color-mix(in_srgb,var(--color-text)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)] px-3 py-2.5`}
      aria-label={title}
    >
      <h2 className="m-0 text-sm font-bold text-[var(--color-text)]">{title}</h2>
      <p className="mt-1 m-0 text-xs leading-relaxed text-[var(--color-muted)]">{body}</p>
    </section>
  );
}
