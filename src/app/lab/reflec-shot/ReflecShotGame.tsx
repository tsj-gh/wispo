"use client";

import confetti from "canvas-confetti";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  applyBumper,
  BUMPER_KIND_BY_SECTOR,
  sectorIndexForDisplayKind,
  swipeToBumperKind,
} from "./bumperRules";
import {
  MAX_STOCK_SIZE,
  REFLECT_SHOT_STOCK_GRADES,
  useReflectShotBoardStock,
} from "@/hooks/useReflectShotBoardStock";
import { useReflectShotWorker } from "@/hooks/useReflectShotWorker";
import { bendOrBumperHint } from "./gridStageGen";
import {
  addCell,
  BUMPER_KINDS,
  cloneGridStageForRestore,
  countBumpersOnSolutionPath,
  gemAwardBumperCellKeys,
  defaultDummyDensityPctForGrade,
  dirsEqual,
  DIR,
  initialWrongDisplayProbabilityForGrade,
  isAgentCell,
  isExclusiveOutsidePadCorridorRow,
  keyCell,
  negateDir,
  parseKey,
  stageColDrawRange,
  stageRowRange,
  unitOrthoDirBetween,
  type BumperKind,
  type CellCoord,
  type Dir,
  type GridStage,
} from "./gridTypes";
import {
  computeRequiredGemCountForStage,
  countExpectedTwoSidedBendsOnIdealPath,
  findCrossCellForNewAgentSegment,
} from "./reflecShotGemRules";
import { decodeReflecStageHash, encodeReflecStageHash, parseReflecHash } from "./reflecShotStageHash";

/**
 * 正解ポリライン上のダミーの `display` を、各通過で `applyBumper(dIn, display) === dOut` になる向きに揃える（スルー含む）。
 * 複数通過で矛盾する場合は先頭 forEach で付けた `solution` のままにする。
 */
function alignDummyBumpersOnSolutionPathForAutoSolve(st: GridStage): void {
  const path = st.solutionPath;
  if (path.length < 3) return;
  for (const [k, bump] of Array.from(st.bumpers.entries())) {
    if (!bump.isDummy) continue;
    let allowed: Set<BumperKind> | null = null;
    for (let i = 1; i < path.length - 1; i++) {
      const cur = path[i]!;
      if (keyCell(cur.c, cur.r) !== k) continue;
      const prev = path[i - 1]!;
      const next = path[i + 1]!;
      const dIn: Dir = { dx: cur.c - prev.c, dy: prev.r - cur.r };
      const dOut: Dir = { dx: next.c - cur.c, dy: cur.r - next.r };
      const visitOk = new Set<BumperKind>();
      for (let ki = 0; ki < BUMPER_KINDS.length; ki++) {
        const kind = BUMPER_KINDS[ki]!;
        if (dirsEqual(applyBumper(dIn, kind), dOut)) visitOk.add(kind);
      }
      if (visitOk.size === 0) {
        allowed = null;
        break;
      }
      if (allowed == null) {
        allowed = visitOk;
      } else {
        const nextAllowed = new Set<BumperKind>();
        for (let ai = 0; ai < BUMPER_KINDS.length; ai++) {
          const bk = BUMPER_KINDS[ai]!;
          if (allowed.has(bk) && visitOk.has(bk)) nextAllowed.add(bk);
        }
        allowed = nextAllowed;
      }
      if (allowed.size === 0) break;
    }
    if (allowed != null && allowed.size > 0) {
      bump.display = BUMPER_KINDS.filter((bk) => allowed!.has(bk))[0]!;
    }
  }
}
import { ReflecShotAdSlot } from "@/components/ReflecShotAdSlots";
import { DebugClearModalBackdropControls } from "@/components/DebugClearModalBackdropControls";
import { clearModalBackdropOverlayStyle, useClearModalBackdropDebugValues } from "@/lib/debugClearModalBackdrop";
import { GamePageHeader } from "@/components/GamePageHeader";
import { refreshAds } from "@/lib/ads";
import {
  GAME_AD_GAP_AFTER_SLOT_1_PX,
  GAME_AD_GAP_BEFORE_SLOT_2_PX,
  GAME_COLUMN_CLASS,
  GAME_TOP_AD_RESERVED_PX,
} from "@/lib/gameLayout";
import { useI18n } from "@/lib/i18n-context";
import { translateReflecStatus } from "@/lib/i18n-runtime-status";
import {
  cellRectPx,
  closestPointOnRectBoundary,
  entryPointOnRect,
  evaluateBumperPassage,
  exitPointOnRect,
  passageDisplayPolyline,
  type Pt,
} from "./trajectoryBumperFit";

/** 1マス移動の基準時間（ms）。実効速度はこれを速度倍率で除算。 */
const BASE_CELL_TRAVEL_MS = 280;

/** 準備タイマー表示（秒の切り捨て、mm:ss） */
function formatPrepDurationMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const mm = m < 100 ? String(m).padStart(2, "0") : String(m);
  return `${mm}:${String(s).padStart(2, "0")}`;
}
/** タップ扱いにする最大移動（px²）。これ未満なら devtj でもスワイプ確定にしない */
const TAP_MAX_SQ = 20 * 20;
/** devtj: これ以上動いたら「一筆スワイプ」扱い（単セルでも強制向き可） */
const DEV_SWIPE_MIN_SQ = 28 * 28;
/** セル境界跨ぎで採用する移動ベクトルの最小ノルム²（px²） */
const ENTRY_VEC_MIN_SQ = 2.5 * 2.5;
/** マス内バンパー記号（／＼－｜）のフォントサイズ = cellPx × この比率（従来 0.42 を 2 倍） */
const BUMPER_GLYPH_SIZE_RATIO = 0.84;
/** 軌跡確定時のマス強調＆P→Q 軌跡フェードの長さ（ms）。準備中バンパー向き確定／十字通過フラッシュと同じ尺 */
const TRAJECTORY_BUMPER_FLASH_MS = 400;
/** デバッグ正解経路と射出中軌跡の線幅（同一） */
const SOLUTION_PATH_LINE_WIDTH = 1.5;
/** 射出軌跡・バンパー反射頂点の光ドット（キャンバス座標系） */
const TRAJECTORY_VERTEX_DOT_R = 2.5;
const TRAJECTORY_VERTEX_DOT_R_SOLUTION = 3.35;
const TRAJECTORY_VERTEX_DOT_BASE_OPACITY = 0.82;
const TRAJECTORY_VERTEX_DOT_FADE_MS = 240;
/** 射出軌跡の折れ点を二次ベジエで丸めるときの曲率半径（px） */
const TRAJECTORY_CORNER_RADIUS_PX = 5;
const TRAJECTORY_CORNER_RADIUS_MIN = 3;
/** デバッグスライダー上限・曲線描画のクランプ上限 */
const TRAJECTORY_CORNER_RADIUS_MAX = 7.5;
/**
 * 連続セグメントの単位ベクトル内積がこれ未満なら折れとみなす（1 に近いほど直線扱いで長く保つ）
 */
const TRAJECTORY_STRAIGHT_CONTINUE_DOT = 0.994;

type TrajectoryDrawStyle = "curved" | "vertexDots";

/** サンプル列から折れ点インデックスのみ抜き出す（直線区間は両端のみ） */
function shotTrailCornerIndices(pts: readonly { x: number; y: number }[], straightDotMin: number): number[] {
  const n = pts.length;
  if (n < 2) return n === 1 ? [0] : [];
  const out: number[] = [0];
  for (let i = 2; i < n; i++) {
    const ax = pts[i - 1]!.x - pts[i - 2]!.x;
    const ay = pts[i - 1]!.y - pts[i - 2]!.y;
    const bx = pts[i]!.x - pts[i - 1]!.x;
    const by = pts[i]!.y - pts[i - 1]!.y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la < 1e-4 || lb < 1e-4) continue;
    const dot = (ax * bx + ay * by) / (la * lb);
    if (dot < straightDotMin) out.push(i - 1);
  }
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

/**
 * 折れ点を制御点とする二次ベジエで繋ぐ（キャンバス＝SVG の Q と同型）。
 * 直線区間は従来どおり L に相当する直線になる。
 */
function canvasPathRoundedShotTrail(
  ctx: CanvasRenderingContext2D,
  pts: readonly { x: number; y: number }[],
  cornerRadius: number,
  straightDotMin: number
): void {
  if (pts.length < 2) return;
  const idx = shotTrailCornerIndices(pts, straightDotMin);
  if (idx.length < 2) return;
  const K = idx.map((j) => pts[j]!);
  const m = K.length;
  const R = Math.max(
    TRAJECTORY_CORNER_RADIUS_MIN,
    Math.min(TRAJECTORY_CORNER_RADIUS_MAX, cornerRadius)
  );
  ctx.moveTo(K[0]!.x, K[0]!.y);
  if (m === 2) {
    ctx.lineTo(K[1]!.x, K[1]!.y);
    return;
  }
  for (let k = 1; k <= m - 2; k++) {
    const p0 = K[k - 1]!;
    const V = K[k]!;
    const p1 = K[k + 1]!;
    const uInX = V.x - p0.x;
    const uInY = V.y - p0.y;
    const uOutX = p1.x - V.x;
    const uOutY = p1.y - V.y;
    const L1 = Math.hypot(uInX, uInY);
    const L2 = Math.hypot(uOutX, uOutY);
    if (L1 < 1e-6 || L2 < 1e-6) {
      ctx.lineTo(V.x, V.y);
      continue;
    }
    const nInX = uInX / L1;
    const nInY = uInY / L1;
    const nOutX = uOutX / L2;
    const nOutY = uOutY / L2;
    const dotCl = Math.max(-1, Math.min(1, nInX * nOutX + nInY * nOutY));
    const angle = Math.acos(dotCl);
    if (angle < 1e-3) {
      ctx.lineTo(V.x, V.y);
      continue;
    }
    const tanHalf = Math.tan(angle / 2);
    const offset = Math.min(R / tanHalf, L1 * 0.48, L2 * 0.48);
    const T1x = V.x - nInX * offset;
    const T1y = V.y - nInY * offset;
    const T2x = V.x + nOutX * offset;
    const T2y = V.y + nOutY * offset;
    ctx.lineTo(T1x, T1y);
    ctx.quadraticCurveTo(V.x, V.y, T2x, T2y);
  }
  ctx.lineTo(K[m - 1]!.x, K[m - 1]!.y);
}

const MAX_GEM_PARTICLES = 80;
const GEM_BURST_N = 9;
/** 十字路形成瞬間の宝石バースト（1個獲得時） */
const GEM_BURST_CROSS_INSTANT_N = 14;
const GEM_BURST_TWO_SIDED_N = 32;
const GEM_PARTICLE_TTL_MS = 520;
const GOAL_SPARKLE_TTL_MS = 720;
const WALL_SPARKLE_TTL_MS = 520;
/** 宝石吸引の基準係数（`debugGemAttractMult` と掛け合わせる） */
const BASE_GEM_ATTRACT = 0.0028;
const DEFAULT_GEM_ATTRACT_MULT = 5;
const DEFAULT_WALL_FX_MS = 500;
const DEFAULT_GOAL_FX_MS = 150;
const DEFAULT_BALL_SPEED_MULT = 2.5;

type GemParticle = { x: number; y: number; vx: number; vy: number; born: number };
type GoalSparkle = { x: number; y: number; vx: number; vy: number; born: number };
type WallSparkle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  /** 再訪両面ヒット時の赤火花（未指定は壁ヒット火花） */
  kind?: "red";
};

type ArrivalResult =
  | { kind: "goal" }
  | { kind: "continue"; next: CellCoord; outDir: Dir }
  | { kind: "lost"; wallDir: Dir };

type FinishAnim =
  | {
      kind: "wallFx";
      t0: number;
      cell: CellCoord;
      wallDir: Dir;
      didSpawnWallSparks: boolean;
    }
  | { kind: "goalFx"; t0: number; cell: CellCoord };

function pushGemBurst(arr: GemParticle[], cx: number, cy: number, now: number, count: number = GEM_BURST_N) {
  const n = Math.max(1, Math.floor(count));
  for (let i = 0; i < n; i++) {
    if (arr.length >= MAX_GEM_PARTICLES) arr.shift();
    const ang = Math.random() * Math.PI * 2;
    const sp = 1.15 + Math.random() * 2.85;
    arr.push({
      x: cx + (Math.random() - 0.5) * 5,
      y: cy + (Math.random() - 0.5) * 5,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      born: now,
    });
  }
}

function pushGoalSparkles(arr: GoalSparkle[], cx: number, cy: number, now: number) {
  for (let i = 0; i < 14; i++) {
    if (arr.length > 36) arr.shift();
    const ang = Math.random() * Math.PI * 2;
    const sp = 0.35 + Math.random() * 1.65;
    arr.push({
      x: cx + (Math.random() - 0.5) * 7,
      y: cy + (Math.random() - 0.5) * 7,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      born: now,
    });
  }
}

function pushWallSparks(arr: WallSparkle[], wx: number, wy: number, now: number) {
  for (let i = 0; i < 18; i++) {
    if (arr.length > 56) arr.shift();
    const ang = Math.random() * Math.PI * 2;
    const sp = 1.1 + Math.random() * 3.4;
    arr.push({
      x: wx + (Math.random() - 0.5) * 5,
      y: wy + (Math.random() - 0.5) * 5,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      born: now,
    });
  }
}

/** 再訪折れ点・両面ヒット: バンパー中心から赤系火花 */
function pushTwoSidedRedSparks(arr: WallSparkle[], cx: number, cy: number, now: number) {
  for (let i = 0; i < 26; i++) {
    if (arr.length > 72) arr.shift();
    const ang = Math.random() * Math.PI * 2;
    const sp = 1.8 + Math.random() * 4.2;
    arr.push({
      x: cx + (Math.random() - 0.5) * 4,
      y: cy + (Math.random() - 0.5) * 4,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      born: now,
      kind: "red",
    });
  }
}

/** 画面 `Dir`（y 上向き正）→ キャンバス増分（y 下向き正） */
function screenDirToPixelUnit(d: Dir): { px: number; py: number } {
  return { px: d.dx, py: -d.dy };
}

function wallFxBallKinematics(
  cellPx: number,
  ox: number,
  oy: number,
  rMin: number,
  cMin: number,
  cell: CellCoord,
  wallDir: Dir,
  rad: number,
  t01: number
): { x: number; y: number; tailDx: number; tailDy: number; tailActive: boolean } {
  const cx = ox + (cell.c - cMin) * cellPx + cellPx / 2;
  const cy = oy + (cell.r - rMin) * cellPx + cellPx / 2;
  const { px, py } = screenDirToPixelUnit(wallDir);
  const half = Math.max(2, cellPx / 2 - rad - 1.5);
  const wx = cx + px * half;
  const wy = cy + py * half;
  const approachEnd = 0.38;
  if (t01 < approachEnd) {
    const u = t01 / approachEnd;
    const e = 1 - (1 - u) ** 3;
    return {
      x: cx + (wx - cx) * e,
      y: cy + (wy - cy) * e,
      tailDx: wx - cx,
      tailDy: wy - cy,
      tailActive: true,
    };
  }
  const v = (t01 - approachEnd) / (1 - approachEnd);
  const bump = Math.sin(v * Math.PI) * (half * 0.24) * (1 - v * 0.45);
  return {
    x: wx - px * bump,
    y: wy - py * bump,
    tailDx: -px,
    tailDy: -py,
    tailActive: true,
  };
}

function drawLightDrop(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  rad: number,
  moveDx: number,
  moveDy: number,
  tailScale: number
) {
  const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, rad * 1.1);
  g.addColorStop(0, "rgba(255,255,255,0.97)");
  g.addColorStop(0.28, "rgba(224, 242, 254, 0.78)");
  g.addColorStop(0.55, "rgba(56, 189, 248, 0.38)");
  g.addColorStop(1, "rgba(14, 165, 233, 0.04)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ax, ay, rad, 0, Math.PI * 2);
  ctx.fill();

  const len = Math.hypot(moveDx, moveDy);
  if (len > 0.4 && tailScale > 0) {
    const nx = moveDx / len;
    const ny = moveDy / len;
    const tLen = Math.min(rad * 2.4, 18) * tailScale;
    const tx = -nx * tLen;
    const ty = -ny * tLen;
    const lg = ctx.createLinearGradient(ax + tx, ay + ty, ax, ay);
    lg.addColorStop(0, "rgba(14, 165, 233, 0)");
    lg.addColorStop(0.45, "rgba(125, 211, 252, 0.4)");
    lg.addColorStop(1, "rgba(255,255,255,0.55)");
    ctx.strokeStyle = lg;
    ctx.lineWidth = Math.max(2.2, rad * 0.48);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ax + tx, ay + ty);
    ctx.lineTo(ax - nx * rad * 0.32, ay - ny * rad * 0.32);
    ctx.stroke();
  }
}

