export function lerp(a: number, b: number, factor: number) {
  return a + (b - a) * Math.min(1, factor);
}

export function distanceSquared(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Convert a tactics-board slot into arena coordinates. Side 0 attacks right. */
export function homeFor(slotX: number, slotY: number, side: 0 | 1) {
  const x = (100 - slotY) * 0.46 + 4;
  const y = slotX * 0.86 + 7;
  return side === 0 ? { x, y } : { x: 100 - x, y: 100 - y };
}
