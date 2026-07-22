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
  context.strokeRect(x(2), y(4), x(96) - x(2), y(96) - y(4));
  context.beginPath();
  context.moveTo(x(50), y(4));
  context.lineTo(x(50), y(96));
  context.stroke();
  context.beginPath();
  context.arc(x(50), y(50), x(9), 0, Math.PI * 2);
  context.stroke();
  context.strokeRect(x(2), y(30), x(12) - x(2), y(70) - y(30));
  context.strokeRect(x(88), y(30), x(98) - x(88), y(70) - y(30));

  state.dots.forEach((dot, index) => {
    const radius = Math.max(7, width * 0.016);
    const px = x(dot.x);
    const py = y(dot.y);
    context.beginPath();
    context.arc(px, py, radius, 0, Math.PI * 2);
    context.fillStyle = dot.team === 0 ? userColor : "#e5484d";
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = index === state.ball.owner ? "#fde047" : "rgba(0,0,0,0.35)";
    context.stroke();
    context.fillStyle = dot.team === 0 ? "#06231f" : "#fff";
    context.font = `bold ${Math.max(8, width * 0.014)}px ${KOREAN_CANVAS_FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(dot.num), px, py);

    if (dot.team === 0) {
      const label = `${dot.num} ${displayArenaName(dot.name)}`;
      const labelFont = Math.max(12, Math.min(15, width * 0.015));
      const labelY = clamp(py - radius - 9, labelFont + 3, height - 6);
      context.font = `800 ${labelFont}px ${KOREAN_CANVAS_FONT}`;
      context.lineWidth = 4;
      context.strokeStyle = "rgba(0, 0, 0, 0.85)";
      context.strokeText(label, px, labelY);
      context.fillStyle = "#fff";
      context.fillText(label, px, labelY);
    }
  });

  context.beginPath();
  context.arc(x(state.ball.x), y(state.ball.y), Math.max(4, width * 0.008), 0, Math.PI * 2);
  context.fillStyle = "#fff";
  context.fill();
  context.strokeStyle = "#111";
  context.lineWidth = 1;
  context.stroke();
}
