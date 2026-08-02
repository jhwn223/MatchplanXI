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

interface HeatMapOptions {
  /** Keep low-density ball travel visible as well as places it dwelled. */
  preserveRoutes?: boolean;
  /** Normalize each player's position cloud before composing the team. */
  normalizeGroups?: boolean;
}

function addToGrid(cells: Float32Array, sample: TrackPoint, weight = sample.seconds) {
  const gx = Math.min(GRID_X - 1, Math.max(0, Math.floor((sample.x / 100) * GRID_X)));
  const gy = Math.min(GRID_Y - 1, Math.max(0, Math.floor((sample.y / 100) * GRID_Y)));
  cells[gy * GRID_X + gx] += weight;
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

function fillGrid(samples: TrackPoint[], preserveRoutes = false) {
  const cells = new Float32Array(GRID_X * GRID_Y);
  let previous: TrackPoint | undefined;
  for (const sample of samples) {
    addToGrid(cells, sample);
    if (preserveRoutes && previous && !sample.segmentStart) {
      const dx = sample.x - previous.x;
      const dy = sample.y - previous.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 2.5 && distance <= 24) {
        const steps = Math.max(2, Math.ceil(distance / 2));
        const routeWeight = Math.min(previous.seconds, sample.seconds) * 0.4 / steps;
        for (let step = 1; step < steps; step++) {
          addToGrid(cells, {
            x: previous.x + dx * step / steps,
            y: previous.y + dy * step / steps,
            seconds: routeWeight,
          }, routeWeight);
        }
      }
    }
    previous = sample;
  }
  blurGrid(cells);
  blurGrid(cells);
  return cells;
}

function groupedPositionGrid(samples: TrackPoint[]) {
  const grouped = new Map<number, TrackPoint[]>();
  for (const sample of samples) {
    const key = sample.groupId ?? -1;
    const group = grouped.get(key) ?? [];
    group.push(sample);
    grouped.set(key, group);
  }
  const combined = new Float32Array(GRID_X * GRID_Y);
  for (const group of grouped.values()) {
    // Tracking stores one position per second. Connecting consecutive samples
    // is essential: otherwise a player visibly running through a zone in the
    // 2D replay appears as disconnected islands in the heat map.
    const grid = fillGrid(group, true);
    const occupied = Array.from(grid).filter((value) => value > 0).sort((a, b) => a - b);
    if (!occupied.length) continue;
    const playerPeak = Math.max(occupied[Math.floor(occupied.length * 0.95)], 1e-6);
    for (let index = 0; index < grid.length; index++) {
      combined[index] += Math.min(1, grid[index] / playerPeak);
    }
  }
  return combined;
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
export function buildHeatCells(samples: TrackPoint[], options: HeatMapOptions = {}): HeatCell[] {
  if (samples.length === 0) return [];
  const cells = options.normalizeGroups
    ? groupedPositionGrid(samples)
    : fillGrid(samples, options.preserveRoutes);

  const occupied = Array.from(cells).filter((value) => value > 0).sort((a, b) => a - b);
  if (occupied.length === 0) return [];
  const peak = occupied[Math.floor(occupied.length * 0.97)];
  const floor = options.preserveRoutes || options.normalizeGroups
    ? 0
    : occupied[Math.floor(occupied.length * 0.5)];
  const span = Math.max(peak - floor, 1e-6);

  const width = 98 / GRID_X;
  const height = 62 / GRID_Y;
  const out: HeatCell[] = [];
  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      const value = cells[gy * GRID_X + gx];
      const linear = Math.min(1, Math.max(0, (value - floor) / span));
      // Route cells are necessarily cooler than dwell cells. A root curve
      // keeps them legible without allowing them to compete with real hubs.
      const intensity = options.preserveRoutes
        ? Math.pow(linear, 0.58)
        : options.normalizeGroups
          // Whole-team positioning must retain lightly visited lanes. The old
          // median cut removed exactly the transition paths the replay showed.
          ? Math.pow(linear, 0.52)
          : linear;
      if (intensity <= (options.preserveRoutes ? 0.035 : options.normalizeGroups ? 0.012 : 0.02)) continue;
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