/** 編集時 StartPad 上の射出体：軽いブルームときらめき（掴んで動かせそうな手がかり） */
function drawEditPadProjectileBloom(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  rad: number,
  nowMs: number
) {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.0038);
  const tw = 0.5 + 0.5 * Math.sin(nowMs * 0.0065 + 1.1);
  const glint = 0.5 + 0.5 * Math.sin(nowMs * 0.011);
  ctx.save();
  const outerR = rad * (1.175 + pulse * 0.2);
  const halo = ctx.createRadialGradient(ax, ay, rad * 0.075, ax, ay, outerR);
  halo.addColorStop(0, "rgba(255,255,255,0)");
  halo.addColorStop(0.5, `rgba(125, 211, 252, ${0.1 + tw * 0.1})`);
  halo.addColorStop(0.82, `rgba(56, 189, 248, ${0.14 + pulse * 0.12})`);
  halo.addColorStop(1, "rgba(14, 165, 233, 0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(ax, ay, outerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowColor = `rgba(224, 242, 254, ${0.28 + pulse * 0.22})`;
  ctx.shadowBlur = 2.5 + pulse * 4.5 + tw * 2;
  ctx.fillStyle = `rgba(255,255,255,${0.045 + glint * 0.035})`;
  ctx.beginPath();
  ctx.arc(ax + Math.sin(nowMs * 0.009) * rad * 0.03, ay + Math.cos(nowMs * 0.008) * rad * 0.025, rad * 0.575, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 待機中の射出体：画面上向きの起動ヒント矢印（わずかにアニメーション） */
function drawLaunchUpArrow(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  rad: number,
  nowMs: number
) {
  const bob = Math.sin(nowMs * 0.0065) * (rad * 0.11);
  const pulse = 0.52 + 0.48 * Math.sin(nowMs * 0.0042);
  const shaftLen = rad * 2.05;
  const tipY = by - rad * 1.02 - shaftLen + bob;
  const baseY = by - rad * 0.82 + bob;
  ctx.save();
  ctx.strokeStyle = `rgba(165, 230, 255, ${0.78 * pulse})`;
  ctx.lineWidth = Math.max(2, rad * 0.2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = `rgba(56, 189, 248, ${0.42 * pulse})`;
  ctx.shadowBlur = 3 + pulse * 6;
  ctx.beginPath();
  ctx.moveTo(bx, baseY);
  ctx.lineTo(bx, tipY + rad * 0.32);
  ctx.stroke();
  const head = rad * 0.42;
  ctx.beginPath();
  ctx.moveTo(bx, tipY);
  ctx.lineTo(bx - head, tipY + head * 1.12);
  ctx.lineTo(bx + head, tipY + head * 1.12);
  ctx.closePath();
  ctx.fillStyle = `rgba(224, 249, 255, ${0.88 * pulse})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(125, 211, 252, ${0.9 * pulse})`;
  ctx.lineWidth = Math.max(1.2, rad * 0.1);
  ctx.stroke();
  ctx.restore();
}

/** ゴール到達時の虹色グロー（`elapsedMs` で色相が流れる） */
function drawLightDropRainbow(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  rad: number,
  elapsedMs: number
) {
  const hue0 = (elapsedMs * 0.14) % 360;
  const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, rad * 1.25);
  g.addColorStop(0, "rgba(255,255,255,0.98)");
  g.addColorStop(0.22, `hsla(${hue0}, 95%, 78%, 0.88)`);
  g.addColorStop(0.48, `hsla(${(hue0 + 55) % 360}, 90%, 62%, 0.55)`);
  g.addColorStop(0.78, `hsla(${(hue0 + 120) % 360}, 85%, 52%, 0.28)`);
  g.addColorStop(1, `hsla(${(hue0 + 200) % 360}, 80%, 45%, 0.06)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ax, ay, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = `hsla(${(hue0 + 40) % 360}, 100%, 70%, 0.55)`;
  ctx.shadowBlur = 10 + 6 * Math.sin(elapsedMs * 0.018);
  ctx.strokeStyle = `hsla(${(hue0 + 80) % 360}, 90%, 75%, 0.65)`;
  ctx.lineWidth = Math.max(1.5, rad * 0.2);
  ctx.beginPath();
  ctx.arc(ax, ay, rad * 0.92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

type Phase = "edit" | "move" | "wallFx" | "goalFx" | "won" | "lost";

type BoardSurfaceSource = "stock" | "generated";

function shotEntryDir(st: GridStage): Dir {
  return unitOrthoDirBetween(st.startPad, st.start) ?? DIR.D;
}

function pathableAt(st: GridStage, c: number, r: number) {
  if (c < 0 || r < 0 || c >= st.width || r >= st.height) return false;
  return st.pathable[c]![r]!;
}

function cellCenterPx(
  c: number,
  r: number,
  cellPx: number,
  ox: number,
  oy: number,
  rMin: number,
  cMin: number
) {
  const yRow = r - rMin;
  return {
    x: ox + (c - cMin) * cellPx + cellPx / 2,
    y: oy + yRow * cellPx + cellPx / 2,
  };
}

function boardPixelLayout(st: GridStage, wPx: number, hPx: number) {
  const { rMin, rMax } = stageRowRange(st);
  const nRows = rMax - rMin + 1;
  const { cMin, cMax } = stageColDrawRange(st);
  const nCols = cMax - cMin + 1;
  const cellPx = Math.max(
    24,
    Math.floor(Math.min(wPx / nCols, hPx / nRows) * 0.92)
  );
  const gw = cellPx * nCols;
  const gh = cellPx * nRows;
  const ox = (wPx - gw) / 2;
  const oy = (hPx - gh) / 2;
  return { cellPx, ox, oy, rMin, cMin, cMax, gw, gh, nCols };
}

/** `draw` 前のポインタ用に、`draw` と同じ式でレイアウトを推定する */
function computeBoardLayout(st: GridStage, wPx: number, hPx: number) {
  const L = boardPixelLayout(st, wPx, hPx);
  return { cellPx: L.cellPx, ox: L.ox, oy: L.oy, rMin: L.rMin, cMin: L.cMin, nCols: L.nCols };
}

type BoardLayoutMetrics = {
  cellPx: number;
  ox: number;
  oy: number;
  rMin: number;
  cMin: number;
  nCols: number;
};

function startPadPixelRect(st: GridStage, layout: BoardLayoutMetrics) {
  const c = st.startPad.c;
  const r = st.startPad.r;
  const left = layout.ox + (c - layout.cMin) * layout.cellPx;
  const top = layout.oy + (r - layout.rMin) * layout.cellPx;
  return { left, top, right: left + layout.cellPx, bottom: top + layout.cellPx };
}

function pointInStartPadPixel(px: number, py: number, st: GridStage, layout: BoardLayoutMetrics) {
  const pr = startPadPixelRect(st, layout);
  return px >= pr.left && px <= pr.right && py >= pr.top && py <= pr.bottom;
}

/** 描画グリッド外周＋1マスぶんのマージン（背景）から軌跡開始を許可 */
function pointInTrajectoryStartMargin(
  px: number,
  py: number,
  st: GridStage,
  layout: BoardLayoutMetrics
) {
  const { rMin, rMax } = stageRowRange(st);
  const nRows = rMax - rMin + 1;
  const gw = layout.cellPx * layout.nCols;
  const gh = layout.cellPx * nRows;
  const m = layout.cellPx;
  const left = layout.ox - m;
  const top = layout.oy - m;
  const right = layout.ox + gw + m;
  const bottom = layout.oy + gh + m;
  return px >= left && px <= right && py >= top && py <= bottom;
}

function clampBallCenterInStartPad(
  cx: number,
  cy: number,
  st: GridStage,
  layout: BoardLayoutMetrics,
  rad: number
) {
  const pr = startPadPixelRect(st, layout);
  const minX = pr.left + rad + 0.5;
  const maxX = pr.right - rad - 0.5;
  const minY = pr.top + rad + 0.5;
  const maxY = pr.bottom - rad - 0.5;
  return {
    x: Math.min(maxX, Math.max(minX, cx)),
    y: Math.min(maxY, Math.max(minY, cy)),
  };
}

/** Pres-Sure Judge 在庫のダブルタップ相当 */
const START_PAD_DOUBLE_TAP_DT_MS = 350;
const START_PAD_DOUBLE_TAP_DIST_SQ = 28 * 28;

/** 辺の欠け長 = (マス1辺 + 射出体直径) / 2 付近にクランプ */
function portalGapLengthPx(cellPx: number) {
  const diam = 2 * Math.max(6, cellPx * 0.22);
  const mid = (cellPx + diam) / 2;
  return Math.min(cellPx * 0.92, Math.max(mid, diam * 1.05));
}

/**
 * マス四辺すべてで線を中央付近で分断し、欠けに fillColor（マス背景と同色）を塗る
 */
function drawCellGappedBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  fillColor: string,
  openLen: number
) {
  const g = Math.min(openLen, s * 0.92);
  const midX = x + s / 2;
  const midY = y + s / 2;
  const loX = midX - g / 2;
  const hiX = midX + g / 2;
  const loY = midY - g / 2;
  const hiY = midY + g / 2;
  const stripeW = 3.5;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(loX, y);
  ctx.moveTo(hiX, y);
  ctx.lineTo(x + s, y);
  ctx.stroke();
  ctx.fillStyle = fillColor;
  ctx.fillRect(loX, y - stripeW / 2, hiX - loX, stripeW);

  ctx.beginPath();
  ctx.moveTo(x, y + s);
  ctx.lineTo(loX, y + s);
  ctx.moveTo(hiX, y + s);
  ctx.lineTo(x + s, y + s);
  ctx.stroke();
  ctx.fillStyle = fillColor;
  ctx.fillRect(loX, y + s - stripeW / 2, hiX - loX, stripeW);

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, loY);
  ctx.moveTo(x, hiY);
  ctx.lineTo(x, y + s);
  ctx.stroke();
  ctx.fillStyle = fillColor;
  ctx.fillRect(x - stripeW / 2, loY, stripeW, hiY - loY);

  ctx.beginPath();
  ctx.moveTo(x + s, y);
  ctx.lineTo(x + s, loY);
  ctx.moveTo(x + s, hiY);
  ctx.lineTo(x + s, y + s);
  ctx.stroke();
  ctx.fillStyle = fillColor;
  ctx.fillRect(x + s - stripeW / 2, loY, stripeW, hiY - loY);
}

/**
 * Worker に渡す生成オプション。`consumerGrade` は盤として再生産する Grade（1〜7）で、
 * UI のドロップダウン値に依存させない（rs2 パース結果などと一致させる）。
 * `dummyDensityPct` は常に含む（本番は `defaultDummyDensityPctForGrade`、devtj+DEBUG はスライダー値）。
 */
function reflectShotWorkerGenOptsForConsumerGrade(
  consumerGrade: number,
  isDevTj: boolean,
  isDebugMode: boolean,
  debugGrade2Bend6MidSlider: number,
  debugLv4GenMode: "default" | "rFirst" | "rSecond",
  debugDummyDensityPct: number
): {
  grade2Bend6TotalBends?: 6 | 7 | 8;
  debugReflecShotConsole?: boolean;
  lv4GenMode?: "default" | "rFirst" | "rSecond";
  dummyDensityPct?: number;
} | undefined {
  const o: {
    grade2Bend6TotalBends?: 6 | 7 | 8;
    debugReflecShotConsole?: boolean;
    lv4GenMode?: "default" | "rFirst" | "rSecond";
    dummyDensityPct?: number;
  } = {};
  if (consumerGrade === 4 && isDevTj && isDebugMode) {
    const n = debugGrade2Bend6MidSlider + 4;
    o.grade2Bend6TotalBends = n === 6 || n === 7 || n === 8 ? n : 7;
  }
  if (consumerGrade === 5) {
    if (isDevTj && isDebugMode) {
      if (debugLv4GenMode === "rFirst") o.lv4GenMode = "rFirst";
      else if (debugLv4GenMode === "default") o.lv4GenMode = "default";
      else o.lv4GenMode = "rSecond";
    } else {
      o.lv4GenMode = "rSecond";
    }
  }
  const dummyPct =
    isDevTj && isDebugMode
      ? Math.max(0, Math.min(100, debugDummyDensityPct))
      : defaultDummyDensityPctForGrade(consumerGrade);
  o.dummyDensityPct = dummyPct;
  if (isDevTj && isDebugMode) {
    o.debugReflecShotConsole = true;
  }
  return Object.keys(o).length ? o : undefined;
}

function bumperSymbol(k: BumperKind): string {
  switch (k) {
    case "SLASH":
      return "／";
    case "BACKSLASH":
      return "＼";
    case "HYPHEN":
      return "－";
    case "PIPE":
      return "｜";
    default:
      return "?";
  }
}

export default function ReflecShotGame() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const isDevTj = searchParams.get("devtj") === "true";
  const clearModalBackdropDebug = useClearModalBackdropDebugValues();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topAdRef = useRef<HTMLDivElement>(null);
  const [grade, setGrade] = useState(1);
  const [seed, setSeed] = useState(() => (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
  const [stage, setStage] = useState<GridStage | null>(null);
  const [phase, setPhase] = useState<Phase>("edit");
  const [statusMsg, setStatusMsg] = useState("");
  const statusMsgDisplay = useMemo(() => translateReflecStatus(statusMsg, t), [statusMsg, t]);
  const [showWinOverlay, setShowWinOverlay] = useState(false);
  const [showFailOverlay, setShowFailOverlay] = useState(false);
  const [bumperTick, setBumperTick] = useState(0);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [debugViewportPreset, setDebugViewportPreset] = useState<"pc" | "tablet" | "mobile">("pc");
  const [showSolutionPath, setShowSolutionPath] = useState(false);
  /** devtj+DEBUG のみ UI から変更。本番は常に curved（案2） */
  const [trajectoryStyle, setTrajectoryStyle] = useState<TrajectoryDrawStyle>("curved");
  /** devtj+DEBUG: 案2（丸み軌跡）の折れ点丸め半径（px） */
  const [debugTrajectoryCornerRadiusPx, setDebugTrajectoryCornerRadiusPx] = useState(
    TRAJECTORY_CORNER_RADIUS_PX
  );
  const activeTrajectoryStyle = useMemo((): TrajectoryDrawStyle => {
    if (isDevTj && isDebugMode) return trajectoryStyle;
    return "curved";
  }, [isDevTj, isDebugMode, trajectoryStyle]);
  const activeTrajectoryCornerRadiusPx = useMemo(() => {
    if (isDevTj && isDebugMode) {
      return Math.max(
        TRAJECTORY_CORNER_RADIUS_MIN,
        Math.min(TRAJECTORY_CORNER_RADIUS_MAX, debugTrajectoryCornerRadiusPx)
      );
    }
    return TRAJECTORY_CORNER_RADIUS_PX;
  }, [debugTrajectoryCornerRadiusPx, isDebugMode, isDevTj]);
  /** デバッグ時のみスライダーで変更。非デバッグ・非 devtj 時は TRAJECTORY_CORNER_RADIUS_PX 固定。 */
  const [debugBallSpeedMult, setDebugBallSpeedMult] = useState(DEFAULT_BALL_SPEED_MULT);
  /** 宝石パーティクル吸引: `BASE_GEM_ATTRACT` に掛ける倍率 */
  const [debugGemAttractMult, setDebugGemAttractMult] = useState(DEFAULT_GEM_ATTRACT_MULT);
  /** 壁衝突〜失敗オーバーレイまでの演出時間（ms） */
  const [debugWallFxMs, setDebugWallFxMs] = useState(DEFAULT_WALL_FX_MS);
  /** ゴール虹演出〜成功オーバーレイまでの時間（ms） */
  const [debugGoalFxMs, setDebugGoalFxMs] = useState(DEFAULT_GOAL_FX_MS);
  /** devtj+DEBUG: ダミー密度スライダー。グレード変更時は当該グレードの既定へ同期 */
  const [debugDummyDensityPct, setDebugDummyDensityPct] = useState(() => defaultDummyDensityPctForGrade(1));
  useEffect(() => {
    setDebugDummyDensityPct(defaultDummyDensityPctForGrade(grade));
  }, [grade]);
  /** devtj+DEBUG ON・G2 のみ Worker に渡す。2〜4 → 全体目標折れ 6〜8（`+4`）。 */
  const [debugGrade2Bend6MidSlider, setDebugGrade2Bend6MidSlider] = useState(3);
  /** devtj+DEBUG ON・Grade5+: Lv.4 生成。既定は R-Second（本番 Grade5 も同様）。 */
  const [debugLv4GenMode, setDebugLv4GenMode] = useState<"default" | "rFirst" | "rSecond">("rSecond");
  /** devtj 軌跡判定: 弧長上限 = 対角線 × この倍率（既定 1.3） */
  const [debugTjMaxArcFactor, setDebugTjMaxArcFactor] = useState(1.3);
  /** devtj+DEBUG: 十字通過フラッシュの腕の基準長 = cellPx×(pct/100)（脈動で最大2倍近く） */
  const [debugCrossFlashArmPct, setDebugCrossFlashArmPct] = useState(60);
  const [tjTrajectoryDebug, setTjTrajectoryDebug] = useState<{
    cellKey: string;
    rejected?: "same-corner" | "arc-too-long";
    picked?: BumperKind;
    meanDists: Partial<Record<BumperKind, number>>;
    similarities: Partial<Record<BumperKind, number>>;
    arcLen?: number;
    maxArcLimit?: number;
  } | null>(null);
  const [hashInput, setHashInput] = useState("");
  const [layoutNonce, setLayoutNonce] = useState(0);
  const [stockPrefetchPaused, setStockPrefetchPaused] = useState(false);
  const nextBoardSourceRef = useRef<BoardSurfaceSource | null>(null);
  const [boardDisplaySource, setBoardDisplaySource] = useState<BoardSurfaceSource | null>(null);
  const pendingRestoreRef = useRef<GridStage | null>(null);
  /**
   * rs2 ハッシュの Worker 非同期生成の入り重なり用（複数クリック時は完了ごとにデクリメント）。
   * >0 のあいだメイン effect はストック／seed 再生成をスキップする。
   */
  const hashRs2GenerationInFlightCountRef = useRef(0);
  /** デバッグパネル「Previous:」用：直前に確定していた grade・seed（初回は null） */
  const debugPrevBoardRef = useRef<{ grade: number; seed: number } | null>(null);
  const [debugPreviousBoard, setDebugPreviousBoard] = useState<{ grade: number; seed: number } | null>(
    null
  );
  const { generate: generateStageInWorker, isGenerating, lastMetrics } = useReflectShotWorker();
  const { stockCounts, takeBoardForGrade } = useReflectShotBoardStock(
    generateStageInWorker,
    !stockPrefetchPaused
  );
  const [boardLoadWait, setBoardLoadWait] = useState(false);
  /** 盤面キー変更・やり直しのたびに増やし、編集フェーズの準備タイマーを 0 から再開する */
  const [prepSessionNonce, setPrepSessionNonce] = useState(0);
  const [prepMs, setPrepMs] = useState(0);
  const lastStagePrepKeyRef = useRef<string>("");

  const requiredGemsRef = useRef(1);
  const collectedGemsRef = useRef(0);
  const gemParticlesRef = useRef<GemParticle[]>([]);
  /** Grade3+: 射出体のセル間移動履歴（十字路判定） */
  const pathSegHistoryRef = useRef<{ a: CellCoord; b: CellCoord }[]>([]);
  /** 現在セグメントで十字宝石を既に付与したか（マス中央通過またはセグメント終端で一度だけ） */
  const crossGemAwardedThisSegRef = useRef(false);
  /** Grade3+: 再訪十字（直進×2・進入直交）の検出用。キーはマス */
  const revisitCrossCellStateRef = useRef<
    Map<
      string,
      {
        visitCount: number;
        firstEntry?: { dc: number; dr: number };
        firstStraight?: boolean;
        awarded: boolean;
        invalidated: boolean;
      }
    >
  >(new Map());
  /** 十字路形成時の交差マスにオレンジ十字フラッシュ */
  const crossFlashRef = useRef<{ c: number; r: number; t0: number } | null>(null);
  /** 射出中の軌跡（盤面 px）。編集フェーズでは空 */
  const moveShotTrailRef = useRef<{ x: number; y: number }[]>([]);
  /** 射出中: バンパーで進行方向が変わったマス（StartPad/GoalPad 除外・直進スルー除外）。SVG `<g>` で描画 */
  const [trajectoryVertexDots, setTrajectoryVertexDots] = useState<
    { c: number; r: number; born: number; isSolutionBumper: boolean }[]
  >([]);
  /** Grade5+: 折れ点バンパーへの初回入射方向 */
  const bumperIncomingFirstRef = useRef<Map<string, Dir>>(new Map());
  const twoSidedBumperUsedRef = useRef<Set<string>>(new Set());
  const goalSparklesRef = useRef<GoalSparkle[]>([]);
  /** 条件達成時の演出用タイムスタンプ */
  const goalUnlockPulseRef = useRef(0);
  const finishAnimRef = useRef<FinishAnim | null>(null);
  const wallSparklesRef = useRef<WallSparkle[]>([]);
  /** 失敗確定後も壁ヒット最終姿勢を描画する（リサイズ時は毎フレーム再計算） */
  const lostBallAnimRef = useRef<{ cell: CellCoord; wallDir: Dir } | null>(null);

  const [requiredGems, setRequiredGems] = useState(1);
  const [collectedGems, setCollectedGems] = useState(0);
  const [gemGoalFail, setGemGoalFail] = useState(false);
  /** StartPad 上でタップ／ドラッグしたら上向き矢印を消す。盤面が変わると再表示 */
  const [launchArrowDismissed, setLaunchArrowDismissed] = useState(false);

  const solutionGemBumperKeys = useMemo(
    () => (stage ? gemAwardBumperCellKeys(stage) : new Set<string>()),
    [stage]
  );

  const simRef = useRef({
    logicalCell: { c: 0, r: 0 } as CellCoord,
    travelDir: DIR.D as Dir,
    fromCell: { c: 0, r: 0 } as CellCoord,
    toCell: { c: 0, r: 0 } as CellCoord,
    lerp01: 0,
    leftStart: false,
    /** StartPad→最初のマスへの1セグメント目の描画起点（盤面 px）。キーフレーム完了で null */
    padLaunchPx: null as { x: number; y: number } | null,
  });

  /** 編集時の射出体中心（盤面 px）。null なら StartPad セル中心 */
  const editBallPadRef = useRef<{ x: number; y: number } | null>(null);
  const startPadDragRef = useRef<{
    pointerId: number;
    startPx: number;
    startPy: number;
    startBallX: number;
    startBallY: number;
  } | null>(null);
  const lastStartPadTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  type ActiveGesture = {
    pointerId: number;
    startX: number;
    startY: number;
    prevX: number;
    prevY: number;
    lastX: number;
    lastY: number;
    maxDistSq: number;
    /** null = 盤外（pathable 外）から開始した devtj ジェスチャー */
    downCellKey: string | null;
    downOnBumper: boolean;
    /** 直前にいた pathable マス（盤外は null）。退出時にここを判定する */
    lastPathableKey: string | null;
    /** バンパーマスごとの入口 P とマス内軌跡サンプル */
    passages: Map<string, { p: Pt; samples: Pt[]; c: number; r: number }>;
    orderedBumperKeys: string[];
    /** devtj: pointermove で既に向きを書き込んだマス（pointerup で二重適用しない） */
    devtjLiveAppliedKeys: Set<string>;
    trailPoints: { x: number; y: number }[];
  };

  const gestureRef = useRef<ActiveGesture | null>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const boardLayoutRef = useRef<BoardLayoutMetrics | null>(null);
  const bumperSectorByKeyRef = useRef<Map<string, number>>(new Map());
  const stageGeomKeyRef = useRef("");
  const trailRafRef = useRef<number | null>(null);
  const trailFadeRafRef = useRef<number | null>(null);
  const trailUiLastPushRef = useRef(0);

  const [swipeTrailPoints, setSwipeTrailPoints] = useState<{ x: number; y: number }[]>([]);
  /** 盤ラッパーリサイズ時に SVG 反射ドットの座標を boardLayoutRef と再同期する */
  const [boardLayoutRevision, setBoardLayoutRevision] = useState(0);
  /** 軌跡は polyline のみフェード。SVG ルートは opacity:1 のままにしてキャンバス側が透けないようにする */
  const [trailStrokeOpacity, setTrailStrokeOpacity] = useState(1);
  /** 判定マス用の短いフラッシュ（時刻は draw の rAF で減衰） */
  const bumperFlashRef = useRef<Map<string, { t0: number; ms: number; mode?: "trajectory" }>>(new Map());

  const pulseBumperFlash = useCallback(
    (cellKey: string, ms = 280, mode: "default" | "trajectory" = "default") => {
      if (mode === "trajectory") {
        bumperFlashRef.current.set(cellKey, { t0: performance.now(), ms, mode: "trajectory" });
      } else {
        bumperFlashRef.current.set(cellKey, { t0: performance.now(), ms });
      }
      setBumperTick((t) => t + 1);
    },
    []
  );

  const workerGenOpts = useMemo(
    () =>
      reflectShotWorkerGenOptsForConsumerGrade(
        grade,
        isDevTj,
        isDebugMode,
        debugGrade2Bend6MidSlider,
        debugLv4GenMode,
        debugDummyDensityPct
      ),
    [
      grade,
      isDevTj,
      isDebugMode,
      debugGrade2Bend6MidSlider,
      debugLv4GenMode,
      debugDummyDensityPct,
    ]
  );

  /** 盤ロード effect は seed / layoutNonce のみで起動。Grade 変更だけでは走らせない（常に最新値は ref から読む） */
  const boardLoadContextRef = useRef({
    grade,
    workerGenOpts,
    isDevTj,
    isDebugMode,
    debugLv4GenMode,
    generateStageInWorker,
    takeBoardForGrade,
  });
  boardLoadContextRef.current = {
    grade,
    workerGenOpts,
    isDevTj,
    isDebugMode,
    debugLv4GenMode,
    generateStageInWorker,
    takeBoardForGrade,
  };

  useEffect(() => {
    if (!stage) {
      lastStagePrepKeyRef.current = "";
      return;
    }
    const key = `${stage.seed >>> 0}-${stage.grade}-${stage.width}x${stage.height}`;
    if (lastStagePrepKeyRef.current !== key) {
      lastStagePrepKeyRef.current = key;
      setPrepSessionNonce((n) => n + 1);
    }
  }, [stage]);

  useEffect(() => {
    if (!stage || phase !== "edit" || boardLoadWait) return;
    setPrepMs(0);
    const t0 = performance.now();
    const id = window.setInterval(() => {
      setPrepMs(Math.floor(performance.now() - t0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, phase, boardLoadWait, prepSessionNonce]);

  useEffect(() => {
    const prev = debugPrevBoardRef.current;
    debugPrevBoardRef.current = { grade, seed };
    if (!prev) {
      setDebugPreviousBoard(null);
      return;
    }
    if (prev.grade === grade && prev.seed === seed) return;
    setDebugPreviousBoard(prev);
  }, [grade, seed]);

  useEffect(() => {
    if (!stage) return;
    const req =
      stage.requiredGemCount ?? computeRequiredGemCountForStage(stage).required;
    requiredGemsRef.current = req;
    setRequiredGems(req);
    collectedGemsRef.current = 0;
    setCollectedGems(0);
    gemParticlesRef.current.length = 0;
    goalSparklesRef.current.length = 0;
    wallSparklesRef.current.length = 0;
    goalUnlockPulseRef.current = 0;
    finishAnimRef.current = null;
    lostBallAnimRef.current = null;
    setGemGoalFail(false);
    setLaunchArrowDismissed(false);
    pathSegHistoryRef.current = [];
    crossGemAwardedThisSegRef.current = false;
    revisitCrossCellStateRef.current.clear();
    crossFlashRef.current = null;
    bumperIncomingFirstRef.current.clear();
    twoSidedBumperUsedRef.current.clear();
  }, [stage]);

  useEffect(() => {
    if (!stage) return;
    const key = `${stage.seed}-${stage.grade}-${stage.width}x${stage.height}`;
    if (stageGeomKeyRef.current === key) return;
    stageGeomKeyRef.current = key;
    const m = bumperSectorByKeyRef.current;
    m.clear();
    stage.bumpers.forEach((bump, k) => {
      m.set(k, sectorIndexForDisplayKind(bump.display));
    });
  }, [stage]);

  useEffect(() => {
    const pending = pendingRestoreRef.current;
    if (pending) {
      pendingRestoreRef.current = null;
      const src: BoardSurfaceSource = nextBoardSourceRef.current ?? "generated";
      nextBoardSourceRef.current = null;
      setBoardDisplaySource(src);
      const cloned = cloneGridStageForRestore(pending);
      setStage(cloned);
      setPhase("edit");
      setStatusMsg("");
      setBumperTick((t) => t + 1);
      simRef.current = {
        logicalCell: { ...cloned.startPad },
        travelDir: shotEntryDir(cloned),
        fromCell: { ...cloned.startPad },
        toCell: { ...cloned.startPad },
        lerp01: 0,
        leftStart: false,
        padLaunchPx: null,
      };
      editBallPadRef.current = null;
      return;
    }

    if (hashRs2GenerationInFlightCountRef.current > 0) {
      return;
    }

    const ctx = boardLoadContextRef.current;
    const {
      grade: g,
      workerGenOpts: opts,
      isDevTj: devTj,
      isDebugMode: dbg,
      debugLv4GenMode: lv4m,
      generateStageInWorker: gen,
      takeBoardForGrade: take,
    } = ctx;

    const skipStockForG2Debug = g === 4 && devTj && dbg;
    const skipStockForG5AltLv4 = g === 5 && devTj && dbg && (lv4m === "rFirst" || lv4m === "default");
    const fromStock = skipStockForG2Debug || skipStockForG5AltLv4 ? null : take(g);
    if (fromStock) {
      nextBoardSourceRef.current = "stock";
      pendingRestoreRef.current = fromStock;
      setSeed(fromStock.seed >>> 0);
      setLayoutNonce((n) => n + 1);
      return;
    }

    let cancelled = false;
    setBoardLoadWait(true);
    setStatusMsg("盤面を準備中…");
    (async () => {
      try {
        const { stage: loaded } = await gen(g, seed, opts);
        if (cancelled) return;
        const cloned = cloneGridStageForRestore(loaded);
        setBoardDisplaySource("generated");
        setStage(cloned);
        setPhase("edit");
        setStatusMsg("");
        setBumperTick((t) => t + 1);
        simRef.current = {
          logicalCell: { ...cloned.startPad },
          travelDir: shotEntryDir(cloned),
          fromCell: { ...cloned.startPad },
          toCell: { ...cloned.startPad },
          lerp01: 0,
          leftStart: false,
          padLaunchPx: null,
        };
        editBallPadRef.current = null;
      } catch {
        if (!cancelled) setStatusMsg("盤面の生成に失敗しました（Worker）");
      } finally {
        if (!cancelled) setBoardLoadWait(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 意図: Grade プルダウンのみの変更では再生成しない（seed / layoutNonce / 保留復元のみトリガー）
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boardLoadContextRef が最新 grade / opts を保持
  }, [seed, layoutNonce]);

  useEffect(() => {
    if (phase !== "won") return;
    refreshAds();
  }, [phase]);

  const currentStageHash = useMemo(
    () => (stage ? encodeReflecStageHash(stage) : ""),
    [stage?.grade, stage?.seed]
  );

  const applyStageFromHash = useCallback(
    (raw: string) => {
      const t = raw.trim();
      const parsed = parseReflecHash(t);
      if (!parsed) {
        setStatusMsg("ハッシュの解析に失敗しました");
        return;
      }
      if (parsed.kind === "rs1") {
        const st = decodeReflecStageHash(t);
        if (!st) {
          setStatusMsg("ハッシュの解析に失敗しました");
          return;
        }
        nextBoardSourceRef.current = "generated";
        pendingRestoreRef.current = st;
        setGrade(st.grade);
        setSeed(st.seed >>> 0);
        setLayoutNonce((n) => n + 1);
        return;
      }
      hashRs2GenerationInFlightCountRef.current += 1;
      setGrade(parsed.grade);
      setSeed(parsed.seed >>> 0);
      setBoardLoadWait(true);
      setStatusMsg("盤面を準備中…");
      void (async () => {
        try {
          const workerOpts = reflectShotWorkerGenOptsForConsumerGrade(
            parsed.grade,
            isDevTj,
            isDebugMode,
            debugGrade2Bend6MidSlider,
            debugLv4GenMode,
            debugDummyDensityPct
          );
          const { stage } = await generateStageInWorker(parsed.grade, parsed.seed >>> 0, workerOpts);
          nextBoardSourceRef.current = "generated";
          pendingRestoreRef.current = cloneGridStageForRestore(stage);
          setGrade(stage.grade);
          setSeed(stage.seed >>> 0);
          setLayoutNonce((n) => n + 1);
          setStatusMsg("");
        } catch {
          setStatusMsg("ハッシュからの生成に失敗しました");
        } finally {
          hashRs2GenerationInFlightCountRef.current = Math.max(0, hashRs2GenerationInFlightCountRef.current - 1);
          if (hashRs2GenerationInFlightCountRef.current === 0) {
            setBoardLoadWait(false);
          }
        }
      })();
    },
    [
      generateStageInWorker,
      isDevTj,
      isDebugMode,
      debugGrade2Bend6MidSlider,
      debugLv4GenMode,
      debugDummyDensityPct,
    ]
  );

  const goNextProblem = useCallback(() => {
    if (phase !== "won" && phase !== "lost") return;
    setShowWinOverlay(false);
    setShowFailOverlay(false);
    refreshAds();
    const skipStockForG2Debug = grade === 4 && isDevTj && isDebugMode;
    const skipStockForG5AltLv4 =
      grade === 5 && isDevTj && isDebugMode && (debugLv4GenMode === "rFirst" || debugLv4GenMode === "default");
    const next = skipStockForG2Debug || skipStockForG5AltLv4 ? null : takeBoardForGrade(grade);
    if (next) {
      nextBoardSourceRef.current = "stock";
      pendingRestoreRef.current = next;
      setSeed(next.seed >>> 0);
      setLayoutNonce((n) => n + 1);
      return;
    }
    setBoardLoadWait(true);
    setStatusMsg("ストックが空のため盤面を生成しています…");
    void (async () => {
      try {
        const { stage: st } = await generateStageInWorker(
          grade,
          (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0,
          workerGenOpts
        );
        nextBoardSourceRef.current = "generated";
        pendingRestoreRef.current = cloneGridStageForRestore(st);
        setSeed(st.seed >>> 0);
        setLayoutNonce((n) => n + 1);
        setStatusMsg("");
      } catch {
        setStatusMsg("次の盤面の生成に失敗しました（Worker）");
      } finally {
        setBoardLoadWait(false);
      }
    })();
  }, [
    phase,
    grade,
    takeBoardForGrade,
    generateStageInWorker,
    workerGenOpts,
    isDevTj,
    isDebugMode,
    debugLv4GenMode,
  ]);

  const beginShot = useCallback(() => {
    const st = stage;
    if (!st || phase !== "edit") return;
    moveShotTrailRef.current = [];
    setTrajectoryVertexDots([]);
    pathSegHistoryRef.current = [];
    crossGemAwardedThisSegRef.current = false;
    revisitCrossCellStateRef.current.clear();
    crossFlashRef.current = null;
    bumperIncomingFirstRef.current.clear();
    twoSidedBumperUsedRef.current.clear();
    collectedGemsRef.current = 0;
    setCollectedGems(0);
    gemParticlesRef.current.length = 0;
    goalSparklesRef.current.length = 0;
    wallSparklesRef.current.length = 0;
    goalUnlockPulseRef.current = 0;
    finishAnimRef.current = null;
    lostBallAnimRef.current = null;
    setGemGoalFail(false);
    startPadDragRef.current = null;
    lastStartPadTapRef.current = null;
    const rect =
      boardWrapRef.current?.getBoundingClientRect() ?? canvasRef.current?.getBoundingClientRect();
    const wPx = Math.max(1, Math.floor(rect?.width ?? 1));
    const hPx = Math.max(1, Math.floor(rect?.height ?? 1));
    const layout = boardLayoutRef.current ?? computeBoardLayout(st, wPx, hPx);
    const padC = cellCenterPx(
      st.startPad.c,
      st.startPad.r,
      layout.cellPx,
      layout.ox,
      layout.oy,
      layout.rMin,
      layout.cMin
    );
    const ball = editBallPadRef.current ?? padC;
    editBallPadRef.current = null;
    simRef.current = {
      logicalCell: { ...st.startPad },
      travelDir: shotEntryDir(st),
      fromCell: { ...st.startPad },
      toCell: { ...st.start },
      lerp01: 0,
      leftStart: false,
      padLaunchPx: { x: ball.x, y: ball.y },
    };
    setPhase("move");
    setStatusMsg("");
  }, [phase, stage]);

  const applyArrival = useCallback((st: GridStage, B: CellCoord, incomingDir: Dir): ArrivalResult => {
    const sim = simRef.current;
    if (B.c === st.goalPad.c && B.r === st.goalPad.r) {
      if (collectedGemsRef.current >= requiredGemsRef.current) return { kind: "goal" };
      return { kind: "lost", wallDir: negateDir(incomingDir) };
    }
    if (B.c === st.startPad.c && B.r === st.startPad.r && sim.leftStart) {
      return { kind: "lost", wallDir: negateDir(incomingDir) };
    }

    if (B.c !== st.startPad.c || B.r !== st.startPad.r) sim.leftStart = true;

    let dOut = incomingDir;
    const bk = keyCell(B.c, B.r);
    const bump = st.bumpers.get(bk);
    if (bump) dOut = applyBumper(incomingDir, bump.display);

    const next = addCell(B, dOut);
    if (!isAgentCell(st, next.c, next.r)) return { kind: "lost", wallDir: dOut };
    return { kind: "continue", next, outDir: dOut };
  }, []);

  const tickSim = useCallback(
    (dtMs: number) => {
      const st = stage;
      if (!st) return;

      if (phase === "wallFx" || phase === "goalFx") {
        const fa = finishAnimRef.current;
        const goalMs = isDevTj && isDebugMode ? debugGoalFxMs : DEFAULT_GOAL_FX_MS;
        const wallMs = isDevTj && isDebugMode ? debugWallFxMs : DEFAULT_WALL_FX_MS;
        if (!fa) {
          lostBallAnimRef.current = null;
          setPhase("edit");
          return;
        }
        const dur = fa.kind === "goalFx" ? goalMs : wallMs;
        const elapsed = performance.now() - fa.t0;

        if (fa.kind === "wallFx" && !fa.didSpawnWallSparks && elapsed >= dur * 0.38) {
          fa.didSpawnWallSparks = true;
          const layout = boardLayoutRef.current;
          if (layout) {
            const radL = Math.max(6, layout.cellPx * 0.22);
            const { px, py } = screenDirToPixelUnit(fa.wallDir);
            const cx =
              layout.ox + (fa.cell.c - layout.cMin) * layout.cellPx + layout.cellPx / 2;
            const cy = layout.oy + (fa.cell.r - layout.rMin) * layout.cellPx + layout.cellPx / 2;
            const half = Math.max(2, layout.cellPx / 2 - radL - 1.5);
            const wpx = cx + px * half;
            const wpy = cy + py * half;
            pushWallSparks(wallSparklesRef.current, wpx, wpy, performance.now());
          }
        }

        if (elapsed >= dur) {
          finishAnimRef.current = null;
          if (fa.kind === "wallFx") {
            lostBallAnimRef.current = { cell: { ...fa.cell }, wallDir: fa.wallDir };
            setShowFailOverlay(true);
            setPhase("lost");
          } else {
            setShowFailOverlay(false);
            setShowWinOverlay(true);
            setPhase("won");
          }
        }
        return;
      }

      if (phase !== "move") return;

      const speedMult = isDevTj && isDebugMode ? debugBallSpeedMult : DEFAULT_BALL_SPEED_MULT;
      const cellTravelMs = BASE_CELL_TRAVEL_MS / speedMult;

      const grantCrossBonusAtCell = (c: number, r: number, nowT: number) => {
        const cCross0 = collectedGemsRef.current;
        collectedGemsRef.current += 1;
        crossFlashRef.current = { c, r, t0: nowT };
        if (
          collectedGemsRef.current >= requiredGemsRef.current &&
          cCross0 < requiredGemsRef.current
        ) {
          goalUnlockPulseRef.current = nowT;
          const layGx = boardLayoutRef.current;
          if (layGx) {
            const gp = st.goalPad;
            const gcc = cellCenterPx(
              gp.c,
              gp.r,
              layGx.cellPx,
              layGx.ox,
              layGx.oy,
              layGx.rMin,
              layGx.cMin
            );
            pushGoalSparkles(goalSparklesRef.current, gcc.x, gcc.y, nowT);
          }
        }
        const layCross = boardLayoutRef.current;
        if (layCross) {
          const cc = cellCenterPx(
            c,
            r,
            layCross.cellPx,
            layCross.ox,
            layCross.oy,
            layCross.rMin,
            layCross.cMin
          );
          pushGemBurst(gemParticlesRef.current, cc.x, cc.y, nowT, GEM_BURST_CROSS_INSTANT_N);
        }
        setCollectedGems(collectedGemsRef.current);
      };

      const sim = simRef.current;
      const prevLerp = sim.lerp01;
      sim.lerp01 += dtMs / cellTravelMs;
      const nextLerp = sim.lerp01;

      if (st.grade >= 3) {
        const crossCellMid = findCrossCellForNewAgentSegment(
          pathSegHistoryRef.current,
          sim.fromCell,
          sim.toCell
        );
        if (
          crossCellMid != null &&
          !crossGemAwardedThisSegRef.current &&
          ((prevLerp < 0.5 && nextLerp >= 0.5) || nextLerp >= 1)
        ) {
          crossGemAwardedThisSegRef.current = true;
          grantCrossBonusAtCell(crossCellMid.c, crossCellMid.r, performance.now());
        }
      }

      if (nextLerp < 1) return;

      const fromPadToFirst =
        sim.fromCell.c === st.startPad.c &&
        sim.fromCell.r === st.startPad.r &&
        sim.toCell.c === st.start.c &&
        sim.toCell.r === st.start.r;

      sim.lerp01 = 0;
      crossGemAwardedThisSegRef.current = false;
      const B = { ...sim.toCell };
      sim.logicalCell = B;
      if (fromPadToFirst) {
        sim.padLaunchPx = null;
      }
      const incoming: Dir = {
        dx: B.c - sim.fromCell.c,
        dy: sim.fromCell.r - B.r,
      };

      if (st.grade >= 3) {
        pathSegHistoryRef.current.push({ a: { ...sim.fromCell }, b: { ...B } });
      }

      const res = applyArrival(st, B, incoming);

      if (res.kind === "continue") {
        const bkRefl = keyCell(B.c, B.r);
        const bumpRefl = st.bumpers.get(bkRefl);
        const hyphenPassRefl =
          bumpRefl &&
          bumpRefl.display === "HYPHEN" &&
          (dirsEqual(incoming, DIR.L) || dirsEqual(incoming, DIR.R));
        const pipePassRefl =
          bumpRefl &&
          bumpRefl.display === "PIPE" &&
          (dirsEqual(incoming, DIR.U) || dirsEqual(incoming, DIR.D));
        const passThroughRefl = hyphenPassRefl || pipePassRefl;
        const turnedAtB = !dirsEqual(incoming, res.outDir);
        const onReflectPad =
          (B.c === st.startPad.c && B.r === st.startPad.r) ||
          (B.c === st.goalPad.c && B.r === st.goalPad.r);
        if (turnedAtB && !onReflectPad && bumpRefl && !passThroughRefl) {
          const isSolBump =
            solutionGemBumperKeys.has(bkRefl) && bumpRefl.isDummy !== true;
          setTrajectoryVertexDots((prev) => [
            ...prev,
            {
              c: B.c,
              r: B.r,
              born: performance.now(),
              isSolutionBumper: isSolBump,
            },
          ]);
        }
      }

      if (st.grade >= 3 && res.kind === "continue") {
        const next = res.next;
        const vIn = { dc: B.c - sim.fromCell.c, dr: B.r - sim.fromCell.r };
        const vOut = { dc: next.c - B.c, dr: next.r - B.r };
        const unitIn = Math.abs(vIn.dc) + Math.abs(vIn.dr) === 1;
        const unitOut = Math.abs(vOut.dc) + Math.abs(vOut.dr) === 1;
        const straight = unitIn && unitOut && vIn.dc === vOut.dc && vIn.dr === vOut.dr;
        const rk = keyCell(B.c, B.r);
        const rm = revisitCrossCellStateRef.current;
        let rs = rm.get(rk);
        if (!rs) rs = { visitCount: 0, awarded: false, invalidated: false };
        rs.visitCount += 1;
        if (rs.visitCount === 1) {
          if (straight) {
            rs.firstEntry = { ...vIn };
            rs.firstStraight = true;
          } else {
            rs.invalidated = true;
          }
        } else if (
          rs.visitCount === 2 &&
          !rs.awarded &&
          !rs.invalidated &&
          rs.firstStraight &&
          rs.firstEntry &&
          straight
        ) {
          if (rs.firstEntry.dc * vIn.dc + rs.firstEntry.dr * vIn.dr === 0) {
            grantCrossBonusAtCell(B.c, B.r, performance.now());
            rs.awarded = true;
          }
        }
        rm.set(rk, rs);
      }

      const bkHit = keyCell(B.c, B.r);
      const isBumperHit =
        st.bumpers.has(bkHit) && !(B.c === st.goalPad.c && B.r === st.goalPad.r);
      const bumpAt = st.bumpers.get(bkHit);
      /** HYPHEN（水平バー）に左右から入射してスルーする場合は反射扱いにしない → 宝石なし */
      const hyphenHorizontalPass =
        bumpAt &&
        bumpAt.display === "HYPHEN" &&
        (dirsEqual(incoming, DIR.L) || dirsEqual(incoming, DIR.R));
      /** PIPE（鉛直バー）に上下から入射してスルーする場合も宝石なし */
      const pipeVerticalPass =
        bumpAt &&
        bumpAt.display === "PIPE" &&
        (dirsEqual(incoming, DIR.U) || dirsEqual(incoming, DIR.D));
      const passThroughNoGem = hyphenHorizontalPass || pipeVerticalPass;
      /** 正解経路上の本番バンパー（従来） */
      const gemFromSolutionBumper =
        isBumperHit &&
        bumpAt &&
        !bumpAt.isDummy &&
        solutionGemBumperKeys.has(bkHit) &&
        !passThroughNoGem;
      /** ダミーでも表示向きに応じた反射（スルー除く）で宝石 1（両面ボーナス対象外） */
      const gemFromDummyBumper =
        isBumperHit && bumpAt && bumpAt.isDummy === true && !passThroughNoGem;
      const gemFromReflection = gemFromSolutionBumper || gemFromDummyBumper;
      if (gemFromReflection) {
        let addGems = 1;
        let burstN = GEM_BURST_N;
        let twoSidedHitFx = false;
        if (gemFromSolutionBumper && st.grade >= 5) {
          const prevIn = bumperIncomingFirstRef.current.get(bkHit);
          if (prevIn == null) {
            bumperIncomingFirstRef.current.set(bkHit, incoming);
          } else if (
            !twoSidedBumperUsedRef.current.has(bkHit) &&
            dirsEqual(incoming, negateDir(prevIn))
          ) {
            addGems += 3;
            twoSidedBumperUsedRef.current.add(bkHit);
            burstN = Math.max(burstN, GEM_BURST_TWO_SIDED_N);
            twoSidedHitFx = true;
          }
        }
        const c0 = collectedGemsRef.current;
        collectedGemsRef.current += addGems;
        const nowG = performance.now();
        if (collectedGemsRef.current >= requiredGemsRef.current && c0 < requiredGemsRef.current) {
          goalUnlockPulseRef.current = nowG;
          const layG = boardLayoutRef.current;
          if (layG) {
            const gp = st.goalPad;
            const gcc = cellCenterPx(
              gp.c,
              gp.r,
              layG.cellPx,
              layG.ox,
              layG.oy,
              layG.rMin,
              layG.cMin
            );
            pushGoalSparkles(goalSparklesRef.current, gcc.x, gcc.y, nowG);
          }
        }
        const layB = boardLayoutRef.current;
        if (layB) {
          const bc = cellCenterPx(B.c, B.r, layB.cellPx, layB.ox, layB.oy, layB.rMin, layB.cMin);
          pushGemBurst(gemParticlesRef.current, bc.x, bc.y, nowG, burstN);
          if (twoSidedHitFx) {
            pushTwoSidedRedSparks(wallSparklesRef.current, bc.x, bc.y, nowG);
            pulseBumperFlash(bkHit, TRAJECTORY_BUMPER_FLASH_MS, "trajectory");
          }
        } else if (twoSidedHitFx) {
          pulseBumperFlash(bkHit, TRAJECTORY_BUMPER_FLASH_MS, "trajectory");
        }
        setCollectedGems(collectedGemsRef.current);
      }

      if (res.kind === "goal") {
        sim.fromCell = { ...B };
        sim.toCell = { ...B };
        sim.lerp01 = 1;
        finishAnimRef.current = { kind: "goalFx", t0: performance.now(), cell: { ...B } };
        setShowFailOverlay(false);
        setPhase("goalFx");
        setStatusMsg("");
        return;
      }
      if (res.kind === "lost") {
        sim.fromCell = { ...B };
        sim.toCell = { ...B };
        sim.lerp01 = 1;
        sim.leftStart = false;
        setShowWinOverlay(false);
        setGemGoalFail(B.c === st.goalPad.c && B.r === st.goalPad.r);
        finishAnimRef.current = {
          kind: "wallFx",
          t0: performance.now(),
          cell: { ...B },
          wallDir: res.wallDir,
          didSpawnWallSparks: false,
        };
        setPhase("wallFx");
        setStatusMsg("");
        return;
      }
      sim.fromCell = B;
      sim.toCell = res.next;
      sim.travelDir = res.outDir;
    },
    [
      applyArrival,
      debugBallSpeedMult,
      debugGoalFxMs,
      debugWallFxMs,
      isDebugMode,
      isDevTj,
      phase,
      pulseBumperFlash,
      solutionGemBumperKeys,
      stage,
    ]
  );

  const initialWrongRatePct = Math.round(initialWrongDisplayProbabilityForGrade(grade) * 100);

  useEffect(() => {
    if (!isDevTj || !isDebugMode || !showSolutionPath || !stage) return;
    const base = stage.gemRuleBaseBends ?? countBumpersOnSolutionPath(stage);
    const r = computeRequiredGemCountForStage(stage);
    const cross =
      stage.gemExpectedCrossings ?? Math.max(r.revisitCrossCells, r.crossings);
    const twoSided =
      stage.gemExpectedTwoSidedBends ?? countExpectedTwoSidedBendsOnIdealPath(stage);
    const reqG = stage.requiredGemCount ?? r.required;
    console.log("[ReflecShot] gem rule check (expected vs Goal)", {
      grade: stage.grade,
      baseBends: base,
      crossPairs: r.crossings,
      revisitCrossCells: r.revisitCrossCells,
      crossEffective: cross,
      expectedTwoSidedBends: twoSided,
      requiredGemCount: reqG,
    });
  }, [isDevTj, isDebugMode, showSolutionPath, stage]);

  useEffect(() => {
    if (phase === "edit") {
      moveShotTrailRef.current = [];
      setTrajectoryVertexDots([]);
    }
  }, [phase]);

  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBoardLayoutRevision((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!showWinOverlay) return;
    refreshAds();
  }, [showWinOverlay]);

  useEffect(() => {
    if (!showWinOverlay) return;
    const defaults = { origin: { y: 0.6 }, zIndex: 9999 };
    confetti({ ...defaults, particleCount: 150, spread: 100 });
    confetti({ ...defaults, particleCount: 75, angle: 60, spread: 55 });
    confetti({ ...defaults, particleCount: 75, angle: 120, spread: 55 });
    const t = setTimeout(() => {
      confetti({ ...defaults, particleCount: 50, scalar: 1.2, spread: 80 });
    }, 200);
    return () => clearTimeout(t);
  }, [showWinOverlay]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const st = stage;
    if (!canvas || !st) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const wPx = Math.max(1, Math.floor(rect.width));
    const hPx = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(wPx * dpr);
    canvas.height = Math.floor(hPx * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { rMin, rMax } = stageRowRange(st);
    const { cMin, cMax, cellPx, ox, oy, nCols } = boardPixelLayout(st, wPx, hPx);

    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, wPx, hPx);

    const rowY = (r: number) => oy + (r - rMin) * cellPx;
    const openLenDraw = portalGapLengthPx(cellPx);
    const now = performance.now();

    const rad = Math.max(6, cellPx * 0.22);
    let ballX = 0;
    let ballY = 0;
    let tailDx = 0;
    let tailDy = 0;
    let tailActive = false;
    let useRainbowDrop = false;
    let rainbowElapsedMs = 0;

    const wallFxMs = isDevTj && isDebugMode ? debugWallFxMs : DEFAULT_WALL_FX_MS;
    const goalFxMs = isDevTj && isDebugMode ? debugGoalFxMs : DEFAULT_GOAL_FX_MS;

    if (phase === "wallFx" || phase === "goalFx") {
      const fa = finishAnimRef.current;
      if (fa?.kind === "wallFx") {
        const t01 = Math.min(1, (now - fa.t0) / wallFxMs);
        const k = wallFxBallKinematics(
          cellPx,
          ox,
          oy,
          rMin,
          cMin,
          fa.cell,
          fa.wallDir,
          rad,
          t01
        );
        ballX = k.x;
        ballY = k.y;
        tailDx = k.tailDx;
        tailDy = k.tailDy;
        tailActive = k.tailActive;
      } else if (fa?.kind === "goalFx") {
        const gc = cellCenterPx(fa.cell.c, fa.cell.r, cellPx, ox, oy, rMin, cMin);
        ballX = gc.x;
        ballY = gc.y;
        tailActive = false;
        useRainbowDrop = true;
        rainbowElapsedMs = now - fa.t0;
      } else {
        const sim = simRef.current;
        const c = cellCenterPx(sim.logicalCell.c, sim.logicalCell.r, cellPx, ox, oy, rMin, cMin);
        ballX = c.x;
        ballY = c.y;
      }
    } else if (phase === "edit") {
      const padC = cellCenterPx(st.startPad.c, st.startPad.r, cellPx, ox, oy, rMin, cMin);
      const bp = editBallPadRef.current ?? padC;
      ballX = bp.x;
      ballY = bp.y;
    } else if (phase === "lost") {
      const lb = lostBallAnimRef.current;
      if (lb) {
        const k = wallFxBallKinematics(cellPx, ox, oy, rMin, cMin, lb.cell, lb.wallDir, rad, 1);
        ballX = k.x;
        ballY = k.y;
        tailDx = k.tailDx;
        tailDy = k.tailDy;
        tailActive = false;
      } else {
        const sim = simRef.current;
        const c = cellCenterPx(sim.logicalCell.c, sim.logicalCell.r, cellPx, ox, oy, rMin, cMin);
        ballX = c.x;
        ballY = c.y;
      }
    } else {
      const sim = simRef.current;
      const f = sim.fromCell;
      const t = sim.toCell;
      let af = cellCenterPx(f.c, f.r, cellPx, ox, oy, rMin, cMin);
      if (
        sim.padLaunchPx &&
        f.c === st.startPad.c &&
        f.r === st.startPad.r &&
        t.c === st.start.c &&
        t.r === st.start.r
      ) {
        af = sim.padLaunchPx;
      }
      const at = cellCenterPx(t.c, t.r, cellPx, ox, oy, rMin, cMin);
      const u = Math.min(1, sim.lerp01);
      ballX = af.x + (at.x - af.x) * u;
      ballY = af.y + (at.y - af.y) * u;
      tailDx = at.x - af.x;
      tailDy = at.y - af.y;
      tailActive = phase === "move";
    }

    if (phase === "move") {
      const tr = moveShotTrailRef.current;
      const minD2 = Math.max(0.5 * 0.5, (cellPx * 0.035) ** 2);
      const last = tr[tr.length - 1];
      if (!last || (ballX - last.x) ** 2 + (ballY - last.y) ** 2 >= minD2) {
        tr.push({ x: ballX, y: ballY });
      }
    }

    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) {
        const x = ox + (c - cMin) * cellPx;
        const y = rowY(r);
        const isStartPad = c === st.startPad.c && r === st.startPad.r;
        const isGoalPad = c === st.goalPad.c && r === st.goalPad.r;
        const inBoard = c >= 0 && c < st.width && r >= 0 && r < st.height;
        const onExclusivePadCorridorRow = isExclusiveOutsidePadCorridorRow(st, r);

        // 盤の真上／真下の「パッド専用行」だけ、パッド1マス以外を背景に同化（左右端 goalPad 行では盤内マスを描く）
        if (onExclusivePadCorridorRow && !isStartPad && !isGoalPad) {
          ctx.fillStyle = "#020617";
          ctx.fillRect(x, y, cellPx, cellPx);
          continue;
        }

        if (isStartPad) {
          const padFill = "#1a2f3c";
          ctx.fillStyle = padFill;
          ctx.fillRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
          ctx.lineWidth = 1;
          drawCellGappedBorder(ctx, x, y, cellPx, padFill, openLenDraw);
          continue;
        }

        const goalPadOutsideCol = st.goalPad.c < 0 || st.goalPad.c >= st.width;
        if (goalPadOutsideCol && c === st.goalPad.c && !isGoalPad) {
          ctx.fillStyle = "#020617";
          ctx.fillRect(x, y, cellPx, cellPx);
          continue;
        }

        if (isGoalPad) {
          const req = requiredGemsRef.current;
          const col = collectedGemsRef.current;
          const goalOpen = col >= req;
          const gcx = x + cellPx / 2;
          const gcy = y + cellPx / 2;
          if (!goalOpen) {
            const gemCountLabel = col < 1 ? String(req) : `${col}/${req}`;
            const gemCountFontPx = Math.max(
              8,
              Math.floor(cellPx * (gemCountLabel.length > 3 ? 0.15 : 0.19))
            );
            ctx.fillStyle = "#2a1a1f";
            ctx.fillRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
            ctx.strokeStyle = "rgba(127, 29, 29, 0.45)";
            ctx.lineWidth = 1;
            for (let s = 0; s < 5; s++) {
              ctx.beginPath();
              ctx.moveTo(x + 5 + s * 4, y + cellPx * 0.32);
              ctx.lineTo(x + cellPx - 6, y + cellPx * 0.68);
              ctx.stroke();
            }
            ctx.save();
            ctx.font = `600 ${gemCountFontPx}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(253, 224, 71, 0.9)";
            ctx.fillText(gemCountLabel, gcx, y + cellPx * 0.24);
            ctx.restore();
            const dotR = Math.max(2.2, cellPx * 0.054);
            const spacing =
              req <= 1 ? 0 : Math.min((cellPx * 0.78) / (req - 1), dotR * 2.75);
            const rowYDots = gcy + cellPx * 0.14;
            for (let i = 0; i < req; i++) {
              const dx = req <= 1 ? gcx : gcx - (spacing * (req - 1)) / 2 + i * spacing;
              const lit = i < col;
              ctx.beginPath();
              ctx.arc(dx, rowYDots, dotR, 0, Math.PI * 2);
              if (lit) {
                ctx.fillStyle = "rgba(253, 224, 71, 0.9)";
                ctx.fill();
                ctx.strokeStyle = "rgba(250, 204, 21, 0.55)";
                ctx.lineWidth = 1;
                ctx.stroke();
              } else {
                ctx.fillStyle = "rgba(30, 18, 22, 0.96)";
                ctx.fill();
                ctx.strokeStyle = "rgba(90, 48, 55, 0.9)";
                ctx.lineWidth = 1.35;
                ctx.stroke();
              }
            }
            drawCellGappedBorder(ctx, x, y, cellPx, "#3d2529", openLenDraw);
            continue;
          }
          const pulse = 0.5 + 0.5 * Math.sin(now * 0.0055);
          ctx.save();
          ctx.shadowColor = "rgba(52, 211, 153, 0.55)";
          ctx.shadowBlur = 11 + pulse * 14;
          ctx.fillStyle = `rgb(${22 + pulse * 28}, ${100 + pulse * 45}, ${88 + pulse * 35})`;
          ctx.fillRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
          ctx.shadowBlur = 0;
          ctx.restore();
          ctx.strokeStyle = `rgba(204, 251, 241, ${0.5 + pulse * 0.35})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, cellPx - 4, cellPx - 4);
          const gg = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, cellPx * 0.48);
          gg.addColorStop(0, `rgba(254, 249, 195, ${0.3 + pulse * 0.22})`);
          gg.addColorStop(1, "rgba(16, 185, 129, 0)");
          ctx.fillStyle = gg;
          ctx.fillRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
          const gemOpenLabel = `${col}/${req}`;
          const gemOpenFontPx = Math.max(
            8,
            Math.floor(cellPx * (gemOpenLabel.length > 3 ? 0.14 : 0.17))
          );
          ctx.save();
          ctx.font = `600 ${gemOpenFontPx}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = `rgba(204, 251, 241, ${0.65 + pulse * 0.2})`;
          ctx.fillText(gemOpenLabel, gcx, gcy + cellPx * 0.36);
          ctx.restore();
          drawCellGappedBorder(ctx, x, y, cellPx, "#0f3d34", openLenDraw);
          continue;
        }

        if (!inBoard || !st.pathable[c]![r]) {
          const voidFill = "#0f172a";
          ctx.fillStyle = voidFill;
          ctx.fillRect(x, y, cellPx, cellPx);
          ctx.lineWidth = 1;
          drawCellGappedBorder(ctx, x, y, cellPx, voidFill, openLenDraw);
          continue;
        }

        const pathFill = "#1e293b";
        ctx.fillStyle = pathFill;
        ctx.fillRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
        ctx.lineWidth = 1;
        drawCellGappedBorder(ctx, x, y, cellPx, pathFill, openLenDraw);

        const k = keyCell(c, r);
        const b = st.bumpers.get(k);
        if (b) {
          const fl = bumperFlashRef.current.get(k);
          let glyphFill = "rgb(125, 211, 252)";
          if (fl) {
            const now = performance.now();
            const u = (now - fl.t0) / fl.ms;
            if (u >= 1) {
              bumperFlashRef.current.delete(k);
            } else {
              const a = 0.48 * (1 - u) * (1 - u);
              if (fl.mode === "trajectory") {
                ctx.fillStyle = `rgba(251, 146, 60, ${a * 0.92})`;
                glyphFill = "rgb(255, 247, 237)";
              } else {
                ctx.fillStyle = `rgba(251, 146, 60, ${a * 0.92})`;
                glyphFill = "rgb(255, 247, 237)";
              }
              ctx.fillRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
            }
          }
          const dbgReveal = isDevTj && isDebugMode && showSolutionPath;
          const solBendHere = dbgReveal && !b.isDummy && solutionGemBumperKeys.has(k);
          let didSaveForDbg = false;
          if (dbgReveal && b.isDummy) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            didSaveForDbg = true;
          } else if (solBendHere) {
            ctx.save();
            glyphFill = "rgb(224, 242, 254)";
            ctx.shadowColor = "rgba(34, 211, 238, 0.9)";
            ctx.shadowBlur = Math.max(5, cellPx * 0.1);
            didSaveForDbg = true;
          }
          ctx.fillStyle = glyphFill;
          ctx.font = `bold ${Math.floor(cellPx * BUMPER_GLYPH_SIZE_RATIO)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(bumperSymbol(b.display), x + cellPx / 2, y + cellPx / 2 + 1);
          if (didSaveForDbg) ctx.restore();
        }
      }
    }

    if (isDevTj && isDebugMode && showSolutionPath && st.solutionPath.length > 1) {
      ctx.strokeStyle = "rgba(244, 63, 94, 0.55)";
      ctx.lineWidth = SOLUTION_PATH_LINE_WIDTH;
      ctx.beginPath();
      const pL = cellCenterPx(st.startPad.c, st.startPad.r, cellPx, ox, oy, rMin, cMin);
      const p0 = cellCenterPx(
        st.solutionPath[0]!.c,
        st.solutionPath[0]!.r,
        cellPx,
        ox,
        oy,
        rMin,
        cMin
      );
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(p0.x, p0.y);
      for (let i = 1; i < st.solutionPath.length; i++) {
        const p = cellCenterPx(
          st.solutionPath[i]!.c,
          st.solutionPath[i]!.r,
          cellPx,
          ox,
          oy,
          rMin,
          cMin
        );
        ctx.lineTo(p.x, p.y);
      }
      const pG = cellCenterPx(st.goalPad.c, st.goalPad.r, cellPx, ox, oy, rMin, cMin);
      ctx.lineTo(pG.x, pG.y);
      ctx.stroke();
    }

    const cf = crossFlashRef.current;
    if (cf) {
      const age = now - cf.t0;
      const crossFlashDur = TRAJECTORY_BUMPER_FLASH_MS;
      if (age >= 0 && age < crossFlashDur) {
        const u = age / crossFlashDur;
        const pulse = (1 - u) * (1 - u);
        const fx = ox + (cf.c - cMin) * cellPx;
        const fy = rowY(cf.r);
        const gcx = fx + cellPx / 2;
        const gcy = fy + cellPx / 2;
        const armScale = (isDevTj && isDebugMode ? debugCrossFlashArmPct : 60) / 100;
        const half = cellPx * armScale * (0.5 + 0.5 * pulse);
        ctx.save();
        ctx.strokeStyle = `rgba(251, 146, 60, ${0.42 + 0.48 * pulse})`;
        ctx.shadowColor = "rgba(251, 146, 60, 0.6)";
        ctx.shadowBlur = 3 + 7 * pulse;
        ctx.lineWidth = 1 + 1.5 * pulse;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(gcx - half, gcy);
        ctx.lineTo(gcx + half, gcy);
        ctx.moveTo(gcx, gcy - half);
        ctx.lineTo(gcx, gcy + half);
        ctx.stroke();
        ctx.restore();
      } else if (age >= crossFlashDur) {
        crossFlashRef.current = null;
      }
    }

    const shotTrail = moveShotTrailRef.current;
    if (shotTrail.length >= 2 && phase !== "edit") {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
      ctx.lineWidth = SOLUTION_PATH_LINE_WIDTH;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (activeTrajectoryStyle === "curved") {
        canvasPathRoundedShotTrail(
          ctx,
          shotTrail,
          activeTrajectoryCornerRadiusPx,
          TRAJECTORY_STRAIGHT_CONTINUE_DOT
        );
      } else {
        ctx.moveTo(shotTrail[0]!.x, shotTrail[0]!.y);
        for (let ti = 1; ti < shotTrail.length; ti++) {
          ctx.lineTo(shotTrail[ti]!.x, shotTrail[ti]!.y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    const gems = gemParticlesRef.current;
    for (let i = gems.length - 1; i >= 0; i--) {
      const p = gems[i]!;
      const age = now - p.born;
      if (age > GEM_PARTICLE_TTL_MS) {
        gems.splice(i, 1);
        continue;
      }
      if (age > 90) {
        const attractM =
          isDevTj && isDebugMode ? debugGemAttractMult : DEFAULT_GEM_ATTRACT_MULT;
        const k = BASE_GEM_ATTRACT * attractM;
        p.vx += (ballX - p.x) * k;
        p.vy += (ballY - p.y) * k;
      }
      p.vx *= 0.986;
      p.vy *= 0.986;
      p.x += p.vx;
      p.y += p.vy;
      const lifeA = Math.max(0, 1 - age / GEM_PARTICLE_TTL_MS);
      const tw = 1.6 + 0.55 * Math.sin(age * 0.045);
      ctx.fillStyle = `rgba(255, ${230 + Math.floor(25 * lifeA)}, ${140 + Math.floor(40 * lifeA)}, ${0.4 + 0.55 * lifeA})`;
      ctx.fillRect(p.x - tw / 2, p.y - tw / 2, tw, tw);
    }

    const sparks = goalSparklesRef.current;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]!;
      const age = now - p.born;
      if (age > GOAL_SPARKLE_TTL_MS) {
        sparks.splice(i, 1);
        continue;
      }
      p.vy -= 0.018;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.992;
      const a = 1 - age / GOAL_SPARKLE_TTL_MS;
      ctx.fillStyle = `rgba(253, 224, 71, ${0.5 * a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.85, 0, Math.PI * 2);
      ctx.fill();
    }

    const wallSp = wallSparklesRef.current;
    for (let i = wallSp.length - 1; i >= 0; i--) {
      const p = wallSp[i]!;
      const age = now - p.born;
      if (age > WALL_SPARKLE_TTL_MS) {
        wallSp.splice(i, 1);
        continue;
      }
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.vy += 0.04;
      p.x += p.vx;
      p.y += p.vy;
      const a = 1 - age / WALL_SPARKLE_TTL_MS;
      if (p.kind === "red") {
        ctx.fillStyle = `rgba(248, 113, 113, ${0.82 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(254, 202, 202, ${0.35 * a})`;
        ctx.beginPath();
        ctx.arc(p.x - 0.4, p.y - 0.4, 1.1, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(254, 243, 199, ${0.55 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (phase === "edit") {
      drawEditPadProjectileBloom(ctx, ballX, ballY, rad, now);
      if (!launchArrowDismissed && !startPadDragRef.current) {
        drawLaunchUpArrow(ctx, ballX, ballY, rad, now);
      }
    }
    if (useRainbowDrop) {
      drawLightDropRainbow(ctx, ballX, ballY, rad, rainbowElapsedMs);
    } else {
      drawLightDrop(ctx, ballX, ballY, rad, tailDx, tailDy, tailActive ? 1 : 0);
    }

    boardLayoutRef.current = { cellPx, ox, oy, rMin, cMin, nCols };
  }, [
    activeTrajectoryCornerRadiusPx,
    activeTrajectoryStyle,
    collectedGems,
    debugCrossFlashArmPct,
    debugGemAttractMult,
    debugGoalFxMs,
    debugWallFxMs,
    isDebugMode,
    isDevTj,
    launchArrowDismissed,
    phase,
    requiredGems,
    showSolutionPath,
    solutionGemBumperKeys,
    stage,
  ]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      tickSim(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, tickSim]);

  useEffect(() => {
    draw();
  }, [bumperTick, draw, phase, stage]);

  const boardClientRect = () => {
    const wrap = boardWrapRef.current;
    const canvas = canvasRef.current;
    return wrap?.getBoundingClientRect() ?? canvas?.getBoundingClientRect() ?? null;
  };

  const pixelToCell = (px: number, py: number): CellCoord | null => {
    const st = stage;
    if (!st) return null;
    const rect = boardClientRect();
    if (!rect) return null;
    const wPx = Math.max(1, Math.floor(rect.width));
    const hPx = Math.max(1, Math.floor(rect.height));
    const layout = boardLayoutRef.current ?? computeBoardLayout(st, wPx, hPx);
    const c = Math.floor((px - layout.ox) / layout.cellPx) + layout.cMin;
    const r = Math.floor((py - layout.oy) / layout.cellPx) + layout.rMin;
    if (!pathableAt(st, c, r)) return null;
    return { c, r };
  };

  const flushTrailToUi = (points: { x: number; y: number }[]) => {
    if (trailRafRef.current != null) cancelAnimationFrame(trailRafRef.current);
    trailRafRef.current = requestAnimationFrame(() => {
      trailRafRef.current = null;
      setSwipeTrailPoints(points.length ? [...points] : []);
    });
  };

  const cancelTrailFade = useCallback(() => {
    if (trailFadeRafRef.current != null) {
      cancelAnimationFrame(trailFadeRafRef.current);
      trailFadeRafRef.current = null;
    }
  }, []);

  const startTrailFadeOut = useCallback(
    (ms: number) => {
      cancelTrailFade();
      const t0 = performance.now();
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / ms);
        setTrailStrokeOpacity(1 - u);
        if (u < 1) {
          trailFadeRafRef.current = requestAnimationFrame(step);
        } else {
          trailFadeRafRef.current = null;
          setSwipeTrailPoints([]);
          setTrailStrokeOpacity(1);
        }
      };
      trailFadeRafRef.current = requestAnimationFrame(step);
    },
    [cancelTrailFade]
  );

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "edit" || !stage) return;
    const rect = boardClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;

    const wPxPad = Math.max(1, Math.floor(rect.width));
    const hPxPad = Math.max(1, Math.floor(rect.height));
    const layoutForPad = boardLayoutRef.current ?? computeBoardLayout(stage, wPxPad, hPxPad);

    if (pointInStartPadPixel(px, py, stage, layoutForPad)) {
      setLaunchArrowDismissed(true);
      const now = performance.now();
      const tap = lastStartPadTapRef.current;
      if (
        tap &&
        now - tap.t <= START_PAD_DOUBLE_TAP_DT_MS &&
        (px - tap.x) ** 2 + (py - tap.y) ** 2 <= START_PAD_DOUBLE_TAP_DIST_SQ
      ) {
        lastStartPadTapRef.current = null;
        startPadDragRef.current = null;
        beginShot();
        return;
      }
      lastStartPadTapRef.current = { t: now, x: px, y: py };

      const padC = cellCenterPx(
        stage.startPad.c,
        stage.startPad.r,
        layoutForPad.cellPx,
        layoutForPad.ox,
        layoutForPad.oy,
        layoutForPad.rMin,
        layoutForPad.cMin
      );
      const cur = editBallPadRef.current ?? padC;
      startPadDragRef.current = {
        pointerId: e.pointerId,
        startPx: px,
        startPy: py,
        startBallX: cur.x,
        startBallY: cur.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const cell = pixelToCell(px, py);
    const inTrailMargin =
      !cell && pointInTrajectoryStartMargin(px, py, stage, layoutForPad);
    if (!cell && !inTrailMargin) return;
    const k = cell ? keyCell(cell.c, cell.r) : null;
    const bumperHere = k != null && stage.bumpers.has(k);

    cancelTrailFade();
    bumperFlashRef.current.clear();
    setBumperTick((t) => t + 1);
    e.currentTarget.setPointerCapture(e.pointerId);
    setTrailStrokeOpacity(1);
    setSwipeTrailPoints([{ x: px, y: py }]);
    if (isDebugMode) setTjTrajectoryDebug(null);
    const passagesInit = new Map<string, { p: Pt; samples: Pt[]; c: number; r: number }>();
    if (bumperHere && cell) {
      const wPx = Math.max(1, Math.floor(rect.width));
      const hPx = Math.max(1, Math.floor(rect.height));
      const layout0 = boardLayoutRef.current ?? computeBoardLayout(stage, wPx, hPx);
      const cr = cellRectPx(cell.c, cell.r, layout0);
      passagesInit.set(k!, {
        p: closestPointOnRectBoundary(px, py, cr),
        samples: [{ x: px, y: py }],
        c: cell.c,
        r: cell.r,
      });
    }
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: px,
      startY: py,
      prevX: px,
      prevY: py,
      lastX: px,
      lastY: py,
      maxDistSq: 0,
      downCellKey: k,
      downOnBumper: bumperHere,
      lastPathableKey: k,
      passages: passagesInit,
      orderedBumperKeys: [],
      devtjLiveAppliedKeys: new Set(),
      trailPoints: [{ x: px, y: py }],
    };
    trailUiLastPushRef.current = performance.now();
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const spd = startPadDragRef.current;
    if (spd && spd.pointerId === e.pointerId && phase === "edit" && stage) {
      const rect = boardClientRect();
      if (!rect) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const wPx = Math.max(1, Math.floor(rect.width));
      const hPx = Math.max(1, Math.floor(rect.height));
      const layout = boardLayoutRef.current ?? computeBoardLayout(stage, wPx, hPx);
      const rad = Math.max(6, layout.cellPx * 0.22);
      const nx = spd.startBallX + (px - spd.startPx);
      const ny = spd.startBallY + (py - spd.startPy);
      const clamped = clampBallCenterInStartPad(nx, ny, stage, layout, rad);
      editBallPadRef.current = clamped;
      const pr = startPadPixelRect(stage, layout);
      if (clamped.y - rad <= pr.top + 0.75) {
        startPadDragRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        beginShot();
      }
      return;
    }

    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId || !stage) return;
    const rect = boardClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const dxFromStart = px - g.startX;
    const dyFromStart = py - g.startY;
    g.maxDistSq = Math.max(g.maxDistSq, dxFromStart * dxFromStart + dyFromStart * dyFromStart);

    const newCell = pixelToCell(px, py);
    const newKey = newCell ? keyCell(newCell.c, newCell.r) : null;
    let trailTrimmedThisMove = false;
    /** マスから抜けた／別マスへ入った境界：退出したバンパーマスを軌跡フィットで判定 */
    if (newKey !== g.lastPathableKey) {
      const oldKey = g.lastPathableKey;
      const edx = px - g.prevX;
      const edy = py - g.prevY;
      const m2 = edx * edx + edy * edy;

      if (oldKey != null) {
        if (stage.bumpers.has(oldKey) && m2 >= ENTRY_VEC_MIN_SQ) {
          const acc = g.passages.get(oldKey);
          if (acc) {
            const wPx = Math.max(1, Math.floor(rect.width));
            const hPx = Math.max(1, Math.floor(rect.height));
            const layoutMv = boardLayoutRef.current ?? computeBoardLayout(stage, wPx, hPx);
            const rrect = cellRectPx(acc.c, acc.r, layoutMv);
            const Q =
              exitPointOnRect(g.prevX, g.prevY, px, py, rrect) ??
              closestPointOnRectBoundary(g.prevX, g.prevY, rrect);
            const res = evaluateBumperPassage(acc.p, Q, acc.samples, rrect, debugTjMaxArcFactor);
            if (isDebugMode) {
              setTjTrajectoryDebug({
                cellKey: oldKey,
                rejected: res.ok ? undefined : res.reason,
                picked: res.ok ? res.kind : undefined,
                meanDists: res.meanDists,
                similarities: res.similarities,
                arcLen: res.arcLen,
                maxArcLimit: res.maxArcLimit,
              });
            }
            trailTrimmedThisMove = true;
            cancelTrailFade();
            g.trailPoints = [{ x: res.trimTo.x, y: res.trimTo.y }];
            trailUiLastPushRef.current = performance.now();
            if (res.ok) {
              const pq = passageDisplayPolyline(acc.p, Q, acc.samples);
              flushTrailToUi(pq);
              setTrailStrokeOpacity(1);
              startTrailFadeOut(TRAJECTORY_BUMPER_FLASH_MS);
              const b = stage.bumpers.get(oldKey);
              if (b) {
                b.display = res.kind;
                bumperSectorByKeyRef.current.set(oldKey, sectorIndexForDisplayKind(res.kind));
              }
              g.devtjLiveAppliedKeys.add(oldKey);
              g.orderedBumperKeys.push(oldKey);
              pulseBumperFlash(oldKey, TRAJECTORY_BUMPER_FLASH_MS, "trajectory");
            } else {
              flushTrailToUi([]);
              setTrailStrokeOpacity(1);
            }
          }
        }
        g.passages.delete(oldKey);
      }

      if (newKey != null && stage.bumpers.has(newKey)) {
        const wPx = Math.max(1, Math.floor(rect.width));
        const hPx = Math.max(1, Math.floor(rect.height));
        const layoutEn = boardLayoutRef.current ?? computeBoardLayout(stage, wPx, hPx);
        const { c, r } = parseKey(newKey);
        const nrect = cellRectPx(c, r, layoutEn);
        const P =
          entryPointOnRect(g.prevX, g.prevY, px, py, nrect) ?? closestPointOnRectBoundary(px, py, nrect);
        g.passages.set(newKey, { p: P, samples: [], c, r });
      }

      g.lastPathableKey = newKey;
    }

    if (newKey != null && stage.bumpers.has(newKey)) {
      const acc = g.passages.get(newKey);
      if (acc) {
        acc.samples.push({ x: px, y: py });
      }
    }

    if (!trailTrimmedThisMove) {
      g.trailPoints.push({ x: px, y: py });
      const now = performance.now();
      if (now - trailUiLastPushRef.current >= 24) {
        trailUiLastPushRef.current = now;
        flushTrailToUi(g.trailPoints);
      }
    }

    g.prevX = px;
    g.prevY = py;
    g.lastX = px;
    g.lastY = py;
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const spdUp = startPadDragRef.current;
    if (spdUp && spdUp.pointerId === e.pointerId) {
      startPadDragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    gestureRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const st = stage;
    if (!st || phase !== "edit") {
      cancelTrailFade();
      flushTrailToUi([]);
      setTrailStrokeOpacity(1);
      return;
    }

    const totalDx = g.lastX - g.startX;
    const totalDy = g.lastY - g.startY;
    const totalSq = totalDx * totalDx + totalDy * totalDy;

    const isSwipeGesture = totalSq >= DEV_SWIPE_MIN_SQ || g.orderedBumperKeys.length > 0;

    if (isSwipeGesture) {
      const applyKeys: string[] = [];
      const seen = new Set<string>();
      for (const k of g.orderedBumperKeys) {
        if (!seen.has(k)) {
          seen.add(k);
          applyKeys.push(k);
        }
      }
      if (g.downOnBumper && g.downCellKey != null && !seen.has(g.downCellKey)) {
        applyKeys.unshift(g.downCellKey);
        seen.add(g.downCellKey);
      }

      /** 盤外開始→バンパーへ入ったが一度も抜けずに離した場合など、退出判定が一度も無いマスを up で確定 */
      const linger = g.lastPathableKey;
      if (
        linger != null &&
        st.bumpers.has(linger) &&
        !g.devtjLiveAppliedKeys.has(linger) &&
        !seen.has(linger)
      ) {
        applyKeys.push(linger);
        seen.add(linger);
      }

      const rectUp = boardClientRect();
      const wUp = Math.max(1, Math.floor(rectUp?.width ?? 1));
      const hUp = Math.max(1, Math.floor(rectUp?.height ?? 1));
      const layoutUp = boardLayoutRef.current ?? computeBoardLayout(st, wUp, hUp);

      const upApplied: string[] = [];
      let lastPqForFade: Pt[] | null = null;
      for (const k of applyKeys) {
        if (g.devtjLiveAppliedKeys.has(k)) continue;
        const acc = g.passages.get(k);
        if (acc) {
          const rrect = cellRectPx(acc.c, acc.r, layoutUp);
          const Q = closestPointOnRectBoundary(g.lastX, g.lastY, rrect);
          const res = evaluateBumperPassage(acc.p, Q, acc.samples, rrect, debugTjMaxArcFactor);
          if (isDebugMode) {
            setTjTrajectoryDebug({
              cellKey: k,
              rejected: res.ok ? undefined : res.reason,
              picked: res.ok ? res.kind : undefined,
              meanDists: res.meanDists,
              similarities: res.similarities,
              arcLen: res.arcLen,
              maxArcLimit: res.maxArcLimit,
            });
          }
          g.trailPoints = [{ x: res.trimTo.x, y: res.trimTo.y }];
          if (res.ok) {
            const b = st.bumpers.get(k);
            if (b) {
              b.display = res.kind;
              bumperSectorByKeyRef.current.set(k, sectorIndexForDisplayKind(res.kind));
              upApplied.push(k);
              lastPqForFade = passageDisplayPolyline(acc.p, Q, acc.samples);
            }
          }
        } else {
          const b = st.bumpers.get(k);
          if (b) {
            b.display = swipeToBumperKind(totalDx, totalDy);
            bumperSectorByKeyRef.current.set(k, sectorIndexForDisplayKind(b.display));
            upApplied.push(k);
          }
        }
        g.passages.delete(k);
      }
      if (upApplied.length > 0) {
        const t0 = performance.now();
        for (const k of upApplied) {
          bumperFlashRef.current.set(k, { t0, ms: TRAJECTORY_BUMPER_FLASH_MS, mode: "trajectory" });
        }
        setBumperTick((t) => t + 1);
      }

      cancelTrailFade();
      if (lastPqForFade && lastPqForFade.length >= 2) {
        flushTrailToUi(lastPqForFade);
        setTrailStrokeOpacity(1);
        startTrailFadeOut(TRAJECTORY_BUMPER_FLASH_MS);
      } else {
        flushTrailToUi([]);
        setTrailStrokeOpacity(1);
      }
    } else {
      cancelTrailFade();
      flushTrailToUi([]);
      setTrailStrokeOpacity(1);
      if (g.downOnBumper && g.downCellKey != null && g.maxDistSq <= TAP_MAX_SQ) {
        const dk = g.downCellKey;
        const b = st.bumpers.get(dk);
        if (b) {
          const cur =
            bumperSectorByKeyRef.current.get(dk) ?? sectorIndexForDisplayKind(b.display);
          const next = (cur + 1) % 8;
          b.display = BUMPER_KIND_BY_SECTOR[next]!;
          bumperSectorByKeyRef.current.set(dk, next);
          pulseBumperFlash(dk, TRAJECTORY_BUMPER_FLASH_MS, "trajectory");
        }
      }
    }
  };

  const onPointerCancel = (e: PointerEvent<HTMLCanvasElement>) => {
    if (startPadDragRef.current?.pointerId === e.pointerId) {
      startPadDragRef.current = null;
    }
    gestureRef.current = null;
    cancelTrailFade();
    flushTrailToUi([]);
    setTrailStrokeOpacity(1);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const regen = () => {
    refreshAds();
    setShowWinOverlay(false);
    setShowFailOverlay(false);
    setSeed((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0);
  };

  const autoSolve = () => {
    const st = stage;
    if (!st || phase !== "edit") return;
    st.bumpers.forEach((v) => {
      v.display = v.solution;
    });
    alignDummyBumpersOnSolutionPathForAutoSolve(st);
    st.bumpers.forEach((bump, k) => {
      bumperSectorByKeyRef.current.set(k, sectorIndexForDisplayKind(bump.display));
    });
    setBumperTick((t) => t + 1);
    setTimeout(() => beginShot(), 30);
  };

  const retryAfterLoss = () => {
    if (!stage) return;
    refreshAds();
    setShowFailOverlay(false);
    editBallPadRef.current = null;
    pathSegHistoryRef.current = [];
    crossGemAwardedThisSegRef.current = false;
    revisitCrossCellStateRef.current.clear();
    crossFlashRef.current = null;
    bumperIncomingFirstRef.current.clear();
    twoSidedBumperUsedRef.current.clear();
    collectedGemsRef.current = 0;
    setCollectedGems(0);
    gemParticlesRef.current.length = 0;
    goalSparklesRef.current.length = 0;
    wallSparklesRef.current.length = 0;
    goalUnlockPulseRef.current = 0;
    finishAnimRef.current = null;
    lostBallAnimRef.current = null;
    setGemGoalFail(false);
    setLaunchArrowDismissed(false);
    setPrepSessionNonce((n) => n + 1);
    setPhase("edit");
    setStatusMsg("");
    simRef.current = {
      logicalCell: { ...stage.startPad },
      travelDir: shotEntryDir(stage),
      fromCell: { ...stage.startPad },
      toCell: { ...stage.startPad },
      lerp01: 0,
      leftStart: false,
      padLaunchPx: null,
    };
  };

  useEffect(() => {
    const onLoad = () => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (window.innerWidth < 1024) {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            return;
          }
          const top = topAdRef.current?.getBoundingClientRect().top ?? 0;
          window.scrollTo({ top: window.scrollY + top, left: 0, behavior: "auto" });
        })
      );
    };
    if (typeof document === "undefined") return;
    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    if (!helpOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [helpOpen]);

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);

  const renderHelpRuleParagraphs = () => {
    const rg = stage?.grade ?? grade;
    return (
      <div className="reflec-shot-doc-rules flex flex-col gap-2 text-left text-xs leading-relaxed text-[var(--color-muted)]">
        <p className="m-0 font-medium">{t("games.reflecShot.ruleIntro")}</p>
        {rg >= 3 && rg <= 4 && <p className="m-0">{t("games.reflecShot.ruleCrossBonus")}</p>}
        {rg >= 5 && rg !== 6 && <p className="m-0">{t("games.reflecShot.ruleCrossBonus")}</p>}
        {rg >= 5 && <p className="m-0">{t("games.reflecShot.ruleTwoSidedBonus")}</p>}
      </div>
    );
  };

  const debugViewportMaxWidth =
    isDevTj && isDebugMode
      ? debugViewportPreset === "mobile"
        ? 430
        : debugViewportPreset === "tablet"
          ? 820
          : 1440
      : undefined;

  return (
    <div
      className={`${GAME_COLUMN_CLASS} flex min-h-0 flex-1 flex-col lg:max-w-none`}
      style={debugViewportMaxWidth ? { maxWidth: `${debugViewportMaxWidth}px` } : undefined}
    >
      {isDevTj && !isDebugMode && (
        <div className="fixed right-4 top-4 z-50">
          <button
            type="button"
            onClick={() => setIsDebugMode(true)}
            className="rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_55%,var(--color-bg))] px-2 py-1 text-xs font-mono text-[var(--color-text)]"
          >
            DEBUG OFF
          </button>
        </div>
      )}
      {isDevTj && isDebugMode && (
        <div className="fixed right-4 top-4 z-50 max-h-[90vh] overflow-y-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_16%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-bg))] p-3 text-xs font-mono text-left text-[var(--color-text)] shadow-lg backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {isDebugPanelExpanded && (
              <span className="font-bold text-[var(--color-primary)]">{t("games.reflecShot.debugPanelTitle")}</span>
            )}
            <div className="flex flex-wrap items-center gap-1 ml-auto">
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
                className="p-1 rounded border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[var(--color-muted)]"
              >
                {isDebugPanelExpanded ? "▲" : "▼"}
              </button>
            </div>
          </div>
          {isDebugPanelExpanded && (
            <>
              <div className="mt-2 rounded-lg border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-2 py-1.5 text-[10px] text-[var(--color-text)]">
                <div className="font-semibold text-[var(--color-primary)]">{t("games.reflecShot.debugPrepTimerLabel")}</div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono tabular-nums">
                  <span className="text-[var(--color-muted)]">
                    {phase === "move" || phase === "wallFx" || phase === "goalFx"
                      ? t("games.reflecShot.phaseMove")
                      : "—"}
                  </span>
                  <span>{stage ? formatPrepDurationMmSs(prepMs) : "—"}</span>
                </div>
              </div>
              <div className="mt-2 rounded-lg border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-2 py-1.5 text-[10px] text-[var(--color-text)]">
                <div className="font-semibold text-[var(--color-primary)]">{t("games.reflecShot.debugViewportPreset")}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {([
                    ["pc", t("games.reflecShot.debugViewportPc")],
                    ["tablet", t("games.reflecShot.debugViewportTablet")],
                    ["mobile", t("games.reflecShot.debugViewportMobile")],
                  ] as const).map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDebugViewportPreset(preset)}
                      className={`rounded border px-2 py-1 text-[10px] ${
                        debugViewportPreset === preset
                          ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_16%,var(--color-bg))] text-[var(--color-primary)]"
                          : "border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] text-[var(--color-muted)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex flex-col gap-1.5 text-[var(--color-muted)]">
                <span className="text-[10px] leading-tight text-[var(--color-muted)]">
                  {t("games.reflecShot.debugTrajectoryStyleLabel")}
                </span>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="reflec-shot-trajectory-style"
                    checked={trajectoryStyle === "curved"}
                    onChange={() => setTrajectoryStyle("curved")}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="text-[10px] leading-snug">{t("games.reflecShot.debugTrajectoryStyleCurved")}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="reflec-shot-trajectory-style"
                    checked={trajectoryStyle === "vertexDots"}
                    onChange={() => setTrajectoryStyle("vertexDots")}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="text-[10px] leading-snug">
                    {t("games.reflecShot.debugTrajectoryStyleVertexDots")}
                  </span>
                </label>
                {trajectoryStyle === "curved" && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[var(--color-muted)]">
                    <span className="shrink-0 text-[10px]">
                      {t("games.reflecShot.debugTrajectoryCornerRadius")}
                    </span>
                    <input
                      type="range"
                      min={TRAJECTORY_CORNER_RADIUS_MIN}
                      max={TRAJECTORY_CORNER_RADIUS_MAX}
                      step={0.25}
                      value={debugTrajectoryCornerRadiusPx}
                      onChange={(e) => setDebugTrajectoryCornerRadiusPx(Number(e.target.value))}
                      className="flex-1 min-w-0 accent-[var(--color-accent)]"
                    />
                    <span className="tabular-nums w-12 text-right text-[10px] text-[color-mix(in_srgb,var(--color-accent)_72%,var(--color-bg))]">
                      {debugTrajectoryCornerRadiusPx.toFixed(2)}px
                    </span>
                  </div>
                )}
              </div>
              <DebugClearModalBackdropControls />
              <label className="mt-2 flex flex-wrap items-center gap-2 text-[var(--color-muted)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSolutionPath}
                  onChange={(e) => setShowSolutionPath(e.target.checked)}
                  style={{ accentColor: "var(--color-primary)" }}
                  className="accent-[var(--color-primary)]"
                />
                {t("games.reflecShot.debugShowSolutionPath")}
              </label>
              {showSolutionPath && stage && (
                <div className="mt-1 rounded-2xl border border-[color-mix(in_srgb,var(--color-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_08%,var(--color-bg))] px-2 py-1.5 text-[10px] leading-snug text-[var(--color-text)] font-mono space-y-0.5">
                  <div className="font-semibold text-[var(--color-primary)]">
                    {t("games.reflecShot.debugGemRulePanelTitle")}
                  </div>
                  <div>
                    {(() => {
                      const r = computeRequiredGemCountForStage(stage);
                      return (
                        <>
                          base={stage.gemRuleBaseBends ?? r.baseBends} crossPairs={r.crossings}{" "}
                          revisitCross={r.revisitCrossCells} crossEff=
                          {stage.gemExpectedCrossings ?? Math.max(r.revisitCrossCells, r.crossings)}{" "}
                          twoSided=
                          {stage.gemExpectedTwoSidedBends ?? r.twoSidedBends}
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    requiredGem=
                    {stage.requiredGemCount ?? computeRequiredGemCountForStage(stage).required}{" "}
                    (GoalPad)
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[var(--color-muted)]">
                <span className="shrink-0 text-[10px]">{t("games.reflecShot.debugDummyDensity")}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={debugDummyDensityPct}
                  onChange={(e) => setDebugDummyDensityPct(Number(e.target.value))}
                  className="min-w-[120px] flex-1 accent-lime-400"
                />
                <span className="tabular-nums w-9 text-right text-[10px] text-lime-200/90">
                  {debugDummyDensityPct}%
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))]">
                {grade <= 2
                  ? t("games.reflecShot.debugInitialWrongRateGrade12")
                  : t("games.reflecShot.debugInitialWrongRate").replace("{pct}", String(initialWrongRatePct))}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[var(--color-muted)]">
                <span className="shrink-0 text-[10px]">{t("games.reflecShot.debugBallSpeed")}</span>
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.25}
                  value={debugBallSpeedMult}
                  onChange={(e) => setDebugBallSpeedMult(Number(e.target.value))}
                  className="flex-1 min-w-0 accent-[var(--color-primary)]"
                />
                <span className="tabular-nums w-10 text-right text-[10px] text-[var(--color-muted)]/90">{debugBallSpeedMult}×</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[var(--color-muted)]">
                <span className="shrink-0 text-[10px]">{t("games.reflecShot.debugGemAttract")}</span>
                <input
                  type="range"
                  min={1}
                  max={7.5}
                  step={0.25}
                  value={debugGemAttractMult}
                  onChange={(e) => setDebugGemAttractMult(Number(e.target.value))}
                  className="flex-1 min-w-0 accent-[var(--color-accent)]"
                />
                <span className="tabular-nums w-10 text-right text-[10px] text-[color-mix(in_srgb,var(--color-accent)_70%,var(--color-bg))]">
                  {debugGemAttractMult}×
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[var(--color-muted)]">
                <span className="shrink-0 text-[10px]">{t("games.reflecShot.debugCrossFlashArm")}</span>
                <input
                  type="range"
                  min={10}
                  max={55}
                  step={1}
                  value={debugCrossFlashArmPct}
                  onChange={(e) => setDebugCrossFlashArmPct(Number(e.target.value))}
                  className="flex-1 min-w-0 accent-orange-400"
                />
                <span className="tabular-nums w-9 text-right text-[10px] text-orange-200/90">
                  {debugCrossFlashArmPct}%
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[var(--color-muted)]">
                <span className="shrink-0 text-[10px]">{t("games.reflecShot.debugWallFxMs")}</span>
                <input
                  type="range"
                  min={100}
                  max={2000}
                  step={50}
                  value={debugWallFxMs}
                  onChange={(e) => setDebugWallFxMs(Number(e.target.value))}
                  className="flex-1 min-w-0 accent-rose-400"
                />
                <span className="tabular-nums w-11 text-right text-[10px] text-rose-200/90">
                  {debugWallFxMs}ms
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[var(--color-muted)]">
                <span className="shrink-0 text-[10px]">{t("games.reflecShot.debugGoalFxMs")}</span>
                <input
                  type="range"
                  min={100}
                  max={2000}
                  step={50}
                  value={debugGoalFxMs}
                  onChange={(e) => setDebugGoalFxMs(Number(e.target.value))}
                  className="flex-1 min-w-0 accent-fuchsia-400"
                />
                <span className="tabular-nums w-11 text-right text-[10px] text-fuchsia-200/90">
                  {debugGoalFxMs}ms
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1 text-[var(--color-muted)]">
                <span className="text-[10px] leading-tight text-[var(--color-muted)]">
                  devtj 軌跡判定・弧長上限（対角線×倍率）
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.05}
                    value={debugTjMaxArcFactor}
                    onChange={(e) => setDebugTjMaxArcFactor(Number(e.target.value))}
                    className="flex-1 min-w-0 accent-[var(--color-accent)]"
                  />
                  <span className="tabular-nums w-12 text-right text-[10px] text-[color-mix(in_srgb,var(--color-accent)_72%,var(--color-bg))]">
                    ×{debugTjMaxArcFactor.toFixed(2)}
                  </span>
                </div>
                {tjTrajectoryDebug && (
                  <div className="mt-1 rounded border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_85%,var(--color-bg))]/80 p-2 text-[10px] leading-snug text-[var(--color-muted)]">
                    <div className="font-semibold text-[var(--color-primary)]">最終判定マス: {tjTrajectoryDebug.cellKey}</div>
                    {tjTrajectoryDebug.rejected && (
                      <div className="text-[var(--color-accent)]">却下: {tjTrajectoryDebug.rejected}</div>
                    )}
                    {tjTrajectoryDebug.picked && (
                      <div className="text-[var(--color-primary)]">採用: {tjTrajectoryDebug.picked}</div>
                    )}
                    {tjTrajectoryDebug.arcLen != null && tjTrajectoryDebug.maxArcLimit != null && (
                      <div className="text-[var(--color-muted)]">
                        弧長 {tjTrajectoryDebug.arcLen.toFixed(1)} / 上限 {tjTrajectoryDebug.maxArcLimit.toFixed(1)} px
                      </div>
                    )}
                    <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[var(--color-muted)]">
                      {(["PIPE", "SLASH", "HYPHEN", "BACKSLASH"] as const).map((kind) => (
                        <div key={kind} className="flex justify-between gap-1">
                          <span>{kind}</span>
                          <span className="tabular-nums text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))]">
                            μ=
                            {tjTrajectoryDebug.meanDists[kind] != null
                              ? tjTrajectoryDebug.meanDists[kind]!.toFixed(3)
                              : "—"}{" "}
                            S=
                            {tjTrajectoryDebug.similarities[kind] != null
                              ? tjTrajectoryDebug.similarities[kind]!.toFixed(0)
                              : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {grade === 4 && (
                <div className="mt-2 flex flex-col gap-0.5 text-[var(--color-muted)]">
                  <span className="text-[10px] leading-tight">
                    {t("games.reflecShot.debugGrade2Mid").replace(
                      "{n}",
                      String(debugGrade2Bend6MidSlider + 4)
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={2}
                      max={4}
                      step={1}
                      value={debugGrade2Bend6MidSlider}
                      onChange={(e) => setDebugGrade2Bend6MidSlider(Number(e.target.value))}
                      className="flex-1 min-w-0 accent-[var(--color-accent)]"
                    />
                    <span className="tabular-nums w-8 text-right text-[10px] text-[color-mix(in_srgb,var(--color-accent)_70%,var(--color-bg))]">
                      {debugGrade2Bend6MidSlider}
                    </span>
                  </div>
                </div>
              )}
              {grade === 5 && (
                <div className="mt-2 flex flex-col gap-1 text-[var(--color-muted)]">
                  <span className="text-[10px] leading-tight text-[var(--color-muted)]">{t("games.reflecShot.debugGenModeLv4")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDebugLv4GenMode("default")}
                      className={`rounded border px-2 py-0.5 text-[10px] ${
                        debugLv4GenMode === "default"
                          ? "border-violet-400 bg-[var(--color-primary)]/25 text-violet-100"
                          : "border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[var(--color-muted)]"
                      }`}
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      onClick={() => setDebugLv4GenMode("rFirst")}
                      className={`rounded border px-2 py-0.5 text-[10px] ${
                        debugLv4GenMode === "rFirst"
                          ? "border-violet-400 bg-[var(--color-primary)]/25 text-violet-100"
                          : "border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[var(--color-muted)]"
                      }`}
                    >
                      R-First
                    </button>
                    <button
                      type="button"
                      onClick={() => setDebugLv4GenMode("rSecond")}
                      className={`rounded border px-2 py-0.5 text-[10px] ${
                        debugLv4GenMode === "rSecond"
                          ? "border-violet-400 bg-[var(--color-primary)]/25 text-violet-100"
                          : "border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[var(--color-muted)]"
                      }`}
                    >
                      R-Second
                    </button>
                  </div>
                </div>
              )}
              <div className="mt-2 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] pt-2 space-y-0.5 text-[var(--color-muted)]/90 text-[10px]">
                <div>
                  Build:{" "}
                  {typeof window !== "undefined" && window.location.hostname === "localhost"
                    ? "LOCAL"
                    : process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "-"}
                </div>
                <div>Time: {process.env.NEXT_PUBLIC_BUILD_DATE || "-"}</div>
                <div>
                  {t("games.reflecShot.debugWorkerLabel")}{" "}
                  {isGenerating
                    ? "RUNNING"
                    : lastMetrics
                      ? `${lastMetrics.totalMs.toFixed(1)} ms`
                      : "—"}
                </div>
                {lastMetrics && (
                  <div className="text-[9px] text-[var(--color-muted)] leading-snug space-y-0.5">
                    <div>
                      {t("games.reflecShot.debugGenPath")}{" "}
                      <span
                        className={
                          lastMetrics.usedPrimary ? "text-[var(--color-primary)]" : "text-[var(--color-accent)]"
                        }
                      >
                        {lastMetrics.usedPrimary
                          ? t("games.reflecShot.debugPrimary")
                          : `${t("games.reflecShot.debugFallback")}${lastMetrics.fallbackT}`}
                      </span>
                    </div>
                    <div className="break-all">
                      seed req…eff:{" "}
                      <code className="text-[var(--color-muted)]">
                        0x{(lastMetrics.requestSeed >>> 0).toString(16)}
                      </code>
                      {lastMetrics.requestSeed >>> 0 !== (lastMetrics.effectiveSeed >>> 0) ? (
                        <>
                          {" → "}
                          <code className="text-[var(--color-accent)]">0x{(lastMetrics.effectiveSeed >>> 0).toString(16)}</code>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
                <div className="text-[var(--color-muted)]/80">
                  Stock:{" "}
                  {REFLECT_SHOT_STOCK_GRADES.map((g) => (
                    <span key={g} className="mr-1.5">
                      G{g} {stockCounts[g]}/{MAX_STOCK_SIZE}
                    </span>
                  ))}
                </div>
                <div className="text-[var(--color-muted)]">
                  Source:{" "}
                  {boardDisplaySource === "stock"
                    ? "Stock"
                    : boardDisplaySource === "generated"
                      ? "Generated"
                      : "—"}
                  {(stage?.grade === 3 || stage?.grade === 4) && stage.grade2PadAdjustLabel && (
                    <span className="text-yellow-300"> {stage.grade2PadAdjustLabel}</span>
                  )}
                  {stage?.reflecSourceStartExtended && (
                    <span className="text-yellow-300"> start extended</span>
                  )}
                </div>
                <label className="flex items-center gap-2 text-[var(--color-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stockPrefetchPaused}
                    onChange={(e) => setStockPrefetchPaused(e.target.checked)}
                    className="accent-[var(--color-accent)]"
                  />
                  {t("games.reflecShot.debugStockPause")}
                </label>
                <button
                  type="button"
                  onClick={() => refreshAds()}
                  className="mt-1 px-2 py-0.5 rounded text-[10px] border border-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_15%,var(--color-bg))] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_22%,var(--color-bg))]"
                >
                  {t("games.reflecShot.debugFlashTest")}
                </button>
              </div>
              <div className="mt-2 border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] pt-2 space-y-1.5">
                <div className="font-semibold text-[var(--color-muted)] text-[10px]">{t("games.reflecShot.debugSeedLabel")}</div>
                <div className="flex items-start gap-1 flex-wrap">
                  <span className="text-[var(--color-muted)] shrink-0 text-[10px]">{t("games.reflecShot.debugBoardPrev")}</span>
                  <code className="text-[9px] break-all flex-1 min-w-0 bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] px-1 rounded text-[var(--color-accent)] max-h-20 overflow-y-auto">
                    {debugPreviousBoard
                      ? `rs2.${debugPreviousBoard.grade}.${(debugPreviousBoard.seed >>> 0).toString(16)}`
                      : "-"}
                  </code>
                </div>
                <div className="flex items-start gap-1 flex-wrap">
                  <span className="text-[var(--color-muted)] shrink-0 text-[10px]">{t("games.reflecShot.debugBoardCurr")}</span>
                  <code
                    className="text-[9px] break-all flex-1 min-w-0 bg-[color-mix(in_srgb,var(--color-text)_06%,var(--color-bg))] px-1 rounded text-[var(--color-primary)] max-h-20 overflow-y-auto"
                    title={currentStageHash || "—"}
                  >
                    {currentStageHash || "—"}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentStageHash && navigator.clipboard) {
                        navigator.clipboard.writeText(currentStageHash);
                      }
                    }}
                    disabled={!currentStageHash}
                    className="px-1.5 py-0.5 rounded text-[9px] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-text)_20%,transparent)] disabled:opacity-40 shrink-0"
                  >
                    {t("games.reflecShot.debugCopy")}
                  </button>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[var(--color-muted)] shrink-0 text-[10px]">{t("games.reflecShot.debugInputLabel")}</span>
                  <input
                    type="text"
                    value={hashInput}
                    onChange={(e) => setHashInput(e.target.value)}
                    placeholder="rs2.{grade}.{hex}"
                    className="flex-1 min-w-0 px-1.5 py-0.5 rounded text-[10px] bg-[color-mix(in_srgb,var(--color-surface)_35%,var(--color-bg))] border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] text-[var(--color-text)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const s = hashInput.trim();
                      if (s) applyStageFromHash(s);
                    }}
                    disabled={!hashInput.trim() || isGenerating || boardLoadWait}
                    className="px-2 py-0.5 rounded text-[10px] border border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-bg))] text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))] disabled:opacity-40"
                  >
                    {t("games.reflecShot.debugGenFromHash")}
                  </button>
                </div>
                <p className="text-[9px] text-[color-mix(in_srgb,var(--color-muted)_85%,var(--color-bg))] leading-snug">
                  <code className="text-[var(--color-muted)]">rs2.</code>
                  {t("games.reflecShot.debugHashHelpMid")}
                  <code className="text-[var(--color-muted)]">rs1.</code>
                  {t("games.reflecShot.debugHashHelpTail")}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      <GamePageHeader
        titleEn="Reflec-Shot"
        titleJa="リフレクショット"
        breadcrumbs={[
          { label: "ホーム", href: "/" },
          { label: "教材一覧", href: "/#lab-cards" },
          { label: "Reflec-Shot", href: "/lab/reflec-shot" },
        ]}
      />

      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div
          ref={topAdRef}
          className="order-3 mt-3 w-full shrink-0 md:order-1 md:mt-0"
          style={{ marginBottom: GAME_AD_GAP_AFTER_SLOT_1_PX }}
        >
          <div className="mx-auto w-full max-w-[980px]">
            <ReflecShotAdSlot slotIndex={1} />
          </div>
        </div>

        <div className="order-1 flex min-h-0 w-full flex-1 flex-col gap-3 lg:order-2 lg:flex-row lg:items-start lg:gap-5">
          <div
            className="reflec-shot-canvas-container relative flex min-h-0 w-full flex-1 flex-col items-center justify-center lg:min-w-0 lg:h-[clamp(430px,calc(100dvh-var(--reflec-top-ad-reserved)-24px),920px)] lg:max-h-[calc(100dvh-var(--reflec-top-ad-reserved)-24px)]"
            style={
              {
                "--reflec-top-ad-reserved": `${GAME_TOP_AD_RESERVED_PX}px`,
              } as CSSProperties
            }
          >
            <section className="relative z-[1] w-full max-w-[520px] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-4 pb-3 pt-0 backdrop-blur sm:px-5 sm:pb-4 sm:pt-0 lg:h-full lg:max-w-none lg:px-4 lg:pb-3 lg:pt-0">
              <button
                type="button"
                aria-label={t("games.reflecShot.helpOpenAria")}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHelpOpen(true);
                }}
                className="absolute right-2 top-2 z-20 grid h-9 w-9 touch-manipulation place-items-center rounded-full border border-[color-mix(in_srgb,var(--color-text)_24%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_88%,var(--color-bg))] text-[1.15rem] leading-none shadow-md"
              >
                📖
              </button>
              <div className="flex h-full w-full flex-col items-center">
                <div className="flex w-full flex-col gap-y-0 pb-0 pt-0.5 mb-0">
                  <div className="grid w-full min-h-5 grid-cols-1 items-center text-sm font-semibold leading-5 text-[var(--color-text)]">
                    <span className="min-w-0 truncate">
                      {phase === "move" || phase === "wallFx" || phase === "goalFx"
                        ? t("games.reflecShot.phaseMove")
                        : "\u00a0"}
                    </span>
                  </div>
                  <div className="flex min-h-5 w-full items-center text-sm leading-5">
                    {boardLoadWait && !statusMsg ? (
                      <span className="text-[var(--color-accent)]">{t("games.reflecShot.st.preparing")}</span>
                    ) : statusMsg &&
                      phase !== "won" &&
                      phase !== "lost" &&
                      phase !== "wallFx" &&
                      phase !== "goalFx" ? (
                      <span className="text-[var(--color-muted)]">{statusMsgDisplay}</span>
                    ) : null}
                  </div>
                </div>
                <div className="w-full" style={{ WebkitTapHighlightColor: "transparent" }}>
                  <div
                    ref={boardWrapRef}
                    className="relative mx-auto aspect-square w-full max-w-[min(95vw,75dvh)] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_90%,var(--color-bg))] lg:w-[clamp(360px,calc(100dvh-var(--reflec-top-ad-reserved)-88px),860px)] lg:max-w-full"
                  >
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 h-full w-full touch-none select-none cursor-default bg-[color-mix(in_srgb,var(--color-text)_90%,var(--color-bg))]"
                      style={{ touchAction: "none" }}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerCancel}
                    />
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl"
                      aria-hidden
                    >
                      {swipeTrailPoints.length >= 2 && (
                        <polyline
                          fill="none"
                          stroke="rgba(248, 250, 252, 0.88)"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ strokeOpacity: trailStrokeOpacity }}
                          points={swipeTrailPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                        />
                      )}
                      <g
                        className="trajectory-vertex-dots"
                        data-board-layout-rev={boardLayoutRevision}
                      >
                        {activeTrajectoryStyle === "vertexDots" &&
                          phase !== "edit" &&
                          trajectoryVertexDots.map((vd) => {
                            const lay = boardLayoutRef.current;
                            if (!lay) return null;
                            const cc = cellCenterPx(
                              vd.c,
                              vd.r,
                              lay.cellPx,
                              lay.ox,
                              lay.oy,
                              lay.rMin,
                              lay.cMin
                            );
                            const dbgSolDots = isDevTj && isDebugMode && showSolutionPath;
                            const sol = dbgSolDots && vd.isSolutionBumper;
                            const rr = sol ? TRAJECTORY_VERTEX_DOT_R_SOLUTION : TRAJECTORY_VERTEX_DOT_R;
                            const fill = sol ? "rgb(207, 250, 254)" : "rgb(255, 255, 255)";
                            const filt = sol
                              ? `drop-shadow(0 0 ${rr + 2.5}px rgba(34,211,238,0.78))`
                              : `drop-shadow(0 0 3px rgba(165,243,252,0.5))`;
                            return (
                              <circle
                                key={`${vd.born}-${vd.c}-${vd.r}`}
                                cx={cc.x}
                                cy={cc.y}
                                r={rr}
                                fill={fill}
                                opacity={isDevTj ? 0 : TRAJECTORY_VERTEX_DOT_BASE_OPACITY}
                                style={{ filter: filt }}
                              >
                                {isDevTj ? (
                                  <animate
                                    attributeName="opacity"
                                    to={String(TRAJECTORY_VERTEX_DOT_BASE_OPACITY)}
                                    dur={`${TRAJECTORY_VERTEX_DOT_FADE_MS}ms`}
                                    fill="freeze"
                                  />
                                ) : null}
                              </circle>
                            );
                          })}
                      </g>
                    </svg>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="order-2 w-full shrink-0 lg:sticky lg:top-5 lg:max-h-[calc(100dvh-20px)] lg:w-[360px] lg:self-start lg:overflow-y-auto">
            <div className="mb-1 mt-2 flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-start lg:mt-0 lg:flex-col lg:gap-3">
          <div className="w-full min-w-0 sm:flex-1 sm:min-w-0">
            <label className="block text-xs text-[var(--color-muted)] mb-1">{t("common.chooseGrade")}</label>
            <div
              className="flex w-full min-w-0 overflow-x-auto gap-2 py-1 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:[display:none]"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {([1, 2, 3, 4, 5, 6, 7] as const).map((g) => {
                const isActive = grade === g;
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={isActive}
                    disabled={isGenerating || boardLoadWait}
                    onClick={() => {
                      setShowWinOverlay(false);
                      setShowFailOverlay(false);
                      setGrade(g);
                      setPhase("edit");
                      setStatusMsg("");
                    }}
                    className={`shrink-0 snap-center whitespace-nowrap px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] touch-manipulation ${
                      isActive
                        ? "bg-[var(--color-primary)] text-[var(--color-on-primary)] border border-[var(--color-primary)]"
                        : "bg-[color-mix(in_srgb,var(--color-text)_78%,var(--color-bg))] text-[var(--color-text)] border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-text)_70%,var(--color-bg))]"
                    } disabled:opacity-50 disabled:pointer-events-none`}
                    title={bendOrBumperHint(g)}
                  >
                    G{g}
                  </button>
                );
              })}
            </div>
          </div>

        {isDevTj && (
          <div className="mt-2 flex flex-wrap justify-center gap-2 pb-1 lg:justify-start">
            <button
              type="button"
              disabled={isGenerating || boardLoadWait}
              className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_15%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2 text-[var(--color-text)] text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] disabled:opacity-40 disabled:pointer-events-none"
              onClick={regen}
            >
              {t("games.reflecShot.regenStage")}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_12%,var(--color-bg))] px-3 py-2 text-[var(--color-primary)] text-sm hover:bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-bg))]"
              onClick={autoSolve}
            >
              {t("games.reflecShot.autoSolve")}
            </button>
          </div>
        )}

        {!isDevTj && (
          <div className="mt-2 flex justify-center pb-1 lg:justify-start">
            <button
              type="button"
              disabled={isGenerating || boardLoadWait}
              className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_15%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2 text-[var(--color-text)] text-sm hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] disabled:opacity-40 disabled:pointer-events-none"
              onClick={regen}
            >
              {t("games.reflecShot.regenStage")}
            </button>
          </div>
        )}
            </div>

            <div className="mt-1 flex w-full flex-col gap-2 lg:hidden">
          <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
              {t("games.reflecShot.accordionRulesSummary")}
            </summary>
            <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-sm leading-relaxed text-[var(--color-muted)]">
              {renderHelpRuleParagraphs()}
            </div>
          </details>
          <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
              {t("games.reflecShot.accordionControlsSummary")}
            </summary>
            <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
              <p className="m-0 whitespace-pre-line md:hidden">{t("games.reflecShot.ruleControls")}</p>
              <p className="m-0 hidden md:block md:text-[11px] md:leading-relaxed">{t("games.reflecShot.ruleControlsPc")}</p>
            </div>
          </details>
          <details className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] text-[var(--color-text)]">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
              {t("games.reflecShot.accordionGoalSummary")}
            </summary>
            <div className="border-t border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--color-muted)]">
              <p className="m-0">【ねらい】{t("games.reflecShot.infoGoal")}</p>
              <p className="mt-2 m-0">【対象】{t("games.reflecShot.infoTarget")}</p>
            </div>
          </details>
            </div>

            <div className="mt-1 hidden w-full flex-col gap-2 lg:flex">
              <section className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("games.reflecShot.accordionRulesSummary")}</h3>
                <div className="mt-2">{renderHelpRuleParagraphs()}</div>
              </section>
              <section className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("games.reflecShot.accordionControlsSummary")}</h3>
                <p className="mt-2 m-0 text-[11px] leading-relaxed text-[var(--color-muted)]">{t("games.reflecShot.ruleControlsPc")}</p>
              </section>
            </div>

            <div
              className="relative z-0 w-full"
              style={{ minHeight: 100, marginTop: GAME_AD_GAP_BEFORE_SLOT_2_PX }}
            >
              <ReflecShotAdSlot slotIndex={2} />
            </div>
          </aside>
        </div>

        <section className="order-4 mx-auto mt-6 hidden w-full max-w-3xl rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-2 lg:block">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("games.reflecShot.accordionGoalSummary")}</h3>
          <p className="mt-2 m-0 text-xs leading-relaxed text-[var(--color-muted)]">【ねらい】{t("games.reflecShot.infoGoal")}</p>
          <p className="mt-2 m-0 text-xs leading-relaxed text-[var(--color-muted)]">【対象】{t("games.reflecShot.infoTarget")}</p>
        </section>
      </div>

      {helpOpen && (
        <div
          className="fixed inset-0 z-[10020] flex items-center justify-center bg-[rgba(0,0,0,0.52)] p-4"
          onClick={() => setHelpOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[var(--color-surface)] p-4 text-[var(--color-text)] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reflec-help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] pb-2">
              <h2 id="reflec-help-title" className="text-lg font-bold text-[var(--color-primary)]">
                {t("games.reflecShot.helpTitle")}
              </h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="shrink-0 rounded-lg border border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]"
              >
                {t("games.reflecShot.helpClose")}
              </button>
            </div>
            <div className="border-b border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] pb-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">{t("games.reflecShot.helpSectionOperate")}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] p-3 text-center">
                  <div className="mb-1 text-2xl" aria-hidden>
                    👆
                  </div>
                  <p className="m-0 text-xs font-medium leading-snug text-[var(--color-muted)]">{t("games.reflecShot.helpTapRotate")}</p>
                </div>
                <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] p-3 text-center">
                  <div className="mb-1 text-2xl" aria-hidden>
                    ↗️
                  </div>
                  <p className="m-0 text-xs font-medium leading-snug text-[var(--color-muted)]">{t("games.reflecShot.helpSwipeLaunch")}</p>
                </div>
              </div>
              <p className="mt-3 m-0 text-[11px] leading-relaxed text-[var(--color-muted)]">{t("games.reflecShot.helpPcNote")}</p>
              <p className="mt-2 m-0 whitespace-pre-line text-[11px] leading-relaxed text-[var(--color-muted)] md:hidden">
                {t("games.reflecShot.ruleControls")}
              </p>
              <p className="mt-2 m-0 hidden text-[11px] leading-relaxed text-[var(--color-muted)] md:block">{t("games.reflecShot.ruleControlsPc")}</p>
            </div>
            <div className="pt-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">{t("games.reflecShot.accordionRulesSummary")}</h3>
              {renderHelpRuleParagraphs()}
            </div>
          </div>
        </div>
      )}

      {showWinOverlay && (
        <div
          className={
            isDevTj
              ? "fixed inset-0 z-[9999] flex items-center justify-center"
              : "fixed inset-0 z-[9999] flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg)_25%,transparent)] [backdrop-filter:blur(1px)_brightness(1.3)]"
          }
          style={isDevTj ? clearModalBackdropOverlayStyle(clearModalBackdropDebug) : undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reflec-win-title"
        >
          <div className="mx-4 max-w-sm rounded-2xl border-2 border-[var(--color-primary)] !bg-[var(--color-surface)] !opacity-100 p-8 text-center shadow-xl">
            <h2
              id="reflec-win-title"
              className="mb-4 text-xl font-bold text-[var(--color-primary)]"
            >
              {t("games.reflecShot.resultWinMessage")}
            </h2>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowWinOverlay(false)}
                className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_85%,var(--color-bg))] px-6 py-3 font-medium text-[var(--color-text)] hover:brightness-95 active:scale-95"
              >
                {t("games.reflecShot.resultBack")}
              </button>
              <button
                type="button"
                onClick={() => goNextProblem()}
                disabled={boardLoadWait}
                className="rounded-lg bg-[var(--color-primary)] px-6 py-3 font-medium text-[var(--color-on-primary)] hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("games.reflecShot.nextProblemBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFailOverlay && (
        <div
          className={
            isDevTj
              ? "fixed inset-0 z-[9999] flex items-center justify-center"
              : "fixed inset-0 z-[9999] flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg)_25%,transparent)] [backdrop-filter:blur(1px)_brightness(1.3)]"
          }
          style={isDevTj ? clearModalBackdropOverlayStyle(clearModalBackdropDebug) : undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reflec-fail-title"
        >
          <div className="mx-4 max-w-sm rounded-2xl border-2 border-[var(--color-primary)] !bg-[var(--color-surface)] !opacity-100 p-8 text-center shadow-xl">
            <h2
              id="reflec-fail-title"
              className="mb-2 text-xl font-bold text-[var(--color-primary)]"
            >
              {t("games.reflecShot.resultFailTitle")}
            </h2>
            <p className="mb-4 text-[var(--color-text)]">
              {gemGoalFail ? t("games.reflecShot.resultFailGems") : t("games.reflecShot.resultFailMessage")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => retryAfterLoss()}
                className="rounded-lg border border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_85%,var(--color-bg))] px-6 py-3 font-medium text-[var(--color-text)] hover:brightness-95 active:scale-95"
              >
                {t("games.reflecShot.resultRetry")}
              </button>
              <button
                type="button"
                onClick={() => goNextProblem()}
                disabled={boardLoadWait}
                className="rounded-lg bg-[var(--color-primary)] px-6 py-3 font-medium text-[var(--color-on-primary)] hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("games.reflecShot.nextProblemBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
