"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { DevLink } from "@/components/DevLink";
import confetti from "canvas-confetti";
import { validatePaths, solvePathsForPairs } from "@/lib/puzzle-engine/pair-link";
import { usePuzzleStock } from "@/hooks/usePuzzleStock";
import {
  useBoardWorker,
  type EnclosureDebugItem,
  type GenerateResult,
  type PostMutationScoreBreakdown,
} from "@/hooks/useBoardWorker";
import { computeABCScore, computeStats, type ABCScore } from "@/lib/pair-link-abc-score";
import { refreshAds, getAdsRefreshState, AD_REFRESH_EVENT, AD_REFRESH_STATE_CHANGED } from "@/lib/ads";
import { PairLinkAdSlot } from "@/components/PairLinkAdSlots";
import { GamePageHeader } from "@/components/GamePageHeader";
import { GameQuickInfoNote } from "@/components/lab/GameQuickInfoNote";
import {
  GAME_AD_GAP_AFTER_SLOT_1_PX,
  GAME_AD_GAP_BEFORE_SLOT_2_PX,
  GAME_COLUMN_CLASS,
  GAME_TOP_AD_RESERVED_PX,
} from "@/lib/gameLayout";
import { useUserSyncContext } from "@/components/UserSyncProvider";
import { DevDebugUserStats } from "@/components/DevDebugUserStats";
import { recordPuzzleClear } from "@/lib/wispo-user-data";
import { clearModalBackdropOverlayStyle, useClearModalBackdropDebugValues } from "@/lib/debugClearModalBackdrop";
import { useI18n } from "@/lib/i18n-context";
import { pairLinkLoadingLine, translatePairLinkStatus } from "@/lib/i18n-runtime-status";
import type { Pair } from "@/lib/puzzle-engine/pair-link";
import {
  EDGE_SWAP_SCORE_DEFAULTS,
  mergeEdgeSwapScoreParams,
  type EdgeSwapScoreParams,
} from "@/lib/pair-link-edge-swap-score";
import {
  PAIR_LINK_GRADE_CONSTANTS,
  GRADE_MAP,
  STOCK_PER_GRADE_MAX,
} from "@/lib/pair-link-grade-constants";
import {
  usePuzzleStockByGrade,
  type GenerateResultWithSource,
  DEFAULT_WORKER_PHASE_MAX_MS_BEFORE_INSURANCE,
} from "@/hooks/usePuzzleStockByGrade";

type NumberCell = { x: number; y: number; val: number; color: string };
type PathPoint = { x: number; y: number };

const PADDING = 50;
const HIT_RADIUS_FACTOR = 0.55; // 数字・端点の当たり判定半径（spacing に対する倍率）

/** 端点タップ時のスケールピーク初期値（デバッグパネルで上書き可） */
export const DEFAULT_TAP_SCALE_FACTOR = 1.25;

/** 盤面の数字円半径（canvas draw と一致） */
const NUMBER_DOT_RADIUS_FACTOR = 0.35;

const ENDPOINT_TAP_SPRING = { type: "spring" as const, stiffness: 400, damping: 10 };

/** タップ波紋: 1回ふわっと広がる時間（秒）。大きいほどゆっくり（ソナー／空気リング風） */
const TAP_RIPPLE_DURATION_SEC = 1.12;
/** 波紋＋数字スプリングが終わるまでオーバーレイを維持（ms） */
const TAP_OVERLAY_CLEAR_MS = Math.round(TAP_RIPPLE_DURATION_SEC * 1000) + 480;

/**
 * 波紋の最大スケール（数字円に対する倍率）。
 * セルが小さい／キャンバスが狭いほど指で隠れてもリングが見えるよう大きく広がる。
 */
function computeTapRippleMaxScale(gridSize: number, canvasSize: number): number {
  const g = Math.max(4, Math.min(16, gridSize));
  const w = Math.max(260, canvasSize);
  const spacingPx = g > 1 ? (w - PADDING * 2) / (g - 1) : w * 0.2;
  const dotRadiusPx = spacingPx * NUMBER_DOT_RADIUS_FACTOR;
  const fingerCoverPx = 36;
  const mobileStretch = Math.min(1.5, Math.pow(480 / w, 0.38));
  const extraPx = fingerCoverPx * mobileStretch;
  const raw = 1 + extraPx / Math.max(3.2, dotRadiusPx);
  return Math.min(2.85, Math.max(1.3, raw));
}
/** 波紋のイージング（終端で減速して消える） */
const TAP_RIPPLE_EASE: [number, number, number, number] = [0.2, 0.85, 0.35, 1];

/** Edge-Swap: 4×4〜6×6 は Default と同様、7×7 は 7〜10、8×8〜10×10 は 8〜10（board-worker と一致） */
export const EDGE_SWAP_PAIR_BOUNDS: Record<number, { min: number; max: number }> = {
  4: { min: 2, max: 4 },
  5: { min: 3, max: 5 },
  6: { min: 4, max: 6 },
  7: { min: 7, max: 10 },
  8: { min: 8, max: 10 },
  9: { min: 8, max: 10 },
  10: { min: 8, max: 10 },
};

const EDGE_SWAP_SCORE_FIELDS: {
  key: keyof EdgeSwapScoreParams;
  label: string;
  step: string;
  min: number;
  max: number;
}[] = [
  { key: "coverageMult", label: "Coverage 係数", step: "0.05", min: 0, max: 10 },
  { key: "wEndpoint", label: "Interference 端点重み", step: "0.5", min: 0, max: 20 },
  { key: "wParallel", label: "Interference 並走重み", step: "0.5", min: 0, max: 20 },
  { key: "enclosureMult", label: "囲い込み倍率", step: "0.05", min: 0, max: 10 },
  { key: "semiDist3Weight", label: "準隣接(距離3)重み", step: "0.05", min: 0, max: 5 },
  { key: "adjRateT1", label: "隣接率しきい値1", step: "0.01", min: 0.01, max: 0.99 },
  { key: "adjRateT2", label: "隣接率しきい値2", step: "0.01", min: 0.01, max: 0.99 },
  { key: "straightRatioThreshold", label: "直線ペア割合しきい値", step: "0.05", min: 0.01, max: 0.99 },
  { key: "straightPenaltyBase", label: "直線ペナルティ基本", step: "10", min: 0, max: 500 },
  { key: "straightPenaltySlope", label: "直線ペナルティ傾き", step: "100", min: 0, max: 5000 },
  { key: "dominanceRatioThreshold", label: "上位2ペア支配しきい値", step: "0.05", min: 0.01, max: 0.99 },
  { key: "dominancePenaltyBase", label: "支配ペナルティ基本", step: "10", min: 0, max: 500 },
  { key: "dominancePenaltySlope", label: "支配ペナルティ傾き", step: "100", min: 0, max: 5000 },
  { key: "size6AdjPenaltyScale", label: "6x6隣接ペナルティ倍率", step: "0.05", min: 0, max: 1 },
  { key: "size6AdjRateT3", label: "6x6隣接率第3しきい値", step: "0.05", min: 0.01, max: 0.99 },
  { key: "size6DominanceThreshold", label: "6x6支配しきい値", step: "0.05", min: 0.01, max: 0.99 },
  { key: "size6DominancePenaltyScale", label: "6x6支配ペナルティ倍率", step: "0.05", min: 0, max: 1 },
  { key: "enclosureBonusPerCount", label: "囲い込みボーナス/件", step: "10", min: 0, max: 200 },
];

