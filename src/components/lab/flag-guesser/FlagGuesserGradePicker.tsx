"use client";

import {
  CURRICULUM_LEVELS,
  getCurriculumStage,
  type FlagGuesserCurriculumLevel,
} from "@/lib/flag-guesser/flagGuesserCurriculum";
import { useI18n } from "@/lib/i18n-context";

export type FlagGuesserCurriculumMeta = {
  poolLength: number;
  stageNameJa: string;
  decoyCount: number;
};

type FlagGuesserGradePickerProps = {
  level: FlagGuesserCurriculumLevel;
  onLevelChange: (level: FlagGuesserCurriculumLevel) => void;
  meta: FlagGuesserCurriculumMeta;
  disabled?: boolean;
};

export function FlagGuesserGradePicker({
  level,
  onLevelChange,
  meta,
  disabled = false,
}: FlagGuesserGradePickerProps) {
  const { t } = useI18n();
  const stage = getCurriculumStage(level);

  return (
    <div className="w-full min-w-0">
      <label className="mb-1 block text-xs text-[var(--color-muted)]">{t("common.chooseGrade")}</label>
      <div
        className="grid grid-cols-7 gap-1 sm:grid-cols-10"
        role="group"
        aria-label="グレード"
      >
        {CURRICULUM_LEVELS.map((lv) => {
          const isActive = level === lv;
          return (
            <button
              key={lv}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => onLevelChange(lv)}
              className={`flex h-9 w-full min-w-0 items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums transition touch-manipulation disabled:pointer-events-none disabled:opacity-50 ${
                isActive
                  ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                  : "text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)]"
              }`}
            >
              {lv}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-[var(--color-muted)]">
        {meta.poolLength > 0 ? meta.stageNameJa : stage.nameJa}
        {meta.poolLength > 0 ? (
          <>
            <span className="tabular-nums"> · {meta.poolLength}国</span>
            {meta.decoyCount > 0 ? (
              <span className="tabular-nums"> · 計{meta.decoyCount + 1}枚</span>
            ) : null}
          </>
        ) : (
          <span className="text-[color-mix(in_srgb,var(--color-muted)_80%,transparent)]"> · 読み込み中…</span>
        )}
      </p>
    </div>
  );
}
