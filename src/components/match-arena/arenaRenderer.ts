import { displayArenaName } from "./names";
import { clamp } from "./runtimeMath";
import type { ArenaState } from "./runtimeTypes";

const KOREAN_CANVAS_FONT = `"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Segoe UI", sans-serif`;

export function drawArenaFrame(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  state: ArenaState,
  userColor: string
) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const x = (value: number) => (value / 100) * width;
  const y = (value: number) => (value / 100) * height;

  context.fillStyle = "#123a1e";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(255,255,255,0.03)";
  for (let index = 0; index < 10; index += 2) {
    context.fillRect((index / 10) * width, 0, width / 10, height);
  }
  context.strokeStyle = "rgba(255,255,255,0.25)";
  context.lineWidth = 1.5;
  // The right edge must land at x(98) to match the penalty/six-yard boxes'
  // goal-line edge below — it was x(96), 2 units short of them, so the box
  // lines poked out past the boundary and read as a stray extra line.
  context.strokeRect(x(2), y(4), x(98) - x(2), y(96) - y(4));
  context.beginPath();
  context.moveTo(x(50), y(4));
  context.lineTo(x(50), y(96));
  context.stroke();
  context.beginPath();
  context.arc(x(50), y(50), x(9), 0, Math.PI * 2);
  context.stroke();
  context.strokeRect(x(2), y(30), x(12) - x(2), y(70) - y(30));
  context.strokeRect(x(88), y(30), x(98) - x(88), y(70) - y(30));
  context.strokeRect(x(2), y(40), x(6) - x(2), y(60) - y(40));
  context.strokeRect(x(94), y(40), x(98) - x(94), y(60) - y(40));
  context.beginPath();
  context.arc(x(10.5), y(50), Math.max(2, width * 0.003), 0, Math.PI * 2);
  context.arc(x(89.5), y(50), Math.max(2, width * 0.003), 0, Math.PI * 2);
  context.fillStyle = "rgba(255,255,255,0.45)";
  context.fill();

  // Show the central defensive block, not a full-height tactical ruler. Wide
  // full-backs often step out, so using every defender's mean made the old
  // line jump around and appear detached from the actual back line.
  ([0, 1] as const).forEach((team) => {
    const defenders = state.dots.filter(
      (dot) => dot.team === team && dot.role === "DEF",
    );
    if (!defenders.length) return;
    const centralCount = defenders.length >= 5 ? 3 : defenders.length >= 3 ? 2 : defenders.length;
    const centralDefenders = [...defenders]
      .sort((a, b) => Math.abs(a.y - 50) - Math.abs(b.y - 50))
      .slice(0, centralCount);
    const sortedX = centralDefenders.map((dot) => dot.x).sort((a, b) => a - b);
    const middle = Math.floor(sortedX.length / 2);
    const lineX = sortedX.length % 2
      ? sortedX[middle]
      : (sortedX[middle - 1] + sortedX[middle]) / 2;
    const minY = clamp(Math.min(...defenders.map((dot) => dot.y)) - 7, 12, 88);
    const maxY = clamp(Math.max(...defenders.map((dot) => dot.y)) + 7, 12, 88);
    context.save();
    context.setLineDash([4, 6]);
    context.strokeStyle =
      team === 0 ? "rgba(110,231,183,0.24)" : "rgba(248,113,113,0.2)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x(lineX), y(minY));
    context.lineTo(x(lineX), y(maxY));
    context.stroke();
    context.restore();
  });

  state.ball.trail.forEach((point) => {
    const alpha = clamp(1 - point.age / 0.55, 0, 1) * 0.35;
    context.beginPath();
    context.arc(
      x(point.x),
      y(point.y),
      Math.max(2, width * 0.0045) * alpha,
      0,
      Math.PI * 2,
    );
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.fill();
  });

  // During a shootout only the current kicker and the defending keeper stay on
  // screen — everyone else drifted off wherever regulation ended and would
  // otherwise clutter a scene that's meant to read as one kicker vs one keeper.
  const pkKick = state.phase === "penalties" ? state.pkSequence[state.pkIndex] : null;
  const visibleDotIndices = pkKick
    ? new Set(
        state.dots.reduce<number[]>((indices, dot, index) => {
          if (index === state.ball.owner || (dot.team !== pkKick.team && dot.role === "GK")) {
            indices.push(index);
          }
          return indices;
        }, []),
      )
    : null;

  state.dots.forEach((dot, index) => {
    if (visibleDotIndices && !visibleDotIndices.has(index)) return;
    const radius = Math.max(7, width * 0.016);
    const px = x(dot.x);
    const py = y(dot.y);
    const actionColor =
      dot.action === "press" || dot.action === "tackle"
        ? "#fb923c"
        : dot.action === "pass" || dot.action === "receive"
          ? "#38bdf8"
          : dot.action === "shoot"
            ? "#fde047"
            : dot.action === "save"
              ? "#c084fc"
              : dot.action === "celebrate"
                ? "#4ade80"
                : null;

    context.beginPath();
    context.ellipse(
      px + 2,
      py + radius * 0.55,
      radius * 0.9,
      radius * 0.48,
      0,
      0,
      Math.PI * 2,
    );
    context.fillStyle = "rgba(0,0,0,0.24)";
    context.fill();

    if (actionColor && dot.actionT > 0) {
      context.beginPath();
      context.arc(px, py, radius + 4, 0, Math.PI * 2);
      context.strokeStyle = actionColor;
      context.lineWidth = 2;
      context.stroke();
    }

    context.beginPath();
    context.arc(px, py, radius, 0, Math.PI * 2);
    context.fillStyle = dot.team === 0 ? userColor : "#e5484d";
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = index === state.ball.owner ? "#fde047" : "rgba(0,0,0,0.35)";
    context.stroke();

    // Facing marker: the short line turns with the player's velocity, so a
    // press, recovery run and receiving body shape no longer look identical.
    context.beginPath();
    context.moveTo(px, py);
    context.lineTo(
      px + Math.cos(dot.facing) * radius * 0.82,
      py + Math.sin(dot.facing) * radius * 0.82,
    );
    context.strokeStyle = "rgba(255,255,255,0.82)";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = dot.team === 0 ? "#06231f" : "#fff";
    context.font = `bold ${Math.max(8, width * 0.014)}px ${KOREAN_CANVAS_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(dot.num), px, py);

    {
      const label = `${dot.num} ${displayArenaName(dot.name)}`;
      const labelFont =
        dot.team === 0
          ? Math.max(12, Math.min(15, width * 0.015))
          : Math.max(10, Math.min(12, width * 0.012));
      const labelY = clamp(py - radius - 9, labelFont + 3, height - 6);
      context.font = `800 ${labelFont}px ${KOREAN_CANVAS_FONT}`;
      // textAlign is "center", so the label spans px ± halfWidth. Players
      // near the touchline (e.g. a keeper on a goal kick) put that outside
      // the canvas with no horizontal clamp, clipping half the name — only
      // labelY was ever kept on-canvas. Nudge px inward by the same amount
      // so the whole label stays visible instead of just centering blindly.
      const halfLabelWidth = context.measureText(label).width / 2 + 3;
      const labelX = clamp(px, halfLabelWidth, width - halfLabelWidth);
      context.lineWidth = 4;
      context.strokeStyle = "rgba(0, 0, 0, 0.85)";
      context.strokeText(label, labelX, labelY);
      context.fillStyle = "#fff";
      context.fillText(label, labelX, labelY);
    }
  });

  context.beginPath();
  context.ellipse(
    x(state.ball.x) + 2,
    y(state.ball.y) + 3,
    Math.max(4, width * 0.007),
    Math.max(2, width * 0.004),
    0,
    0,
    Math.PI * 2,
  );
  context.fillStyle = "rgba(0,0,0,0.35)";
  context.fill();
  context.beginPath();
  context.arc(x(state.ball.x), y(state.ball.y), Math.max(4, width * 0.007), 0, Math.PI * 2);
  context.fillStyle = "#fff";
  context.fill();
  context.strokeStyle = "#111";
  context.lineWidth = 1;
  context.stroke();
}
