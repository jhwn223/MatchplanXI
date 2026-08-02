export function mulberry32(seed: number) {
  let value = seed >>> 0;
  return function () {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function poisson(lambda: number, rng: () => number): number {
  const limit = Math.exp(-lambda);
  let count = 0;
  let product = 1;
  do {
    count++;
    product *= rng();
  } while (product > limit);
  return count - 1;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function weightedPick<T>(items: T[], weight: (item: T) => number, rng: () => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0.01, weight(item)), 0);
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= Math.max(0.01, weight(item));
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}
