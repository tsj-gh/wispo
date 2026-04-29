"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import { GamePageHeader } from "@/components/GamePageHeader";
import { GameQuickInfoNote } from "@/components/lab/GameQuickInfoNote";
import { SkyscraperAdSlot } from "@/components/SkyscraperAdSlots";
import { refreshAds } from "@/lib/ads";
import {
  GAME_AD_GAP_AFTER_SLOT_1_PX,
  GAME_AD_GAP_BEFORE_SLOT_2_PX,
  GAME_COLUMN_CLASS,
  GAME_TOP_AD_RESERVED_PX,
} from "@/lib/gameLayout";
import {
  generateUniquePuzzle,
  validateAgainstSolution,
  validateProgress,
} from "@/lib/puzzle-engine/skyscrapers";
import { useUserSyncContext } from "@/components/UserSyncProvider";
import { DevDebugUserStats } from "@/components/DevDebugUserStats";
import { recordPuzzleClear } from "@/lib/wispo-user-data";
import { clearModalBackdropOverlayStyle, useClearModalBackdropDebugValues } from "@/lib/debugClearModalBackdrop";
import { useI18n } from "@/lib/i18n-context";
import { translateSkyStatus } from "@/lib/i18n-runtime-status";

type Clues = {
  top: (number | null)[];
  bottom: (number | null)[];
  left: (number | null)[];
  right: (number | null)[];
};

type MaybeHistoryEntry = { r: number; c: number; prevVal: number };