function pairCountOptions(gridSize: number, generationMode: "default" | "edgeSwap"): number[] {
  const b = EDGE_SWAP_PAIR_BOUNDS[gridSize];
  if (generationMode === "edgeSwap" && b) {
    return Array.from({ length: b.max - b.min + 1 }, (_, i) => b.min + i);
  }
  const lo = Math.max(2, gridSize - 2);
  const hi = gridSize >= 7 ? 10 : gridSize;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

function clampPairCount(
  gridSize: number,
  numPairs: number,
  generationMode: "default" | "edgeSwap"
): number {
  const opts = pairCountOptions(gridSize, generationMode);
  if (opts.length === 0) return numPairs;
  return Math.max(opts[0], Math.min(opts[opts.length - 1], numPairs));
}

type HitTarget =
  | { type: "endpoint"; val: string; pathIdx: number; point: PathPoint; isFirst: boolean }
  | { type: "number"; x: number; y: number; val: number };

/** 盤面に印刷された数字マスか。線の先端など「数字のないマス」上の端点は false */
function isPrintedNumberCell(
  numbers: NumberCell[],
  valStr: string,
  gx: number,
  gy: number
): boolean {
  return numbers.some((n) => String(n.val) === valStr && n.x === gx && n.y === gy);
}

function emptyPaths(pairs: Pair[]): Record<string, PathPoint[][]> {
  const out: Record<string, PathPoint[][]> = {};
  pairs.forEach((p) => {
    const [r1, c1] = p.start;
    const [r2, c2] = p.end;
    out[String(p.id)] = [[{ x: c1, y: r1 }], [{ x: c2, y: r2 }]];
  });
  return out;
}

/** board-worker の logFinalScoreDetail と同形式（Final Board — …） */
function logFinalBoardScoreToConsole(bd: PostMutationScoreBreakdown | null | undefined): void {
  if (bd == null) {
    console.warn(
      "[盤面スコア] postMutationScoreBreakdown がありません（Edge-Swap で生成された直近の盤のスコアのみ保持されます）"
    );
    return;
  }
  const row = bd as PostMutationScoreBreakdown & {
    coverageScore?: number;
    interferenceScore?: number;
    adjRate?: number;
    adjCount?: number;
    semiAdjCount?: number;
  };
  const adjPct = ((row.adjRate ?? 0) * 100).toFixed(1);
  console.log(
    "Final Board — [Final Score Detail] Total: " +
      row.finalScore +
      ", Coverage: " +
      (row.coverageScore ?? "—") +
      ", Interference: " +
      (row.interferenceScore ?? "—") +
      ", Enclosures: " +
      (row.enclosureCount ?? 0) +
      ", AdjRate: " +
      adjPct +
      "%, Dist2: " +
      (row.adjCount ?? "—") +
      ", Dist3: " +
      (row.semiAdjCount ?? "—")
  );
  console.log("[盤面スコア] postMutationScoreBreakdown (raw):", bd);
}

type PairLinkBoardPaintParams = {
  numbers: NumberCell[];
  paths: Record<string, PathPoint[][]>;
  gridSize: number;
  spacing: number;
  isDrawing: boolean;
  activeVal: string | null;
  activePathIdx: number | null;
  isDebugMode: boolean;
  debugEnclosures: EnclosureDebugItem[] | null;
};

/** canvas への実描画（ref コールバック / useLayoutEffect / rAF リトライから共通利用） */
function drawPairLinkBoard(canvas: HTMLCanvasElement, p: PairLinkBoardPaintParams): void {
  const {
    numbers,
    paths,
    gridSize,
    spacing,
    isDrawing,
    activeVal,
    activePathIdx,
    isDebugMode,
    debugEnclosures,
  } = p;

  if (!numbers.length || spacing <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      ctx.beginPath();
      ctx.arc(PADDING + i * spacing, PADDING + j * spacing, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  Object.entries(paths).forEach(([v, pathList]) => {
    const color = numbers.find((n) => String(n.val) === v)?.color ?? "#10b981";
    pathList.forEach((path, idx) => {
      const isActive = isDrawing && activeVal === v && activePathIdx === idx;
      ctx.strokeStyle = color;
      ctx.lineWidth =
        gridSize >= 9
          ? Math.max(2, spacing * (isActive ? 0.55 : 0.45))
          : spacing * (isActive ? 0.55 : 0.45);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = isActive ? 0.7 : 1;
      ctx.beginPath();
      path.forEach((pt, i) => {
        const px = PADDING + pt.x * spacing;
        const py = PADDING + pt.y * spacing;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2;
      const drawEndpointCircle = (pt: PathPoint) => {
        ctx.beginPath();
        ctx.arc(PADDING + pt.x * spacing, PADDING + pt.y * spacing, spacing * 0.4, 0, Math.PI * 2);
        ctx.fill();
      };
      drawEndpointCircle(path[path.length - 1]);
      if (path.length > 1) drawEndpointCircle(path[0]);
    });
  });

  ctx.globalAlpha = 1;
  const r = spacing * NUMBER_DOT_RADIUS_FACTOR;
  ctx.font = `bold ${r}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  numbers.forEach((n) => {
    const x = PADDING + n.x * spacing;
    const y = PADDING + n.y * spacing;
    ctx.fillStyle = n.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.fillText(String(n.val), x, y);
  });

  if (isDebugMode && debugEnclosures && debugEnclosures.length > 0) {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = Math.max(1.5, spacing * 0.08);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const pseudoStroke = "rgba(192, 132, 252, 0.92)";
    const pseudoMarkFs = Math.max(7, spacing * 0.22);
    for (const e of debugEnclosures) {
      const isPseudo = e.pseudo === true;
      if (e.kind === "vertical") {
        const px = PADDING + e.col * spacing;
        const py1 = PADDING + e.y1 * spacing;
        const py2 = PADDING + e.y2 * spacing;
        ctx.strokeStyle = isPseudo ? pseudoStroke : "rgba(251, 191, 36, 0.9)";
        ctx.beginPath();
        ctx.moveTo(px, py1);
        ctx.lineTo(px, py2);
        ctx.stroke();
        if (isPseudo) {
          ctx.font = `bold ${pseudoMarkFs}px Arial`;
          ctx.fillStyle = pseudoStroke;
          ctx.fillText("▼", px, py1 - spacing * 0.14);
          ctx.fillText("▲", px, py2 + spacing * 0.14);
        }
      } else {
        const py = PADDING + e.row * spacing;
        const px1 = PADDING + e.x1 * spacing;
        const px2 = PADDING + e.x2 * spacing;
        ctx.strokeStyle = isPseudo ? pseudoStroke : "rgba(56, 189, 248, 0.9)";
        ctx.beginPath();
        ctx.moveTo(px1, py);
        ctx.lineTo(px2, py);
        ctx.stroke();
        if (isPseudo) {
          ctx.font = `bold ${pseudoMarkFs}px Arial`;
          ctx.fillStyle = pseudoStroke;
          ctx.fillText("◀", px1 - spacing * 0.14, py);
          ctx.fillText("▶", px2 + spacing * 0.14, py);
        }
      }
      if (!isPseudo) {
        const mx = PADDING + e.nCol * spacing;
        const my = PADDING + e.nRow * spacing;
        ctx.font = `bold ${Math.max(10, spacing * 0.38)}px Arial`;
        ctx.fillStyle = "rgba(248, 113, 113, 0.95)";
        ctx.fillText(e.kind === "vertical" ? "▼" : "×", mx, my);
      }
    }
    ctx.restore();
  }
}

type EndpointTapFxPayload = {
  id: number;
  valStr: string;
  gx: number;
  gy: number;
  partner: PathPoint | null;
};

function gridCellCenterPercent(gx: number, gy: number, spacing: number, canvasSize: number) {
  const px = PADDING + gx * spacing;
  const py = PADDING + gy * spacing;
  return { leftPct: (px / canvasSize) * 100, topPct: (py / canvasSize) * 100 };
}

/** 親の再レンダーで型が変わらないようモジュール直下に置く（内側で定義すると毎回アンマウント→波紋が再発火） */
function TapRippleRing({
  gx,
  gy,
  zClass,
  spacing,
  canvasSize,
  diamPct,
  rippleMaxScale,
}: {
  gx: number;
  gy: number;
  zClass: string;
  spacing: number;
  canvasSize: number;
  diamPct: number;
  rippleMaxScale: number;
}) {
  const { leftPct, topPct } = gridCellCenterPercent(gx, gy, spacing, canvasSize);
  return (
    <div
      className={`absolute flex items-center justify-center pointer-events-none ${zClass}`}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${diamPct}%`,
        aspectRatio: "1",
        transform: "translate(-50%, -50%)",
      }}
    >
      <motion.div
        layout={false}
        className="absolute inset-0 rounded-full border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] shadow-[0_0_14px_rgba(255,255,255,0.06)]"
        initial={{ scale: 1, opacity: 0.22 }}
        animate={{ scale: rippleMaxScale, opacity: 0 }}
        transition={{ duration: TAP_RIPPLE_DURATION_SEC, ease: TAP_RIPPLE_EASE }}
      />
    </div>
  );
}

function PairLinkEndpointTapOverlay({
  tapFx,
  canvasSize,
  spacing,
  color,
  tapScaleFactor,
  rippleMaxScale,
}: {
  tapFx: EndpointTapFxPayload;
  canvasSize: number;
  spacing: number;
  color: string;
  tapScaleFactor: number;
  rippleMaxScale: number;
}) {
  const diamPct = ((2 * NUMBER_DOT_RADIUS_FACTOR * spacing) / canvasSize) * 100;
  const fontPx = Math.max(10, Math.round(spacing * 0.32));

  const { leftPct, topPct } = gridCellCenterPercent(tapFx.gx, tapFx.gy, spacing, canvasSize);

  return (
    <div className="absolute inset-0 pointer-events-none z-[6] overflow-hidden rounded-[inherit]" aria-hidden>
      {tapFx.partner ? (
        <TapRippleRing
          gx={tapFx.partner.x}
          gy={tapFx.partner.y}
          zClass="z-[4]"
          spacing={spacing}
          canvasSize={canvasSize}
          diamPct={diamPct}
          rippleMaxScale={rippleMaxScale}
        />
      ) : null}
      <TapRippleRing
        gx={tapFx.gx}
        gy={tapFx.gy}
        zClass="z-[5]"
        spacing={spacing}
        canvasSize={canvasSize}
        diamPct={diamPct}
        rippleMaxScale={rippleMaxScale}
      />
      <div
        className="absolute z-[7] flex items-center justify-center pointer-events-none"
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${diamPct}%`,
          aspectRatio: "1",
          transform: "translate(-50%, -50%)",
        }}
      >
        <motion.div
          layout={false}
          className="absolute inset-0 flex items-center justify-center rounded-full"
          initial={{ scale: tapScaleFactor }}
          animate={{ scale: 1 }}
          transition={ENDPOINT_TAP_SPRING}
        >
          <div
            className="absolute inset-0 rounded-full flex items-center justify-center shadow-sm"
            style={{ backgroundColor: color }}
          >
            <span className="relative z-10 font-bold text-[var(--color-on-primary)] drop-shadow-sm" style={{ fontSize: fontPx }}>
              {tapFx.valStr}
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function PairLinkGame() {
  const { t } = useI18n();
  const [gridSize, setGridSize] = useState(6);
  const [numbers, setNumbers] = useState<NumberCell[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [paths, setPaths] = useState<Record<string, PathPoint[][]>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const statusDisplay = useMemo(() => translatePairLinkStatus(status, t), [status, t]);
  const loadingOverlayText = useMemo(() => pairLinkLoadingLine(status, t), [status, t]);
  const [solved, setSolved] = useState(false);
  const [showClearOverlay, setShowClearOverlay] = useState(false);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  const [isDrawing, setIsDrawing] = useState(false);
  const [activeVal, setActiveVal] = useState<string | null>(null);
  const [activePathIdx, setActivePathIdx] = useState<number | null>(null);
  const [puzzleKey, setPuzzleKey] = useState(0);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(true);
  /** 詳細なコンソール出力（デバッグモードON時、OFFなら Final Board とエラーのみ） */
  const [verboseConsoleLogs, setVerboseConsoleLogs] = useState(false);
  /** devtj=true 時: 出題元・Score・Seed のデバッグ表示用 */
  const [lastPuzzleDebugInfo, setLastPuzzleDebugInfo] = useState<{
    source: "generated" | "insurance";
    score: number | null;
    seed: string | null;
    grade: number;
  } | null>(null);
  const [forcedWidth, setForcedWidth] = useState<number | null>(null);
  const [adsRefreshState, setAdsRefreshState] = useState(() => getAdsRefreshState());
  const [countFlashing, setCountFlashing] = useState(false);
  const [tick, setTick] = useState(0);
  const [currentSeed, setCurrentSeed] = useState<string | null>(null);
  const [hashInput, setHashInput] = useState("");
  const [abcScore, setAbcScore] = useState<ABCScore | null>(null);
  const [batch100Running, setBatch100Running] = useState(false);
  const [batch100Result, setBatch100Result] = useState<string | null>(null);
  const [debugGridSize, setDebugGridSize] = useState(6);
  const [debugNumPairs, setDebugNumPairs] = useState(5);
  const [test10Running, setTest10Running] = useState(false);
  const [test10Result, setTest10Result] = useState<{ success: number; avgMs: number; lastAbc: ABCScore | null } | null>(null);
  const [settingsGridSize, setSettingsGridSize] = useState(6);
  const [settingsNumPairs, setSettingsNumPairs] = useState(5);
  const [currentGrade, setCurrentGrade] = useState(1);
  const [useLegacyMode, setUseLegacyMode] = useState(false);
  const [configEmptyIsolatedPenalty, setConfigEmptyIsolatedPenalty] = useState(5);
  const [configDetourWeight, setConfigDetourWeight] = useState(0);
  const [configBaseThreshold, setConfigBaseThreshold] = useState(0);
  const [debugGenerationMode, setDebugGenerationMode] = useState<"default" | "edgeSwap">("edgeSwap");
  /** ストック空き時、Worker 試行の累計がこの ms を超えたら保険へ（デバッグパネルで調整） */
  const [debugWorkerInsuranceBudgetMs, setDebugWorkerInsuranceBudgetMs] = useState(
    DEFAULT_WORKER_PHASE_MAX_MS_BEFORE_INSURANCE
  );
  const [tapScaleFactor, setTapScaleFactor] = useState(DEFAULT_TAP_SCALE_FACTOR);
  /** Edge-Swap: 囲い込み目標件数（常時ON、定数として Edge Swap 定数内に配置） */
  const [debugTargetEnclosureCount, setDebugTargetEnclosureCount] = useState(10);
  const [scoreThresholdDraft, setScoreThresholdDraft] = useState(10);
  const [scoreThresholdApplied, setScoreThresholdApplied] = useState(10);
  const [debugEnclosures, setDebugEnclosures] = useState<EnclosureDebugItem[] | null>(null);
  const [edgeSwapScoreDraft, setEdgeSwapScoreDraft] = useState<EdgeSwapScoreParams>(() => ({
    ...EDGE_SWAP_SCORE_DEFAULTS,
  }));
  const [edgeSwapScoreApplied, setEdgeSwapScoreApplied] = useState<EdgeSwapScoreParams>(() => ({
    ...EDGE_SWAP_SCORE_DEFAULTS,
  }));
  const [edgeSwapConstantsPanelOpen, setEdgeSwapConstantsPanelOpen] = useState(false);
  const [legacyDebugPanelOpen, setLegacyDebugPanelOpen] = useState(false);
  const countFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth : 500)
  );

  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const clearModalBackdropDebug = useClearModalBackdropDebugValues();
  const userSync = useUserSyncContext();

  useEffect(() => {
    if (isDevTj) setIsDebugMode(true);
  }, [isDevTj]);

  useEffect(() => {
    setSettingsNumPairs((p) => clampPairCount(settingsGridSize, p, debugGenerationMode));
  }, [settingsGridSize, debugGenerationMode]);

  useEffect(() => {
    if (!isDebugMode) setDebugEnclosures(null);
  }, [isDebugMode]);

  useEffect(() => {
    if (debugGenerationMode !== "edgeSwap") setDebugEnclosures(null);
  }, [debugGenerationMode]);

  useEffect(() => {
    if (!isDebugMode) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isDebugMode]);

  useEffect(() => {
    if (!isDebugMode) return;
    const onStateChanged = () => setAdsRefreshState(getAdsRefreshState());
    const onRefreshSuccess = () => {
      setAdsRefreshState(getAdsRefreshState());
      setCountFlashing(true);
      if (countFlashTimeoutRef.current) clearTimeout(countFlashTimeoutRef.current);
      countFlashTimeoutRef.current = setTimeout(() => {
        setCountFlashing(false);
        countFlashTimeoutRef.current = null;
      }, 450);
    };
    window.addEventListener(AD_REFRESH_STATE_CHANGED, onStateChanged);
    window.addEventListener(AD_REFRESH_EVENT, onRefreshSuccess);
    return () => {
      window.removeEventListener(AD_REFRESH_STATE_CHANGED, onStateChanged);
      window.removeEventListener(AD_REFRESH_EVENT, onRefreshSuccess);
      if (countFlashTimeoutRef.current) clearTimeout(countFlashTimeoutRef.current);
    };
  }, [isDebugMode]);

  useEffect(() => {
    if (forcedWidth != null) return;
    const update = () => setWindowWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [forcedWidth]);

  const topAdRef = useRef<HTMLDivElement>(null);
  const didInitialAutoScrollRef = useRef(false);

  useEffect(() => {
    if (didInitialAutoScrollRef.current) return;
    if (loading || numbers.length === 0) return;
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
  }, [loading, numbers.length]);

  const effectiveViewportWidth = forcedWidth ?? windowWidth - 40;
  const canvasPixelSize = useMemo(() => {
    const base = Math.max(300, effectiveViewportWidth);
    const wCap = windowWidth >= 1024 ? 860 : 500;
    if (typeof window === "undefined") return Math.min(wCap, base);
    const hCap = window.innerHeight - GAME_TOP_AD_RESERVED_PX - 96;
    return Math.floor(Math.min(wCap, base, hCap));
  }, [windowWidth, effectiveViewportWidth]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeSecondsRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintParamsRef = useRef<PairLinkBoardPaintParams>({
    numbers: [],
    paths: {},
    gridSize: 6,
    spacing: 1,
    isDrawing: false,
    activeVal: null,
    activePathIdx: null,
    isDebugMode: false,
    debugEnclosures: null,
  });
  const isDrawingRef = useRef(false);
  const activeValRef = useRef<string | null>(null);
  const activePathIdxRef = useRef<number | null>(null);
  const hasTriggeredClearRef = useRef(false);
  const isCheckingClearRef = useRef(false);
  const currentSolutionPathsRef = useRef<Record<string, { x: number; y: number }[][]> | null>(null);
  /** 直近ロードした盤の Worker Final Board スコア（デバッグボタン用） */
  const lastPostMutationScoreRef = useRef<PostMutationScoreBreakdown | null>(null);
  const mergeIndexRef = useRef<number | null>(null);
  const mergeJustHappenedRef = useRef(false);
  const tapFxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tapFx, setTapFx] = useState<EndpointTapFxPayload | null>(null);

  useEffect(() => {
    return () => {
      if (tapFxTimeoutRef.current) clearTimeout(tapFxTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    isDrawingRef.current = isDrawing;
    activeValRef.current = activeVal;
    activePathIdxRef.current = activePathIdx;
  }, [isDrawing, activeVal, activePathIdx]);

  const spacing =
    gridSize > 1 ? (canvasPixelSize - PADDING * 2) / (gridSize - 1) : 0;
  const canvasSize = Math.round(PADDING * 2 + (gridSize - 1) * spacing) || 420;

  const tapRippleMaxScale = useMemo(
    () => computeTapRippleMaxScale(gridSize, canvasSize),
    [gridSize, canvasSize]
  );

  const pulseEndpointTap = useCallback((valStr: string, gx: number, gy: number) => {
    const partnerCell =
      numbers.find((n) => String(n.val) === valStr && (n.x !== gx || n.y !== gy)) ?? null;
    const partner: PathPoint | null = partnerCell
      ? { x: partnerCell.x, y: partnerCell.y }
      : null;
    setTapFx({
      id: typeof performance !== "undefined" ? performance.now() : Date.now(),
      valStr,
      gx,
      gy,
      partner,
    });
    if (tapFxTimeoutRef.current) clearTimeout(tapFxTimeoutRef.current);
    tapFxTimeoutRef.current = setTimeout(() => {
      setTapFx(null);
      tapFxTimeoutRef.current = null;
    }, TAP_OVERLAY_CLEAR_MS);
  }, [numbers]);

  useEffect(() => {
    setTapFx(null);
    if (tapFxTimeoutRef.current) {
      clearTimeout(tapFxTimeoutRef.current);
      tapFxTimeoutRef.current = null;
    }
  }, [puzzleKey, loading]);

  const evalConfig = {
    emptyIsolatedPenalty: configEmptyIsolatedPenalty,
    detourWeight: configDetourWeight,
    baseThreshold: configBaseThreshold > 0 ? configBaseThreshold : undefined,
    generationMode: debugGenerationMode,
    ...(debugGenerationMode === "edgeSwap"
      ? {
          targetEnclosureCount: debugTargetEnclosureCount,
          scoreThreshold: scoreThresholdApplied,
        }
      : {}),
    ...(isDebugMode && debugGenerationMode === "edgeSwap"
      ? { debugEnclosureViz: true }
      : {}),
    ...(debugGenerationMode === "edgeSwap"
      ? { edgeSwapScoreParams: edgeSwapScoreApplied }
      : {}),
    ...(isDebugMode ? { enableAlgoLogs: true, verboseAlgoLogs: verboseConsoleLogs } : {}),
  };
  const { getPuzzle, prefetch, manualPrefetch, clearStockForKey, isPrefetching, lastGenerationTimeMs, lastProfile, lastAttempts, lastTotalMs, stockStatus } = usePuzzleStock({ config: evalConfig });
  const { getPuzzleByGrade, prefetchGrade, stockStatus: gradeStockStatus } = usePuzzleStockByGrade({
    debugLog: true,
    enableAlgoLogs: isDebugMode,
    verboseAlgoLogs: verboseConsoleLogs,
    workerPhaseMaxMsBeforeInsurance: debugWorkerInsuranceBudgetMs,
  });
  const { generate: workerGenerate } = useBoardWorker();

  const initGame = useCallback(
    async (
      gs: number,
      np: number,
      seed?: string,
      options?: { onSuccess?: (result: Awaited<ReturnType<typeof getPuzzle>>) => void | Promise<void> }
    ) => {
      hasTriggeredClearRef.current = false;
      isCheckingClearRef.current = false;
      setSolved(false);
      setShowClearOverlay(false);
      setTimeSeconds(0);
      setTimerActive(false);
      setDebugEnclosures(null);
      lastPostMutationScoreRef.current = null;

      const npClamped = clampPairCount(gs, np, debugGenerationMode);
      const key = `${gs}x${npClamped}`;
      const hasStock = (stockStatus[key] ?? 0) > 0 && !seed;
      if (!hasStock) {
        setLoading(true);
        setStatus(seed ? "ハッシュから生成中" : "探索中");
      }

      try {
        const result = await getPuzzle(gs, npClamped, seed);
        if (result.error) {
          setStatus(result.error ?? "生成に失敗しました");
          return;
        }
        setGridSize(result.gridSize);
        setNumbers(result.numbers);
        setPairs(result.pairs);
        setPaths(emptyPaths(result.pairs));
        setStatus("Playing");
        setTimerActive(true);
        setPuzzleKey((k) => k + 1);
        setCurrentSeed(result.seed ?? null);
        currentSolutionPathsRef.current = result.solutionPaths ?? null;
        setDebugEnclosures(result.debugEnclosures ?? null);
        lastPostMutationScoreRef.current = result.postMutationScoreBreakdown ?? null;
        await options?.onSuccess?.(result);
      } catch (err) {
        setStatus(
          err instanceof Error ? err.message : "生成に失敗しました。もう一度お試しください。"
        );
      } finally {
        setLoading(false);
      }
    },
    [getPuzzle, stockStatus, debugGenerationMode, isDebugMode]
  );

  const initGameByGrade = useCallback(
    async (
      grade: number,
      seed?: string,
      options?: { onSuccess?: (result: GenerateResultWithSource) => void | Promise<void> }
    ) => {
      hasTriggeredClearRef.current = false;
      isCheckingClearRef.current = false;
      setSolved(false);
      setShowClearOverlay(false);
      setTimeSeconds(0);
      setTimerActive(false);
      setDebugEnclosures(null);
      lastPostMutationScoreRef.current = null;
      setLoading(true);
      setStatus(gradeStockStatus[grade] != null && gradeStockStatus[grade] > 0 ? "読み込み中" : "生成中...");

      try {
        const PUZZLE_LOAD_TIMEOUT_MS = 60_000;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const result = await Promise.race([
          getPuzzleByGrade(grade, seed),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error("タイムアウトしました。もう一度お試しください。")),
              PUZZLE_LOAD_TIMEOUT_MS
            );
          }),
        ]);
        if (timeoutId != null) clearTimeout(timeoutId);
        if (result.error) {
          setStatus(result.error ?? "生成に失敗しました");
          return;
        }
        setGridSize(result.gridSize);
        setNumbers(result.numbers);
        setPairs(result.pairs);
        setPaths(emptyPaths(result.pairs));
        setStatus("Playing");
        setTimerActive(true);
        setPuzzleKey((k) => k + 1);
        setCurrentSeed(result.seed ?? null);
        currentSolutionPathsRef.current = result.solutionPaths ?? null;
        setDebugEnclosures(result.debugEnclosures ?? null);
        lastPostMutationScoreRef.current = result.postMutationScoreBreakdown ?? null;
        const source = result.source ?? "generated";
        const score = result.postMutationScoreBreakdown?.finalScore ?? null;
        setLastPuzzleDebugInfo({ source, score, seed: result.seed ?? null, grade });
        await options?.onSuccess?.(result);
      } catch (err) {
        setStatus(
          err instanceof Error ? err.message : "生成に失敗しました。もう一度お試しください。"
        );
      } finally {
        setLoading(false);
      }
    },
    [getPuzzleByGrade, gradeStockStatus]
  );

  useEffect(() => {
    if (useLegacyMode) {
      initGame(6, 5);
    } else {
      initGameByGrade(1);
      prefetchGrade(1);
      prefetchGrade(2);
      prefetchGrade(3);
    }
  }, [useLegacyMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ABC スコアを盤面ロード時に計算
  useEffect(() => {
    const sol = currentSolutionPathsRef.current;
    if (!pairs.length || !sol) {
      setAbcScore(null);
      return;
    }
    const score = computeABCScore(pairs, sol, gridSize);
    setAbcScore(score);
  }, [pairs, puzzleKey, gridSize]);

  const runTest10 = useCallback(async () => {
    setTest10Running(true);
    setTest10Result(null);
    const gs = Math.max(4, Math.min(8, debugGridSize));
    const maxP = gs >= 7 ? 10 : gs;
    const np = clampPairCount(
      gs,
      Math.max(2, Math.min(maxP, debugNumPairs)),
      debugGenerationMode
    );
    const times: number[] = [];
    let lastAbc: ABCScore | null = null;
    let success = 0;
    try {
      for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        const result = await workerGenerate(gs, undefined, np, evalConfig);
        const elapsed = Math.round(performance.now() - t0);
        if (!result.error && result.solutionPaths && result.pairs) {
          success++;
          times.push(elapsed);
          const score = computeABCScore(result.pairs, result.solutionPaths, result.gridSize);
          if (score) lastAbc = score;
        }
      }
      const avgMs = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
      setTest10Result({ success, avgMs, lastAbc });
    } finally {
      setTest10Running(false);
    }
  }, [
    debugGridSize,
    debugNumPairs,
    debugGenerationMode,
    debugTargetEnclosureCount,
    edgeSwapScoreApplied,
    isDebugMode,
    workerGenerate,
    configEmptyIsolatedPenalty,
    configDetourWeight,
    configBaseThreshold,
  ]);

  const runBatch100 = useCallback(async () => {
    setBatch100Running(true);
    setBatch100Result(null);
    const aVals: number[] = [];
    const bVals: number[] = [];
    const cVals: number[] = [];
    const npEff = clampPairCount(settingsGridSize, settingsNumPairs, debugGenerationMode);
    try {
      for (let i = 0; i < 100; i++) {
        const result = await workerGenerate(settingsGridSize, undefined, npEff, evalConfig);
        if (result.error || !result.solutionPaths || !result.pairs) continue;
        const score = computeABCScore(result.pairs, result.solutionPaths, result.gridSize);
        if (score) {
          aVals.push(score.detourScore);
          bVals.push(score.enclosureScore);
          cVals.push(score.junctionComplexity);
        }
      }
      const aStat = computeStats(aVals);
      const bStat = computeStats(bVals);
      const cStat = computeStats(cVals);
      const report = [
        `[ABC 100回計測] ${settingsGridSize}x${npEff}`,
        `A. Detour Score: min=${aStat.min.toFixed(3)} max=${aStat.max.toFixed(3)} avg=${aStat.avg.toFixed(3)} std=${aStat.std.toFixed(3)}`,
        `B. Enclosure Score: min=${bStat.min} max=${bStat.max} avg=${bStat.avg.toFixed(2)} std=${bStat.std.toFixed(2)}`,
        `C. Junction Complexity: min=${cStat.min.toFixed(3)} max=${cStat.max.toFixed(3)} avg=${cStat.avg.toFixed(3)} std=${cStat.std.toFixed(3)}`,
      ].join("\n");
      console.log(report);
      setBatch100Result(report);
    } finally {
      setBatch100Running(false);
    }
  }, [
    settingsGridSize,
    settingsNumPairs,
    debugGenerationMode,
    debugTargetEnclosureCount,
    edgeSwapScoreApplied,
    isDebugMode,
    workerGenerate,
    configEmptyIsolatedPenalty,
    configDetourWeight,
    configBaseThreshold,
  ]);

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

  // 表示サイズと内部サイズが異なる場合の座標変換（拡縮時もタップずれなし）
  const getGridPos = useCallback(
    (clientX: number, clientY: number): PathPoint | null => {
      const canvas = canvasRef.current;
      if (!canvas || spacing <= 0) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (clientX - rect.left) * scaleX;
      const canvasY = (clientY - rect.top) * scaleY;
      const x = Math.round((canvasX - PADDING) / spacing);
      const y = Math.round((canvasY - PADDING) / spacing);
      if (x >= 0 && x < gridSize && y >= 0 && y < gridSize) return { x, y };
      return null;
    },
    [gridSize, spacing]
  );

  const getCanvasPos = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas || spacing <= 0) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    [spacing]
  );

  const findNearestHit = useCallback(
    (clientX: number, clientY: number): HitTarget | null => {
      const canvasPos = getCanvasPos(clientX, clientY);
      if (!canvasPos) return null;

      const hitRadius = spacing * HIT_RADIUS_FACTOR;
      let best: { target: HitTarget; distSq: number } | null = null;

      const consider = (target: HitTarget, px: number, py: number) => {
        const dx = canvasPos.x - px;
        const dy = canvasPos.y - py;
        const distSq = dx * dx + dy * dy;
        if (distSq <= hitRadius * hitRadius) {
          if (!best || distSq < best.distSq) best = { target, distSq };
        }
      };

      for (const [v, pathList] of Object.entries(paths)) {
        for (let i = 0; i < pathList.length; i++) {
          const path = pathList[i];
          const first = path[0];
          const last = path[path.length - 1];
          const firstPx = PADDING + first.x * spacing;
          const firstPy = PADDING + first.y * spacing;
          consider(
            { type: "endpoint", val: v, pathIdx: i, point: first, isFirst: true },
            firstPx,
            firstPy
          );
          if (first.x !== last.x || first.y !== last.y) {
            const lastPx = PADDING + last.x * spacing;
            const lastPy = PADDING + last.y * spacing;
            consider(
              { type: "endpoint", val: v, pathIdx: i, point: last, isFirst: false },
              lastPx,
              lastPy
            );
          }
        }
      }

      for (const n of numbers) {
        const px = PADDING + n.x * spacing;
        const py = PADDING + n.y * spacing;
        consider({ type: "number", x: n.x, y: n.y, val: n.val }, px, py);
      }

      return (best as { target: HitTarget } | null)?.target ?? null;
    },
    [paths, numbers, spacing, getCanvasPos]
  );

  const checkClear = useCallback(async () => {
    // ローディング中（次へ押下後の探索中など）は前パズルの paths が残っており誤検知するためスキップ
    if (loading || solved || pairs.length === 0 || hasTriggeredClearRef.current)
      return;
    // pointerup/pointercancel の両発火や StrictMode による二重実行を防ぐため、処理開始直後にフラグを立てる
    hasTriggeredClearRef.current = true;
    isCheckingClearRef.current = true;
    try {
      const result = validatePaths(paths, pairs, gridSize);
      if (result.ok) {
        setSolved(true);
        setTimerActive(false);
        setShowClearOverlay(true);
        try {
          recordPuzzleClear("pairLink");
          if (userSync?.saveProgressAndSync) {
            userSync.saveProgressAndSync(() => {}).catch(() => {});
          }
        } catch {
          /* ignore */
        }
      } else {
        hasTriggeredClearRef.current = false;
      }
    } catch {
      hasTriggeredClearRef.current = false;
    } finally {
      isCheckingClearRef.current = false;
    }
  }, [paths, pairs, gridSize, solved, loading, userSync]);

  const triggerDebugSolve = useCallback(async () => {
    if (typeof window !== "undefined" && window.location.search.includes("devtj=true")) {
      console.log("[強制クリア] 呼び出し", {
        loading,
        solved,
        pairsLen: pairs.length,
        hasTriggered: hasTriggeredClearRef.current,
      });
    }
    if (loading || pairs.length === 0) return;

    if (solved) {
      setShowClearOverlay(false);
      hasTriggeredClearRef.current = false;
      const onSuccess = async (result: GenerateResult) => {
        let solvedPaths = result.solutionPaths ?? null;
        if (!solvedPaths || Object.keys(solvedPaths).length === 0) {
          const rawPaths = solvePathsForPairs(result.pairs, result.gridSize);
          if (!rawPaths || Object.keys(rawPaths).length === 0) {
            setStatus("解が見つかりませんでした。");
            return;
          }
          solvedPaths = rawPaths;
        }
        setPaths(solvedPaths);
        setSolved(true);
        setTimerActive(false);
        setShowClearOverlay(true);
        recordPuzzleClear("pairLink");
        if (userSync?.saveProgressAndSync) {
          userSync.saveProgressAndSync(() => {}).catch(() => {});
        }
      };
      try {
        if (useLegacyMode) {
          await initGame(settingsGridSize, settingsNumPairs, undefined, { onSuccess });
        } else {
          await initGameByGrade(currentGrade, undefined, { onSuccess });
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "強制クリアに失敗しました");
      }
      return;
    }

    hasTriggeredClearRef.current = true;
    try {
      let solvedPaths: Record<string, { x: number; y: number }[][]> | null =
        currentSolutionPathsRef.current;
      if (typeof window !== "undefined" && window.location.search.includes("devtj=true")) {
        console.log("[強制クリア] currentSolutionPathsRef:", solvedPaths ? `${Object.keys(solvedPaths).length} keys` : "null");
      }
      if (!solvedPaths || Object.keys(solvedPaths).length === 0) {
        if (typeof window !== "undefined" && window.location.search.includes("devtj=true")) {
          console.log("[強制クリア] solvePathsForPairs を呼び出し");
        }
        const raw = solvePathsForPairs(pairs, gridSize);
        if (!raw || Object.keys(raw).length === 0) {
          const msg = "解が見つかりませんでした。";
          setStatus(msg);
          if (typeof window !== "undefined" && window.location.search.includes("devtj=true")) {
            console.warn("[強制クリア] solvePathsForPairs 失敗:", msg);
          }
          hasTriggeredClearRef.current = false;
          return;
        }
        solvedPaths = raw;
      }
      if (typeof window !== "undefined" && window.location.search.includes("devtj=true")) {
        console.log("[強制クリア] setPaths 実行, keys:", Object.keys(solvedPaths).length);
      }
      setPaths(solvedPaths);
      setSolved(true);
      setTimerActive(false);
      setShowClearOverlay(true);
      recordPuzzleClear("pairLink");
      if (userSync?.saveProgressAndSync) {
        userSync.saveProgressAndSync(() => {}).catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "強制クリアに失敗しました";
      setStatus(msg);
      if (typeof window !== "undefined" && window.location.search.includes("devtj=true")) {
        console.error("[強制クリア] 例外:", err);
      }
      hasTriggeredClearRef.current = false;
    }
  }, [pairs, gridSize, loading, solved, userSync, initGame, initGameByGrade, useLegacyMode, currentGrade, settingsGridSize, settingsNumPairs]);

  // トリガーA: クリア判定され正解演出開始時に広告リフレッシュ
  useEffect(() => {
    if (!showClearOverlay) return;
    refreshAds();
  }, [showClearOverlay]);

  // クリア画面ポップアップ時のみ紙吹雪を1回発火（showClearOverlay の遷移で確実に1回に限定）
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

  const attachCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (!node) return;
    const p = paintParamsRef.current;
    if (p.numbers.length > 0 && p.spacing > 0) {
      drawPairLinkBoard(node, p);
    }
  }, []);

  // コールバック ref でマウント直後に描画。useLayoutEffect 時点では canvasRef が null のケースがあるため rAF でも追い描き。
  useLayoutEffect(() => {
    if (loading || !numbers.length || spacing <= 0) return;

    let cancelled = false;
    let rafId = 0;
    let attempt = 0;
    const run = () => {
      if (cancelled) return;
      const el = canvasRef.current;
      if (el) {
        drawPairLinkBoard(el, paintParamsRef.current);
        return;
      }
      attempt += 1;
      if (attempt < 24) {
        rafId = requestAnimationFrame(run);
      }
    };
    run();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    loading,
    puzzleKey,
    paths,
    numbers,
    gridSize,
    spacing,
    isDrawing,
    activeVal,
    activePathIdx,
    isDebugMode,
    debugEnclosures,
  ]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (solved || hasTriggeredClearRef.current || isCheckingClearRef.current) return;
      const hit = findNearestHit(e.clientX, e.clientY);
      if (!hit) return;

      if (hit.type === "endpoint") {
        const { val: v, pathIdx: i, isFirst } = hit;
        const path = paths[v]?.[i];
        if (!path) return;
        if (isFirst) {
          setPaths((prev) => {
            const next = { ...prev };
            const seg = [...next[v]].map((s) => [...s]);
            seg[i] = [...path].reverse();
            next[v] = seg;
            return next;
          });
        }
        activeValRef.current = v;
        activePathIdxRef.current = i;
        isDrawingRef.current = true;
        setActiveVal(v);
        setActivePathIdx(i);
        setIsDrawing(true);
        if (isPrintedNumberCell(numbers, v, hit.point.x, hit.point.y)) {
          pulseEndpointTap(v, hit.point.x, hit.point.y);
        }
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        return;
      }

      if (hit.type === "number") {
        const { x, y, val } = hit;
        const v = String(val);
        const alreadyEndpoint = (paths[v] ?? []).some(
          (path) =>
            (path[0]?.x === x && path[0]?.y === y) ||
            (path[path.length - 1]?.x === x && path[path.length - 1]?.y === y)
        );
        if (alreadyEndpoint) return;
        setPaths((prev) => {
          const next = { ...prev };
          if (!next[v]) next[v] = [];
          next[v] = [...(next[v] ?? []), [{ x, y }]];
          return next;
        });
        const pathIdx = (paths[v]?.length ?? 1) - 1;
        activeValRef.current = v;
        activePathIdxRef.current = pathIdx;
        isDrawingRef.current = true;
        setActiveVal(v);
        setActivePathIdx(pathIdx);
        setIsDrawing(true);
        pulseEndpointTap(v, x, y);
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }
    },
    [paths, numbers, solved, findNearestHit, pulseEndpointTap]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // refs を参照（window listener から呼ばれたとき、描画開始直後の React 再描画前でも正しく動作）
      const av = activeValRef.current;
      const api = activePathIdxRef.current;
      if (hasTriggeredClearRef.current || isCheckingClearRef.current || !isDrawingRef.current || av === null || api === null) return;
      e.preventDefault();
      const p = getGridPos(e.clientX, e.clientY);
      if (!p) return;

      let didMerge = false;
      let reachedGoal = false;

      setPaths((prev) => {
        const path = prev[av]?.[api];
        if (!path) return prev;
        const last = path[path.length - 1];
        if (p.x === last.x && p.y === last.y) return prev;

        const manhattan =
          Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
        if (manhattan !== 1) return prev;

        if (
          path.length > 1 &&
          p.x === path[path.length - 2].x &&
          p.y === path[path.length - 2].y
        ) {
          if (mergeJustHappenedRef.current) return prev;
          const mergeIdx = mergeIndexRef.current;
          const popped = path.slice(0, -1);
          const firstIsNum = numbers.some(
            (n) =>
              n.x === popped[0].x &&
              n.y === popped[0].y &&
              n.val === Number(av)
          );
          const lastIsNum = numbers.some(
            (n) =>
              n.x === popped[popped.length - 1].x &&
              n.y === popped[popped.length - 1].y &&
              n.val === Number(av)
          );
          if (!firstIsNum && !lastIsNum) return prev;
          if (mergeIdx !== null && popped.length === mergeIdx) {
            mergeIndexRef.current = null;
            const ourPath = path.slice(0, mergeIdx);
            const otherPath = path.slice(mergeIdx).reverse();
            const next = { ...prev };
            next[av] = [ourPath, otherPath];
            return next;
          }
          const next = { ...prev };
          const seg = next[av].map((s) => [...s]);
          seg[api] = popped;
          next[av] = seg;
          return next;
        }

        // 数字の端点からは別方向に伸ばせない（戻すのみ）。path.length===1は開始点からの初回伸ばしなので許可
        const lastIsNumber = numbers.some(
          (n) => n.x === last.x && n.y === last.y && n.val === Number(av)
        );
        if (lastIsNumber && path.length > 1) return prev;

        // 自分の開始数字へ戻る（ループ生成・2本目防止）
        if (
          path.length > 2 &&
          p.x === path[0].x &&
          p.y === path[0].y
        )
          return prev;

        const oIdx = 1 - api;
        const oPath = prev[av]?.[oIdx];
        if (
          oPath &&
          oPath.length > 0 &&
          p.x === oPath[oPath.length - 1].x &&
          p.y === oPath[oPath.length - 1].y
        ) {
          // 数字から伸びる線は1方向に限定：マージ後の経路は「数字-数字」でなければならない
          // path[0] と oPath[0] が両方数字で、かつ異なるときのみマージ許可
          const pathStart = path[0];
          const oPathStart = oPath[0];
          const pathStartIsNum = numbers.some(
            (n) => n.x === pathStart.x && n.y === pathStart.y && n.val === Number(av)
          );
          const oPathStartIsNum = numbers.some(
            (n) => n.x === oPathStart.x && n.y === oPathStart.y && n.val === Number(av)
          );
          if (
            !pathStartIsNum ||
            !oPathStartIsNum ||
            (pathStart.x === oPathStart.x && pathStart.y === oPathStart.y)
          )
            return prev;
          didMerge = true;
          mergeJustHappenedRef.current = true;
          mergeIndexRef.current = path.length;
          const merged = [...path, ...[...oPath].reverse()];
          const seg = prev[av].filter((_, i) => i !== oIdx);
          seg[0] = merged;
          const next = { ...prev };
          next[av] = seg;
          return next;
        }

        const tNum = numbers.find((n) => n.x === p.x && n.y === p.y);
        if (tNum) {
          if (tNum.val !== Number(av)) return prev;
          reachedGoal = true;
          const next = { ...prev };
          const seg = next[av].map((s) => [...s]);
          seg[api] = [...path, p];
          next[av] = seg;
          return next;
        }

        const occupied = Object.values(prev)
          .flat()
          .some((pa) => pa.some((pt) => pt.x === p.x && pt.y === p.y));
        if (occupied) return prev;

        const next = { ...prev };
        const seg = next[av].map((s) => [...s]);
        seg[api] = [...path, p];
        next[av] = seg;
        return next;
      });

      if (didMerge) {
        activePathIdxRef.current = 0;
        setActivePathIdx(0);
      }
    },
    [numbers, getGridPos]
  );

  const handlePointerUp = useCallback(() => {
    mergeIndexRef.current = null;
    mergeJustHappenedRef.current = false;
    isDrawingRef.current = false;
    activeValRef.current = null;
    activePathIdxRef.current = null;
    setIsDrawing(false);
    setActiveVal(null);
    setActivePathIdx(null);

    // 線を戻して数字が孤立した場合、その数字に path=[その数字] を与える
    // （スプリットは mergeIndexRef が pointerUp で null になるため別セッションでは発生しない）
    setPaths((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const n of numbers) {
        const v = String(n.val);
        const pathList = next[v] ?? [];
        const isEndpoint = pathList.some(
          (path) =>
            (path[0]?.x === n.x && path[0]?.y === n.y) ||
            (path[path.length - 1]?.x === n.x && path[path.length - 1]?.y === n.y)
        );
        if (!isEndpoint) {
          if (!next[v]) next[v] = [];
          next[v] = [...next[v], [{ x: n.x, y: n.y }]];
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    checkClear();
  }, [checkClear, numbers]);

  // HTML版と同様に window で pointermove/up を受信（指が canvas 外に出てもドラッグ継続）
  const handlePointerMoveRef = useRef(handlePointerMove);
  const handlePointerUpRef = useRef(handlePointerUp);
  handlePointerMoveRef.current = handlePointerMove;
  handlePointerUpRef.current = handlePointerUp;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const synthetic = {
        clientX: e.clientX,
        clientY: e.clientY,
        preventDefault: () => e.preventDefault(),
      } as React.PointerEvent;
      handlePointerMoveRef.current(synthetic);
    };
    const onUp = () => handlePointerUpRef.current?.();

    window.addEventListener("pointermove", onMove, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
    };
  }, []);

  paintParamsRef.current = {
    numbers,
    paths,
    gridSize,
    spacing,
    isDrawing,
    activeVal,
    activePathIdx,
    isDebugMode,
    debugEnclosures,
  };

  if (loading || !numbers.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] text-[var(--color-text)]">
        <p className="text-[var(--color-muted)]">{loadingOverlayText}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {isDevTj && lastPuzzleDebugInfo && !useLegacyMode && (
        <div
          className="fixed left-4 bottom-4 z-40 rounded-lg border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_82%,var(--color-bg))] px-2 py-1.5 text-[10px] font-mono text-[var(--color-muted)]"
          aria-live="polite"
        >
          Source: {lastPuzzleDebugInfo.source === "insurance" ? "Insurance" : "Generated"} | Stock: {(gradeStockStatus[lastPuzzleDebugInfo.grade] ?? 0)}/{STOCK_PER_GRADE_MAX} | Score: {lastPuzzleDebugInfo.score ?? "—"} | Seed: {lastPuzzleDebugInfo.seed ? lastPuzzleDebugInfo.seed.slice(-12) : "—"}
        </div>
      )}
      {isDevTj && !isDebugMode && (
        <div className="fixed right-4 top-4 z-50">
          <button
            onClick={() => setIsDebugMode(true)}
            className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_55%,var(--color-bg))] px-2 py-1 text-xs font-mono text-[var(--color-text)]"
          >
            DEBUG OFF
          </button>
        </div>
      )}
      {isDebugMode && (
        <div className="fixed right-4 top-4 z-50 max-h-[90vh] overflow-y-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-bg))] p-3 text-left text-xs font-mono text-[var(--color-text)] shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            {isDebugPanelExpanded && (
              <span className="shrink-0 font-bold text-[var(--color-primary)]">{t("games.pairLink.debugPanelTitle")}</span>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                onClick={() => setIsDebugMode(false)}
                className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[var(--color-primary)] px-2 py-1 text-[var(--color-on-primary)]"
              >
                DEBUG ON
              </button>
              <button
                onClick={() => setIsDebugPanelExpanded((v) => !v)}
                className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] p-1 text-[var(--color-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]"
                title={isDebugPanelExpanded ? t("common.closePanel") : t("common.openPanel")}
              >
                {isDebugPanelExpanded ? "▲" : "▼"}
              </button>
            </div>
          </div>
          {isDebugPanelExpanded && (
            <>
              <label className="mt-2 flex items-center gap-2 cursor-pointer text-[var(--color-muted)]">
                <input
                  type="checkbox"
                  checked={verboseConsoleLogs}
                  onChange={(e) => setVerboseConsoleLogs(e.target.checked)}
                  className="rounded border-[color-mix(in_srgb,var(--color-text)_30%,transparent)]"
                />
                <span className="text-[10px]">{t("games.pairLink.debugVerboseLog")}</span>
              </label>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  onClick={() => triggerDebugSolve()}
                  disabled={loading || pairs.length === 0}
                  className="px-2 py-0.5 rounded text-[10px] border border-emerald-500/50 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("games.pairLink.debugForceClear")}
                </button>
                <button
                  type="button"
                  onClick={() => logFinalBoardScoreToConsole(lastPostMutationScoreRef.current)}
                  disabled={loading}
                  className="px-2 py-0.5 rounded text-[10px] border border-cyan-500/50 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="直近ロード時の postMutationScoreBreakdown を、Worker と同形式でコンソールへ"
                >
                  今の盤面スコアをコンソールに出力
                </button>
                <button
                  onClick={() =>
                    manualPrefetch(
                      settingsGridSize,
                      clampPairCount(settingsGridSize, settingsNumPairs, debugGenerationMode)
                    )
                  }
                  disabled={isPrefetching}
                  className="px-2 py-0.5 rounded text-[10px] border border-[color-mix(in_srgb,var(--color-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-bg))] text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  手動プリフェッチ実行
                </button>
                <button
                  onClick={() => refreshAds()}
                  className="px-2 py-0.5 rounded text-[10px] border border-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30"
                >
                  フラッシュテスト
                </button>
              </div>
              <div className="mt-2 space-y-0.5 text-[var(--color-muted)]/90 text-[10px]">
                <div>
                  プリフェッチ状態:{" "}
                  <span className={isPrefetching ? "text-[var(--color-accent)]" : ""}>
                    {isPrefetching ? "生成中...（Running）" : "待機中（Idle）"}
                  </span>
                </div>
                <div>
                  ストック状況:{" "}
                  <span className="tabular-nums text-[var(--color-accent)]">
                    {Object.entries(stockStatus)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([k, v]) => `${k}: ${v}個`)
                      .join(", ") || "なし"}
                  </span>
                </div>
                <div>
                  最終生成時間:{" "}
                  <span className="tabular-nums">{lastGenerationTimeMs != null ? `${lastGenerationTimeMs}ms` : "—"}</span>
                </div>
                {lastAttempts != null && (
                  <div>
                    Attempts:{" "}
                    <span className="tabular-nums">{lastAttempts} 回</span>
                  </div>
                )}
                {lastTotalMs != null && (
                  <div>
                    全体:{" "}
                    <span className="tabular-nums">{lastTotalMs} ms</span>
                  </div>
                )}
                {lastProfile && Object.keys(lastProfile).length > 0 && (
                  <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
                    <div className="font-semibold text-[var(--color-muted)] mb-0.5">[累計内訳]（ループ全回分合計）</div>
                    {Object.entries(lastProfile).map(([step, ms]) => {
                      const cn = ms > 100 ? "text-red-400 font-bold" : ms > 16.7 ? "text-[var(--color-accent)]" : "";
                      return (
                        <div key={step} className="flex justify-between gap-2">
                          <span>{step}:</span>
                          <span className={`tabular-nums shrink-0 ${cn}`}>{ms} ms</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div>
                  リフレッシュ試行:{" "}
                  最終トライ{" "}
                  {adsRefreshState.lastTryTime
                    ? new Date(adsRefreshState.lastTryTime).toLocaleTimeString("ja-JP")
                    : "—"}
                  {adsRefreshState.lastTryTime ? (
                    <span
                      className={`tabular-nums ml-1 ${
                        Math.floor((Date.now() - adsRefreshState.lastRefreshAt) / 1000) >= 30
                          ? "text-emerald-400"
                          : ""
                      }`}
                    >
                      ({Math.floor((Date.now() - adsRefreshState.lastTryTime) / 1000)}秒前)
                    </span>
                  ) : null}
                </div>
                <div>
                  リフレッシュ成功:{" "}
                  最終更新{" "}
                  {adsRefreshState.lastRefreshAt
                    ? new Date(adsRefreshState.lastRefreshAt).toLocaleTimeString("ja-JP")
                    : "—"}
                  {adsRefreshState.lastRefreshAt ? (
                    <span
                      className={`tabular-nums ml-1 ${
                        Math.floor((Date.now() - adsRefreshState.lastRefreshAt) / 1000) >= 30
                          ? "text-emerald-400"
                          : ""
                      }`}
                    >
                      ({Math.floor((Date.now() - adsRefreshState.lastRefreshAt) / 1000)}秒前)
                    </span>
                  ) : null}
                </div>
                <div>
                  リフレッシュ回数:{" "}
                  <span
                    className={`tabular-nums transition-colors duration-200 ${
                      countFlashing ? "text-[var(--color-accent)] font-bold" : ""
                    }`}
                  >
                    {adsRefreshState.refreshCount}
                  </span>
                </div>
                <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
                  <div className="font-semibold text-[var(--color-muted)] mb-0.5">UIモード</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <button
                      onClick={() => setUseLegacyMode(false)}
                      className={`px-2 py-0.5 rounded text-[10px] border ${
                        !useLegacyMode ? "border-emerald-500 bg-emerald-500/30 text-emerald-400" : "border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] text-[var(--color-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]"
                      }`}
                    >
                      [グレード 1-11]
                    </button>
                    <button
                      onClick={() => setUseLegacyMode(true)}
                      className={`px-2 py-0.5 rounded text-[10px] border ${
                        useLegacyMode ? "border-emerald-500 bg-emerald-500/30 text-emerald-400" : "border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] text-[var(--color-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]"
                      }`}
                    >
                      [Size/Pairs レガシー]
                    </button>
                  </div>
                  <div className="mt-1.5 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] space-y-1">
                    <div className="font-semibold text-[var(--color-muted)] text-[10px]">端点タップ演出</div>
                    <label className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-muted)]">
                      <span className="shrink-0">TAP_SCALE_FACTOR</span>
                      <input
                        type="range"
                        min={1.02}
                        max={1.45}
                        step={0.01}
                        value={tapScaleFactor}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          setTapScaleFactor(Math.round(v * 100) / 100);
                        }}
                        className="w-[min(140px,100%)] accent-emerald-500"
                      />
                      <span className="tabular-nums text-[var(--color-muted)] w-9 shrink-0">
                        {tapScaleFactor.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTapScaleFactor(DEFAULT_TAP_SCALE_FACTOR)}
                        className="px-1.5 py-0.5 rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]"
                      >
                        既定
                      </button>
                    </label>
                    <div className="text-[9px] text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))] leading-snug">
                      波紋最大スケール（自動）:{" "}
                      <span className="tabular-nums text-[var(--color-muted)]">{tapRippleMaxScale.toFixed(2)}</span>
                      <span className="text-[color-mix(in_srgb,var(--color-muted)_70%,var(--color-bg))]">
                        {" "}
                        · G{gridSize} / {canvasSize}px
                      </span>
                    </div>
                  </div>
                  {!useLegacyMode && (
                    <div className="mt-0.5 text-[10px] text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))] space-y-0.5">
                      <div>
                        グレードストック: {Object.entries(gradeStockStatus).map(([g, n]) => `G${g}:${n}/${STOCK_PER_GRADE_MAX}`).join(" ")}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        <span className="text-[var(--color-muted)] shrink-0">
                          ストック空→保険まで Worker 累計(ms)
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={120_000}
                          step={50}
                          value={debugWorkerInsuranceBudgetMs}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (!Number.isFinite(n)) return;
                            setDebugWorkerInsuranceBudgetMs(Math.max(0, Math.min(120_000, Math.round(n))));
                          }}
                          className="w-20 px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-surface)_45%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[color-mix(in_srgb,var(--color-text)_88%,var(--color-bg))] tabular-nums"
                          title={`プリフェッチ無しで Worker 試行がこの時間を超えたら保険アセットへ切替（既定 ${DEFAULT_WORKER_PHASE_MAX_MS_BEFORE_INSURANCE}ms）`}
                        />
                        <span className="text-[color-mix(in_srgb,var(--color-muted)_70%,var(--color-bg))]">既定 {DEFAULT_WORKER_PHASE_MAX_MS_BEFORE_INSURANCE}</span>
                      </div>
                      {lastPuzzleDebugInfo && (
                        <div className="text-[var(--color-muted)]">
                          Source: {lastPuzzleDebugInfo.source === "insurance" ? "Insurance" : "Generated"} | Score: {lastPuzzleDebugInfo.score ?? "—"} | Seed: {lastPuzzleDebugInfo.seed ?? "—"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
                  <div className="font-semibold text-[var(--color-muted)] mb-0.5">生成モード</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {(["default", "edgeSwap"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setDebugGenerationMode(m)}
                        className={`px-2 py-0.5 rounded text-[10px] border ${
                          debugGenerationMode === m
                            ? "border-emerald-500 bg-emerald-500/30 text-emerald-400"
                            : "border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] text-[var(--color-muted)] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]"
                        }`}
                      >
                        {m === "default" ? "[Default]" : "[Edge-Swap]"}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 space-y-1 text-[10px]">
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--color-muted)] shrink-0 w-28">生成盤面のScore閾値（Default 10）</span>
                      <input
                        type="number"
                        min={-1}
                        value={scoreThresholdDraft}
                        onChange={(e) => setScoreThresholdDraft(Number(e.target.value))}
                        className="w-16 px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-surface)_45%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[color-mix(in_srgb,var(--color-text)_88%,var(--color-bg))]"
                      />
                      <button
                        type="button"
                        onClick={() => setScoreThresholdApplied(scoreThresholdDraft)}
                        className="px-2 py-0.5 rounded text-[10px] border border-emerald-500/50 bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/35"
                      >
                        反映
                      </button>
                    </div>
                    <div className="flex gap-3 text-[var(--color-muted)]">
                      <span>生成リトライ回数: {lastAttempts != null ? lastAttempts : "—"}</span>
                      <span>生成所要時間: {lastTotalMs != null ? `${lastTotalMs} ms` : "—"}</span>
                    </div>
                  </div>
                  {debugGenerationMode === "edgeSwap" && (
                    <>
                      <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
                        <button
                          type="button"
                          onClick={() => setEdgeSwapConstantsPanelOpen((o) => !o)}
                          className="flex items-center gap-1 w-full text-left font-semibold text-[var(--color-muted)] text-[10px] py-0.5 hover:text-[var(--color-on-primary)]/90"
                        >
                          <span className="tabular-nums w-3 text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))]">
                            {edgeSwapConstantsPanelOpen ? "▼" : "▶"}
                          </span>
                          Edge Swap定数
                        </button>
                        {edgeSwapConstantsPanelOpen && (
                          <div className="mt-1 space-y-1 pl-1 text-[10px]">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[var(--color-muted)] shrink-0 w-[10.5rem]">目標件数（囲い込み）</span>
                              <input
                                type="range"
                                min={0}
                                max={24}
                                step={1}
                                value={debugTargetEnclosureCount}
                                onChange={(e) => setDebugTargetEnclosureCount(Number(e.target.value))}
                                className="flex-1 max-w-24"
                              />
                              <span className="tabular-nums w-6 text-[var(--color-muted)]">
                                {debugTargetEnclosureCount}
                              </span>
                            </div>
                            {EDGE_SWAP_SCORE_FIELDS.map((f) => (
                              <div key={f.key} className="flex items-center gap-1 flex-wrap">
                                <span className="text-[var(--color-muted)] shrink-0 w-[10.5rem]">{f.label}</span>
                                <input
                                  type="number"
                                  min={f.min}
                                  max={f.max}
                                  step={f.step}
                                  value={edgeSwapScoreDraft[f.key]}
                                  onChange={(e) =>
                                    setEdgeSwapScoreDraft((d) => ({
                                      ...d,
                                      [f.key]: Number(e.target.value),
                                    }))
                                  }
                                  className="w-[4.5rem] px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-surface)_45%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[color-mix(in_srgb,var(--color-text)_88%,var(--color-bg))]"
                                />
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() =>
                                setEdgeSwapScoreApplied(mergeEdgeSwapScoreParams(edgeSwapScoreDraft))
                              }
                              className="mt-1 px-2 py-0.5 rounded text-[10px] border border-emerald-500/50 bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/35"
                            >
                              変更を反映
                            </button>
                            <p className="text-[9px] text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))] leading-snug">
                              隣接率の第3しきい値 0.45 および段階ペナルティ額（200 / 1000 / 5000+）は
                              worker 固定です。
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {isDevTj && (
                  <>
                    <DevDebugUserStats />
                    <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] space-y-1">
                      <div className="font-semibold text-[var(--color-muted)]">進捗同期</div>
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--color-muted)] shrink-0">anon_id:</span>
                        <code
                          className="text-[9px] truncate max-w-[120px] bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] px-1 rounded"
                          title={userSync?.anonId ?? ""}
                        >
                          {userSync?.anonId ?? "—"}
                        </code>
                        <button
                          type="button"
                          onClick={() => userSync?.syncNow()}
                          className="px-1 py-0.5 rounded text-[9px] border border-[color-mix(in_srgb,var(--color-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-bg))] text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))]"
                        >
                          同期
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] space-y-1">
                      <div className="font-semibold text-[var(--color-muted)]">シード（再現用）</div>
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--color-muted)] shrink-0">Current Hash:</span>
                        <code
                          className="text-[9px] truncate max-w-[140px] bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] px-1 rounded"
                          title={currentSeed ?? ""}
                        >
                          {currentSeed ?? "—"}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            if (currentSeed && navigator.clipboard) {
                              navigator.clipboard.writeText(currentSeed);
                            }
                          }}
                          disabled={!currentSeed}
                          className="px-1 py-0.5 rounded text-[9px] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-text)_20%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          コピー
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[var(--color-muted)] shrink-0">Input Hash:</span>
                        <input
                          type="text"
                          value={hashInput}
                          onChange={(e) => setHashInput(e.target.value)}
                          placeholder="ハッシュを入力"
                          className="flex-1 min-w-0 px-1.5 py-0.5 rounded text-[10px] bg-[color-mix(in_srgb,var(--color-surface)_45%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[color-mix(in_srgb,var(--color-text)_88%,var(--color-bg))]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const s = hashInput.trim();
                            if (s) {
                              if (useLegacyMode) {
                                initGame(settingsGridSize, settingsNumPairs, s);
                              } else {
                                initGameByGrade(currentGrade, s);
                              }
                            }
                          }}
                          disabled={!hashInput.trim() || loading}
                          className="px-2 py-0.5 rounded text-[10px] border border-emerald-500/50 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ハッシュから生成
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
                      <button
                        type="button"
                        onClick={() => setLegacyDebugPanelOpen((o) => !o)}
                        className="flex items-center gap-1 w-full text-left font-semibold text-[var(--color-muted)] text-[10px] py-0.5 hover:text-[var(--color-on-primary)]/90"
                      >
                        <span className="tabular-nums w-3 text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))]">
                          {legacyDebugPanelOpen ? "▼" : "▶"}
                        </span>
                        過去の情報（Default 生成・ABC 等）
                      </button>
                      {legacyDebugPanelOpen && (
                        <>
                          <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
                            <div className="font-semibold text-[var(--color-muted)]">評価関数パラメータ</div>
                            <div className="space-y-1 mt-0.5 text-[10px]">
                              <div className="flex items-center gap-1">
                                <span className="text-[var(--color-muted)] shrink-0 w-32">Empty Isolated:</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={20}
                                  step={1}
                                  value={configEmptyIsolatedPenalty}
                                  onChange={(e) => setConfigEmptyIsolatedPenalty(Number(e.target.value))}
                                  className="flex-1"
                                />
                                <span className="tabular-nums w-6">{configEmptyIsolatedPenalty}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[var(--color-muted)] shrink-0 w-32">Detour Weight:</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={5}
                                  step={0.1}
                                  value={configDetourWeight}
                                  onChange={(e) => setConfigDetourWeight(Number(e.target.value))}
                                  className="flex-1"
                                />
                                <span className="tabular-nums w-8">{configDetourWeight.toFixed(1)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[var(--color-muted)] shrink-0 w-32">Base Threshold:</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={1000}
                                  step={10}
                                  value={configBaseThreshold}
                                  onChange={(e) => setConfigBaseThreshold(Number(e.target.value))}
                                  className="flex-1"
                                />
                                <span className="tabular-nums w-10">
                                  {configBaseThreshold === 0 ? "自動" : configBaseThreshold}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
                            <div className="font-semibold text-[var(--color-muted)]">一意解限界調査</div>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <label className="text-[var(--color-muted)] text-[10px] shrink-0">Grid:</label>
                              <input
                                type="number"
                                min={4}
                                max={8}
                                value={debugGridSize}
                                onChange={(e) => {
                                  const v = Math.max(4, Math.min(8, Number(e.target.value) || 6));
                                  setDebugGridSize(v);
                                  const maxP = v >= 7 ? 10 : v;
                                  setDebugNumPairs((p) => Math.min(p, maxP));
                                }}
                                className="w-12 px-1 py-0.5 rounded text-[10px] bg-[color-mix(in_srgb,var(--color-surface)_45%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[color-mix(in_srgb,var(--color-text)_88%,var(--color-bg))]"
                              />
                              <label className="text-[var(--color-muted)] text-[10px] shrink-0">Pairs:</label>
                              <input
                                type="number"
                                min={2}
                                max={debugGridSize >= 7 ? 10 : debugGridSize}
                                value={debugNumPairs}
                                onChange={(e) =>
                                  setDebugNumPairs(
                                    Math.max(
                                      2,
                                      Math.min(
                                        debugGridSize >= 7 ? 10 : debugGridSize,
                                        Number(e.target.value) || 5
                                      )
                                    )
                                  )
                                }
                                className="w-12 px-1 py-0.5 rounded text-[10px] bg-[color-mix(in_srgb,var(--color-surface)_45%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[color-mix(in_srgb,var(--color-text)_88%,var(--color-bg))]"
                              />
                              <button
                                type="button"
                                onClick={runTest10}
                                disabled={test10Running}
                                className="px-2 py-0.5 rounded text-[10px] border border-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {test10Running ? "実行中..." : "Test 10 Runs"}
                              </button>
                            </div>
                            {test10Result && (
                              <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                                <span>成功: {test10Result.success}/10</span>
                                <span className="ml-2">平均: {test10Result.avgMs}ms</span>
                                {test10Result.lastAbc && (
                                  <div className="mt-0.5 text-[color-mix(in_srgb,var(--color-accent)_85%,var(--color-bg))]">
                                    ABC: A={test10Result.lastAbc.detourScore.toFixed(2)} B=
                                    {test10Result.lastAbc.enclosureScore} C=
                                    {test10Result.lastAbc.junctionComplexity.toFixed(2)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="mt-1 pt-1 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)]">
                            <div className="font-semibold text-[var(--color-muted)]">ABC スコア</div>
                            <div className="space-y-0.5 text-[var(--color-muted)]/90">
                              <div>
                                A. 迂回率:{" "}
                                <span className="tabular-nums text-[var(--color-accent)]">
                                  {abcScore ? abcScore.detourScore.toFixed(3) : "—"}
                                </span>
                              </div>
                              <div>
                                B. エンクロージャ:{" "}
                                <span className="tabular-nums text-[var(--color-accent)]">
                                  {abcScore != null ? abcScore.enclosureScore : "—"}
                                </span>
                              </div>
                              <div>
                                C. 分岐複雑性:{" "}
                                <span className="tabular-nums text-[var(--color-accent)]">
                                  {abcScore ? abcScore.junctionComplexity.toFixed(3) : "—"}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={runBatch100}
                              disabled={batch100Running}
                              className="mt-1 px-2 py-0.5 rounded text-[10px] border border-violet-500/50 bg-[var(--color-primary)]/20 text-violet-400 hover:bg-[var(--color-primary)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {batch100Running ? "計測中..." : "100回生成 & 計測"}
                            </button>
                            {batch100Result && (
                              <pre className="mt-1 p-1 rounded bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] text-[9px] text-[var(--color-muted)] whitespace-pre-wrap max-h-24 overflow-y-auto">
                                {batch100Result}
                              </pre>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="mt-2 flex gap-1">
                {([{ label: "PC", value: null }, { label: "Mobile", value: 375 }, { label: "Tablet", value: 768 }] as const).map(
                  ({ label, value }) => (
                    <button
                      key={label}
                      onClick={() => setForcedWidth(value)}
                      className={`px-2 py-0.5 rounded text-[10px] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] transition-colors ${
                        forcedWidth === value ? "bg-emerald-600/80 border-emerald-400" : "bg-[color-mix(in_srgb,var(--color-surface)_45%,var(--color-bg))] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]"
                      }`}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </div>
      )}
      <div
        style={
          forcedWidth != null && isDevTj
            ? { width: `${forcedWidth}px`, margin: "0 auto", maxWidth: "100%" }
            : undefined
        }
      >
        <div className={`${GAME_COLUMN_CLASS} flex min-h-0 flex-1 flex-col lg:max-w-none`}>
          <GamePageHeader
            titleEn="Pair-Link"
            titleJa="ペアリンク"
            breadcrumbs={[
              { label: "ホーム", href: "/" },
              { label: "教材一覧", href: "/#lab-cards" },
              { label: "ペアリンク", href: "/lab/pair-link" },
            ]}
            trailing={
              <>
                <span className="tabular-nums">{formatTime(timeSeconds)}</span>
                {solved && <span className="text-[var(--color-primary)]">{t("games.pairLink.clear")}</span>}
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
                <PairLinkAdSlot slotIndex={1} />
              </div>
            </div>

            <div className="order-1 flex min-h-0 w-full flex-1 flex-col gap-3 lg:order-2 lg:flex-row lg:items-start lg:gap-5">
              <div
                className="relative flex min-h-0 w-full flex-1 flex-col items-stretch lg:min-w-0 lg:max-h-[calc(100dvh-var(--pair-top-ad-reserved)-80px)]"
                style={{ "--pair-top-ad-reserved": `${GAME_TOP_AD_RESERVED_PX}px` } as CSSProperties}
              >
                <section className="relative z-[1] mb-4 w-full flex-1 rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-4 pb-4 pt-0 backdrop-blur sm:px-5 sm:pb-5 sm:pt-0 lg:mb-0 lg:flex lg:min-h-0 lg:flex-col">
                  <div className="flex w-full flex-col items-center lg:min-h-0 lg:flex-1 lg:justify-center">
                    <div className="mb-2 w-full text-sm font-semibold text-[var(--color-text)]">
                      <span>{statusDisplay}</span>
                    </div>
                    <div
                      className="w-full touch-none select-none"
                      style={{ minHeight: canvasSize, WebkitTapHighlightColor: "transparent" }}
                    >
                      <div className="relative mx-auto w-full max-w-[500px] overflow-hidden rounded-xl border-2 border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_85%,var(--color-bg))] shadow-lg lg:max-w-[min(860px,calc(100dvh-var(--pair-top-ad-reserved)-100px))]">
                        <canvas
                          ref={attachCanvasRef}
                          width={canvasSize}
                          height={canvasSize}
                          className="block h-auto w-full cursor-crosshair bg-[color-mix(in_srgb,var(--color-text)_85%,var(--color-bg))] align-top"
                          style={{ touchAction: "none" }}
                          onPointerDown={handlePointerDown}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onPointerLeave={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                        />
                        {tapFx != null && spacing > 0 && canvasSize > 0 && (
                          <PairLinkEndpointTapOverlay
                            key={tapFx.id}
                            tapFx={tapFx}
                            canvasSize={canvasSize}
                            spacing={spacing}
                            tapScaleFactor={tapScaleFactor}
                            rippleMaxScale={tapRippleMaxScale}
                            color={
                              numbers.find((n) => String(n.val) === tapFx.valStr)?.color ?? "#10b981"
                            }
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="order-2 w-full shrink-0 lg:sticky lg:top-5 lg:max-h-[calc(100dvh-20px)] lg:w-[360px] lg:self-start lg:overflow-y-auto">
                <div className="mx-auto mb-2 flex w-full min-w-0 flex-col gap-4 lg:mt-0">
          {useLegacyMode ? (
            <>
              <div className="w-full min-w-0 sm:flex-1 sm:min-w-0">
                <label className="block text-xs text-[var(--color-muted)] mb-1">Grid Size</label>
                <div
                  className="flex w-full min-w-0 overflow-x-auto gap-2 py-1 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:[display:none]"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {[4, 5, 6, 7, 8, 9, 10].map((n) => {
                    const isActive = settingsGridSize === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          setSettingsGridSize(n);
                          const maxP = n >= 7 ? 10 : n;
                          const b = EDGE_SWAP_PAIR_BOUNDS[n];
                          const minP =
                            debugGenerationMode === "edgeSwap" && b
                              ? b.min
                              : Math.max(2, n - 2);
                          setSettingsNumPairs((p) =>
                            Math.min(maxP, Math.max(minP, Math.min(p, maxP)))
                          );
                        }}
                        className={`shrink-0 snap-center whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] touch-manipulation ${
                          isActive
                            ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] border border-[var(--color-primary)]"
                            : "bg-[color-mix(in_srgb,var(--color-text)_78%,var(--color-bg))] text-[var(--color-text)] border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]"
                        }`}
                      >
                        {n}×{n}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="w-full min-w-0 sm:flex-1 sm:min-w-0">
                <label className="block text-xs text-[var(--color-muted)] mb-1">Number of Pairs</label>
                <div
                  className="flex w-full min-w-0 overflow-x-auto gap-2 py-1 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:[display:none]"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {pairCountOptions(settingsGridSize, debugGenerationMode).map((n) => {
                    const clamped = clampPairCount(settingsGridSize, settingsNumPairs, debugGenerationMode);
                    const isActive = clamped === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setSettingsNumPairs(n)}
                        className={`shrink-0 snap-center whitespace-nowrap px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] touch-manipulation ${
                          isActive
                            ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] border border-[var(--color-primary)]"
                            : "bg-[color-mix(in_srgb,var(--color-text)_78%,var(--color-bg))] text-[var(--color-text)] border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]"
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center shrink-0 w-full sm:w-auto">
                <button
                  onClick={() => {
                    refreshAds();
                    initGame(settingsGridSize, settingsNumPairs);
                  }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] text-sm font-medium hover:brightness-95 disabled:opacity-50"
                >
                  {t("games.pairLink.newPuzzleLegacy")}
                </button>
                {isDebugMode && (
                  <button
                    onClick={() =>
                      clearStockForKey(
                        settingsGridSize,
                        clampPairCount(settingsGridSize, settingsNumPairs, debugGenerationMode)
                      )
                    }
                    className="px-4 py-2 rounded-lg bg-[color-mix(in_srgb,var(--color-text)_65%,var(--color-bg))] text-[var(--color-on-primary)] text-sm font-medium hover:brightness-95"
                    title={`${settingsGridSize}×${clampPairCount(settingsGridSize, settingsNumPairs, debugGenerationMode)} のストックを削除（プリフェッチ中もキャンセル）`}
                  >
                    （debug）ストックを削除
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="w-full min-w-0 sm:flex-1 sm:min-w-0">
                <label className="block text-xs text-[var(--color-muted)] mb-1">{t("common.chooseGrade")}</label>
                <div
                  className="flex w-full min-w-0 overflow-x-auto gap-2 py-1 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:[display:none]"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {PAIR_LINK_GRADE_CONSTANTS.map((g) => {
                    const isActive = currentGrade === g.grade;
                    return (
                      <button
                        key={g.grade}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          setCurrentGrade(g.grade);
                          prefetchGrade(g.grade);
                        }}
                        className={`shrink-0 snap-center whitespace-nowrap px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] touch-manipulation ${
                          isActive
                            ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] border border-[var(--color-primary)]"
                            : "bg-[color-mix(in_srgb,var(--color-text)_78%,var(--color-bg))] text-[var(--color-text)] border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]"
                        }`}
                        title={g.theme}
                      >
                        G{g.grade}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="shrink-0 w-full sm:w-auto flex justify-center sm:justify-start">
                <button
                  onClick={() => {
                    refreshAds();
                    initGameByGrade(currentGrade);
                  }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] text-sm font-medium hover:brightness-95 disabled:opacity-50"
                >
                  {t("games.pairLink.nextPuzzle")}
                </button>
              </div>
            </>
          )}
                </div>

                {!useLegacyMode && GRADE_MAP.get(currentGrade) && (
                  <p className="mt-1 w-full px-1 text-center text-xs text-[var(--color-muted)] lg:text-left">
                    {GRADE_MAP.get(currentGrade)!.theme}
                  </p>
                )}

                <div className="mt-1 flex w-full flex-col gap-2 lg:hidden">
                  <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
                      {t("games.skyscraper.rulesTitle")}
                    </summary>
                    <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                      <p className="m-0">{t("games.pairLink.ruleHint")}</p>
                    </div>
                  </details>
                  <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
                      {t("games.reflecShot.accordionControlsSummary")}
                    </summary>
                    <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                      <p className="m-0">タップまたはドラッグで経路を接続</p>
                    </div>
                  </details>
                </div>

                <div className="mt-1 hidden w-full flex-col gap-2 lg:flex">
                  <section className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2">
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("games.skyscraper.rulesTitle")}</h3>
                    <p className="mt-2 m-0 text-xs leading-relaxed text-[var(--color-muted)]">{t("games.pairLink.ruleHint")}</p>
                  </section>
                  <section className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2">
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("games.reflecShot.accordionControlsSummary")}</h3>
                    <p className="mt-2 m-0 text-xs leading-relaxed text-[var(--color-muted)]">タップまたはドラッグで経路を接続</p>
                  </section>
                </div>

                <div
                  className="relative z-0 mt-0 w-full"
                  style={{ minHeight: 100, marginTop: GAME_AD_GAP_BEFORE_SLOT_2_PX }}
                >
                  <PairLinkAdSlot slotIndex={2} />
                </div>
              </aside>
            </div>

            <section className="order-4 mx-auto mt-6 w-full max-w-3xl">
              <GameQuickInfoNote
                goal="論理的推論・先読み計画・ワーキングメモリの強化"
                target="小学生〜大人（推奨: 小学校中学年以上）"
                operation="タップまたはドラッグで経路を接続"
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
              {t("games.pairLink.clearSolved").replace("{time}", formatTime(timeSeconds))}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => setShowClearOverlay(false)}
                className="px-6 py-3 rounded-lg border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_85%,var(--color-bg))] text-[var(--color-text)] font-medium hover:brightness-95 active:scale-95"
              >
                {t("games.pairLink.back")}
              </button>
              <button
                onClick={() => {
                  refreshAds();
                  setShowClearOverlay(false);
                  if (useLegacyMode) {
                    initGame(settingsGridSize, settingsNumPairs);
                  } else {
                    initGameByGrade(currentGrade);
                  }
                }}
                className="px-6 py-3 rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] font-medium hover:brightness-95 active:scale-95"
              >
                {t("games.pairLink.continueNext")}
              </button>
              {isDevTj && (
                <button
                  onClick={() => triggerDebugSolve()}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-sm border border-emerald-500/50 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("games.pairLink.forceClearNew")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
