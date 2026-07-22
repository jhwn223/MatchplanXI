import { useMemo } from "react";
import type { FormationSlot } from "../data/formation";

interface Point {
  x: number;
  y: number;
}

interface Props {
  points: Point[];
}

const COLS = 24;
const ROWS = 16;
const SIGMA = 14;

function coverageAt(gx: number, gy: number, points: Point[]): number {
  let max = 0;
  for (const p of points) {
    const dx = gx - p.x;
    const dy = gy - p.y;
    const cov = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
    if (cov > max) max = cov;
  }
  return max;
}

function heatColor(cov: number): string {
  const hue = cov * 120;
  const alpha = 0.12 + cov * 0.38;
  return `hsla(${hue.toFixed(0)}, 75%, 45%, ${alpha.toFixed(2)})`;
}

/** "Good spacing" links between outfield points 14-30 (% of pitch) apart. */
function findSynergyLinks(points: Point[]): [Point, Point][] {
  const links: [Point, Point][] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= 14 && dist <= 30) links.push([points[i], points[j]]);
    }
  }
  return links;
}

/** Live coverage heatmap + synergy links for the currently filled pitch slots.
 *  Recomputed on every render, so it updates continuously while a player is dragged. */
export function Heatmap({ points }: Props) {
  const cells = useMemo(() => {
    if (points.length === 0) return [];
    const out: { key: string; x: number; y: number; fill: string }[] = [];
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const gx = ((cx + 0.5) / COLS) * 100;
        const gy = ((cy + 0.5) / ROWS) * 100;
        const cov = coverageAt(gx, gy, points);
        out.push({
          key: `${cx}-${cy}`,
          x: (cx / COLS) * 100,
          y: (cy / ROWS) * 100,
          fill: heatColor(cov),
        });
      }
    }
    return out;
  }, [points]);

  const links = useMemo(() => findSynergyLinks(points), [points]);

  if (points.length === 0) return null;

  return (
    <svg className="heatmap" viewBox="0 0 100 100" preserveAspectRatio="none">
      {cells.map((c) => (
        <rect
          key={c.key}
          x={c.x}
          y={c.y}
          width={100 / COLS + 0.4}
          height={100 / ROWS + 0.4}
          fill={c.fill}
        />
      ))}
      {links.map(([a, b], i) => (
        <line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          className="heatmap__link"
        />
      ))}
    </svg>
  );
}

export function slotPoints(formation: FormationSlot[], slots: Record<string, number | null>): Point[] {
  return formation.filter((s) => slots[s.id] != null).map((s) => ({ x: s.x, y: s.y }));
}