function emptyGrid(n: number): number[][] {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

function cloneGrid(grid: number[][]): number[][] {
  return grid.map((row) => [...row]);
}

export default function SkyscraperGame() {
  const { t } = useI18n();
  const [n, setN] = useState(5);
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [clues, setClues] = useState<Clues | null>(null);
  const [grid, setGrid] = useState<number[][]>([]);
  const [solved, setSolved] = useState(false);
  const [showClearOverlay, setShowClearOverlay] = useState(false);
  const [status, setStatus] = useState("");
  const statusDisplay = useMemo(() => translateSkyStatus(status, t), [status, t]);
  const [maybeMode, setMaybeMode] = useState(false);
  const [maybeGridSnapshot, setMaybeGridSnapshot] = useState<number[][] | null>(null);
  const [sinceMaybeHistory, setSinceMaybeHistory] = useState<MaybeHistoryEntry[]>([]);
  const [firstDeterminedCell, setFirstDeterminedCell] = useState<{ r: number; c: number } | null>(null);
  const [isRewinding, setIsRewinding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [currentSeed, setCurrentSeed] = useState<string | null>(null);
  const [randomSequenceId, setRandomSequenceId] = useState<number | null>(null);
  const [coreGridHash, setCoreGridHash] = useState<string | null>(null);
  const [hashInput, setHashInput] = useState("");
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const clearModalBackdropDebug = useClearModalBackdropDebugValues();
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(true);
  const userSync = useUserSyncContext();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeSecondsRef = useRef(0);
  /** 静的書き出し対応: 解はクライアント内のみ保持（旧 httpOnly Cookie 相当） */
  const solutionRef = useRef<number[][] | null>(null);
  const selectedCellRef = useRef<{ r: number; c: number } | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const swipeHandledRef = useRef(false);

  const loadPuzzle = useCallback(
    async (size: number, diff: "easy" | "normal" | "hard", seed?: string) => {
      setLoading(true);
      setSolved(false);
      setShowClearOverlay(false);
      setN(size);
      setDifficulty(diff);
      setTimeSeconds(0);
      timeSecondsRef.current = 0;
      setTimerActive(false);
      setMaybeMode(false);
      setMaybeGridSnapshot(null);
      setSinceMaybeHistory([]);
      setFirstDeterminedCell(null);
      try {
        const result = generateUniquePuzzle(size, diff, 40, seed);
        solutionRef.current = result.solution;
        setClues(result.clues);
        setN(result.solution.length);
        setGrid(emptyGrid(result.solution.length));
        setStatus("");
        setCurrentSeed(result.seed ?? null);
        setRandomSequenceId(result.randomSequenceId ?? null);
        setCoreGridHash(result.coreGridHash ?? null);
      } catch (err) {
        solutionRef.current = null;
        setStatus(err instanceof Error ? err.message : "パズルの生成に失敗しました。");
        setLoading(false);
        return;
      }
      setLoading(false);
      setTimerActive(true);
      refreshAds();
    },
    []
  );

  useEffect(() => {
    loadPuzzle(n, difficulty);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const topAdRef = useRef<HTMLDivElement>(null);
  const didInitialAutoScrollRef = useRef(false);

  useEffect(() => {
    if (didInitialAutoScrollRef.current) return;
    if (loading || !clues) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (window.innerWidth < 1024) {
          window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        } else {
          const top = topAdRef.current?.getBoundingClientRect().top ?? 0;
          window.scrollTo({ top: window.scrollY + top, left: 0, behavior: "auto" });
        }
        didInitialAutoScrollRef.current = true;
      })
    );
  }, [loading, clues]);

  useEffect(() => {
    if (timerActive && !solved) {
      timerRef.current = setInterval(() => {
        setTimeSeconds((s) => {
          const next = s + 1;
          timeSecondsRef.current = next;
          return next;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActive, solved]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const checkWin = useCallback(async () => {
    if (solved || !clues) return;
    const filled = grid.every((row) => row.every((v) => v > 0));
    if (!filled) return;
    setTimerActive(false);
    const sol = solutionRef.current;
    const result =
      !sol || sol.length !== n
        ? { ok: false, msg: "パズルの有効期限が切れています。新規生成してください。" }
        : validateAgainstSolution(grid, sol);
    if (result.ok) {
      setSolved(true);
      setShowClearOverlay(true);
      try {
        recordPuzzleClear("skyscraper");
        if (userSync?.saveProgressAndSync) {
          userSync.saveProgressAndSync(() => {}).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    } else {
      setStatus(result.msg);
    }
  }, [grid, n, difficulty, clues, solved, userSync]);

  useEffect(() => {
    checkWin();
  }, [grid, checkWin]);

  // クリア画面ポップアップ時のみ紙吹雪を1回発火
  useEffect(() => {
    if (!showClearOverlay) return;
    const defaults = { origin: { y: 0.6 }, zIndex: 9999 };
    confetti({ ...defaults, particleCount: 150, spread: 100 });
    confetti({ ...defaults, particleCount: 75, angle: 60, spread: 55 });
    confetti({ ...defaults, particleCount: 75, angle: 120, spread: 55 });
    const t = setTimeout(() => {
      confetti({ ...defaults, particleCount: 50, scalar: 1.2, spread: 80 });
    }, 200);
    return () => clearTimeout(t);
  }, [showClearOverlay]);

  const cycleCell = useCallback(
    (r: number, c: number) => {
      if (solved || !clues) return;
      const cur = grid[r]?.[c] ?? 0;
      const next = cur >= n ? 0 : cur + 1;

      if (maybeMode) {
        setSinceMaybeHistory((h) => [...h, { r, c, prevVal: cur }]);
      }

      setGrid((g) => {
        const nextGrid = cloneGrid(g);
        nextGrid[r][c] = next;
        return nextGrid;
      });
    },
    [grid, n, clues, solved, maybeMode, sinceMaybeHistory, maybeGridSnapshot]
  );

  const setCellValue = useCallback(
    (r: number, c: number, val: number) => {
      if (solved || !clues) return;
      const cur = grid[r]?.[c] ?? 0;

      if (maybeMode) {
        setSinceMaybeHistory((h) => [...h, { r, c, prevVal: cur }]);
      }

      setGrid((g) => {
        const nextGrid = cloneGrid(g);
        nextGrid[r][c] = val;
        return nextGrid;
      });
    },
    [grid, clues, solved, maybeMode, sinceMaybeHistory, maybeGridSnapshot]
  );

  const incrementCell = useCallback(
    (r: number, c: number) => {
      const cur = grid[r]?.[c] ?? 0;
      if (cur < n) setCellValue(r, c, cur + 1);
    },
    [grid, n, setCellValue]
  );

  const decrementCell = useCallback(
    (r: number, c: number) => {
      const cur = grid[r]?.[c] ?? 0;
      if (cur > 0) setCellValue(r, c, cur - 1);
    },
    [grid, setCellValue]
  );

  const handleHint = () => {
    if (solved || !clues) return;
    const decoded = solutionRef.current;
    if (!decoded || decoded.length !== n) {
      setStatus("パズルの有効期限が切れています。");
      return;
    }
    const empties: [number, number][] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!grid[r]?.[c] || grid[r][c] === 0) empties.push([r, c]);
      }
    }
    if (empties.length === 0) {
      setStatus("すべて埋まっています。");
      return;
    }
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    const val = decoded[r][c];
    setCellValue(r, c, val);
    setStatus(`ヒント: (${r + 1}, ${c + 1}) = ${val}`);
    selectedCellRef.current = { r, c };
  };

  const handleCheck = () => {
    if (!clues) return;
    const result = validateProgress(grid, clues, n);
    setStatus(result.msg);
  };

  const handleClear = () => {
    if (!clues) return;
    setGrid(emptyGrid(n));
    setStatus("盤面をリセットしました。");
    setMaybeMode(false);
    setMaybeGridSnapshot(null);
    setSinceMaybeHistory([]);
    setFirstDeterminedCell(null);
  };

  const handleSolve = () => {
    const decoded = solutionRef.current;
    if (!decoded || decoded.length !== n) {
      setStatus("パズルの有効期限が切れています。");
      return;
    }
    setGrid(decoded.map((r) => [...r]));
    setSolved(true);
    setTimerActive(false);
    setShowClearOverlay(true);
    setStatus("解答を表示しました。");
  };

  const triggerDebugSolve = useCallback(async () => {
    if (solved || !clues) return;
    const decoded = solutionRef.current;
    if (!decoded || decoded.length !== n) {
      setStatus("パズルの有効期限が切れています。");
      return;
    }
    setGrid(decoded.map((r) => [...r]));
    setSolved(true);
    setTimerActive(false);
    setShowClearOverlay(true);
    setStatus("強制クリア（デバッグ）");
    try {
      recordPuzzleClear("skyscraper");
      if (userSync?.saveProgressAndSync) {
        userSync.saveProgressAndSync(() => {}).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [n, clues, solved, userSync]);

  const handleMaybeEnter = () => {
    const snapshot = cloneGrid(grid);
    setMaybeMode(true);
    setMaybeGridSnapshot(snapshot);
    setSinceMaybeHistory([]);
    // メイビー時点で最初に数字が入っていたマスを探す（行優先）
    let first: { r: number; c: number } | null = null;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (snapshot[r]?.[c]) {
          first = { r, c };
          break;
        }
      }
      if (first) break;
    }
    setFirstDeterminedCell(first);
    setStatus("メイビーモード：仮の入力が可能です。");
  };

  const handleMaybeConfirm = () => {
    setMaybeMode(false);
    setMaybeGridSnapshot(null);
    setSinceMaybeHistory([]);
    setFirstDeterminedCell(null);
    setStatus("メイビーモードを終了しました。");
  };

  const handleMaybeRewind = () => {
    if (!maybeGridSnapshot) return;
    setIsRewinding(true);
    setGrid(cloneGrid(maybeGridSnapshot));
    setMaybeMode(false);
    setMaybeGridSnapshot(null);
    setSinceMaybeHistory([]);
    setFirstDeterminedCell(null);
    setStatus("巻き戻ししました。");
    setTimeout(() => setIsRewinding(false), 200);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!clues || solved) return;
      const sel = selectedCellRef.current;
      if (!sel) return;
      const { r, c } = sel;
      if (e.key === "Backspace") {
        e.preventDefault();
        setCellValue(r, c, 0);
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= n) {
        e.preventDefault();
        setCellValue(r, c, num);
      }
    },
    [clues, solved, n, setCellValue]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (loading || !clues) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] text-[var(--color-text)]">
        <p className="text-[var(--color-muted)]">{t("games.skyscraper.loadPuzzle")}</p>
      </div>
    );
  }

  return (
    <div className="relative isolate w-full">
      {isDevTj && !isDebugMode && (
        <div className="fixed right-4 top-4 z-50">
          <button
            type="button"
            onClick={() => setIsDebugMode(true)}
            className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_55%,var(--color-bg))] px-2 py-1 font-mono text-xs text-[var(--color-text)]"
          >
            DEBUG OFF
          </button>
        </div>
      )}
      {isDevTj && isDebugMode && (
        <div className="fixed right-4 top-4 z-50 max-h-[90vh] overflow-y-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-bg))] p-3 text-left text-xs font-mono text-[var(--color-text)] shadow-lg backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between gap-2">
            {isDebugPanelExpanded && (
              <span className="font-bold text-[var(--color-primary)]">{t("games.skyscraper.debugPanel")}</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsDebugMode(false)}
                className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[var(--color-primary)] px-2 py-1 text-[var(--color-on-primary)]"
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
          <div className="space-y-2 text-[10px] text-[var(--color-muted)]/90">
            <DevDebugUserStats />
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => triggerDebugSolve()}
                disabled={solved || !clues}
                className="px-2 py-0.5 rounded text-[9px] border border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-bg))] text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("games.skyscraper.debugForceClear")}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="shrink-0">anon_id:</span>
              <code
                className="text-[9px] truncate max-w-[120px] bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] px-1 rounded text-[var(--color-muted)]"
                title={userSync?.anonId ?? ""}
              >
                {userSync?.anonId ?? "—"}
              </code>
              <button
                onClick={() => userSync?.syncNow()}
                className="px-1 py-0.5 rounded text-[9px] border border-[color-mix(in_srgb,var(--color-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-bg))] text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))]"
              >
                {t("games.skyscraper.sync")}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="shrink-0">Current Hash:</span>
              <code
                className="text-[9px] truncate max-w-[140px] bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] px-1 rounded text-[var(--color-muted)]"
                title={currentSeed ?? ""}
              >
                {currentSeed ?? "—"}
              </code>
              <button
                onClick={() => currentSeed && navigator.clipboard?.writeText(currentSeed)}
                disabled={!currentSeed}
                className="px-1 py-0.5 rounded text-[9px] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-text)_20%,transparent)] disabled:opacity-50"
              >
                {t("games.skyscraper.copy")}
              </button>
            </div>
            <div>
              <span className="shrink-0 text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))]">Random Sequence ID:</span>{" "}
              <span className="tabular-nums">{randomSequenceId ?? "—"}</span>
            </div>
            <div>
              <span className="shrink-0 text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))]">Core Grid Hash:</span>{" "}
              <code className="text-[9px] truncate max-w-[120px] block">{coreGridHash ?? "—"}</code>
            </div>
            <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
              <span className="shrink-0">Input Hash:</span>
              <input
                type="text"
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                placeholder={t("games.skyscraper.hashPlaceholder")}
                className="flex-1 min-w-0 px-1.5 py-0.5 rounded text-[10px] bg-[color-mix(in_srgb,var(--color-surface)_35%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[var(--color-text)]"
              />
              <button
                onClick={() => {
                  const s = hashInput.trim();
                  if (s) loadPuzzle(n, difficulty, s);
                }}
                disabled={!hashInput.trim() || loading}
                className="px-2 py-0.5 rounded text-[10px] border border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-bg))] text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] disabled:opacity-50"
              >
                {t("games.skyscraper.genFromHash")}
              </button>
            </div>
          </div>
          )}
        </div>
      )}
      <div className={`${GAME_COLUMN_CLASS} flex min-h-0 flex-1 flex-col lg:max-w-none`}>
        <GamePageHeader
          titleEn="Skyscraper"
          titleJa="スカイスクレイパー"
          breadcrumbs={[
            { label: "ホーム", href: "/" },
            { label: "教材一覧", href: "/#lab-cards" },
            { label: "Skyscraper", href: "/lab/skyscraper" },
          ]}
          trailing={
            <>
              <span className="tabular-nums">{formatTime(timeSeconds)}</span>
              {solved && <span className="text-[var(--color-primary)]">{t("games.skyscraper.clearBanner")}</span>}
            </>
          }
        />

        <div className="flex min-h-0 w-full flex-1 flex-col">
          <div
            ref={topAdRef}
            className="order-3 mt-3 w-full shrink-0 md:order-1 md:mt-0"
            style={{ marginBottom: GAME_AD_GAP_AFTER_SLOT_1_PX }}
          >
            <div className="mx-auto w-full max-w-[980px]">
              <SkyscraperAdSlot slotIndex={1} />
            </div>
          </div>

          <div className="order-1 flex min-h-0 w-full flex-1 flex-col gap-3 lg:order-2 lg:flex-row lg:items-start lg:gap-5">
            <div
              className="relative flex min-h-0 w-full flex-1 flex-col lg:min-w-0 lg:max-h-[calc(100dvh-var(--sky-top-ad-reserved)-80px)] lg:overflow-y-auto"
              style={{ "--sky-top-ad-reserved": `${GAME_TOP_AD_RESERVED_PX}px` } as CSSProperties}
            >
              <section className="relative z-[1] mb-4 w-full rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-4 pb-4 pt-0 backdrop-blur sm:px-5 sm:pb-5 sm:pt-0 lg:mb-0">
                <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
          <div className="flex flex-col gap-2 items-center">
            <div className="grid gap-1 justify-items-center" style={{ gridTemplateColumns: `repeat(${n + 2}, auto)` }}>
              <div />
              {clues.top.map((v, i) => (
                <div
                  key={`t-${i}`}
                  className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-[var(--color-muted)] font-semibold text-sm"
                >
                  {v ?? "—"}
                </div>
              ))}
              <div />
            </div>

            <div className={`flex gap-2 items-stretch transition-opacity duration-200 ${isRewinding ? "opacity-60" : "opacity-100"}`}>
              <div className="flex flex-col justify-between">
                {clues.left.map((v, i) => (
                  <div
                    key={`l-${i}`}
                    className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-[var(--color-muted)] font-semibold text-sm"
                  >
                    {v ?? "—"}
                  </div>
                ))}
              </div>
              <div
                className={`border-2 border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] rounded-xl overflow-hidden transition-opacity duration-200 ${isRewinding ? "opacity-50" : "opacity-100"}`}
                style={{ display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)` }}
              >
                {Array.from({ length: n * n }, (_, i) => {
                  const r = Math.floor(i / n);
                  const c = i % n;
                  const val = grid[r]?.[c] ?? 0;
                  const isMaybe = maybeMode;
                  const isPin = firstDeterminedCell?.r === r && firstDeterminedCell?.c === c;

                  return (
                    <div
                      key={`${r}-${c}`}
                      role="button"
                      tabIndex={0}
                      className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] cursor-pointer font-bold text-base sm:text-lg select-none touch-none
                        ${solved ? "cursor-default bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]/50" : "hover:bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]/50"}
                        ${val ? "text-[var(--color-text)]" : "text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))]"}
                        ${isMaybe ? "text-[var(--color-muted)]" : ""}
                        ${isPin ? "relative after:content-[''] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-0 after:h-0 after:border-l-[5px] after:border-r-[5px] after:border-l-transparent after:border-r-transparent after:border-t-[8px] after:border-t-[var(--color-primary)]" : ""}`}
                      style={
                        val
                          ? {
                              background: `linear-gradient(to top, color-mix(in srgb, var(--color-primary) 40%, transparent) ${(val / n) * 100}%, transparent ${(val / n) * 100}%)`,
                            }
                          : {}
                      }
                      onClick={() => {
                        if (solved) return;
                        if (swipeHandledRef.current) {
                          swipeHandledRef.current = false;
                          return;
                        }
                        selectedCellRef.current = { r, c };
                        cycleCell(r, c);
                      }}
                      onFocus={() => {
                        selectedCellRef.current = { r, c };
                      }}
                      onTouchStart={(e) => {
                        touchStartYRef.current = e.touches[0].clientY;
                      }}
                      onTouchEnd={(e) => {
                        const start = touchStartYRef.current;
                        if (start == null) return;
                        const end = e.changedTouches[0].clientY;
                        const delta = start - end;
                        if (delta > 15) {
                          incrementCell(r, c);
                          swipeHandledRef.current = true;
                        } else if (delta < -15) {
                          decrementCell(r, c);
                          swipeHandledRef.current = true;
                        }
                        touchStartYRef.current = null;
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        touchStartYRef.current = e.clientY;
                        swipeHandledRef.current = false;
                      }}
                      onMouseUp={(e) => {
                        if (e.button !== 0) return;
                        const start = touchStartYRef.current;
                        if (start == null) return;
                        const end = e.clientY;
                        const delta = start - end;
                        if (delta > 15) {
                          incrementCell(r, c);
                          swipeHandledRef.current = true;
                        } else if (delta < -15) {
                          decrementCell(r, c);
                          swipeHandledRef.current = true;
                        }
                        touchStartYRef.current = null;
                      }}
                    >
                      {val || ""}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col justify-between">
                {clues.right.map((v, i) => (
                  <div
                    key={`r-${i}`}
                    className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-[var(--color-muted)] font-semibold text-sm"
                  >
                    {v ?? "—"}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-1 justify-items-center" style={{ gridTemplateColumns: `repeat(${n + 2}, auto)` }}>
              <div />
              {clues.bottom.map((v, i) => (
                <div
                  key={`b-${i}`}
                  className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-[var(--color-muted)] font-semibold text-sm"
                >
                  {v ?? "—"}
                </div>
              ))}
              <div />
            </div>
          </div>

          <div className="flex flex-col gap-2 items-center maybe-panel">
            <span className="text-sm text-[var(--color-muted)] font-medium">{t("games.skyscraper.maybeLabel")}</span>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleMaybeEnter}
                disabled={solved || maybeMode}
                className="px-4 py-2 rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_75%,var(--color-primary))] text-[var(--color-on-primary)] text-sm font-medium hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("games.skyscraper.maybeEnter")}
              </button>
              <button
                onClick={handleMaybeConfirm}
                disabled={!maybeMode}
                className="px-4 py-2 rounded-lg bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] text-[var(--color-text)] text-sm hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("games.skyscraper.maybeConfirm")}
              </button>
              <button
                onClick={handleMaybeRewind}
                disabled={!maybeMode}
                className="px-4 py-2 rounded-lg bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] text-[var(--color-text)] text-sm hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("games.skyscraper.maybeRewind")}
              </button>
            </div>
          </div>
        </div>

                <div className="mt-3 min-h-[1.5em] text-center text-sm font-medium text-[var(--color-muted)]">{statusDisplay}</div>
              </section>
            </div>

            <aside className="order-2 w-full shrink-0 lg:sticky lg:top-5 lg:max-h-[calc(100dvh-20px)] lg:w-[360px] lg:self-start lg:overflow-y-auto">
              <section className="relative z-[1] mb-4 w-full rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-4 pb-4 pt-3 backdrop-blur sm:px-5 sm:pb-5 sm:pt-3 lg:mb-3">
                <div className="flex w-full min-w-0 flex-col gap-4">
          <div className="w-full min-w-0">
            <label className="mb-1 block text-xs text-[var(--color-muted)]">{t("games.skyscraper.sizeLabel")}</label>
            <div
              className="flex w-full min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] snap-x snap-mandatory [&::-webkit-scrollbar]:[display:none]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {([4, 5, 6] as const).map((size) => {
                const isActive = n === size;
                return (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => loadPuzzle(size, difficulty)}
                    disabled={loading}
                    className={`min-h-[44px] shrink-0 snap-center touch-manipulation whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                        : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_78%,var(--color-bg))] text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]"
                    } disabled:opacity-50`}
                  >
                    {size}×{size}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="w-full min-w-0">
            <label className="mb-1 block text-xs text-[var(--color-muted)]">{t("games.skyscraper.difficulty")}</label>
            <div
              className="flex w-full min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] snap-x snap-mandatory [&::-webkit-scrollbar]:[display:none]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {(
                [
                  { key: "easy" as const, labelKey: "games.skyscraper.diffEasy" as const },
                  { key: "normal" as const, labelKey: "games.skyscraper.diffNormal" as const },
                  { key: "hard" as const, labelKey: "games.skyscraper.diffHard" as const },
                ] as const
              ).map(({ key, labelKey }) => {
                const label = t(labelKey);
                const isActive = difficulty === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => loadPuzzle(n, key)}
                    disabled={loading}
                    className={`min-h-[44px] shrink-0 snap-center touch-manipulation whitespace-nowrap rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-on-primary)]"
                        : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_78%,var(--color-bg))] text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]"
                    } disabled:opacity-50`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={handleHint}
              disabled={solved}
              className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))] px-3 py-2 text-sm text-[var(--color-text)] hover:brightness-95 disabled:opacity-50"
            >
              {t("games.skyscraper.hint")}
            </button>
            <button
              onClick={handleCheck}
              className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))] px-3 py-2 text-sm text-[var(--color-text)] hover:brightness-95"
            >
              {t("games.skyscraper.check")}
            </button>
            <button
              onClick={handleClear}
              disabled={solved}
              className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))] px-3 py-2 text-sm text-[var(--color-text)] hover:brightness-95 disabled:opacity-50"
            >
              {t("games.skyscraper.reset")}
            </button>
            <button
              onClick={handleSolve}
              className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm text-[var(--color-on-primary)] hover:brightness-95"
            >
              {t("games.skyscraper.autoSolve")}
            </button>
          </div>
                  <div className="flex justify-center">
                    <button
                      onClick={() => loadPuzzle(n, difficulty)}
                      disabled={loading}
                      className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-on-primary)] hover:brightness-95 disabled:opacity-50"
                    >
                      {t("games.skyscraper.newPuzzle")}
                    </button>
                  </div>
                </div>
              </section>

              <div className="mt-1 flex w-full flex-col gap-2 lg:hidden">
                <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
                    {t("games.reflecShot.accordionControlsSummary")}
                  </summary>
                  <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                    <p className="m-0">タップで数字入力、推理しながら検証</p>
                  </div>
                </details>
                <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
                  <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
                    {t("games.skyscraper.rulesTitle")}
                  </summary>
                  <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                    <p className="mb-3 m-0">{t("games.skyscraper.rulesIntro")}</p>
                    <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-[var(--color-muted)]">
                      <li>{t("games.skyscraper.rulesLi1")}</li>
                      <li>{t("games.skyscraper.rulesLi2")}</li>
                      <li>{t("games.skyscraper.rulesLi3")}</li>
                      <li>{t("games.skyscraper.rulesLi4")}</li>
                    </ol>
                  </div>
                </details>
              </div>

              <div className="mt-1 hidden w-full flex-col gap-2 lg:flex">
                <section className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("games.reflecShot.accordionControlsSummary")}</h3>
                  <p className="mt-2 m-0 text-xs leading-relaxed text-[var(--color-muted)]">タップで数字入力、推理しながら検証</p>
                </section>
                <section className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("games.skyscraper.rulesTitle")}</h3>
                  <p className="mt-2 mb-3 text-xs leading-relaxed text-[var(--color-muted)]">{t("games.skyscraper.rulesIntro")}</p>
                  <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-[var(--color-muted)]">
                    <li>{t("games.skyscraper.rulesLi1")}</li>
                    <li>{t("games.skyscraper.rulesLi2")}</li>
                    <li>{t("games.skyscraper.rulesLi3")}</li>
                    <li>{t("games.skyscraper.rulesLi4")}</li>
                  </ol>
                </section>
              </div>

              <div className="relative z-0 w-full" style={{ minHeight: 100, marginTop: GAME_AD_GAP_BEFORE_SLOT_2_PX }}>
                <SkyscraperAdSlot slotIndex={2} />
              </div>
            </aside>
          </div>

          <section className="order-4 mx-auto mt-6 w-full max-w-3xl">
            <GameQuickInfoNote
              goal="空間把握・演繹推論・仮説検証の反復訓練"
              target="小学校中学年〜大人"
              operation="タップで数字入力、推理しながら検証"
            />
          </section>
        </div>
      </div>

      {showClearOverlay && (
        <div
          className={
            isDevTj
              ? "fixed inset-0 z-[9999] flex items-center justify-center"
              : "fixed inset-0 z-[9999] flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg)_25%,transparent)] [backdrop-filter:blur(1px)_brightness(1.3)]"
          }
          style={isDevTj ? clearModalBackdropOverlayStyle(clearModalBackdropDebug) : undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-title"
        >
          <div className="mx-4 max-w-sm rounded-2xl border-2 border-[var(--color-primary)] !bg-[var(--color-surface)] !opacity-100 p-8 text-center shadow-xl">
            <h2
              id="clear-title"
              className="mb-2 text-xl font-bold text-[var(--color-primary)]"
            >
              Perfect!
            </h2>
            <p className="mb-4 text-[var(--color-text)]">
              {t("games.skyscraper.clearSolved").replace("{time}", formatTime(timeSeconds))}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setShowClearOverlay(false)}
                className="px-6 py-3 rounded-lg border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_85%,var(--color-bg))] text-[var(--color-text)] font-medium hover:brightness-95 active:scale-95"
              >
                {t("games.skyscraper.back")}
              </button>
              <button
                onClick={() => {
                  setShowClearOverlay(false);
                  loadPuzzle(n, difficulty);
                }}
                className="px-6 py-3 rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] font-medium hover:brightness-95 active:scale-95"
              >
                {t("games.skyscraper.continueNext")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
