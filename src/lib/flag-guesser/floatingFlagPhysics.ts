/**
 * はじけて！バブル（PopPopBubblesScene）と同系の壁反射・定速運動。
 * 将来的に Web Worker へ移す際もそのまま移植しやすいよう副作用のみに閉じる。
 */

export type FloatingBubbleLike = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  cruiseSpeed: number;
  radius: number;
  restitution: number;
  friction: number;
};

/** 国旗カード中心が動ける矩形（ステージ左上原点・px） */
export type FlagFloatRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function enforceCruiseSpeed(b: FloatingBubbleLike): void {
  const target = Math.max(8, b.cruiseSpeed);
  const speed = Math.hypot(b.vx, b.vy);
  if (speed < 0.01) {
    const a = Math.random() * Math.PI * 2;
    b.vx = Math.cos(a) * target;
    b.vy = Math.sin(a) * target;
    return;
  }
  const k = target / speed;
  b.vx *= k;
  b.vy *= k;
}

/** 要素座標系で 2 矩形の交差 */
export function intersectFlagFloatRects(a: FlagFloatRect, b: FlagFloatRect): FlagFloatRect {
  const minX = Math.max(a.minX, b.minX);
  const minY = Math.max(a.minY, b.minY);
  const maxX = Math.min(a.maxX, b.maxX);
  const maxY = Math.min(a.maxY, b.maxY);
  if (maxX <= minX + 8 || maxY <= minY + 8) return a;
  return { minX, minY, maxX, maxY };
}

/** 四辺を内側へ寄せる（カード半分＋余白がはみ出さないよう） */
export function insetFlagFloatRect(
  rect: FlagFloatRect,
  padX: number,
  padY: number
): FlagFloatRect {
  const minX = rect.minX + padX;
  const minY = rect.minY + padY;
  const maxX = rect.maxX - padX;
  const maxY = rect.maxY - padY;
  if (maxX <= minX + 8 || maxY <= minY + 8) return rect;
  return { minX, minY, maxX, maxY };
}

/**
 * 要素の getBoundingClientRect と「実際に見えている viewport」の交差を、
 * 要素ローカル座標の移動範囲に変換する。
 */
export function flagFloatRectFromStageElement(el: HTMLElement): FlagFloatRect {
  const r = el.getBoundingClientRect();
  let minX = 0;
  let minY = 0;
  let maxX = Math.max(1, r.width);
  let maxY = Math.max(1, r.height);

  if (typeof window !== "undefined") {
    const vv = window.visualViewport;
    const vLeft = vv?.offsetLeft ?? 0;
    const vTop = vv?.offsetTop ?? 0;
    const vRight = vLeft + (vv?.width ?? window.innerWidth);
    const vBottom = vTop + (vv?.height ?? window.innerHeight);

    /* layout viewport との交差も取り、Safari 等で rect が広く取られるケースを抑える */
    const visLeft = Math.max(r.left, vLeft, 0);
    const visRight = Math.min(r.right, vRight, document.documentElement.clientWidth);
    const visTop = Math.max(r.top, vTop, 0);
    const visBottom = Math.min(r.bottom, vBottom, document.documentElement.clientHeight);

    const clipL = Math.max(0, visLeft - r.left);
    const clipR = Math.min(r.width, visRight - r.left);
    const clipT = Math.max(0, visTop - r.top);
    const clipB = Math.min(r.height, visBottom - r.top);

    if (clipR > clipL + 8) {
      minX = clipL;
      maxX = clipR;
    }
    if (clipB > clipT + 8) {
      minY = clipT;
      maxY = clipB;
    }
  }

  return { minX, minY, maxX, maxY };
}

/** 浮遊カード中心を矩形内に収める */
export function clampBubbleToFloatRect(
  b: FloatingBubbleLike,
  rect: FlagFloatRect,
  halfW: number,
  halfH: number
): void {
  b.x = Math.min(rect.maxX - halfW, Math.max(rect.minX + halfW, b.x));
  b.y = Math.min(rect.maxY - halfH, Math.max(rect.minY + halfH, b.y));
}

/**
 * 画面外から内向きにバブルを生成（PopPopBubbles の spawnWave と同様）。
 *
 * `spawnInside: true` の場合は、rect 内ランダム位置で生成する。
 */
