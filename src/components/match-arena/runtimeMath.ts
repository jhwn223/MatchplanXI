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

/**
 * Convert a tactics-board slot into arena coordinates. Side 0 attacks right.
 *
 * This is the same canonical frame the match engine uses (`tacticalHome`):
 * full-pitch x with only x mirrored for the away side, y kept absolute. The
 * engine's position samples and event coordinates land directly on these
 * homes, so the renderer never has to translate between two pitch frames.
 */
export function homeFor(slotX: number, slotY: number, side: 0 | 1) {
  const x = clamp(100 - slotY, 2, 98);
  const y = clamp(slotX, 4, 96);
  return side === 0 ? { x, y } : { x: 100 - x, y };
}

/**
 * Where a player stands for a kickoff: the whole team compressed into its own
 * half, keeping every line's order and lane. Open-play steering then expands
 * the block back to its full shape, which reads as the game "opening up".
 */
export function kickoffHomeFor(homeX: number, homeY: number, side: 0 | 1) {
  const canonical = side === 0 ? homeX : 100 - homeX;
  const compressed = 4 + canonical * 0.42;
  return {
    x: side === 0 ? compressed : 100 - compressed,
    y: homeY,
  };
}
