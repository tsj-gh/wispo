"use client";

import { useSearchParams } from "next/navigation";

type DevTjEditorialNoteProps = {
  text?: string;
  className?: string;
};

const DEFAULT_TEXT = "※ここは運営者による手書きのコメントがより相応しい";

/** `?devtj=true` のときだけ注釈を表示する。 */
export function DevTjEditorialNote({ text = DEFAULT_TEXT, className }: DevTjEditorialNoteProps) {
  const searchParams = useSearchParams();
  if (searchParams.get("devtj") !== "true") return null;

  return (
    <p
      className={
        className ??
        "mt-2 rounded-lg border border-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] px-3 py-2 text-xs font-semibold leading-relaxed text-[var(--color-text)]"
      }
    >
      {text}
    </p>
  );
}
