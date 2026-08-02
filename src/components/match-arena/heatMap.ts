import type { TrackPoint } from "../../data/matchSim";

/**
 * Turning clock-sampled positions into something a heat map can draw.
 *
 * Kept apart from the component so the shape of the scale can be measured
 * against real match data rather than eyeballed.
 */
const GRID_X = 44;
const GRID_Y = 28;

export interface HeatCell {
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
}

/** One separable box pass; two of them read as a Gaussian at this grid size. */
function blurGrid(cells: Float32Array) {
  const out = new Float32Array(cells.length);
  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      let sum = 0;
      let weight = 0;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = gx + dx;
        if (nx < 0 || nx >= GRID_X) continue;
        sum += cells[gy * GRID_X + nx];
        weight++;
      }
      out[gy * GRID_X + gx] = sum / weight;
    }
  }
  for (let gx = 0; gx < GRID_X; gx++) {
    for (let gy = 0; gy < GRID_Y; gy++) {
      let sum = 0;
      let weight = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= GRID_Y) continue;
        sum += out[ny * GRID_X + gx];
        weight++;
      }
      cells[gy * GRID_X + gx] = sum / weight;
    }
  }
}

/**
 * Bins samples by how much match time each one stands for, then scales the
 * grid against its own distribution.
 *
 * Time, not sample count, is what a heat map is supposed to show: a ball that
 * sits in one channel for twenty seconds has to outweigh one played through
 * the same channel twice. Scaling against the single busiest cell, though,
 * makes every map look the same — football spreads its time widely enough that
 * almost everything lands mid-range and the picture washes out. The floor is
 * the median cell and the ceiling the 97th percentile, so the colours always
 * describe where this side actually concentrated rather than where anything
 * happened at all.
 */
export function buildHeatCells(samples: TrackPoint[]): HeatCell[] {
  if (samples.length === 0) return [];
  const cells = new Float32Array(GRID_X * GRID_Y);
  for (const sample of samples) {
    const gx = Math.min(GRID_X - 1, Math.max(0, Math.floor((sample.x / 100) * GRID_X)));
    const gy = Math.min(GRID_Y - 1, Math.max(0, Math.floor((sample.y / 100) * GRID_Y)));
    cells[gy * GRID_X + gx] += sample.seconds;
  }
  blurGrid(cells);
  blurGrid(cells);

  const occupied = Array.from(cells).filter((value) => value > 0).sort((a, b) => a - b);
  if (occupied.length === 0) return [];
  const floor = occupied[Math.floor(occupied.length * 0.5)];
  const peak = occupied[Math.floor(occupied.length * 0.97)];
  const span = Math.max(peak - floor, 1e-6);

  const width = 98 / GRID_X;
  const height = 62 / GRID_Y;
  const out: HeatCell[] = [];
  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      const value = cells[gy * GRID_X + gx];
      const intensity = Math.min(1, Math.max(0, (value - floor) / span));
      if (intensity <= 0.02) continue;
      out.push({
        x: 1 + gx * width,
        y: 1 + gy * height,
        width,
        height,
        intensity,
      });
    }
  }
  return out;
}

/** Cool to hot, the way every tracking provider draws these. */
const HEAT_RAMP: Array<[number, [number, number, number]]> = [
  [0, [24, 108, 60]],
  [0.3, [82, 211, 39]],
  [0.55, [199, 226, 34]],
  [0.72, [255, 230, 0]],
  [0.87, [255, 129, 24]],
  [1, [242, 56, 27]],
];

export function heatColor(intensity: number) {
  let low = HEAT_RAMP[0];
  let high = HEAT_RAMP[HEAT_RAMP.length - 1];
  for (let index = 0; index < HEAT_RAMP.length - 1; index++) {
    if (intensity >= HEAT_RAMP[index][0] && intensity <= HEAT_RAMP[index + 1][0]) {
      low = HEAT_RAMP[index];
      high = HEAT_RAMP[index + 1];
      break;
    }
  }
  const t = high[0] === low[0] ? 0 : (intensity - low[0]) / (high[0] - low[0]);
  const channel = (index: number) => Math.round(low[1][index] + (high[1][index] - low[1][index]) * t);
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
}