export function spawnBubbleLike(opts: {
  rect: FlagFloatRect;
  halfW: number;
  halfH: number;
  speedScale?: number;
  restitution?: number;
  spawnInside?: boolean;
}): FloatingBubbleLike {
  const { rect, halfW, halfH } = opts;
  const speedScale = opts.speedScale ?? 1;
  const restitution = opts.restitution ?? 0.86;
  const spawnInside = opts.spawnInside ?? false;
  const { minX, minY, maxX, maxY } = rect;
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const cx = minX + boxW * 0.5;
  const cy = minY + boxH * 0.5;
  const radius = Math.max(halfW, halfH);

  let x = 0;
  let y = 0;
  if (spawnInside) {
    const pad = 4;
    const loX = minX + halfW + pad;
    const hiX = Math.max(loX + 1, maxX - halfW - pad);
    const loY = minY + halfH + pad;
    const hiY = Math.max(loY + 1, maxY - halfH - pad);
    x = rand(loX, hiX);
    y = rand(loY, hiY);
  } else {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) {
      x = rand(minX + halfW, maxX - halfW);
      y = minY - halfH - rand(16, 72);
    } else if (side === 1) {
      x = maxX + halfW + rand(16, 72);
      y = rand(minY + halfH, maxY - halfH);
    } else if (side === 2) {
      x = rand(minX + halfW, maxX - halfW);
      y = maxY + halfH + rand(16, 72);
    } else {
      x = minX - halfW - rand(16, 72);
      y = rand(minY + halfH, maxY - halfH);
    }
  }
  const baseAngle = Math.atan2(cy - y, cx - x);
  const angle = spawnInside ? Math.random() * Math.PI * 2 : baseAngle + rand(-0.75, 0.75);
  const speed = rand(22, 38) * speedScale;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    cruiseSpeed: speed,
    radius,
    restitution,
    friction: 0.01,
  };
}

/**
 * パネル座標（浮遊レイヤーと同じ左上原点 px）の位置でバブルを生成し、中央方向へ初速を与える。
 */
export function spawnBubbleLikeAtPanelXY(opts: {
  x: number;
  y: number;
  rect: FlagFloatRect;
  halfW: number;
  halfH: number;
  speedScale?: number;
  restitution?: number;
}): FloatingBubbleLike {
  const { x, y, rect, halfW, halfH } = opts;
  const speedScale = opts.speedScale ?? 1;
  const restitution = opts.restitution ?? 0.88;
  const boxW = rect.maxX - rect.minX;
  const boxH = rect.maxY - rect.minY;
  const cx = rect.minX + boxW * 0.5;
  const cy = rect.minY + boxH * 0.5;
  const radius = Math.max(halfW, halfH);
  const baseAngle = Math.atan2(cy - y, cx - x);
  const angle = baseAngle + rand(-0.75, 0.75);
  const speed = rand(22, 38) * speedScale;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    cruiseSpeed: speed,
    radius,
    restitution,
    friction: 0.01,
  };
}

/**
 * 1 フレーム分の移動と壁反発（`dt` 秒）。
 * `halfW` / `halfH` は translate(-50%) 付き矩形カードの半幅・半高。
 */
export function stepBubbleLikeInRect(
  b: FloatingBubbleLike,
  rect: FlagFloatRect,
  dt: number,
  halfW: number,
  halfH: number
): void {
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  const { minX, minY, maxX, maxY } = rect;

  if (b.x - halfW < minX) {
    b.x = minX + halfW;
    b.vx = Math.abs(b.vx) * b.restitution;
    b.vy *= 1 - b.friction;
  } else if (b.x + halfW > maxX) {
    b.x = maxX - halfW;
    b.vx = -Math.abs(b.vx) * b.restitution;
    b.vy *= 1 - b.friction;
  }
  if (b.y - halfH < minY) {
    b.y = minY + halfH;
    b.vy = Math.abs(b.vy) * b.restitution;
    b.vx *= 1 - b.friction;
  } else if (b.y + halfH > maxY) {
    b.y = maxY - halfH;
    b.vy = -Math.abs(b.vy) * b.restitution;
    b.vx *= 1 - b.friction;
  }
  enforceCruiseSpeed(b);
}

/** @deprecated 互換の別名 — stepBubbleLikeInRect を使用 */
export function stepBubbleLikeInBox(
  b: FloatingBubbleLike,
  width: number,
  height: number,
  dt: number
): void {
  const hw = b.radius;
  const hh = b.radius;
  stepBubbleLikeInRect(b, { minX: 0, minY: 0, maxX: width, maxY: height }, dt, hw, hh);
}
