import { LAB_SUPPLEMENT_BAND_CLASS } from "@/lib/gameLayout";

type GameIntroMiniSectionProps = {
  title: string;
  body: string;
};

export function GameIntroMiniSection({ title, body }: GameIntroMiniSectionProps) {
  return (
    <section
      className={`${LAB_SUPPLEMENT_BAND_CLASS} mb-3 rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] px-3 py-2.5`}
      aria-label={title}
    >
      <h2 className="m-0 text-sm font-bold text-[var(--color-text)]">{title}</h2>
      <p className="mt-1 m-0 text-xs leading-relaxed text-[var(--color-muted)]">{body}</p>
    </section>
  );
}
