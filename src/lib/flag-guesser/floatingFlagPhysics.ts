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

/**
 * 画面外から内向きにバブルを生成（PopPopBubbles の spawnWave と同様）。
 */
export function spawnBubbleLike(opts: {
  width: number;
  height: number;
  radius: number;
  speedScale?: number;
  restitution?: number;
}): FloatingBubbleLike {
  const { width, height, radius } = opts;
  const speedScale = opts.speedScale ?? 1;
  const restitution = opts.restitution ?? 0.86;
  const side = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;
  if (side === 0) {
    x = rand(radius, width - radius);
    y = -radius - rand(16, 72);
  } else if (side === 1) {
    x = width + radius + rand(16, 72);
    y = rand(radius, height - radius);
  } else if (side === 2) {
    x = rand(radius, width - radius);
    y = height + radius + rand(16, 72);
  } else {
    x = -radius - rand(16, 72);
    y = rand(radius, height - radius);
  }
  const baseAngle = Math.atan2(height * 0.5 - y, width * 0.5 - x);
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
 */
export function stepBubbleLikeInBox(b: FloatingBubbleLike, width: number, height: number, dt: number): void {
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x - b.radius < 0) {
    b.x = b.radius;
    b.vx = Math.abs(b.vx) * b.restitution;
    b.vy *= 1 - b.friction;
  } else if (b.x + b.radius > width) {
    b.x = width - b.radius;
    b.vx = -Math.abs(b.vx) * b.restitution;
    b.vy *= 1 - b.friction;
  }
  if (b.y - b.radius < 0) {
    b.y = b.radius;
    b.vy = Math.abs(b.vy) * b.restitution;
    b.vx *= 1 - b.friction;
  } else if (b.y + b.radius > height) {
    b.y = height - b.radius;
    b.vy = -Math.abs(b.vy) * b.restitution;
    b.vx *= 1 - b.friction;
  }
  enforceCruiseSpeed(b);
}
